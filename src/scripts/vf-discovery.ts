#!/usr/bin/env npx tsx
/**
 * VesselFinder Network Traffic Discovery Script
 *
 * This script analyzes network traffic from VesselFinder to identify:
 * 1. API endpoints that return vessel data
 * 2. HTML structure containing vessel details
 * 3. The best method for extracting: Length, Beam, Draught, Type, Callsign
 */

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

interface NetworkLog {
  type: "REQUEST" | "RESPONSE";
  url: string;
  method?: string;
  resourceType?: string;
  status?: number;
  contentType?: string;
  bodyPreview?: string;
  timestamp: string;
}

async function analyzeVesselFinderTraffic(mmsi: string) {
  console.log("=== VesselFinder Network Traffic Analysis ===\n");
  console.log(`Target MMSI: ${mmsi}`);
  console.log(`URL: https://www.vesselfinder.com/vessels/details/${mmsi}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1280, height: 1400 },
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ],
  });

  const page = await browser.newPage();
  const networkLogs: NetworkLog[] = [];
  const jsonResponses: { url: string; data: any }[] = [];

  // Capture all requests
  page.on("request", (request) => {
    networkLogs.push({
      type: "REQUEST",
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      timestamp: new Date().toISOString(),
    });
  });

  // Capture all responses
  page.on("response", async (response) => {
    const contentType = response.headers()["content-type"] || "";
    const url = response.url();

    // Log response
    networkLogs.push({
      type: "RESPONSE",
      url,
      status: response.status(),
      contentType,
      timestamp: new Date().toISOString(),
    });

    // Capture JSON responses for analysis
    if (contentType.includes("json")) {
      try {
        const body = await response.text();
        const data = JSON.parse(body);
        jsonResponses.push({ url, data });
        console.log(`[JSON] ${url.substring(0, 80)}...`);
      } catch {
        // Ignore parse errors
      }
    }
  });

  try {
    console.log("Loading page...\n");
    await page.goto(`https://www.vesselfinder.com/vessels/details/${mmsi}`, {
      waitUntil: "networkidle0",
      timeout: 60000,
    });

    console.log(`Final URL: ${page.url()}\n`);

    // Extract HTML content
    const html = await page.content();

    // Analyze HTML structure for vessel details
    console.log("=== HTML Analysis ===\n");

    // Look for common vessel detail patterns
    const vesselDataPatterns = [
      { name: "Length", pattern: /Length[^<]*<[^>]*>([^<]+)/i },
      { name: "Beam", pattern: /Beam[^<]*<[^>]*>([^<]+)/i },
      { name: "Draught", pattern: /Draught[^<]*<[^>]*>([^<]+)/i },
      { name: "Type", pattern: /Type[^<]*<[^>]*>([^<]+)/i },
      { name: "Callsign", pattern: /Call\s*sign[^<]*<[^>]*>([^<]+)/i },
      { name: "IMO", pattern: /IMO[^<]*<[^>]*>([^<]+)/i },
      { name: "MMSI", pattern: /MMSI[^<]*<[^>]*>([^<]+)/i },
      { name: "Flag", pattern: /Flag[^<]*<[^>]*>([^<]+)/i },
      { name: "Gross Tonnage", pattern: /Gross\s*Tonnage[^<]*<[^>]*>([^<]+)/i },
      { name: "Deadweight", pattern: /Dead\s*weight[^<]*<[^>]*>([^<]+)/i },
    ];

    console.log("Vessel details found in HTML:");
    for (const { name, pattern } of vesselDataPatterns) {
      const match = html.match(pattern);
      if (match) {
        console.log(`  ${name}: ${match[1].trim()}`);
      }
    }

    // Look for Length/Beam combined format
    const dimensionsMatch = html.match(
      /Length\s*[\/x]\s*Beam[^<]*<[^>]*>([^<]+)/i,
    );
    if (dimensionsMatch) {
      console.log(`  Length/Beam (combined): ${dimensionsMatch[1].trim()}`);
    }

    // Look for table-based data
    console.log("\n=== Table Structure Analysis ===\n");
    const tableRows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    const vesselRows = tableRows.filter(
      (row) =>
        /length|beam|draught|type|callsign|imo|mmsi|flag/i.test(row) &&
        /<th|<td/i.test(row),
    );

    if (vesselRows.length > 0) {
      console.log(`Found ${vesselRows.length} table rows with vessel data`);
      vesselRows.slice(0, 5).forEach((row, i) => {
        const cleanRow = row.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
        console.log(`  Row ${i + 1}: ${cleanRow.trim().substring(0, 100)}`);
      });
    }

    // Look for dl/dt/dd structure
    const dlMatch = html.match(/<dl[\s\S]*?<\/dl>/gi);
    if (dlMatch) {
      console.log(`\nFound ${dlMatch.length} definition lists (dl)`);
    }

    // Look for specific CSS classes or IDs
    const vesselInfoSection = html.match(
      /class="[^"]*vessel[^"]*"[^>]*>[\s\S]{0,2000}/gi,
    );
    if (vesselInfoSection) {
      console.log(
        `\nFound ${vesselInfoSection.length} sections with 'vessel' in class`,
      );
    }

    // Analyze JSON responses
    console.log("\n=== JSON API Responses ===\n");
    if (jsonResponses.length === 0) {
      console.log("No JSON API responses captured");
    } else {
      console.log(`Found ${jsonResponses.length} JSON responses:\n`);
      for (const { url, data } of jsonResponses) {
        console.log(`URL: ${url}`);
        console.log(`Data preview: ${JSON.stringify(data).substring(0, 300)}`);
        console.log("---");
      }
    }

    // Check for XHR/Fetch patterns in scripts
    console.log("\n=== Script Analysis ===\n");
    const scripts = await page.$$eval("script", (scripts) =>
      scripts
        .map((s) => s.innerHTML || s.src)
        .filter((s) => s && s.length > 0),
    );
    const apiPatterns = scripts.filter(
      (s) => /api|fetch|ajax|xhr|vessel/i.test(s) && s.length < 1000,
    );
    console.log(
      `Found ${scripts.length} scripts, ${apiPatterns.length} may contain API calls`,
    );

    // Save full HTML for manual inspection
    const fs = await import("fs");
    const outputPath = `/tmp/vf-${mmsi}-${Date.now()}.html`;
    fs.writeFileSync(outputPath, html);
    console.log(`\nFull HTML saved to: ${outputPath}`);

    // Summary
    console.log("\n=== Summary ===\n");
    console.log(
      `Total requests: ${networkLogs.filter((l) => l.type === "REQUEST").length}`,
    );
    console.log(
      `Total responses: ${networkLogs.filter((l) => l.type === "RESPONSE").length}`,
    );
    console.log(`JSON responses: ${jsonResponses.length}`);

    // XHR/Fetch URLs
    console.log("\n=== Potentially Useful URLs ===\n");
    const interestingUrls = networkLogs
      .filter(
        (l) =>
          l.type === "RESPONSE" &&
          (l.contentType?.includes("json") ||
            /api|vessel|ship|data|position|detail/i.test(l.url)),
      )
      .map((l) => l.url);

    [...new Set(interestingUrls)].forEach((url) => console.log(url));

    return {
      jsonResponses,
      html,
      networkLogs,
    };
  } catch (err) {
    console.error("Error during analysis:", err);
    throw err;
  } finally {
    await browser.close();
  }
}

// Run with target MMSI
const targetMMSI = process.argv[2] || "533132788";
analyzeVesselFinderTraffic(targetMMSI)
  .then(() => {
    console.log("\nDiscovery complete!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Discovery failed:", err);
    process.exit(1);
  });
