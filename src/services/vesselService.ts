import fetch from "node-fetch";
import { VesselDetail, VesselImageMetadata } from "../domain/vessel";
import vesselRepository from "./vesselRepository";
import marineTrafficCrawler from "./crawlers/marineTrafficCrawler";
import MinioStorageService from "./minioService";
import logger from "../lib/logger";

export interface GetVesselOptions {
  identifier: string;
  type?: "mmsi" | "imo";
  forceRefresh?: boolean;
}

let minioServiceSingleton: MinioStorageService | null = null;

function getMinioService(): MinioStorageService | null {
  if (minioServiceSingleton) {
    return minioServiceSingleton;
  }
  try {
    minioServiceSingleton = new MinioStorageService();
    return minioServiceSingleton;
  } catch (error) {
    logger.warn({ err: error }, "MinIO is not configured or unavailable");
    return null;
  }
}

function detectIdentifierType(identifier: string): "mmsi" | "imo" {
  const cleaned = identifier.replace(/\D/g, "");
  if (cleaned.length === 9) {
    return "mmsi";
  }
  return "imo";
}

async function enrichWithPublicUrls(detail: VesselDetail): Promise<VesselDetail> {
  if (!detail.images) {
    return detail;
  }
  const minio = getMinioService();
  detail.images = detail.images.map((image) => ({
    ...image,
    publicUrl:
      minio && image.bucket && image.objectName
        ? minio.getPublicUrl(image.objectName)
        : image.originalUrl,
  }));
  return detail;
}

async function fetchAndStoreImages(detail: VesselDetail): Promise<VesselDetail> {
  const minio = getMinioService();
  if (!detail.images?.length || !minio) {
    return detail;
  }

  const uploadedImages: VesselImageMetadata[] = [];
  for (const image of detail.images) {
    if (!image.originalUrl) {
      continue;
    }
    try {
      const response = await fetch(image.originalUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch image from ${image.originalUrl}: ${response.status}`,
        );
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const contentType = response.headers.get("content-type") ?? "image/jpeg";
      const upload = await minio.uploadBuffer(
        buffer,
        contentType,
        detail.mmsi ?? detail.imo,
      );
      uploadedImages.push({
        bucket: upload.bucket,
        objectName: upload.objectName,
        originalUrl: image.originalUrl,
        contentType,
        sizeBytes: buffer.length,
        checksum: upload.etag,
      });
    } catch (error) {
      logger.error(
        { err: error, url: image.originalUrl },
        "Failed to process vessel image",
      );
    }
  }

  return {
    ...detail,
    images: uploadedImages,
  };
}

export class VesselService {
  async getVessel(options: GetVesselOptions): Promise<VesselDetail> {
    const identifierType = options.type ?? detectIdentifierType(options.identifier);

    if (!options.forceRefresh) {
      const existing = await vesselRepository.findByLookup({
        identifier: options.identifier,
        identifierType,
      });
      if (existing) {
        logger.info(
          { identifier: options.identifier, type: identifierType },
          "Found vessel in cache",
        );
        return enrichWithPublicUrls(existing);
      }
    }

    logger.info(
      { identifier: options.identifier, type: identifierType },
      "Cache miss, crawling vessel details",
    );

    const crawled = await marineTrafficCrawler.fetchVesselDetails({
      mmsi: identifierType === "mmsi" ? options.identifier : undefined,
      imo: identifierType === "imo" ? options.identifier : undefined,
    });

    const withStoredImages = await fetchAndStoreImages(crawled);
    const saved = await vesselRepository.upsertVessel(withStoredImages);

    return enrichWithPublicUrls(saved);
  }
}

const vesselService = new VesselService();
export default vesselService;
export { detectIdentifierType };

export function __resetVesselServiceTestHooks() {
  minioServiceSingleton = null;
}
