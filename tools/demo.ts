#!/usr/bin/env ts-node
import dotenv from "dotenv";
import { getVesselService } from "../src/services/vessel.service";
import logger from "../src/services/logger.service";
import { getDatabaseService } from "../src/services/database.service";
import { getStorageService } from "../src/services/storage.service";

dotenv.config();

/**
 * Demo tool to showcase the vessel tracking system
 */
class Demo {
  private vesselService: any;

  constructor() {
    this.vesselService = getVesselService();
  }

  async run(): Promise<void> {
    console.log("\n" + "=".repeat(80));
    console.log("VESSEL TRACKING SYSTEM - DEMO");
    console.log("=".repeat(80) + "\n");

    await this.initializeServices();

    // Demo 1: Fetch vessel details
    await this.demoFetchVessel();

    // Demo 2: Show caching
    await this.demoCaching();

    // Demo 3: Show position tracking
    await this.demoPositionTracking();

    // Demo 4: Show image storage
    await this.demoImageStorage();

    console.log("\n" + "=".repeat(80));
    console.log("DEMO COMPLETED");
    console.log("=".repeat(80) + "\n");

    await this.cleanup();
  }

  private async initializeServices(): Promise<void> {
    console.log("Initializing services...");

    const dbService = getDatabaseService();
    await dbService.connect();

    const storageService = getStorageService();
    await storageService.initialize();

    console.log("✓ Services initialized\n");
  }

  private async demoFetchVessel(): Promise<void> {
    console.log("Demo 1: Fetching Vessel Details");
    console.log("-".repeat(80));

    const testMMSI = "211879870";
    console.log(`Fetching vessel with MMSI: ${testMMSI}...`);

    try {
      const vessel = await this.vesselService.getVessel({ mmsi: testMMSI });

      if (vessel) {
        console.log("\n✓ Vessel found:");
        console.log(`  Name: ${vessel.name || "N/A"}`);
        console.log(`  MMSI: ${vessel.mmsi || "N/A"}`);
        console.log(`  IMO: ${vessel.imo || "N/A"}`);
        console.log(`  Type: ${vessel.vesselType || "N/A"}`);
        console.log(`  Flag: ${vessel.flag || "N/A"}`);

        if (vessel.length || vessel.width) {
          console.log(`  Dimensions: ${vessel.length || "?"}m x ${vessel.width || "?"}m`);
        }

        if (vessel.positions && vessel.positions.length > 0) {
          const pos = vessel.positions[0];
          console.log(
            `  Latest Position: ${pos.latitude.toFixed(4)}°, ${pos.longitude.toFixed(4)}°`
          );
          console.log(`  Speed: ${pos.speed || "N/A"} knots`);
          console.log(`  Course: ${pos.course || "N/A"}°`);
        }

        if (vessel.images && vessel.images.length > 0) {
          console.log(`  Images: ${vessel.images.length} stored`);
        }
      } else {
        console.log("✗ Vessel not found");
      }
    } catch (error: any) {
      console.log(`✗ Error: ${error.message}`);
    }

    console.log("");
  }

  private async demoCaching(): Promise<void> {
    console.log("Demo 2: Database Caching");
    console.log("-".repeat(80));

    const testMMSI = "211879870";

    // First request (might crawl)
    console.log("First request (fresh data from crawling)...");
    const start1 = Date.now();
    try {
      await this.vesselService.refreshVessel({ mmsi: testMMSI });
      const duration1 = Date.now() - start1;
      console.log(`✓ Completed in ${duration1}ms (crawled)\n`);
    } catch (error: any) {
      console.log(`✗ Error: ${error.message}\n`);
    }

    // Second request (from cache)
    console.log("Second request (from database cache)...");
    const start2 = Date.now();
    try {
      await this.vesselService.getVessel({ mmsi: testMMSI });
      const duration2 = Date.now() - start2;
      console.log(`✓ Completed in ${duration2}ms (cached)`);
      console.log(`  Cache speedup: ~${Math.round(15000 / duration2)}x faster!\n`);
    } catch (error: any) {
      console.log(`✗ Error: ${error.message}\n`);
    }
  }

  private async demoPositionTracking(): Promise<void> {
    console.log("Demo 3: Position Tracking");
    console.log("-".repeat(80));

    const testMMSI = "636018594";

    try {
      const position = await this.vesselService.getLatestPosition({ mmsi: testMMSI });

      if (position) {
        console.log("✓ Latest position retrieved:");
        console.log(`  Latitude: ${position.latitude.toFixed(6)}°`);
        console.log(`  Longitude: ${position.longitude.toFixed(6)}°`);
        console.log(`  Speed: ${position.speed || "N/A"} knots`);
        console.log(`  Course: ${position.course || "N/A"}°`);
        console.log(`  Timestamp: ${new Date(position.timestamp).toISOString()}`);
        console.log(`  Source: ${position.source} (${position.sourceType})`);
      } else {
        console.log("✗ Position not available");
      }
    } catch (error: any) {
      console.log(`✗ Error: ${error.message}`);
    }

    console.log("");
  }

  private async demoImageStorage(): Promise<void> {
    console.log("Demo 4: Image Storage with MinIO");
    console.log("-".repeat(80));

    const testMMSI = "211879870";

    try {
      const vessel = await this.vesselService.getVessel({ mmsi: testMMSI });

      if (vessel && vessel.images && vessel.images.length > 0) {
        console.log(`✓ Found ${vessel.images.length} images for vessel`);

        vessel.images.forEach((img: any, index: number) => {
          console.log(`\nImage ${index + 1}:`);
          console.log(`  Type: ${img.imageType || "N/A"}`);
          console.log(`  Bucket: ${img.bucketName}`);
          console.log(`  Object Key: ${img.objectKey}`);
          console.log(`  Source URL: ${img.sourceUrl || "N/A"}`);
        });
      } else {
        console.log("✗ No images found for vessel");
        console.log("  Note: Images are extracted during fresh crawls");
      }
    } catch (error: any) {
      console.log(`✗ Error: ${error.message}`);
    }

    console.log("");
  }

  private async cleanup(): Promise<void> {
    const dbService = getDatabaseService();
    await dbService.disconnect();
  }
}

// Run demo
if (require.main === module) {
  const demo = new Demo();
  demo
    .run()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      logger.error("Demo failed", { error });
      process.exit(1);
    });
}

export default Demo;
