import Source from "../Source";
import { VesselDetails } from "./VesselDetails.interface";
import { crawlerLogger } from "../../../services/logger.service";
import * as cheerio from "cheerio";

class MarineTrafficEnhanced extends Source {
  /**
   * Get comprehensive vessel details including identity, specifications, and images
   */
  async getVesselDetails(mmsi: string): Promise<VesselDetails> {
    crawlerLogger.info(`Fetching vessel details for MMSI: ${mmsi}`);

    const url = `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${mmsi}`;
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    const details: VesselDetails = {
      mmsi,
    };

    try {
      // Set up response interceptors
      const positionPromise = this.interceptVesselPosition(page);
      const detailsPromise = this.interceptVesselDetails(page);

      // Navigate to the page
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

      crawlerLogger.debug(`Page loaded: ${page.url()}`);

      // Wait for page to load and extract data
      await page.waitForTimeout(2000);

      // Extract data from intercepted API calls
      const [positionData, apiDetails] = await Promise.allSettled([
        positionPromise,
        detailsPromise,
      ]);

      if (positionData.status === "fulfilled" && positionData.value) {
        details.position = positionData.value;
      }

      if (apiDetails.status === "fulfilled" && apiDetails.value) {
        Object.assign(details, apiDetails.value);
      }

      // Scrape additional details from the page HTML
      const htmlContent = await page.content();
      const scrapedDetails = this.scrapeVesselDetails(htmlContent, mmsi);
      Object.assign(details, scrapedDetails);

      // Extract images
      details.images = await this.extractImages(page);

      crawlerLogger.info(`Successfully fetched details for MMSI: ${mmsi}`, {
        hasPosition: !!details.position,
        hasImages: details.images && details.images.length > 0,
      });

      return details;
    } catch (error) {
      crawlerLogger.error(`Failed to fetch vessel details for MMSI: ${mmsi}`, { error });
      throw error;
    } finally {
      await browser.close();
    }
  }

  /**
   * Intercept vessel position API response
   */
  private interceptVesselPosition(page: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve(null);
      }, 15000);

      page.on("response", async (response: any) => {
        const reqUrl = response.url();
        if (/vessels\/.*\/position/.test(reqUrl)) {
          try {
            const body = await response.text();
            const parsedData = JSON.parse(body);

            const position = {
              latitude: parseFloat(
                parsedData.lat ?? parsedData.latitude ?? 0
              ),
              longitude: parseFloat(
                parsedData.lon ?? parsedData.longitude ?? 0
              ),
              course: parseFloat(
                parsedData.course ?? parsedData.heading ?? 0
              ),
              speed: parseFloat(parsedData.speed ?? 0),
              heading: parseInt(parsedData.heading ?? parsedData.course ?? 0),
              timestamp: new Date(
                (parsedData.timestamp ?? parsedData.lastPos ?? 0) * 1000
              ),
              source: "MarineTraffic",
              sourceType: "AIS",
            };

            clearTimeout(timeout);
            resolve(position);
          } catch (err) {
            crawlerLogger.error("Failed to parse position response", { err });
            resolve(null);
          }
        }
      });
    });
  }

  /**
   * Intercept vessel details API response
   */
  private interceptVesselDetails(page: any): Promise<Partial<VesselDetails> | null> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(null);
      }, 15000);

      page.on("response", async (response: any) => {
        const reqUrl = response.url();
        if (/vessels\/.*\/details/.test(reqUrl) || /shipdetails/.test(reqUrl)) {
          try {
            const body = await response.text();
            const parsedData = JSON.parse(body);

            const details: Partial<VesselDetails> = {
              imo: parsedData.imo?.toString(),
              name: parsedData.name || parsedData.shipName,
              callsign: parsedData.callsign,
              flag: parsedData.flag,
              vesselType: parsedData.type || parsedData.vesselType,
              vesselTypeCode: parsedData.typeCode,
              length: parseFloat(parsedData.length ?? 0) || undefined,
              width: parseFloat(parsedData.width ?? parsedData.beam ?? 0) || undefined,
              draught: parseFloat(parsedData.draught ?? parsedData.draft ?? 0) || undefined,
              deadweight: parseInt(parsedData.deadweight ?? parsedData.dwt ?? 0) || undefined,
              grossTonnage: parseInt(parsedData.gt ?? parsedData.grossTonnage ?? 0) || undefined,
              yearBuilt: parseInt(parsedData.yearBuilt ?? parsedData.built ?? 0) || undefined,
              builder: parsedData.builder,
              destination: parsedData.destination,
            };

            clearTimeout(timeout);
            resolve(details);
          } catch (err) {
            crawlerLogger.error("Failed to parse details response", { err });
            resolve(null);
          }
        }
      });
    });
  }

  /**
   * Scrape vessel details from HTML content
   */
  private scrapeVesselDetails(html: string, mmsi: string): Partial<VesselDetails> {
    const $ = cheerio.load(html);
    const details: Partial<VesselDetails> = { mmsi };

    try {
      // Extract vessel name
      const vesselName = $("h1.vessel-name, h1[itemprop='name']").first().text().trim();
      if (vesselName) {
        details.name = vesselName;
      }

      // Extract IMO from various possible locations
      const imoText = $("td:contains('IMO')").next().text().trim() ||
                      $("span:contains('IMO')").parent().find("strong, b").text().trim();
      if (imoText) {
        const imoMatch = imoText.match(/\d{7}/);
        if (imoMatch) {
          details.imo = imoMatch[0];
        }
      }

      // Extract vessel type
      const vesselType = $("td:contains('Vessel Type')").next().text().trim() ||
                        $("span:contains('Type')").parent().find("a").text().trim();
      if (vesselType) {
        details.vesselType = vesselType;
      }

      // Extract flag
      const flag = $("td:contains('Flag')").next().text().trim() ||
                   $("img[alt*='flag']").attr("alt");
      if (flag) {
        details.flag = flag.replace(/flag/gi, "").trim();
      }

      // Extract dimensions
      const lengthText = $("td:contains('Length')").next().text().trim();
      if (lengthText) {
        const lengthMatch = lengthText.match(/(\d+\.?\d*)/);
        if (lengthMatch) {
          details.length = parseFloat(lengthMatch[1]);
        }
      }

      const widthText = $("td:contains('Width'), td:contains('Beam')").next().text().trim();
      if (widthText) {
        const widthMatch = widthText.match(/(\d+\.?\d*)/);
        if (widthMatch) {
          details.width = parseFloat(widthMatch[1]);
        }
      }

      crawlerLogger.debug("Scraped vessel details from HTML", { details });
    } catch (error) {
      crawlerLogger.error("Error scraping vessel details", { error });
    }

    return details;
  }

  /**
   * Extract vessel images from the page
   */
  private async extractImages(page: any): Promise<Array<{ url: string; type?: string }>> {
    try {
      const images = await page.evaluate(() => {
        const imageElements = document.querySelectorAll(
          'img[src*="photo"], img[data-src*="photo"], .vessel-photo img, .ship-photo img'
        );

        const imageList: Array<{ url: string; type?: string }> = [];

        imageElements.forEach((img: any) => {
          const src = img.src || img.dataset?.src;
          if (src && !src.includes("avatar") && !src.includes("placeholder")) {
            imageList.push({
              url: src,
              type: img.className?.includes("main") ? "main" : "gallery",
            });
          }
        });

        return imageList;
      });

      crawlerLogger.debug(`Extracted ${images.length} images`);
      return images;
    } catch (error) {
      crawlerLogger.error("Failed to extract images", { error });
      return [];
    }
  }

  /**
   * Legacy method for backward compatibility - returns only position
   */
  async getLocation(mmsi: string) {
    const details = await this.getVesselDetails(mmsi);
    return details.position || null;
  }
}

export default MarineTrafficEnhanced;
