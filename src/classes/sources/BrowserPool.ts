import { Browser, BrowserContext } from "playwright-core";
import { chromium } from "playwright-extra";
import StealthPlugin from "playwright-extra-plugin-stealth";
import { crawlerLogger } from "../../services/logger.service";

// Use stealth plugin
chromium.use(StealthPlugin());

interface BrowserInstance {
  browser: Browser;
  context: BrowserContext;
  inUse: boolean;
  createdAt: Date;
}

/**
 * Browser pool to manage multiple browser instances for better anti-detection
 */
export class BrowserPool {
  private pool: BrowserInstance[] = [];
  private maxPoolSize: number;
  private maxIdleTime: number; // milliseconds
  private userAgents: string[];

  constructor(maxPoolSize: number = 3, maxIdleTimeMinutes: number = 30) {
    this.maxPoolSize = maxPoolSize;
    this.maxIdleTime = maxIdleTimeMinutes * 60 * 1000;
    this.userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    ];

    crawlerLogger.info("Browser pool initialized", {
      maxPoolSize: this.maxPoolSize,
      maxIdleTimeMinutes,
    });
  }

  /**
   * Get an available browser instance or create a new one
   */
  async getBrowser(): Promise<{ browser: Browser; context: BrowserContext }> {
    // Clean up idle browsers
    await this.cleanupIdleBrowsers();

    // Find available browser
    const available = this.pool.find((instance) => !instance.inUse);

    if (available) {
      available.inUse = true;
      crawlerLogger.debug("Reusing existing browser from pool");
      return {
        browser: available.browser,
        context: available.context,
      };
    }

    // Create new browser if pool not full
    if (this.pool.length < this.maxPoolSize) {
      const instance = await this.createBrowserInstance();
      this.pool.push(instance);
      crawlerLogger.info("Created new browser instance", {
        poolSize: this.pool.length,
      });
      return {
        browser: instance.browser,
        context: instance.context,
      };
    }

    // Wait for available browser
    crawlerLogger.debug("Waiting for available browser in pool");
    return await this.waitForAvailableBrowser();
  }

  /**
   * Release browser back to pool
   */
  async releaseBrowser(browser: Browser): Promise<void> {
    const instance = this.pool.find((inst) => inst.browser === browser);
    if (instance) {
      instance.inUse = false;
      crawlerLogger.debug("Browser released back to pool");
    }
  }

  /**
   * Create a new browser instance with anti-detection measures
   */
  private async createBrowserInstance(): Promise<BrowserInstance> {
    const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
    const userAgent =
      this.userAgents[Math.floor(Math.random() * this.userAgents.length)];

    const launchOptions: any = {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
        `--user-agent=${userAgent}`,
      ],
      ...(executablePath ? { executablePath } : {}),
    };

    const browser = await chromium.launch(launchOptions);

    // Create context with randomized viewport
    const viewportWidth = 1280 + Math.floor(Math.random() * 400);
    const viewportHeight = 720 + Math.floor(Math.random() * 300);

    const context = await browser.newContext({
      viewport: {
        width: viewportWidth,
        height: viewportHeight,
      },
      userAgent,
      locale: "en-US",
      timezoneId: "America/New_York",
      permissions: [],
      geolocation: undefined,
      colorScheme: "light",
      deviceScaleFactor: 1,
    });

    // Add anti-detection scripts
    await context.addInitScript(`
      // Override navigator.webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // Override Chrome object
      window.chrome = {
        runtime: {},
      };

      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );

      // Override plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
    `);

    crawlerLogger.debug("Browser instance created with anti-detection measures", {
      userAgent,
      viewport: { width: viewportWidth, height: viewportHeight },
    });

    return {
      browser,
      context,
      inUse: true,
      createdAt: new Date(),
    };
  }

  /**
   * Wait for an available browser in the pool
   */
  private async waitForAvailableBrowser(
    maxWaitTime: number = 30000
  ): Promise<{ browser: Browser; context: BrowserContext }> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const available = this.pool.find((instance) => !instance.inUse);
      if (available) {
        available.inUse = true;
        return {
          browser: available.browser,
          context: available.context,
        };
      }

      // Wait 100ms before checking again
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error("Timeout waiting for available browser");
  }

  /**
   * Clean up idle browsers
   */
  private async cleanupIdleBrowsers(): Promise<void> {
    const now = Date.now();

    for (let i = this.pool.length - 1; i >= 0; i--) {
      const instance = this.pool[i];

      if (
        !instance.inUse &&
        now - instance.createdAt.getTime() > this.maxIdleTime
      ) {
        try {
          await instance.context.close();
          await instance.browser.close();
          this.pool.splice(i, 1);
          crawlerLogger.info("Closed idle browser instance");
        } catch (error) {
          crawlerLogger.error("Error closing idle browser", { error });
        }
      }
    }
  }

  /**
   * Close all browsers in the pool
   */
  async closeAll(): Promise<void> {
    crawlerLogger.info("Closing all browsers in pool");

    for (const instance of this.pool) {
      try {
        await instance.context.close();
        await instance.browser.close();
      } catch (error) {
        crawlerLogger.error("Error closing browser", { error });
      }
    }

    this.pool = [];
    crawlerLogger.info("All browsers closed");
  }
}

// Singleton instance
let browserPoolInstance: BrowserPool | null = null;

export function getBrowserPool(): BrowserPool {
  if (!browserPoolInstance) {
    browserPoolInstance = new BrowserPool();
  }
  return browserPoolInstance;
}
