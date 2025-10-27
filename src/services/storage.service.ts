import { Client, ClientOptions } from "minio";
import { storageLogger } from "./logger.service";
import { Readable } from "stream";

export class StorageService {
  private client: Client;
  private bucketName: string;

  constructor() {
    const config: ClientOptions = {
      endPoint: process.env.MINIO_ENDPOINT || "localhost",
      port: parseInt(process.env.MINIO_PORT || "9000"),
      useSSL: process.env.MINIO_USE_SSL === "true",
      accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
      secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
    };

    this.client = new Client(config);
    this.bucketName = process.env.MINIO_BUCKET_NAME || "vessel-images";

    storageLogger.info("MinIO client initialized", { config: { ...config, secretKey: "***" } });
  }

  async initialize(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.bucketName);
      if (!exists) {
        await this.client.makeBucket(this.bucketName, "us-east-1");
        storageLogger.info(`Bucket created: ${this.bucketName}`);
      } else {
        storageLogger.info(`Bucket already exists: ${this.bucketName}`);
      }
    } catch (error) {
      storageLogger.error("Failed to initialize storage", { error });
      throw error;
    }
  }

  async uploadImage(
    buffer: Buffer,
    objectKey: string,
    metadata?: Record<string, string>
  ): Promise<{ bucketName: string; objectKey: string; etag: string }> {
    try {
      const stream = Readable.from(buffer);
      const uploadMetadata = {
        "Content-Type": metadata?.mimeType || "image/jpeg",
        ...metadata,
      };

      const result = await this.client.putObject(
        this.bucketName,
        objectKey,
        stream,
        buffer.length,
        uploadMetadata
      );

      storageLogger.info("Image uploaded successfully", {
        bucketName: this.bucketName,
        objectKey,
        size: buffer.length,
      });

      return {
        bucketName: this.bucketName,
        objectKey,
        etag: result.etag,
      };
    } catch (error) {
      storageLogger.error("Failed to upload image", { objectKey, error });
      throw error;
    }
  }

  async uploadFromUrl(
    url: string,
    objectKey: string
  ): Promise<{ bucketName: string; objectKey: string; etag: string }> {
    try {
      storageLogger.info("Downloading image from URL", { url, objectKey });

      const fetch = (await import("node-fetch")).default;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }

      const buffer = await response.buffer();
      const contentType = response.headers.get("content-type") || "image/jpeg";

      return await this.uploadImage(buffer, objectKey, { mimeType: contentType });
    } catch (error) {
      storageLogger.error("Failed to upload image from URL", { url, objectKey, error });
      throw error;
    }
  }

  async getImageUrl(objectKey: string, expirySeconds: number = 3600): Promise<string> {
    try {
      const url = await this.client.presignedGetObject(
        this.bucketName,
        objectKey,
        expirySeconds
      );
      return url;
    } catch (error) {
      storageLogger.error("Failed to generate image URL", { objectKey, error });
      throw error;
    }
  }

  async deleteImage(objectKey: string): Promise<void> {
    try {
      await this.client.removeObject(this.bucketName, objectKey);
      storageLogger.info("Image deleted successfully", { objectKey });
    } catch (error) {
      storageLogger.error("Failed to delete image", { objectKey, error });
      throw error;
    }
  }

  async imageExists(objectKey: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucketName, objectKey);
      return true;
    } catch (error) {
      return false;
    }
  }
}

// Singleton instance
let storageServiceInstance: StorageService | null = null;

export function getStorageService(): StorageService {
  if (!storageServiceInstance) {
    storageServiceInstance = new StorageService();
  }
  return storageServiceInstance;
}
