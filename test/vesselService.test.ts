import type { VesselDetail } from "../src/domain/vessel";

const repositoryMock = {
  findByLookup: jest.fn(),
  upsertVessel: jest.fn(),
};

const crawlerMock = {
  fetchVesselDetails: jest.fn(),
};

const minioUploadMock = jest.fn();
const minioPublicUrlMock = jest.fn((objectName: string) => `http://minio/${objectName}`);

jest.mock("../src/services/vesselRepository", () => ({
  __esModule: true,
  default: repositoryMock,
}));

jest.mock("../src/services/crawlers/marineTrafficCrawler", () => ({
  __esModule: true,
  default: crawlerMock,
}));

jest.mock("../src/services/minioService", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    uploadBuffer: minioUploadMock,
    getPublicUrl: minioPublicUrlMock,
    ensureBucket: jest.fn(),
  })),
}));

jest.mock("node-fetch", () => ({
  __esModule: true,
  default: jest.fn(() =>
    Promise.resolve({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
      headers: {
        get: () => "image/jpeg",
      },
    }),
  ),
}));

import vesselService, {
  detectIdentifierType,
  __resetVesselServiceTestHooks,
} from "../src/services/vesselService";

describe("VesselService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetVesselServiceTestHooks();
  });

  it("detectIdentifierType identifies MMSI by length", () => {
    expect(detectIdentifierType("123456789")).toBe("mmsi");
    expect(detectIdentifierType("IMO1234567")).toBe("imo");
  });

  it("returns cached vessel when repository hit exists", async () => {
    const sampleDetail: VesselDetail = {
      name: "Cached Vessel",
      mmsi: "123456789",
      images: [
        {
          bucket: "bucket",
          objectName: "object.jpg",
        },
      ],
    };
    repositoryMock.findByLookup.mockResolvedValueOnce(sampleDetail);

    const result = await vesselService.getVessel({
      identifier: "123456789",
    });

    expect(repositoryMock.findByLookup).toHaveBeenCalledTimes(1);
    expect(crawlerMock.fetchVesselDetails).not.toHaveBeenCalled();
    expect(minioPublicUrlMock).toHaveBeenCalledWith("object.jpg");
    expect(result.images?.[0]?.publicUrl).toBe("http://minio/object.jpg");
  });

  it("forces crawl when forceRefresh flag is true", async () => {
    const crawledDetail: VesselDetail = {
      name: "Fresh Vessel",
      imo: "9876543",
      images: [],
    };
    crawlerMock.fetchVesselDetails.mockResolvedValueOnce(crawledDetail);
    repositoryMock.upsertVessel.mockResolvedValueOnce(crawledDetail);

    const result = await vesselService.getVessel({
      identifier: "IMO9876543",
      forceRefresh: true,
    });

    expect(repositoryMock.findByLookup).not.toHaveBeenCalled();
    expect(crawlerMock.fetchVesselDetails).toHaveBeenCalledWith({
      imo: "IMO9876543",
      mmsi: undefined,
    });
    expect(repositoryMock.upsertVessel).toHaveBeenCalledWith(crawledDetail);
    expect(result.name).toBe("Fresh Vessel");
  });
});
