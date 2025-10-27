import { PrismaClient } from "@prisma/client";
import { dbLogger } from "./logger.service";

class DatabaseService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient({
      log: [
        { level: "query", emit: "event" },
        { level: "error", emit: "event" },
        { level: "warn", emit: "event" },
      ],
    });

    // Log database queries in development
    if (process.env.NODE_ENV !== "production") {
      this.prisma.$on("query" as never, (e: any) => {
        dbLogger.debug("Query executed", {
          query: e.query,
          duration: e.duration,
        });
      });
    }

    this.prisma.$on("error" as never, (e: any) => {
      dbLogger.error("Database error", { error: e });
    });

    this.prisma.$on("warn" as never, (e: any) => {
      dbLogger.warn("Database warning", { warning: e });
    });

    dbLogger.info("Database service initialized");
  }

  async connect(): Promise<void> {
    try {
      await this.prisma.$connect();
      dbLogger.info("Database connected successfully");
    } catch (error) {
      dbLogger.error("Failed to connect to database", { error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.prisma.$disconnect();
      dbLogger.info("Database disconnected");
    } catch (error) {
      dbLogger.error("Failed to disconnect from database", { error });
      throw error;
    }
  }

  getClient(): PrismaClient {
    return this.prisma;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      dbLogger.error("Database health check failed", { error });
      return false;
    }
  }
}

// Singleton instance
let databaseServiceInstance: DatabaseService | null = null;

export function getDatabaseService(): DatabaseService {
  if (!databaseServiceInstance) {
    databaseServiceInstance = new DatabaseService();
  }
  return databaseServiceInstance;
}

export { DatabaseService };
