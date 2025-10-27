#!/usr/bin/env ts-node
import dotenv from "dotenv";
import { getVesselService } from "../src/services/vessel.service";
import logger from "../src/services/logger.service";
import { getDatabaseService } from "../src/services/database.service";
import { getStorageService } from "../src/services/storage.service";

dotenv.config();

interface BenchmarkResult {
  operation: string;
  duration: number;
  success: boolean;
  error?: string;
}

/**
 * Benchmark tool to test bot detection bypass and system performance
 */
class Benchmark {
  private vesselService: any;
  private results: BenchmarkResult[] = [];

  constructor() {
    this.vesselService = getVesselService();
  }

  async run(): Promise<void> {
    logger.info("Starting benchmark tests...");

    // Initialize services
    await this.initializeServices();

    // Test cases with real MMSI numbers (these are public test vessels)
    const testMMSIs = [
      "211879870", // Test vessel
      "636018594", // Common test MMSI
      "247331100", // Another test vessel
    ];

    // Benchmark 1: Single vessel crawl
    await this.benchmarkSingleVessel(testMMSIs[0]);

    // Benchmark 2: Cached retrieval
    await this.benchmarkCachedRetrieval(testMMSIs[0]);

    // Benchmark 3: Multiple concurrent requests
    await this.benchmarkConcurrentRequests(testMMSIs);

    // Benchmark 4: Bot detection bypass test
    await this.benchmarkBotDetection(testMMSIs);

    // Print results
    this.printResults();

    // Cleanup
    await this.cleanup();
  }

  private async initializeServices(): Promise<void> {
    const startTime = Date.now();
    try {
      const dbService = getDatabaseService();
      await dbService.connect();

      const storageService = getStorageService();
      await storageService.initialize();

      const duration = Date.now() - startTime;
      this.results.push({
        operation: "Service Initialization",
        duration,
        success: true,
      });

      logger.info(`Services initialized in ${duration}ms`);
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.results.push({
        operation: "Service Initialization",
        duration,
        success: false,
        error: error.message,
      });
    }
  }

  private async benchmarkSingleVessel(mmsi: string): Promise<void> {
    logger.info(`Benchmark: Single vessel crawl (MMSI: ${mmsi})`);

    const startTime = Date.now();
    try {
      await this.vesselService.refreshVessel({ mmsi });
      const duration = Date.now() - startTime;

      this.results.push({
        operation: "Single Vessel Crawl (with caching)",
        duration,
        success: true,
      });

      logger.info(`Single vessel crawl completed in ${duration}ms`);
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.results.push({
        operation: "Single Vessel Crawl",
        duration,
        success: false,
        error: error.message,
      });

      logger.error(`Single vessel crawl failed: ${error.message}`);
    }
  }

  private async benchmarkCachedRetrieval(mmsi: string): Promise<void> {
    logger.info(`Benchmark: Cached retrieval (MMSI: ${mmsi})`);

    const startTime = Date.now();
    try {
      await this.vesselService.getVessel({ mmsi });
      const duration = Date.now() - startTime;

      this.results.push({
        operation: "Cached Vessel Retrieval",
        duration,
        success: true,
      });

      logger.info(`Cached retrieval completed in ${duration}ms`);
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.results.push({
        operation: "Cached Vessel Retrieval",
        duration,
        success: false,
        error: error.message,
      });
    }
  }

  private async benchmarkConcurrentRequests(mmsis: string[]): Promise<void> {
    logger.info(`Benchmark: ${mmsis.length} concurrent requests`);

    const startTime = Date.now();
    try {
      const promises = mmsis.map((mmsi) =>
        this.vesselService.getVessel({ mmsi }).catch((err: Error) => {
          logger.warn(`Failed to fetch ${mmsi}: ${err.message}`);
          return null;
        })
      );

      const results = await Promise.all(promises);
      const successCount = results.filter((r) => r !== null).length;
      const duration = Date.now() - startTime;

      this.results.push({
        operation: `Concurrent Requests (${successCount}/${mmsis.length} succeeded)`,
        duration,
        success: successCount > 0,
      });

      logger.info(
        `Concurrent requests completed in ${duration}ms (${successCount}/${mmsis.length} succeeded)`
      );
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.results.push({
        operation: "Concurrent Requests",
        duration,
        success: false,
        error: error.message,
      });
    }
  }

  private async benchmarkBotDetection(mmsis: string[]): Promise<void> {
    logger.info("Benchmark: Bot detection bypass test");

    let successCount = 0;
    let totalDuration = 0;

    for (const mmsi of mmsis) {
      const startTime = Date.now();
      try {
        await this.vesselService.refreshVessel({ mmsi });
        const duration = Date.now() - startTime;
        totalDuration += duration;
        successCount++;

        logger.info(`Bot bypass test ${successCount}: Success in ${duration}ms`);

        // Add delay between requests to simulate realistic usage
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error: any) {
        const duration = Date.now() - startTime;
        totalDuration += duration;

        logger.warn(`Bot bypass test failed: ${error.message}`);

        // Check if failure is due to bot detection
        if (
          error.message?.includes("timeout") ||
          error.message?.includes("blocked") ||
          error.message?.includes("403")
        ) {
          logger.error("DETECTED: Bot detection may be triggered!");
        }
      }
    }

    const avgDuration = totalDuration / mmsis.length;
    const successRate = (successCount / mmsis.length) * 100;

    this.results.push({
      operation: `Bot Detection Bypass (${successRate.toFixed(1)}% success rate)`,
      duration: avgDuration,
      success: successCount > 0,
    });

    logger.info(
      `Bot detection test: ${successCount}/${mmsis.length} succeeded (${successRate.toFixed(1)}%)`
    );
    logger.info(`Average duration: ${avgDuration.toFixed(0)}ms`);
  }

  private printResults(): void {
    console.log("\n" + "=".repeat(80));
    console.log("BENCHMARK RESULTS");
    console.log("=".repeat(80));

    const successfulTests = this.results.filter((r) => r.success).length;
    const totalTests = this.results.length;

    console.log(`\nTotal Tests: ${totalTests}`);
    console.log(`Successful: ${successfulTests}`);
    console.log(`Failed: ${totalTests - successfulTests}`);
    console.log(`Success Rate: ${((successfulTests / totalTests) * 100).toFixed(1)}%\n`);

    console.log("Detailed Results:");
    console.log("-".repeat(80));

    this.results.forEach((result) => {
      const status = result.success ? "✓" : "✗";
      const color = result.success ? "\x1b[32m" : "\x1b[31m";
      const reset = "\x1b[0m";

      console.log(
        `${color}${status}${reset} ${result.operation.padEnd(50)} ${result.duration.toFixed(0)}ms`
      );

      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }
    });

    console.log("=".repeat(80) + "\n");
  }

  private async cleanup(): Promise<void> {
    try {
      const dbService = getDatabaseService();
      await dbService.disconnect();

      logger.info("Cleanup completed");
    } catch (error: any) {
      logger.error("Cleanup failed", { error });
    }
  }
}

// Run benchmark
if (require.main === module) {
  const benchmark = new Benchmark();
  benchmark
    .run()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      logger.error("Benchmark failed", { error });
      process.exit(1);
    });
}

export default Benchmark;
