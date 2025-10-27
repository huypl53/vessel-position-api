import { Router, Request, Response } from "express";
import { getVesselService } from "../services/vessel.service";
import { apiLogger } from "../services/logger.service";

const router = Router();
const vesselService = getVesselService();

/**
 * GET /api/vessels/:identifier
 * Get vessel by MMSI or IMO
 */
router.get("/:identifier", async (req: Request, res: Response) => {
  const { identifier } = req.params;
  const { refresh } = req.query;

  apiLogger.info("GET /api/vessels/:identifier", { identifier, refresh });

  try {
    // Determine if identifier is MMSI or IMO
    const isMMSI = /^\d{9}$/.test(identifier);
    const isIMO = /^\d{7}$/.test(identifier);

    if (!isMMSI && !isIMO) {
      return res.status(400).json({
        error: "Invalid identifier. Must be 9-digit MMSI or 7-digit IMO",
        data: null,
      });
    }

    const query = isMMSI ? { mmsi: identifier } : { imo: identifier };

    let vessel;
    if (refresh === "true") {
      vessel = await vesselService.refreshVessel(query);
    } else {
      vessel = await vesselService.getVessel(query);
    }

    if (!vessel) {
      return res.status(404).json({
        error: "Vessel not found",
        data: null,
      });
    }

    apiLogger.info("Vessel retrieved successfully", {
      vesselId: vessel.id,
      identifier,
    });

    res.json({
      error: null,
      data: vessel,
    });
  } catch (error: any) {
    apiLogger.error("Error retrieving vessel", { identifier, error });

    res.status(500).json({
      error: error.message || "Failed to retrieve vessel",
      data: null,
    });
  }
});

/**
 * GET /api/vessels/:identifier/position/latest
 * Get latest position for a vessel
 */
router.get("/:identifier/position/latest", async (req: Request, res: Response) => {
  const { identifier } = req.params;

  apiLogger.info("GET /api/vessels/:identifier/position/latest", { identifier });

  try {
    const isMMSI = /^\d{9}$/.test(identifier);
    const isIMO = /^\d{7}$/.test(identifier);

    if (!isMMSI && !isIMO) {
      return res.status(400).json({
        error: "Invalid identifier. Must be 9-digit MMSI or 7-digit IMO",
        data: null,
      });
    }

    const query = isMMSI ? { mmsi: identifier } : { imo: identifier };
    const position = await vesselService.getLatestPosition(query);

    if (!position) {
      return res.status(404).json({
        error: "Position not found",
        data: null,
      });
    }

    res.json({
      error: null,
      data: position,
    });
  } catch (error: any) {
    apiLogger.error("Error retrieving position", { identifier, error });

    res.status(500).json({
      error: error.message || "Failed to retrieve position",
      data: null,
    });
  }
});

/**
 * POST /api/vessels/:identifier/refresh
 * Force refresh vessel data
 */
router.post("/:identifier/refresh", async (req: Request, res: Response) => {
  const { identifier } = req.params;

  apiLogger.info("POST /api/vessels/:identifier/refresh", { identifier });

  try {
    const isMMSI = /^\d{9}$/.test(identifier);

    if (!isMMSI) {
      return res.status(400).json({
        error: "Invalid identifier. Must be 9-digit MMSI for refresh",
        data: null,
      });
    }

    const vessel = await vesselService.refreshVessel({ mmsi: identifier });

    res.json({
      error: null,
      data: vessel,
    });
  } catch (error: any) {
    apiLogger.error("Error refreshing vessel", { identifier, error });

    res.status(500).json({
      error: error.message || "Failed to refresh vessel",
      data: null,
    });
  }
});

export default router;
