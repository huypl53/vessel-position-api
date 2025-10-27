import fetch from "node-fetch";
import { chromium } from "playwright-extra";
import StealthPlugin from "playwright-extra-plugin-stealth";
import type { Browser, BrowserContext, Page } from "playwright-core";
import logger from "../../lib/logger";
import { randomUserAgent } from "../../utils/userAgents";

// Use stealth plugin to bypass bot detection
chromium.use(StealthPlugin());

class Source {
  /**
   * Verifies that the given position object is valid according to the Position type.
   * Throws an error if the position is invalid.
   * @param position The position object to verify
   */
  verifyPosition(position: any): void {
    if (
      typeof position !== "object" ||
      position === null ||
      typeof position.lat !== "number" ||
      typeof position.lon !== "number" ||
      isNaN(position.lat) ||
      isNaN(position.lon) ||
      position.lat < -90 ||
      position.lat > 90 ||
      position.lon < -180 ||
      position.lon > 180
    ) {
      throw new Error(
        "Invalid position: must have numeric lat (-90..90) and lon (-180..180)",
      );
    }
  }

  private browser: Browser | null = null;

  constructor() {
    this.browser = null;
  }

  async getBrowser(): Promise<Browser> {
    if (this.browser) {
      logger.debug("[PLAYWRIGHT] Returning existing browser instance");
      return this.browser;
    }

    logger.info("[PLAYWRIGHT] Launching browser with stealth plugin");
    const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
    const launchOptions: any = {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
      ...(executablePath ? { executablePath } : {}),
    };

    logger.debug({ launchOptions }, "Launching Playwright with options");

    try {
      this.browser = await chromium.launch(launchOptions);
      logger.info("[PLAYWRIGHT] Browser launched successfully with stealth");
    } catch (err) {
      logger.error({ err }, "[PLAYWRIGHT] Failed to launch browser");
      throw err;
    }

    return this.browser;
  }

  private async createIsolatedContext(): Promise<BrowserContext> {
    const browser = await this.getBrowser();
    const userAgent = randomUserAgent();
    const viewport = {
      width: 1200 + Math.floor(Math.random() * 400),
      height: 720 + Math.floor(Math.random() * 360),
    };

    const context = await browser.newContext({
      viewport: {
        width: viewport.width,
        height: viewport.height,
      },
      userAgent,
      locale: "en-US",
      timezoneId: "UTC",
      permissions: [],
    });

    // Add initialization script to define __name property
    await context.addInitScript(`
      Object.defineProperty(window, "__name", {
        get: function() { return "https://www.marinetraffic.com"; },
        configurable: true,
      });
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      window.chrome = { runtime: {} };
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
    `);

    logger.debug(
      { userAgent, viewport },
      "[PLAYWRIGHT] Created isolated browser context",
    );

    return context;
  }

  async newPage(): Promise<Page> {
    const context = await this.createIsolatedContext();
    const page = await context.newPage();

    page.on("close", async () => {
      await context.close();
    });

    // Listen to console messages from the browser
    page.on("console", (msg) => {
      logger.debug(
        { type: msg.type(), text: msg.text() },
        "[BROWSER] Console",
      );
    });

    // Listen to page errors
    page.on("pageerror", (error) => {
      logger.error({ err: error }, "[BROWSER] Page error");
    });

    return page;
  }

  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  convertRawCoordinatesIntoDecimal(input): number {
    const grade = parseInt(input.substring(0, input.indexOf("°")));
    const rest = input.substring(input.indexOf("°") + 1);
    const minutes = parseInt(rest.substring(0, rest.indexOf("'")));
    const seconds = parseInt(
      rest.substring(rest.indexOf("'") + 1).split('"')[0],
    );
    return grade + (minutes + seconds / 60) / 60;
  }

  fetch = async function (url: string, headers: any, method: string) {
    const response = await fetch(url, {
      headers,
      body: undefined,
      method,
    });
    const text = await response.text();
    return text;
  };
}

export default Source;
