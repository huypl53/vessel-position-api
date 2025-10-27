import dotenv from "dotenv";
import http from "http";
import https from "https";

dotenv.config();
const RUN_CURL_TESTS = process.env.RUN_CURL_TESTS === "true";
const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;
let serverInstance: { close: () => void } | null = null;
const API_URL = process.env.API_URL ?? "http://localhost:" + PORT;

async function fetchUrl(
  url: string,
): Promise<{ status: number; body: string }> {
  return await new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, body: data });
        });
      })
      .on("error", reject);
  });
}

const tests: Array<[string, string]> = [
  ["/ais/mt/211879870/location/latest", "Get latest vessel location by MMSI"],
  [
    "/adsb/adsbe/abc123/location/latest",
    "Get latest aircraft location by ICAO",
  ],
  [
    "/legacy/getLastPositionFromVF/211879870",
    "Legacy: Get last position from MST",
  ],
  [
    "/legacy/getLastPositionFromMT/211879870",
    "Legacy: Get last position from Marinetraffic",
  ],
  ["/legacy/getLastPosition/211879870", "Legacy: Get last position (default)"],
  // ['/legacy/getVesselsInArea/WMED,EMED', 'Legacy: Get vessels in area'],
  // ['/legacy/getVesselsNearMe/37.7749/-122.4194/10', 'Legacy: Get vessels near a location'],
  // ['/legacy/getVesselsInPort/Hamburg', 'Legacy: Get vessels in port']
];

const describeFn = RUN_CURL_TESTS ? describe : describe.skip;

describeFn("API endpoint integration tests", () => {
  beforeAll(async () => {
    if (RUN_CURL_TESTS) {
      const { default: Server } = await import("../src/classes/server");
      serverInstance = new Server(PORT);
    }
  });

  afterAll(() => {
    serverInstance?.close();
  });

  tests.forEach(([path, desc]) => {
    test(
      desc + ` (${path})`,
      async () => {
        const url = API_URL + path;
        const res = await fetchUrl(url);
        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(500);
        // Try to parse as JSON, otherwise just check body is not empty
        try {
          const json = JSON.parse(res.body);
          expect(json).toBeDefined();
        } catch {
          expect(res.body).toBeTruthy();
        }
      },
      60000,
    ); // Allow up to 60s per test for slow endpoints
  });
});
