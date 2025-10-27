import express from "express";
import cors from "cors";
import path from "path";
import { api } from "../legacy/api";
import { areaApi } from "../legacy/area";
import ADSBexchange from "./sources/adsb/adsbe";
import vesselService, { detectIdentifierType as detectIdType } from "../services/vesselService";
import logger from "../lib/logger";

function parseBoolean(value: any): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return ["true", "1", "yes", "y"].includes(value.toLowerCase());
  }
  return false;
}

function normalizeIdentifierType(value: any): "mmsi" | "imo" | undefined {
  if (value === "mmsi" || value === "imo") {
    return value;
  }
  return undefined;
}
class Server {
  app: any;
  server: any;
  constructor(port) {
    this.init(port);
  }

  init(port: number) {
    this.app = express();
    this.app.set("port", port);
    this.app.use(
      cors({
        origin: "*",
      }),
    );
    this.app.get("/", (_request: any, response: any) => {
      response.sendFile(path.join(__dirname, "/../static/index.html"));
    });
    this.loadLegacyRoutes();
    this.loadRoutes();
    this.server = this.app.listen(this.app.get("port"), () => {
      logger.info(
        { port: this.app.get("port") },
        "API server is listening",
      );
    });
  }

  close() {
    if (this.server) {
      this.server.close();
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
        logger.debug({ icao: req.params.icao }, "ADS-B lookup request");
        const adsbe = new ADSBexchange();
        const location = await adsbe.getLocation(req.params.icao);
        logger.debug({ location }, "ADS-B response");
        res.send({
          error: null,
          data: location,
        });
      },
    );
    this.app.get("/vessels/:identifier", async (req: any, res: any) => {
      try {
        const identifier = req.params.identifier;
        const type =
          normalizeIdentifierType(req.query.type) ??
          detectIdType(identifier);
        const forceRefresh = parseBoolean(req.query.force ?? req.query.refresh);

        logger.info(
          { identifier, type, forceRefresh },
          "Vessel lookup requested",
        );

        const detail = await vesselService.getVessel({
          identifier,
          type,
          forceRefresh,
        });

        res.json({
          error: null,
          data: detail,
        });
      } catch (error) {
        logger.error(
          { err: error },
          "Failed to resolve vessel details",
        );
        res.status(500).json({
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch vessel details",
          data: null,
        });
      }
    });
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
