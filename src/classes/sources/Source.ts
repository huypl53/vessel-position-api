import fetch from "node-fetch";
import { chromium } from "playwright-extra";
import StealthPlugin from "playwright-extra-plugin-stealth";
import type { Browser, BrowserContext, Page } from "playwright-core";

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
  private context: BrowserContext | null = null;

  constructor() {
    this.browser = null;
    this.context = null;
  }

  async getBrowser(): Promise<Browser> {
    if (this.browser) {
      console.log("[PLAYWRIGHT] Returning existing browser instance");
      return this.browser;
    }

    console.log("[PLAYWRIGHT] Launching browser with stealth plugin");
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

    console.log(JSON.stringify(launchOptions, null, 2));

    try {
      this.browser = await chromium.launch(launchOptions);
      console.log("[PLAYWRIGHT] Browser launched successfully with stealth");
    } catch (err) {
      console.error("[PLAYWRIGHT] Failed to launch browser:", err);
      throw err;
    }

    return this.browser;
  }

  async getContext(): Promise<BrowserContext> {
    if (this.context) {
      return this.context;
    }

    const browser = await this.getBrowser();
    this.context = await browser.newContext({
      viewport: {
        width: 2458,
        height: 1302,
      },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.98 Safari/537.36",
    });

    // Add initialization script to define __name property
    await this.context.addInitScript(`
      Object.defineProperty(window, "__name", {
        get: function() { return "https://www.marinetraffic.com"; },
        configurable: true,
      });
    `);

    return this.context;
  }

  async newPage(): Promise<Page> {
    const context = await this.getContext();
    const page = await context.newPage();

    // Listen to console messages from the browser
    page.on("console", (msg) => {
      console.log(`[BROWSER ${msg.type().toUpperCase()}]:`, msg.text());
    });

    // Listen to page errors
    page.on("pageerror", (error) => {
      console.error("[BROWSER ERROR]:", error.message);
    });

    return page;
  }

  async closeBrowser(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
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
