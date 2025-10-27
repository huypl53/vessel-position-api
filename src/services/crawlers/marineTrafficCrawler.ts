import Source from "../../classes/sources/Source";
import { VesselDetail } from "../../domain/vessel";
import logger from "../../lib/logger";

export interface CrawlOptions {
  mmsi?: string;
  imo?: string;
}

export class MarineTrafficCrawler extends Source {
  async fetchVesselDetails({ mmsi, imo }: CrawlOptions): Promise<VesselDetail> {
    if (!mmsi && !imo) {
      throw new Error("MarineTrafficCrawler requires an MMSI or IMO");
    }

    const identifierPath = mmsi ? `mmsi:${mmsi}` : `imo:${imo}`;
    const page = await this.newPage();
    const url = `https://www.marinetraffic.com/en/ais/details/ships/${identifierPath}`;

    try {
      logger.debug(
        { url, mmsi, imo },
        "Navigating to MarineTraffic vessel page",
      );
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);

      const vesselData = await page.evaluate<any>(() => {
        function toNumber(value: any): number | undefined {
          if (value === null || value === undefined) {
            return undefined;
          }
          const parsed =
            typeof value === "string"
              ? Number(value.replace(/[^\d.-]/g, ""))
              : Number(value);
          return Number.isFinite(parsed) ? parsed : undefined;
        }

        function deepSearch(root: any): any {
          const seen = new Set<any>();
          const stack = [root];
          while (stack.length) {
            const current = stack.pop();
            if (!current || typeof current !== "object") continue;
            if (seen.has(current)) continue;
            seen.add(current);

            const keys = Object.keys(current);
            const normalizedKeys = keys.map((k) => k.toLowerCase());
            const hasIdentity =
              normalizedKeys.includes("shipname") ||
              (normalizedKeys.includes("name") &&
                (normalizedKeys.includes("imo") || normalizedKeys.includes("mmsi")));

            if (hasIdentity) {
              return current;
            }

            for (const key of keys) {
              stack.push(current[key]);
            }
          }
          return null;
        }

        const globalAny = window as any;
        const roots: any[] = [
          globalAny.__NUXT__,
          globalAny.__NEXT_DATA__,
          globalAny.__PRELOADED_STATE__,
          globalAny.APP_STATE,
          globalAny.__APOLLO_STATE__,
        ].filter(Boolean);

        const candidates: any[] = [];
        for (const root of roots) {
          const found = deepSearch(root);
          if (found) {
            candidates.push(found);
          }
        }

        const fallbackName =
          document.querySelector("[data-testid='vessel-name']")?.textContent ??
          document.querySelector("h1 span")?.textContent ??
          document.title;

        const fallbackImage =
          (document.querySelector("[data-testid='vessel-photo'] img") as HTMLImageElement)
            ?.src ?? document.querySelector("img[src*='photos']")?.getAttribute("src");

        const primary: any = candidates[0] ?? {};

        return {
          name:
            primary.shipname ??
            primary.shipName ??
            primary.name ??
            fallbackName?.trim() ??
            null,
          mmsi:
            primary.mmsi ??
            primary.MMSI ??
            globalAny.mmsi ??
            null,
          imo:
            primary.imo ??
            primary.IMO ??
            primary.imoNumber ??
            null,
          callSign:
            primary.callsign ??
            primary.callSign ??
            primary.cs ??
            null,
          flag: primary.flag ?? primary.flagName ?? null,
          type:
            primary.shiptype ??
            primary.shipType ??
            primary.type ??
            null,
          subType:
            primary.shiptypespecific ??
            primary.shipTypeSpecific ??
            primary.typeSpecific ??
            null,
          yearBuilt: toNumber(primary.yearbuilt ?? primary.yearBuilt),
          lengthMeters: toNumber(
            primary.length ?? primary.lengthoverall ?? primary.lengthOverall,
          ),
          breadthMeters: toNumber(
            primary.beam ?? primary.breadth ?? primary.breadthExtreme,
          ),
          draughtMeters: toNumber(primary.draught ?? primary.draft),
          deadweightTons: toNumber(primary.deadweight ?? primary.dwt),
          grossTonnage: toNumber(primary.grosstonnage ?? primary.gt),
          imageUrl:
            primary.photo ??
            primary.photo_url ??
            primary.photoUrl ??
            fallbackImage ??
            null,
          raw: primary,
        };
      });

      const detail: VesselDetail = {
        name: vesselData.name ?? undefined,
        mmsi: (mmsi ?? vesselData.mmsi ?? undefined)?.toString(),
        imo: (imo ?? vesselData.imo ?? undefined)?.toString(),
        callSign: vesselData.callSign ?? undefined,
        flag: vesselData.flag ?? undefined,
        type: vesselData.type ?? undefined,
        subType: vesselData.subType ?? undefined,
        yearBuilt: vesselData.yearBuilt ?? undefined,
        source: "MarineTraffic",
        crawlerMetadata: vesselData.raw ?? undefined,
        dimensions: {
          lengthMeters: vesselData.lengthMeters ?? undefined,
          breadthMeters: vesselData.breadthMeters ?? undefined,
          draughtMeters: vesselData.draughtMeters ?? undefined,
          deadweightTons: vesselData.deadweightTons ?? undefined,
          grossTonnage: vesselData.grossTonnage ?? undefined,
        },
        images: vesselData.imageUrl
          ? [
              {
                bucket: "",
                objectName: "",
                originalUrl: vesselData.imageUrl,
              },
            ]
          : [],
      };

      return detail;
    } finally {
      logger.debug(
        { mmsi, imo },
        "MarineTraffic crawler finished",
      );
      await page.close();
    }
  }
}

const marineTrafficCrawler = new MarineTrafficCrawler();
export default marineTrafficCrawler;
