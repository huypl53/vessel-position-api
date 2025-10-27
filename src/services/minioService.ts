import { Client } from "minio";
import crypto from "crypto";
import logger from "../lib/logger";

export interface UploadResult {
  bucket: string;
  objectName: string;
  size: number;
  etag: string;
}

export class MinioStorageService {
  private readonly client: Client;
  private readonly bucket: string;

  constructor() {
    const {
      MINIO_ENDPOINT,
      MINIO_PORT,
      MINIO_ACCESS_KEY,
      MINIO_SECRET_KEY,
      MINIO_BUCKET,
      MINIO_USE_SSL,
    } = process.env;

    if (!MINIO_ENDPOINT || !MINIO_PORT || !MINIO_ACCESS_KEY || !MINIO_SECRET_KEY) {
      throw new Error("MinIO configuration is incomplete. Check environment variables.");
    }

    this.bucket = MINIO_BUCKET ?? "vessel-images";
    this.client = new Client({
      endPoint: MINIO_ENDPOINT,
      port: Number(MINIO_PORT),
      accessKey: MINIO_ACCESS_KEY,
      secretKey: MINIO_SECRET_KEY,
      useSSL: MINIO_USE_SSL === "true",
    });
  }

  async ensureBucket(): Promise<void> {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      const region = process.env.MINIO_REGION ?? "us-east-1";
      await this.client.makeBucket(this.bucket, region);
      logger.info({ bucket: this.bucket, region }, "Created MinIO bucket");
    }
  }

  async uploadBuffer(
    buffer: Buffer,
    contentType: string,
    suggestedName?: string,
  ): Promise<UploadResult> {
    await this.ensureBucket();
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const objectName = `${suggestedName ?? "image"}-${hash}.jpg`;
    const metaData = {
      "Content-Type": contentType,
    };

    const uploadInfo = await this.client.putObject(
      this.bucket,
      objectName,
      buffer,
      buffer.length,
      metaData,
    );
    logger.info(
      {
        bucket: this.bucket,
        objectName,
        size: buffer.length,
      },
      "Uploaded object to MinIO",
    );

    return {
      bucket: this.bucket,
      objectName,
      size: buffer.length,
      etag: uploadInfo.etag ?? "",
    };
  }

  getPublicUrl(objectName: string): string {
    const protocol = process.env.MINIO_USE_SSL === "true" ? "https" : "http";
    const endpoint = process.env.MINIO_ENDPOINT;
    const port = process.env.MINIO_PORT;
    return `${protocol}://${endpoint}${port ? `:${port}` : ""}/${this.bucket}/${objectName}`;
  }
}

export default MinioStorageService;
