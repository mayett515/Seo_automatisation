import { ReleaseVerificationSchema, type ReleaseCheck, type ReleaseVerification } from "@localseo/contracts";
import { decideReleaseVerificationStatus } from "@localseo/domain";
import type { VerificationPort } from "./index.js";

export type HttpReleaseVerificationAdapterOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  userAgent?: string;
};

type PageFetchResult =
  | {
      status: "ok";
      targetUrl: string;
      finalUrl: string;
      statusCode: number;
      html: string;
      headers: Headers;
    }
  | {
      status: "failed";
      targetUrl: string;
      message: string;
      statusCode?: number;
      finalUrl?: string;
    };

const defaultTimeoutMs = 10_000;
const defaultUserAgent = "localseo-verifier/0.1";

export class HttpReleaseVerificationAdapter implements VerificationPort {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly userAgent: string;

  constructor(options: HttpReleaseVerificationAdapterOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
    this.userAgent = options.userAgent ?? defaultUserAgent;
  }

  async verifyRelease(input: {
    releasePlanId: string;
    deploymentId?: string;
    liveUrls: string[];
    trackingExpected?: boolean;
  }): Promise<ReleaseVerification> {
    const checkedAt = new Date().toISOString();
    const liveUrls = uniqueUrls(input.liveUrls);

    if (liveUrls.length === 0) {
      const checks = [
        releaseCheck({
          checkKey: "live_route_discovery_check",
          scope: "domain",
          severity: "blocker",
          result: "failed",
          message: "No live deployment URLs were available for verification.",
          evidence: { observed: { liveUrlCount: 0 } }
        })
      ];

      return verificationResult(input, checkedAt, checks);
    }

    const pageResults = await Promise.all(liveUrls.map((liveUrl) => this.fetchPage(liveUrl)));
    const checks = pageResults.flatMap((result) => pageChecks(result, Boolean(input.trackingExpected)));
    checks.push(await this.sitemapCheck(liveUrls));

    return verificationResult(input, checkedAt, checks);
  }

  private async fetchPage(targetUrl: string): Promise<PageFetchResult> {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(targetUrl, {
        headers: { "user-agent": this.userAgent },
        redirect: "follow",
        signal: abort.signal
      });
      const statusCode = response.status;
      const finalUrl = response.url || targetUrl;

      if (!response.ok) {
        return {
          status: "failed",
          targetUrl,
          statusCode,
          finalUrl,
          message: `Live route returned HTTP ${statusCode}.`
        };
      }

      const html = await response.text();

      return {
        status: "ok",
        targetUrl,
        finalUrl,
        statusCode,
        html,
        headers: response.headers
      };
    } catch (error) {
      return {
        status: "failed",
        targetUrl,
        message: error instanceof Error ? error.message : "Live route fetch failed."
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async sitemapCheck(liveUrls: string[]): Promise<ReleaseCheck> {
    const firstUrl = liveUrls[0];

    if (!firstUrl) {
      return releaseCheck({
        checkKey: "sitemap_readiness_check",
        scope: "sitemap",
        severity: "warning",
        result: "skipped",
        message: "Sitemap verification skipped because no live URL was available."
      });
    }

    let sitemapUrl: string;

    try {
      sitemapUrl = new URL("/sitemap.xml", firstUrl).toString();
    } catch {
      return releaseCheck({
        checkKey: "sitemap_readiness_check",
        scope: "sitemap",
        severity: "warning",
        result: "skipped",
        message: "Sitemap verification skipped because the live URL was invalid.",
        evidence: { targetUrl: firstUrl }
      });
    }

    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(sitemapUrl, {
        headers: { "user-agent": this.userAgent },
        redirect: "follow",
        signal: abort.signal
      });
      const body = response.ok ? await response.text() : "";
      const expectedUrls = liveUrls.map((liveUrl) => safeNormalizeCanonicalUrl(liveUrl) ?? liveUrl);
      const sitemapUrls = sitemapLocations(body);
      const missingUrls = expectedUrls.filter((liveUrl) => !sitemapUrls.has(liveUrl));

      return releaseCheck({
        checkKey: "sitemap_readiness_check",
        scope: "sitemap",
        severity: "warning",
        result: response.ok && missingUrls.length === 0 ? "passed" : "failed",
        message:
          response.ok && missingUrls.length === 0
            ? "Sitemap is reachable and includes verified live routes."
            : "Sitemap is missing or does not include every verified live route.",
        evidence: {
          targetUrl: sitemapUrl,
          expected: { liveUrls: expectedUrls },
          observed: { statusCode: response.status, missingUrls }
        }
      });
    } catch (error) {
      return releaseCheck({
        checkKey: "sitemap_readiness_check",
        scope: "sitemap",
        severity: "warning",
        result: "failed",
        message: "Sitemap could not be fetched during verification.",
        evidence: {
          targetUrl: sitemapUrl,
          observed: { failure: error instanceof Error ? error.message : "sitemap_fetch_failed" }
        }
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function pageChecks(result: PageFetchResult, trackingExpected: boolean): ReleaseCheck[] {
  if (result.status === "failed") {
    return [
      releaseCheck({
        checkKey: "http_status_check",
        scope: "domain",
        severity: "blocker",
        result: "failed",
        message: result.message,
        evidence: {
          targetUrl: result.targetUrl,
          observed: {
            statusCode: result.statusCode ?? null,
            finalUrl: result.finalUrl ?? null
          }
        }
      }),
      releaseCheck({
        checkKey: "canonical_trailing_slash_check",
        scope: "page",
        severity: "blocker",
        result: "skipped",
        message: "Canonical verification skipped because the live route could not be fetched.",
        evidence: { targetUrl: result.targetUrl }
      }),
      releaseCheck({
        checkKey: "indexability_check",
        scope: "page",
        severity: "blocker",
        result: "skipped",
        message: "Indexability verification skipped because the live route could not be fetched.",
        evidence: { targetUrl: result.targetUrl }
      })
    ];
  }

  return [
    httpStatusCheck(result),
    indexabilityCheck(result),
    canonicalCheck(result),
    schemaCheck(result),
    trackingCheck(result, trackingExpected)
  ];
}

function httpStatusCheck(result: Extract<PageFetchResult, { status: "ok" }>): ReleaseCheck {
  return releaseCheck({
    checkKey: "http_status_check",
    scope: "domain",
    severity: "blocker",
    result: "passed",
    message: "Live route returned a successful HTTP response.",
    evidence: {
      targetUrl: result.targetUrl,
      observed: {
        statusCode: result.statusCode,
        finalUrl: result.finalUrl
      }
    }
  });
}

function indexabilityCheck(result: Extract<PageFetchResult, { status: "ok" }>): ReleaseCheck {
  const robotsHeader = result.headers.get("x-robots-tag") ?? "";
  const robotsMeta = metaRobotsContent(result.html);
  const hasNoindex = containsNoindex(robotsHeader) || containsNoindex(robotsMeta);

  return releaseCheck({
    checkKey: "indexability_check",
    scope: "page",
    severity: "blocker",
    result: hasNoindex ? "failed" : "passed",
    message: hasNoindex
      ? "Live route is blocked by noindex robots directives."
      : "Live route is not blocked by noindex robots directives.",
    evidence: {
      targetUrl: result.targetUrl,
      expected: { noindex: false },
      observed: {
        robotsHeader,
        robotsMeta
      }
    }
  });
}

function canonicalCheck(result: Extract<PageFetchResult, { status: "ok" }>): ReleaseCheck {
  const expected = normalizeCanonicalUrl(result.targetUrl);
  const observed = canonicalHref(result.html, result.finalUrl);
  const normalizedObserved = observed ? safeNormalizeCanonicalUrl(observed) : undefined;
  const passed = normalizedObserved === expected;

  return releaseCheck({
    checkKey: "canonical_trailing_slash_check",
    scope: "page",
    severity: "blocker",
    result: passed ? "passed" : "failed",
    message: passed
      ? "Canonical URL matches the intended live route."
      : "Canonical URL is missing or does not match the intended live route.",
    evidence: {
      targetUrl: result.targetUrl,
      expected: { canonicalUrl: expected },
      observed: { canonicalUrl: normalizedObserved ?? null }
    }
  });
}

function schemaCheck(result: Extract<PageFetchResult, { status: "ok" }>): ReleaseCheck {
  const scripts = jsonLdScripts(result.html);

  if (scripts.length === 0) {
    return releaseCheck({
      checkKey: "schema_parse_check",
      scope: "page",
      severity: "warning",
      result: "failed",
      message: "No JSON-LD structured data was found on the live route.",
      evidence: { targetUrl: result.targetUrl, observed: { jsonLdScriptCount: 0 } }
    });
  }

  const parseFailures = scripts
    .map((script, index) => ({ index, parsed: parseJson(script) }))
    .filter((item) => !item.parsed.ok);

  return releaseCheck({
    checkKey: "schema_parse_check",
    scope: "page",
    severity: "warning",
    result: parseFailures.length === 0 ? "passed" : "failed",
    message:
      parseFailures.length === 0
        ? "JSON-LD structured data parsed successfully."
        : "One or more JSON-LD structured data blocks could not be parsed.",
    evidence: {
      targetUrl: result.targetUrl,
      observed: {
        jsonLdScriptCount: scripts.length,
        parseFailures: parseFailures.map((failure) => failure.index)
      }
    }
  });
}

function trackingCheck(result: Extract<PageFetchResult, { status: "ok" }>, trackingExpected: boolean): ReleaseCheck {
  if (!trackingExpected) {
    return releaseCheck({
      checkKey: "tracking_load_check",
      scope: "tracking",
      severity: "warning",
      result: "skipped",
      message: "Tracking verification skipped because no active tracking key is configured.",
      evidence: { targetUrl: result.targetUrl, expected: { trackingExpected } }
    });
  }

  const loaded = /data-localseo|localseo-track|\/track\b|track\.localseo/iu.test(result.html);

  return releaseCheck({
    checkKey: "tracking_load_check",
    scope: "tracking",
    severity: "warning",
    result: loaded ? "passed" : "failed",
    message: loaded ? "Tracking script marker was found on the live route." : "Tracking script marker was not found.",
    evidence: {
      targetUrl: result.targetUrl,
      expected: { trackingExpected: true },
      observed: { trackingMarkerFound: loaded }
    }
  });
}

function verificationResult(
  input: { releasePlanId: string; deploymentId?: string },
  checkedAt: string,
  checks: ReleaseCheck[]
): ReleaseVerification {
  const verificationStatus = decideReleaseVerificationStatus(checks);

  return ReleaseVerificationSchema.parse({
    releasePlanId: input.releasePlanId,
    deploymentId: input.deploymentId,
    verificationStatus,
    summary:
      verificationStatus === "live_healthy"
        ? "Post-deploy verification passed."
        : "Post-deploy verification completed with issues.",
    checkedAt,
    checks
  });
}

function releaseCheck(input: ReleaseCheck): ReleaseCheck {
  return input;
}

function uniqueUrls(urls: string[]): string[] {
  const normalized = new Set<string>();

  for (const url of urls) {
    try {
      normalized.add(new URL(url).toString());
    } catch {
      normalized.add(url);
    }
  }

  return [...normalized];
}

function metaRobotsContent(html: string): string {
  const metaTags = html.match(/<meta\b[^>]*>/giu) ?? [];
  const robotsTag = metaTags.find((tag) => /name\s*=\s*["']robots["']/iu.test(tag));
  return robotsTag ? (attributeValue(robotsTag, "content") ?? "") : "";
}

function containsNoindex(value: string): boolean {
  return /(?:^|,|\s)noindex(?:,|\s|$)/iu.test(value);
}

function canonicalHref(html: string, baseUrl: string): string | undefined {
  const linkTags = html.match(/<link\b[^>]*>/giu) ?? [];
  const canonicalTag = linkTags.find((tag) => {
    const rel = attributeValue(tag, "rel") ?? "";
    return rel.split(/\s+/u).some((part) => part.toLowerCase() === "canonical");
  });
  const href = canonicalTag ? attributeValue(canonicalTag, "href") : undefined;

  if (!href) {
    return undefined;
  }

  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

function attributeValue(tag: string, attribute: string): string | undefined {
  const pattern = new RegExp(`\\b${attribute}\\s*=\\s*["']([^"']+)["']`, "iu");
  return pattern.exec(tag)?.[1];
}

function jsonLdScripts(html: string): string[] {
  const scripts: string[] = [];
  const pattern = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html))) {
    scripts.push(htmlDecode(match[1]?.trim() ?? ""));
  }

  return scripts;
}

function parseJson(value: string): { ok: true } | { ok: false } {
  try {
    JSON.parse(value);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

function sitemapLocations(xml: string): Set<string> {
  const locs = new Set<string>();
  const pattern = /<loc>\s*([^<]+?)\s*<\/loc>/giu;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(xml))) {
    const value = htmlDecode(match[1]?.trim() ?? "");
    const normalized = safeNormalizeCanonicalUrl(value) ?? value;

    if (normalized.length > 0) {
      locs.add(normalized);
    }
  }

  return locs;
}

function normalizeCanonicalUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";

  if (!url.pathname.endsWith("/") && !/\.[a-z0-9]+$/iu.test(url.pathname)) {
    url.pathname = `${url.pathname}/`;
  }

  return url.toString();
}

function safeNormalizeCanonicalUrl(value: string): string | undefined {
  try {
    return normalizeCanonicalUrl(value);
  } catch {
    return undefined;
  }
}

function htmlDecode(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#34;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}
