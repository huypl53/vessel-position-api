import Source from "../Source";

interface VesselDetails {
  mmsi: string;
  imo?: string;
  callsign?: string;
  name?: string;
  type?: string;
  length?: number;
  beam?: number;
  draught?: number;
  flag?: string;
  yearBuilt?: number;
  grossTonnage?: number;
  deadweight?: number;
  source: "VesselFinder";
  source_type: "AIS";
  raw?: any;
}

interface VesselPosition {
  latitude: number;
  longitude: number;
  course: number;
  speed: number;
  timestamp: string;
  source: "VesselFinder";
  source_type: "AIS";
  draught?: number;
  destination?: string;
  raw?: any;
}

class VesselFinder extends Source {
  private readonly BASE_URL = "https://www.vesselfinder.com";
  private readonly TIMEOUT_MS = 45000;

  /**
   * Extract vessel details from HTML content
   */
  private extractFromHtml(html: string): Partial<VesselDetails> {
    const extracted: Partial<VesselDetails> = {};

    // Extract from quick info table (class n3/v3)
    // Example: <tr><td class="n3">Callsign</td><td class="v3">9WPJ2</td></tr>
    const quickInfoPatterns: {
      key: keyof VesselDetails;
      pattern: RegExp;
      transform?: (val: string) => any;
    }[] = [
      {
        key: "callsign",
        pattern: /<td class="n3">Callsign<\/td>\s*<td class="v3[^"]*">([^<]+)/i,
      },
      {
        key: "type",
        pattern:
          /<td class="n3">AIS Type<\/td>\s*<td class="v3[^"]*">([^<]+)/i,
      },
      {
        key: "flag",
        pattern: /<td class="n3">AIS Flag<\/td>\s*<td class="v3[^"]*">([^<]+)/i,
      },
    ];

    // Extract Length / Beam combined format: "47 / 11 m"
    const lengthBeamMatch = html.match(
      /<td class="n3">Length \/ Beam<\/td>\s*<td class="v3[^"]*">(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*m/i,
    );
    if (lengthBeamMatch) {
      extracted.length = parseFloat(lengthBeamMatch[1]);
      extracted.beam = parseFloat(lengthBeamMatch[2]);
    }

    // Extract IMO / MMSI combined format: "9895898 / 533132788"
    const imoMmsiMatch = html.match(
      /<td class="n3">IMO \/ MMSI<\/td>\s*<td class="v3[^"]*">(\d+)\s*\/\s*(\d+)/i,
    );
    if (imoMmsiMatch) {
      extracted.imo = imoMmsiMatch[1];
      extracted.mmsi = imoMmsiMatch[2];
    }

    // Extract current draught: "Current draught 2.5 m"
    const draughtMatch = html.match(
      /<td class="n3">Current draught<\/td>\s*<td class="v3[^"]*">([\d.]+)\s*m/i,
    );
    if (draughtMatch) {
      extracted.draught = parseFloat(draughtMatch[1]);
    }

    // Apply quick info patterns
    for (const { key, pattern, transform } of quickInfoPatterns) {
      const match = html.match(pattern);
      if (match) {
        extracted[key] = transform ? transform(match[1].trim()) : match[1].trim();
      }
    }

    // Extract from technical specs table (class tpc1/tpc2)
    // Example: <tr><td class="tpc1">Ship Type</td><td class="tpc2">Landing Craft</td></tr>
    const techSpecPatterns: {
      key: keyof VesselDetails;
      label: string;
      transform?: (val: string) => any;
    }[] = [
      { key: "imo", label: "IMO number" },
      { key: "type", label: "Ship Type" },
      { key: "flag", label: "Flag" },
      {
        key: "length",
        label: "Length Overall",
        transform: (v) => parseFloat(v),
      },
      { key: "beam", label: "Beam", transform: (v) => parseFloat(v) },
      { key: "draught", label: "Draught", transform: (v) => parseFloat(v) },
      {
        key: "grossTonnage",
        label: "Gross Tonnage",
        transform: (v) => parseFloat(v.replace(/,/g, "")),
      },
      {
        key: "deadweight",
        label: "Deadweight",
        transform: (v) => parseFloat(v.replace(/,/g, "")),
      },
    ];

    for (const { key, label, transform } of techSpecPatterns) {
      // Handle labels with <small> tags like "Length Overall <small>(m)</small>"
      const pattern = new RegExp(
        `<td class="tpc1">${label}[^<]*(?:<small>[^<]*<\\/small>)?<\\/td>\\s*<td class="tpc2">([^<]+)`,
        "i",
      );
      const match = html.match(pattern);
      if (match && match[1].trim() !== "-" && match[1].trim() !== "") {
        const value = match[1].trim();
        // Only set if we don't already have a value (quick info takes precedence for some fields)
        if (extracted[key] === undefined) {
          extracted[key] = transform ? transform(value) : value;
        }
      }
    }

    // Extract vessel name from title or description
    // Example: <title>ASB MARINE 3, Landing Craft - Details...</title>
    const titleMatch = html.match(/<title>([^,]+),/);
    if (titleMatch) {
      extracted.name = titleMatch[1].trim();
    }

    // Alternative: from meta description or H1
    // Example: The vessel <strong>ASB MARINE 3</strong>
    if (!extracted.name) {
      const strongMatch = html.match(
        /The vessel\s*<strong>([^<]+)<\/strong>/i,
      );
      if (strongMatch) {
        extracted.name = strongMatch[1].trim();
      }
    }

    // Extract year built from description
    // Example: "is a Landing Craft built in 2023"
    const yearMatch = html.match(/built in (\d{4})/i);
    if (yearMatch) {
      extracted.yearBuilt = parseInt(yearMatch[1]);
    }

    // Extract from JavaScript variables as fallback
    // Example: var vu_imo=9895898;var MMSI=533132788
    if (!extracted.imo) {
      const vuImoMatch = html.match(/var\s+vu_imo\s*=\s*(\d+)/);
      if (vuImoMatch) {
        extracted.imo = vuImoMatch[1];
      }
    }
    if (!extracted.mmsi) {
      const mmsiMatch = html.match(/var\s+MMSI\s*=\s*(\d+)/);
      if (mmsiMatch) {
        extracted.mmsi = mmsiMatch[1];
      }
    }

    return extracted;
  }

  /**
   * Extract position data from HTML content
   */
  private extractPositionFromHtml(html: string): Partial<VesselPosition> {
    const extracted: Partial<VesselPosition> = {};

    // Extract coordinates from various possible formats
    // Look for lat/lon in JavaScript or data attributes
    const latMatch = html.match(
      /(?:latitude|lat)\s*[=:]\s*["']?([-\d.]+)["']?/i,
    );
    const lonMatch = html.match(
      /(?:longitude|lon|lng)\s*[=:]\s*["']?([-\d.]+)["']?/i,
    );

    if (latMatch) {
      extracted.latitude = parseFloat(latMatch[1]);
    }
    if (lonMatch) {
      extracted.longitude = parseFloat(lonMatch[1]);
    }

    // Extract speed and course
    const speedMatch = html.match(
      /<td class="n3">Speed<\/td>\s*<td class="v3[^"]*">([\d.]+)/i,
    );
    const courseMatch = html.match(
      /<td class="n3">Course<\/td>\s*<td class="v3[^"]*">([\d.]+)/i,
    );

    if (speedMatch) {
      extracted.speed = parseFloat(speedMatch[1]);
    }
    if (courseMatch) {
      extracted.course = parseFloat(courseMatch[1]);
    }

    // Extract current draught
    const draughtMatch = html.match(
      /<td class="n3">Current draught<\/td>\s*<td class="v3[^"]*">([\d.]+)/i,
    );
    if (draughtMatch) {
      extracted.draught = parseFloat(draughtMatch[1]);
    }

    // Extract destination
    const destMatch = html.match(
      /<td class="n3">Destination<\/td>\s*<td class="v3[^"]*">([^<]+)/i,
    );
    if (destMatch) {
      extracted.destination = destMatch[1].trim();
    }

    return extracted;
  }

  /**
   * Fetch vessel details by MMSI
   */
  getVesselDetails = async (mmsi: string): Promise<VesselDetails | null> => {
    console.log(`[VesselFinder] Fetching details for MMSI: ${mmsi}`);

    const url = `${this.BASE_URL}/vessels/details/${mmsi}`;
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      // Navigate to vessel details page
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: this.TIMEOUT_MS,
      });

      const finalUrl = page.url();
      console.log(`[VesselFinder] Final URL: ${finalUrl}`);

      // Wait a bit for any dynamic content to load
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Get HTML content
      const html = await page.content();

      // Check for 404 page
      if (html.includes("Error 404") || html.includes("Page not found")) {
        console.log(`[VesselFinder] Vessel not found: ${mmsi}`);
        await page.close();
        return null;
      }

      // Extract data from HTML
      const extracted = this.extractFromHtml(html);

      // Ensure we have the MMSI
      if (!extracted.mmsi) {
        extracted.mmsi = mmsi;
      }

      const result: VesselDetails = {
        mmsi: extracted.mmsi || mmsi,
        imo: extracted.imo,
        callsign: extracted.callsign,
        name: extracted.name,
        type: extracted.type,
        length: extracted.length,
        beam: extracted.beam,
        draught: extracted.draught,
        flag: extracted.flag,
        yearBuilt: extracted.yearBuilt,
        grossTonnage: extracted.grossTonnage,
        deadweight: extracted.deadweight,
        source: "VesselFinder",
        source_type: "AIS",
        raw: extracted,
      };

      console.log(`[VesselFinder] Extracted details:`, result);

      await page.close();
      return result;
    } catch (err) {
      console.error("[VesselFinder] Error fetching details:", err);
      await page.close();
      return null;
    }
  };

  /**
   * Fetch vessel location by MMSI
   * For compatibility with other sources
   */
  getLocation = async (mmsi: string): Promise<VesselPosition | null> => {
    console.log(`[VesselFinder] Fetching location for MMSI: ${mmsi}`);

    const url = `${this.BASE_URL}/vessels/details/${mmsi}`;
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: this.TIMEOUT_MS,
      });

      // Wait for content
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const html = await page.content();

      // Check for 404 page
      if (html.includes("Error 404") || html.includes("Page not found")) {
        console.log(`[VesselFinder] Vessel not found: ${mmsi}`);
        await page.close();
        return null;
      }

      const extracted = this.extractPositionFromHtml(html);

      await page.close();

      // Return null if no coordinates found
      if (
        extracted.latitude === undefined ||
        extracted.longitude === undefined
      ) {
        console.log("[VesselFinder] No position data found in HTML");
        return null;
      }

      return {
        latitude: extracted.latitude,
        longitude: extracted.longitude,
        course: extracted.course || 0,
        speed: extracted.speed || 0,
        timestamp: new Date().toISOString(),
        source: "VesselFinder",
        source_type: "AIS",
        draught: extracted.draught,
        destination: extracted.destination,
        raw: extracted,
      };
    } catch (err) {
      console.error("[VesselFinder] Error fetching location:", err);
      await page.close();
      return null;
    }
  };
}

export default VesselFinder;
