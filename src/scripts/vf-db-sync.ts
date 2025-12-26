#!/usr/bin/env npx tsx
/**
 * VesselFinder Database Sync Script
 *
 * Connects to PostgreSQL, reads incomplete vessel records,
 * crawls VesselFinder for missing data, and updates the database.
 *
 * Features:
 * - Only crawls records with critical fields missing (length AND beam are NULL)
 * - OFFSET pagination for large datasets (200k+ records)
 * - 10 second delay between requests
 * - Downloads vessel images to local storage
 * - Logs all results to file (JSON Lines format)
 *
 * Usage:
 *   npx tsx src/scripts/vf-db-sync.ts
 *   npx tsx src/scripts/vf-db-sync.ts --limit 100
 *   npx tsx src/scripts/vf-db-sync.ts --limit 100 --offset 500
 */

import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import VesselFinder from "../classes/sources/ais/vf";

// Load environment variables
import "dotenv/config";

// Configuration
const config = {
  db: {
    host: process.env.POSTGRES_HOST || "localhost",
    port: parseInt(process.env.POSTGRES_PORT || "5432"),
    database: process.env.POSTGRES_DB || "mariner",
    user: process.env.POSTGRES_USER || "postgres",
    password: process.env.POSTGRES_PASSWORD || "",
  },
  crawlDelayMs: parseInt(process.env.CRAWL_DELAY_MS || "10000"),
  batchSize: parseInt(process.env.CRAWL_BATCH_SIZE || "50"),
  offset: 0,
  imagesPath: process.env.IMAGES_PATH || "./images",
  logsPath: process.env.LOGS_PATH || "./logs",
};

// Parse command line arguments
const args = process.argv.slice(2);
const limitIndex = args.indexOf("--limit");
if (limitIndex !== -1 && args[limitIndex + 1]) {
  config.batchSize = parseInt(args[limitIndex + 1]);
}
const offsetIndex = args.indexOf("--offset");
if (offsetIndex !== -1 && args[offsetIndex + 1]) {
  config.offset = parseInt(args[offsetIndex + 1]);
}

// Ensure directories exist
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Timestamp for log files
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const logFile = path.join(config.logsPath, `vf-sync-${timestamp}.log`);
const resultsFile = path.join(
  config.logsPath,
  `vf-sync-${timestamp}-results.json`,
);

// Logger
class Logger {
  private logStream: fs.WriteStream;
  private resultsStream: fs.WriteStream;

  constructor(logPath: string, resultsPath: string) {
    ensureDir(path.dirname(logPath));
    this.logStream = fs.createWriteStream(logPath, { flags: "a" });
    this.resultsStream = fs.createWriteStream(resultsPath, { flags: "a" });
  }

  log(message: string): void {
    const line = `[${new Date().toISOString()}] ${message}`;
    console.log(line);
    this.logStream.write(line + "\n");
  }

  result(data: any): void {
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...data,
    });
    this.resultsStream.write(line + "\n");
  }

  close(): void {
    this.logStream.end();
    this.resultsStream.end();
  }
}

// Download image from URL
async function downloadImage(
  url: string,
  destPath: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const file = fs.createWriteStream(destPath);
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(destPath);
          resolve(false);
          return;
        }
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve(true);
        });
      })
      .on("error", (err) => {
        file.close();
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath);
        }
        resolve(false);
      });
  });
}

// Main sync function
async function syncVessels(): Promise<void> {
  const logger = new Logger(logFile, resultsFile);

  logger.log("=".repeat(60));
  logger.log("VesselFinder Database Sync");
  logger.log("=".repeat(60));
  logger.log(`Log file: ${logFile}`);
  logger.log(`Results file: ${resultsFile}`);
  logger.log(
    `Database: ${config.db.host}:${config.db.port}/${config.db.database}`,
  );
  logger.log(`Batch size: ${config.batchSize}`);
  logger.log(`Offset: ${config.offset}`);
  logger.log(`Crawl delay: ${config.crawlDelayMs}ms`);
  logger.log(`Images path: ${config.imagesPath}`);

  // Ensure images directory exists
  ensureDir(config.imagesPath);

  // Connect to database
  const pool = new Pool(config.db);

  try {
    // Test connection
    await pool.query("SELECT 1");
    logger.log("Database connected successfully");

    // Query incomplete records (only where BOTH length AND beam are NULL)
    // This is more efficient for large datasets and focuses on critical missing data
    const query = `
      SELECT mmsi FROM mariner25_object
      WHERE length IS NULL
        AND beam IS NULL
      ORDER BY object_id
      LIMIT $1 OFFSET $2
    `;

    // First, get total count of incomplete records
    const countQuery = `
      SELECT COUNT(*) as total FROM mariner25_object
      WHERE length IS NULL AND beam IS NULL
    `;
    const countResult = await pool.query(countQuery);
    const totalInDb = parseInt(countResult.rows[0].total);

    const { rows } = await pool.query(query, [config.batchSize, config.offset]);
    const totalRecords = rows.length;

    logger.log(`Total incomplete in DB: ${totalInDb}`);
    logger.log(`Fetched this batch: ${totalRecords} (offset: ${config.offset})`);
    logger.log("");

    if (totalRecords === 0) {
      logger.log("No incomplete records to process");
      logger.close();
      await pool.end();
      return;
    }

    // Stats
    const stats = {
      total: totalRecords,
      updated: 0,
      notFound: 0,
      errors: 0,
      imagesDownloaded: 0,
    };

    const vf = new VesselFinder();
    const startTime = Date.now();

    // Process each MMSI
    for (let i = 0; i < rows.length; i++) {
      const mmsi = rows[i].mmsi;
      const progress = `[${i + 1}/${totalRecords}]`;

      try {
        logger.log(`${progress} MMSI ${mmsi}...`);

        // Fetch from VesselFinder
        const details = await vf.getVesselDetails(mmsi);

        if (!details) {
          logger.log(`${progress} MMSI ${mmsi}... NOT FOUND`);
          logger.result({ mmsi, status: "not_found" });
          stats.notFound++;
        } else {
          // Update database
          const updateQuery = `
            UPDATE mariner25_object
            SET
              length = COALESCE($2, length),
              beam = COALESCE($3, beam),
              draft = COALESCE($4, draft),
              callsign = COALESCE($5, callsign),
              imo = COALESCE($6, imo),
              type = COALESCE($7, type),
              flag = COALESCE($8, flag),
              image = COALESCE($9, image),
              updated_at = NOW()
            WHERE mmsi = $1
          `;

          await pool.query(updateQuery, [
            mmsi,
            details.length,
            details.beam,
            details.draught,
            details.callsign,
            details.imo,
            details.type,
            details.flag,
            details.imageUrl,
          ]);

          // Download image if available
          let imageDownloaded = false;
          if (details.imageUrl) {
            const imagePath = path.join(config.imagesPath, `${mmsi}.jpg`);
            if (!fs.existsSync(imagePath)) {
              imageDownloaded = await downloadImage(details.imageUrl, imagePath);
              if (imageDownloaded) {
                stats.imagesDownloaded++;
                logger.log(`  Image saved: ${imagePath}`);
              }
            }
          }

          const dataPreview = `length=${details.length || "N/A"}, beam=${details.beam || "N/A"}, draft=${details.draught || "N/A"}`;
          logger.log(`${progress} MMSI ${mmsi}... SUCCESS (${dataPreview})`);

          logger.result({
            mmsi,
            status: "success",
            data: {
              length: details.length,
              beam: details.beam,
              draft: details.draught,
              callsign: details.callsign,
              imo: details.imo,
              type: details.type,
              flag: details.flag,
              imageUrl: details.imageUrl,
              imageDownloaded,
            },
          });

          stats.updated++;
        }
      } catch (err: any) {
        logger.log(`${progress} MMSI ${mmsi}... ERROR: ${err.message}`);
        logger.result({ mmsi, status: "error", error: err.message });
        stats.errors++;
      }

      // Wait before next request (except for last one)
      if (i < rows.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, config.crawlDelayMs));
      }
    }

    // Summary
    const duration = Math.round((Date.now() - startTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;

    logger.log("");
    logger.log("=".repeat(60));
    logger.log("SUMMARY");
    logger.log("=".repeat(60));
    logger.log(`Total: ${stats.total}`);
    logger.log(`Updated: ${stats.updated}`);
    logger.log(`Not Found: ${stats.notFound}`);
    logger.log(`Errors: ${stats.errors}`);
    logger.log(`Images Downloaded: ${stats.imagesDownloaded}`);
    logger.log(`Duration: ${minutes}m ${seconds}s`);
    logger.log("");
    logger.log(`Results saved to: ${resultsFile}`);

    // Suggest next offset for pagination
    const nextOffset = config.offset + config.batchSize;
    const remaining = totalInDb - nextOffset;
    if (remaining > 0) {
      logger.log("");
      logger.log(`Remaining records: ~${remaining}`);
      logger.log(`Next command: npx tsx src/scripts/vf-db-sync.ts --limit ${config.batchSize} --offset ${nextOffset}`);
    }

    // Close connections
    await pool.end();
    logger.close();

    console.log("\nSync complete!");
  } catch (err: any) {
    logger.log(`FATAL ERROR: ${err.message}`);
    logger.close();
    await pool.end();
    process.exit(1);
  }
}

// Handle graceful shutdown
let isShuttingDown = false;
process.on("SIGINT", () => {
  if (!isShuttingDown) {
    isShuttingDown = true;
    console.log("\n\nReceived SIGINT. Shutting down gracefully...");
    process.exit(0);
  }
});

// Run
syncVessels().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
