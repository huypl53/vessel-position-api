import { PrismaClient, Vessel, VesselPosition, VesselImage } from "@prisma/client";
import { getDatabaseService } from "./database.service";
import { getStorageService } from "./storage.service";
import MarineTrafficEnhanced from "../classes/sources/ais/mt-enhanced";
import { VesselDetails } from "../classes/sources/ais/VesselDetails.interface";
import { dbLogger, crawlerLogger, storageLogger } from "./logger.service";
import { v4 as uuidv4 } from "uuid";

export class VesselService {
  private prisma: PrismaClient;
  private storageService;
  private crawler: MarineTrafficEnhanced;

  // Cache TTL in milliseconds (default: 1 hour)
  private cacheTTL: number;

  constructor(cacheTTLMinutes: number = 60) {
    this.prisma = getDatabaseService().getClient();
    this.storageService = getStorageService();
    this.crawler = new MarineTrafficEnhanced();
    this.cacheTTL = cacheTTLMinutes * 60 * 1000;
  }

  /**
   * Get vessel by MMSI or IMO. Returns from cache if available and fresh,
   * otherwise crawls and stores the data.
   */
  async getVessel(identifier: {
    mmsi?: string;
    imo?: string;
  }): Promise<Vessel & { positions: VesselPosition[]; images: VesselImage[] } | null> {
    dbLogger.info("Getting vessel", { identifier });

    // Try to find vessel in database
    let vessel = await this.findVesselInDb(identifier);

    if (vessel) {
      const isCacheFresh = this.isCacheFresh(vessel.lastCrawled);

      if (isCacheFresh) {
        dbLogger.info("Returning cached vessel data", {
          vesselId: vessel.id,
          lastCrawled: vessel.lastCrawled,
        });
        return vessel;
      }

      dbLogger.info("Cache expired, re-crawling vessel", {
        vesselId: vessel.id,
        lastCrawled: vessel.lastCrawled,
      });
    }

    // Crawl vessel data
    if (!identifier.mmsi) {
      throw new Error("MMSI is required for crawling");
    }

    try {
      const vesselDetails = await this.crawler.getVesselDetails(identifier.mmsi);

      // Store or update vessel
      vessel = await this.storeVesselDetails(vesselDetails);

      return vessel;
    } catch (error) {
      crawlerLogger.error("Failed to crawl vessel", { identifier, error });

      // Return stale cache if available
      if (vessel) {
        dbLogger.info("Returning stale cached data due to crawl failure", {
          vesselId: vessel.id,
        });
        return vessel;
      }

      throw error;
    }
  }

  /**
   * Find vessel in database by MMSI or IMO
   */
  private async findVesselInDb(identifier: {
    mmsi?: string;
    imo?: string;
  }): Promise<(Vessel & { positions: VesselPosition[]; images: VesselImage[] }) | null> {
    const where: any = {};

    if (identifier.mmsi) {
      where.mmsi = identifier.mmsi;
    } else if (identifier.imo) {
      where.imo = identifier.imo;
    } else {
      return null;
    }

    try {
      const vessel = await this.prisma.vessel.findFirst({
        where,
        include: {
          positions: {
            orderBy: { timestamp: "desc" },
            take: 10, // Get last 10 positions
          },
          images: true,
        },
      });

      return vessel;
    } catch (error) {
      dbLogger.error("Error finding vessel in database", { identifier, error });
      return null;
    }
  }

  /**
   * Check if cached data is still fresh
   */
  private isCacheFresh(lastCrawled: Date): boolean {
    const now = new Date().getTime();
    const lastCrawledTime = new Date(lastCrawled).getTime();
    return now - lastCrawledTime < this.cacheTTL;
  }

  /**
   * Store vessel details in database and MinIO
   */
  private async storeVesselDetails(
    details: VesselDetails
  ): Promise<Vessel & { positions: VesselPosition[]; images: VesselImage[] }> {
    dbLogger.info("Storing vessel details", {
      mmsi: details.mmsi,
      imo: details.imo,
      name: details.name,
    });

    try {
      // Find or create vessel
      let vessel = await this.findVesselInDb({
        mmsi: details.mmsi,
        imo: details.imo,
      });

      if (vessel) {
        // Update existing vessel
        vessel = await this.prisma.vessel.update({
          where: { id: vessel.id },
          data: {
            name: details.name || vessel.name,
            imo: details.imo || vessel.imo,
            callsign: details.callsign || vessel.callsign,
            flag: details.flag || vessel.flag,
            vesselType: details.vesselType || vessel.vesselType,
            vesselTypeCode: details.vesselTypeCode || vessel.vesselTypeCode,
            length: details.length || vessel.length,
            width: details.width || vessel.width,
            draught: details.draught || vessel.draught,
            deadweight: details.deadweight || vessel.deadweight,
            grossTonnage: details.grossTonnage || vessel.grossTonnage,
            yearBuilt: details.yearBuilt || vessel.yearBuilt,
            builder: details.builder || vessel.builder,
            status: details.status || vessel.status,
            destination: details.destination || vessel.destination,
            eta: details.eta || vessel.eta,
            lastCrawled: new Date(),
          },
          include: {
            positions: true,
            images: true,
          },
        });

        dbLogger.info("Updated existing vessel", { vesselId: vessel.id });
      } else {
        // Create new vessel
        vessel = await this.prisma.vessel.create({
          data: {
            mmsi: details.mmsi,
            imo: details.imo,
            name: details.name,
            callsign: details.callsign,
            flag: details.flag,
            vesselType: details.vesselType,
            vesselTypeCode: details.vesselTypeCode,
            length: details.length,
            width: details.width,
            draught: details.draught,
            deadweight: details.deadweight,
            grossTonnage: details.grossTonnage,
            yearBuilt: details.yearBuilt,
            builder: details.builder,
            status: details.status,
            destination: details.destination,
            eta: details.eta,
            lastCrawled: new Date(),
          },
          include: {
            positions: true,
            images: true,
          },
        });

        dbLogger.info("Created new vessel", { vesselId: vessel.id });
      }

      // Store position if available
      if (details.position) {
        await this.storeVesselPosition(vessel.id, details.position);
      }

      // Store images if available
      if (details.images && details.images.length > 0) {
        await this.storeVesselImages(vessel.id, details.images);
      }

      // Reload vessel with updated relations
      const updatedVessel = await this.prisma.vessel.findUnique({
        where: { id: vessel.id },
        include: {
          positions: {
            orderBy: { timestamp: "desc" },
            take: 10,
          },
          images: true,
        },
      });

      return updatedVessel!;
    } catch (error) {
      dbLogger.error("Failed to store vessel details", { details, error });
      throw error;
    }
  }

  /**
   * Store vessel position
   */
  private async storeVesselPosition(
    vesselId: string,
    position: VesselDetails["position"]
  ): Promise<void> {
    if (!position) return;

    try {
      await this.prisma.vesselPosition.create({
        data: {
          vesselId,
          latitude: position.latitude,
          longitude: position.longitude,
          course: position.course,
          speed: position.speed,
          heading: position.heading,
          timestamp: position.timestamp,
          source: position.source,
          sourceType: position.sourceType,
        },
      });

      dbLogger.info("Stored vessel position", { vesselId });
    } catch (error) {
      dbLogger.error("Failed to store vessel position", { vesselId, error });
    }
  }

  /**
   * Store vessel images in MinIO
   */
  private async storeVesselImages(
    vesselId: string,
    images: Array<{ url: string; type?: string }>
  ): Promise<void> {
    storageLogger.info(`Storing ${images.length} images for vessel ${vesselId}`);

    for (const image of images) {
      try {
        const objectKey = `vessels/${vesselId}/${uuidv4()}.jpg`;

        // Upload image to MinIO
        const uploadResult = await this.storageService.uploadFromUrl(
          image.url,
          objectKey
        );

        // Store image metadata in database
        await this.prisma.vesselImage.create({
          data: {
            vesselId,
            bucketName: uploadResult.bucketName,
            objectKey: uploadResult.objectKey,
            imageType: image.type || "gallery",
            sourceUrl: image.url,
          },
        });

        storageLogger.info("Stored vessel image", { vesselId, objectKey });
      } catch (error) {
        storageLogger.error("Failed to store vessel image", {
          vesselId,
          imageUrl: image.url,
          error,
        });
      }
    }
  }

  /**
   * Get latest position for a vessel
   */
  async getLatestPosition(identifier: {
    mmsi?: string;
    imo?: string;
  }): Promise<VesselPosition | null> {
    const vessel = await this.getVessel(identifier);

    if (!vessel || vessel.positions.length === 0) {
      return null;
    }

    return vessel.positions[0];
  }

  /**
   * Force refresh vessel data (bypass cache)
   */
  async refreshVessel(identifier: { mmsi?: string; imo?: string }): Promise<Vessel> {
    dbLogger.info("Force refreshing vessel", { identifier });

    if (!identifier.mmsi) {
      throw new Error("MMSI is required for refreshing");
    }

    const vesselDetails = await this.crawler.getVesselDetails(identifier.mmsi);
    return await this.storeVesselDetails(vesselDetails);
  }
}

// Singleton instance with default cache TTL
let vesselServiceInstance: VesselService | null = null;

export function getVesselService(cacheTTLMinutes?: number): VesselService {
  if (!vesselServiceInstance) {
    vesselServiceInstance = new VesselService(cacheTTLMinutes);
  }
  return vesselServiceInstance;
}
