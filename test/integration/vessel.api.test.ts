import request from "supertest";
import express from "express";
import vesselRoutes from "../../src/routes/vessel.routes";

// Mock vessel service
jest.mock("../../src/services/vessel.service", () => ({
  getVesselService: jest.fn(() => ({
    getVessel: jest.fn().mockResolvedValue({
      id: "test-id",
      mmsi: "123456789",
      imo: "1234567",
      name: "Test Vessel",
      vesselType: "Cargo",
      length: 200,
      width: 30,
      positions: [
        {
          id: "pos-1",
          latitude: 35.5,
          longitude: -120.5,
          speed: 12.5,
          course: 180,
          timestamp: new Date(),
          source: "MarineTraffic",
          sourceType: "AIS",
        },
      ],
      images: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastCrawled: new Date(),
    }),
    getLatestPosition: jest.fn().mockResolvedValue({
      id: "pos-1",
      vesselId: "test-id",
      latitude: 35.5,
      longitude: -120.5,
      speed: 12.5,
      course: 180,
      timestamp: new Date(),
      source: "MarineTraffic",
      sourceType: "AIS",
      createdAt: new Date(),
    }),
    refreshVessel: jest.fn().mockResolvedValue({
      id: "test-id",
      mmsi: "123456789",
      name: "Test Vessel",
      positions: [],
      images: [],
    }),
  })),
}));

describe("Vessel API Integration Tests", () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use("/api/vessels", vesselRoutes);
  });

  describe("GET /api/vessels/:identifier", () => {
    it("should return vessel by MMSI", async () => {
      const response = await request(app)
        .get("/api/vessels/123456789")
        .expect(200);

      expect(response.body).toHaveProperty("error", null);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toHaveProperty("mmsi", "123456789");
      expect(response.body.data).toHaveProperty("name", "Test Vessel");
    });

    it("should return vessel by IMO", async () => {
      const response = await request(app)
        .get("/api/vessels/1234567")
        .expect(200);

      expect(response.body).toHaveProperty("error", null);
      expect(response.body).toHaveProperty("data");
    });

    it("should return 400 for invalid identifier", async () => {
      const response = await request(app)
        .get("/api/vessels/invalid")
        .expect(400);

      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toContain("Invalid identifier");
    });
  });

  describe("GET /api/vessels/:identifier/position/latest", () => {
    it("should return latest position", async () => {
      const response = await request(app)
        .get("/api/vessels/123456789/position/latest")
        .expect(200);

      expect(response.body).toHaveProperty("error", null);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toHaveProperty("latitude");
      expect(response.body.data).toHaveProperty("longitude");
      expect(response.body.data).toHaveProperty("source", "MarineTraffic");
    });

    it("should return 400 for invalid identifier", async () => {
      const response = await request(app)
        .get("/api/vessels/abc/position/latest")
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("POST /api/vessels/:identifier/refresh", () => {
    it("should force refresh vessel data", async () => {
      const response = await request(app)
        .post("/api/vessels/123456789/refresh")
        .expect(200);

      expect(response.body).toHaveProperty("error", null);
      expect(response.body).toHaveProperty("data");
    });

    it("should return 400 for invalid MMSI", async () => {
      const response = await request(app)
        .post("/api/vessels/invalid/refresh")
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });
  });
});
