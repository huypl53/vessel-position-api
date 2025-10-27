import express from "express";
import cors from "cors";
import path from "path";
import { api } from "../legacy/api";
import { areaApi } from "../legacy/area";
import ADSBexchange from "./sources/adsb/adsbe";
import vesselRoutes from "../routes/vessel.routes";
import { getDatabaseService } from "../services/database.service";
import { getStorageService } from "../services/storage.service";
import logger, { apiLogger } from "../services/logger.service";

class Server {
  app: any;
  server: any;
  constructor(port) {
    this.init(port);
  }

  async init(port: number) {
    this.app = express();
    this.app.set("port", port);

    // Middleware
    this.app.use(
      cors({
        origin: "*",
      }),
    );
    this.app.use(express.json());

    // Initialize services
    await this.initializeServices();

    // Routes
    this.app.get("/", (_request: any, response: any) => {
      response.sendFile(path.join(__dirname, "/../static/index.html"));
    });

    // Health check
    this.app.get("/health", async (_request: any, response: any) => {
      const dbService = getDatabaseService();
      const dbHealthy = await dbService.healthCheck();

      response.json({
        status: dbHealthy ? "healthy" : "unhealthy",
        database: dbHealthy ? "connected" : "disconnected",
        timestamp: new Date().toISOString(),
      });
    });

    // API routes
    this.app.use("/api/vessels", vesselRoutes);

    this.loadLegacyRoutes();
    this.loadRoutes();

    this.server = this.app.listen(this.app.get("port"), () => {
      logger.info(`Server running on port ${this.app.get("port")}`);
    });
  }

  async initializeServices() {
    try {
      // Initialize database
      const dbService = getDatabaseService();
      await dbService.connect();
      apiLogger.info("Database connected");

      // Initialize storage
      const storageService = getStorageService();
      await storageService.initialize();
      apiLogger.info("Storage initialized");
    } catch (error) {
      apiLogger.error("Failed to initialize services", { error });
      throw error;
    }
  }

  async close() {
    if (this.server) {
      this.server.close();

      // Cleanup services
      const dbService = getDatabaseService();
      await dbService.disconnect();

      logger.info("Server closed");
    }
  }

  loadRoutes() {
    // /:sourcetype/:source/:vehicleidentifier/location/latest
    this.app.get(
      "/ais/mt/:mmsi/location/latest",
      async (req: any, res: any) => {
        try {
          api.getLocationFromMT(req.params.mmsi, (result) => {
            res.send({
              error: null,
              data: result,
            });
          });
        } catch (error) {
          res.send({
            error: error || "Unknown error",
            data: null,
          });
        }
      },
    );
    this.app.get(
      "/adsb/adsbe/:icao/location/latest",
      async (req: any, res: any) => {
        console.log(req.params.icao);
        const adsbe = new ADSBexchange();
        const location = await adsbe.getLocation(req.params.icao);
        console.log(location);
        res.send({
          error: null,
          data: location,
        });
      },
    );
  }

  loadLegacyRoutes() {
    // this route is wrongly named on purpose for legacy reasons.
    // AS VF is not as easy to reverse as the other ones, it is replaced by MST
    this.app.get(
      "/legacy/getLastPositionFromVF/:mmsi",
      (req: any, res: any) => {
        api.getLocationFromMST(req.params.mmsi, (result) => {
          res.send(result);
        });
      },
    );
    this.app.get(
      "/legacy/getLastPositionFromMT/:mmsi",
      (req: any, res: any) => {
        api.getLocationFromMT(req.params.mmsi, (result) => {
          res.send(result);
        });
      },
    );
    this.app.get("/legacy/getLastPosition/:mmsi", (req: any, res: any) => {
      api.getLocation(req.params.mmsi, (result) => {
        res.send(result);
      });
    });
    // e.g. /getVesselsInArea/WMED,EMED
    this.app.get(
      "/legacy/getVesselsInArea/:area",
      async (req: any, res: any) => {
        await areaApi.fetchVesselsInArea(
          req.params.area.split(","),
          (result) => {
            res.json(result);
          },
        );
      },
    );
    this.app.get(
      "/legacy/getVesselsNearMe/:lat/:lng/:distance",
      async (req: any, res: any) => {
        await areaApi.fetchVesselsNearMe(
          req.params.lat,
          req.params.lng,
          req.params.distance,
          (result) => {
            res.json(result);
          },
        );
      },
    );
    this.app.get("/legacy/getVesselsInPort/:shipPort", (req: any, res: any) => {
      api.getVesselsInPort(req.params.shipPort, (result) => {
        res.send(result);
      });
    });
  }
}

export default Server;
