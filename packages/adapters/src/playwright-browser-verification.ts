import { chromium, type Browser, type Route } from "playwright";
import type { BrowserRuntimeCheckResult, BrowserRuntimeVerifier } from "./http-release-verification.js";

export type PlaywrightBrowserRuntimeVerifierOptions = {
  executablePath?: string;
  headless?: boolean;
  userAgent?: string;
  settleMs?: number;
  trackingRequestPattern?: RegExp;
};

const defaultSettleMs = 750;
const defaultTrackingRequestPattern = /(?:^|\/)track(?:\/|\?|$)|localseo-track|data-localseo/iu;

export class PlaywrightBrowserRuntimeVerifier implements BrowserRuntimeVerifier {
  private readonly executablePath: string | undefined;
  private readonly headless: boolean;
  private readonly userAgent: string | undefined;
  private readonly settleMs: number;
  private readonly trackingRequestPattern: RegExp;

  constructor(options: PlaywrightBrowserRuntimeVerifierOptions = {}) {
    this.executablePath = options.executablePath;
    this.headless = options.headless ?? true;
    this.userAgent = options.userAgent;
    this.settleMs = Math.max(0, options.settleMs ?? defaultSettleMs);
    this.trackingRequestPattern = options.trackingRequestPattern ?? defaultTrackingRequestPattern;
  }

  async verifyTracking(input: {
    targetUrl: string;
    timeoutMs: number;
    trackingExpected: boolean;
  }): Promise<BrowserRuntimeCheckResult> {
    if (!input.trackingExpected) {
      return {
        status: "skipped",
        targetUrl: input.targetUrl,
        reason: "tracking_not_expected",
        observed: { trackingExpected: false }
      };
    }

    const targetOrigin = safeOrigin(input.targetUrl);

    if (!targetOrigin) {
      return {
        status: "skipped",
        targetUrl: input.targetUrl,
        reason: "browser_execution_failed",
        observed: { failure: "invalid_browser_verification_url" }
      };
    }

    const requestedUrls: string[] = [];
    let trackingRequestCount = 0;
    let browser: Browser | undefined;

    try {
      browser = await chromium.launch({
        executablePath: this.executablePath,
        headless: this.headless
      });
      const context = await browser.newContext({
        userAgent: this.userAgent
      });
      const page = await context.newPage();

      await page.route("**/*", async (route) => {
        const requestUrl = route.request().url();
        requestedUrls.push(redactUrl(requestUrl));

        if (this.trackingRequestPattern.test(requestUrl)) {
          trackingRequestCount += 1;
        }

        await routeBrowserRequest(route, targetOrigin);
      });

      await page.goto(input.targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: input.timeoutMs
      });

      await page.waitForTimeout(Math.min(this.settleMs, input.timeoutMs));

      if (trackingRequestCount > 0) {
        return {
          status: "passed",
          targetUrl: input.targetUrl,
          finalUrl: page.url(),
          observed: {
            trackingRequestCount,
            requestedUrls
          }
        };
      }

      return {
        status: "failed",
        targetUrl: input.targetUrl,
        finalUrl: page.url(),
        reason: "tracking_request_not_observed",
        observed: {
          trackingRequestCount,
          requestedUrls
        }
      };
    } catch (error) {
      return {
        status: "skipped",
        targetUrl: input.targetUrl,
        reason: browser ? errorReason(error) : "browser_unavailable",
        observed: {
          failure: error instanceof Error ? error.message : "browser_execution_failed",
          requestedUrls
        }
      };
    } finally {
      await browser?.close().catch(() => undefined);
    }
  }
}

async function routeBrowserRequest(route: Route, targetOrigin: string): Promise<void> {
  const requestUrl = route.request().url();

  if (isAllowedBrowserRequest(requestUrl, targetOrigin)) {
    await route.continue();
    return;
  }

  await route.abort("blockedbyclient");
}

function isAllowedBrowserRequest(value: string, targetOrigin: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.origin === targetOrigin;
  } catch {
    return false;
  }
}

function safeOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

function errorReason(error: unknown): "browser_timeout" | "browser_execution_failed" {
  return error instanceof Error && error.name === "TimeoutError" ? "browser_timeout" : "browser_execution_failed";
}

function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = url.search ? "?redacted" : "";
    url.hash = "";
    return url.toString();
  } catch {
    return "unparseable_url";
  }
}
