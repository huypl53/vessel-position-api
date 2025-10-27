import { StorageService } from "../../src/services/storage.service";

// Mock MinIO client
jest.mock("minio", () => {
  return {
    Client: jest.fn().mockImplementation(() => ({
      bucketExists: jest.fn().mockResolvedValue(true),
      makeBucket: jest.fn().mockResolvedValue(undefined),
      putObject: jest.fn().mockResolvedValue({ etag: "test-etag" }),
      presignedGetObject: jest.fn().mockResolvedValue("https://minio.test/image.jpg"),
      removeObject: jest.fn().mockResolvedValue(undefined),
      statObject: jest.fn().mockResolvedValue({ size: 1024 }),
    })),
  };
});

describe("StorageService", () => {
  let storageService: StorageService;

  beforeEach(() => {
    storageService = new StorageService();
  });

  it("should initialize without errors", async () => {
    await expect(storageService.initialize()).resolves.not.toThrow();
  });

  it("should upload image buffer", async () => {
    const buffer = Buffer.from("test image data");
    const objectKey = "test/image.jpg";

    const result = await storageService.uploadImage(buffer, objectKey);

    expect(result).toHaveProperty("bucketName");
    expect(result).toHaveProperty("objectKey");
    expect(result).toHaveProperty("etag");
    expect(result.objectKey).toBe(objectKey);
  });

  it("should generate presigned URL", async () => {
    const objectKey = "test/image.jpg";

    const url = await storageService.getImageUrl(objectKey);

    expect(url).toBeDefined();
    expect(typeof url).toBe("string");
    expect(url).toContain("http");
  });

  it("should check if image exists", async () => {
    const objectKey = "test/image.jpg";

    const exists = await storageService.imageExists(objectKey);

    expect(typeof exists).toBe("boolean");
  });
});
