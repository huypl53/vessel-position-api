import fetch from "node-fetch";
import { getBrowserPool } from "./BrowserPool";
import type { Browser, BrowserContext, Page } from "playwright-core";

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
      return this.browser;
    }

    const browserPool = getBrowserPool();
    const { browser, context } = await browserPool.getBrowser();

    this.browser = browser;
    this.context = context;

    return this.browser;
  }

  async getContext(): Promise<BrowserContext> {
    if (this.context) {
      return this.context;
    }

    // Browser pool creates context automatically
    await this.getBrowser();
    return this.context!;
  }

  async newPage(): Promise<Page> {
    const context = await this.getContext();
    const page = await context.newPage();

    // Add random delays to mimic human behavior
    await page.addInitScript(`
      // Random mouse movements
      setInterval(() => {
        const x = Math.floor(Math.random() * window.innerWidth);
        const y = Math.floor(Math.random() * window.innerHeight);
        const event = new MouseEvent('mousemove', {
          clientX: x,
          clientY: y
        });
        document.dispatchEvent(event);
      }, 5000 + Math.random() * 5000);
    `);

    return page;
  }

  async closeBrowser(): Promise<void> {
    if (this.browser) {
      const browserPool = getBrowserPool();
      await browserPool.releaseBrowser(this.browser);
      this.browser = null;
      this.context = null;
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
