import { chromium, Browser, BrowserContext, Route, ConsoleMessage } from "playwright";
import { RenderRequest, RenderResponseSuccess } from "./types.js";
import { isPrivateIP } from "./ssrf.js";

const POOL_SIZE = parseInt(process.env.BROWSER_POOL_SIZE || "2");
const MAX_RENDER_MS = parseInt(process.env.MAX_RENDER_MS || "20000");
const RECYCLE_AFTER_RENDERS = parseInt(process.env.RECYCLE_AFTER_RENDERS || "50");

export class BrowserPool {
  private browsers: Browser[] = [];
  private available: Browser[] = [];
  private queue: Array<{
    request: RenderRequest;
    resolve: (value: RenderResponseSuccess) => void;
    reject: (error: Error) => void;
  }> = [];

  public rendersSinceRecycle = 0;
  public activeBrowsers = 0;
  public queuedRequests = 0;
  public poolSize = POOL_SIZE;

  constructor() {
    this.initializePool();
  }

  private async initializePool() {
    for (let i = 0; i < POOL_SIZE; i++) {
      try {
        const browser = await chromium.launch({
          args: ["--disable-blink-features=AutomationControlled"],
        });
        this.browsers.push(browser);
        this.available.push(browser);
      } catch (error) {
        console.error("Failed to launch browser:", error);
      }
    }
    console.log(`Browser pool initialized with ${this.available.length} browsers`);
  }

  async render(request: RenderRequest): Promise<RenderResponseSuccess> {
    // SSRF protection
    if (!isValidUrl(request.url)) {
      throw new Error("Invalid URL");
    }

    if (isPrivateIP(request.url)) {
      throw new Error("Private IP addresses not allowed");
    }

    // Get browser from pool
    const availableBrowser = this.available.pop();
    if (!availableBrowser) {
      // No available browser, wait in queue
      return new Promise((resolve, reject) => {
        this.queuedRequests++;
        this.queue.push({ request, resolve, reject });
      });
    }

    const browser: Browser = availableBrowser;
    this.activeBrowsers++;
    const startTime = Date.now();

    try {
      const context: BrowserContext = await (browser as any).createContext();
      try {
        // Block unnecessary resources
        await context.route("**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf,eot}", (route: Route) =>
          route.abort()
        );

        const page = await context.newPage();
        try {
          const consoleErrors: string[] = [];
          page.on("console", (msg: ConsoleMessage) => {
            if (msg.type() === "error") {
              consoleErrors.push(msg.text());
            }
          });

          const navigationStart = Date.now();
          await page.goto(request.url, { waitUntil: "domcontentloaded", timeout: MAX_RENDER_MS });
          const navigationMs = Date.now() - navigationStart;

          // Wait for selector if provided
          if (request.waitFor) {
            try {
              await page.waitForSelector(request.waitFor, { timeout: 5000 });
            } catch {
              // Selector not found, but continue anyway
            }
          }

          const renderStart = Date.now();
          const html = await page.content();
          const renderMs = Date.now() - renderStart;
          const totalMs = Date.now() - startTime;

          let screenshotBase64: string | undefined;
          if (request.screenshot) {
            const screenshot = await page.screenshot();
            screenshotBase64 = screenshot.toString("base64");
          }

          return {
            status: "ok" as const,
            html,
            finalUrl: page.url(),
            screenshotBase64,
            timings: { navigationMs, renderMs, totalMs },
            consoleErrors,
          };
        } finally {
          await page.close();
        }
      } finally {
        await context.close();
      }
    } catch (error) {
      // Browser crashed, remove it
      const index = this.browsers.indexOf(browser);
      if (index !== -1) {
        this.browsers.splice(index, 1);
        this.poolSize = this.browsers.length;
      }

      // Try to restart if we have capacity
      if (this.browsers.length < POOL_SIZE) {
        try {
          const newBrowser = await chromium.launch();
          this.browsers.push(newBrowser);
          this.available.push(newBrowser);
          this.poolSize = this.browsers.length;
        } catch (launchError) {
          console.error("Failed to restart browser:", launchError);
        }
      }

      throw error;
    } finally {
      this.activeBrowsers--;
      this.rendersSinceRecycle++;

      // Recycle browser if needed
      if (this.rendersSinceRecycle >= RECYCLE_AFTER_RENDERS) {
        try {
          await browser.close();
        } catch {
          // Ignore close errors
        }

        if (this.browsers.includes(browser)) {
          const index = this.browsers.indexOf(browser);
          this.browsers.splice(index, 1);
          this.poolSize = this.browsers.length;
        }

        // Launch replacement
        try {
          const newBrowser = await chromium.launch();
          this.browsers.push(newBrowser);
          this.available.push(newBrowser);
          this.poolSize = this.browsers.length;
          this.rendersSinceRecycle = 0;
        } catch (error) {
          console.error("Failed to launch replacement browser:", error);
        }
      } else {
        this.available.push(browser);
        this.processQueue();
      }
    }
  }

  private processQueue() {
    while (this.queue.length > 0 && this.available.length > 0) {
      const item = this.queue.shift();
      if (!item) break;

      this.queuedRequests--;
      this.render(item.request).then(item.resolve).catch(item.reject);
    }
  }

  async close() {
    for (const browser of this.browsers) {
      try {
        await browser.close();
      } catch {
        // Ignore errors
      }
    }
    this.browsers = [];
    this.available = [];
  }
}

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
