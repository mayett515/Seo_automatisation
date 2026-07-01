import { ReleaseVerificationSchema, type ReleaseCheck, type ReleaseVerification } from "@localseo/contracts";
import { decideReleaseVerificationStatus } from "@localseo/domain";
import type { VerificationPort } from "./index.js";

export type HttpReleaseVerificationAdapterOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  userAgent?: string;
  maxConcurrentPageFetches?: number;
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
const defaultMaxConcurrentPageFetches = 5;
const maxSameOriginRedirects = 5;
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const localSeoSchemaTypes = new Set(["LocalBusiness", "Service", "FAQPage"]);

class VerificationRedirectError extends Error {
  constructor(
    message: string,
    readonly finalUrl: string
  ) {
    super(message);
    this.name = "VerificationRedirectError";
  }
}

export class HttpReleaseVerificationAdapter implements VerificationPort {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly userAgent: string;
  private readonly maxConcurrentPageFetches: number;

  constructor(options: HttpReleaseVerificationAdapterOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
    this.userAgent = options.userAgent ?? defaultUserAgent;
    this.maxConcurrentPageFetches = Math.max(1, options.maxConcurrentPageFetches ?? defaultMaxConcurrentPageFetches);
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

    const pageResults = await mapWithConcurrency(liveUrls, this.maxConcurrentPageFetches, (liveUrl) =>
      this.fetchPage(liveUrl)
    );
    const checks = pageResults.flatMap((result) => pageChecks(result, Boolean(input.trackingExpected)));
    checks.push(await this.sitemapCheck(liveUrls));

    return verificationResult(input, checkedAt, checks);
  }

  private async fetchPage(targetUrl: string): Promise<PageFetchResult> {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), this.timeoutMs);

    try {
      const { response, finalUrl } = await fetchSameOriginWithRedirects(this.fetchImpl, targetUrl, {
        headers: { "user-agent": this.userAgent },
        signal: abort.signal
      });
      const statusCode = response.status;

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
        finalUrl: error instanceof VerificationRedirectError ? error.finalUrl : undefined,
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
      const { response } = await fetchSameOriginWithRedirects(this.fetchImpl, sitemapUrl, {
        headers: { "user-agent": this.userAgent },
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
          observed: {
            failure: error instanceof Error ? error.message : "sitemap_fetch_failed",
            finalUrl: error instanceof VerificationRedirectError ? error.finalUrl : null
          }
        }
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function fetchSameOriginWithRedirects(
  fetchImpl: typeof fetch,
  targetUrl: string,
  init: Omit<RequestInit, "redirect">
): Promise<{ response: Response; finalUrl: string }> {
  const allowedOrigin = httpUrlOrigin(targetUrl);
  let currentUrl = targetUrl;
  let redirects = 0;

  while (true) {
    const response = await fetchImpl(currentUrl, {
      ...init,
      redirect: "manual"
    });

    if (!redirectStatuses.has(response.status)) {
      return { response, finalUrl: currentUrl };
    }

    const location = response.headers.get("location");

    if (!location) {
      return { response, finalUrl: currentUrl };
    }

    if (redirects >= maxSameOriginRedirects) {
      throw new VerificationRedirectError(
        `Verification exceeded ${maxSameOriginRedirects} same-origin redirects.`,
        currentUrl
      );
    }

    const nextUrl = new URL(location, currentUrl);

    if (!isHttpUrl(nextUrl) || nextUrl.origin !== allowedOrigin) {
      throw new VerificationRedirectError("Verification redirect left the deployment origin.", nextUrl.toString());
    }

    redirects += 1;
    currentUrl = nextUrl.toString();
  }
}

function httpUrlOrigin(value: string): string {
  const url = new URL(value);

  if (!isHttpUrl(url)) {
    throw new Error("Verification URL must use HTTP or HTTPS.");
  }

  return url.origin;
}

function isHttpUrl(url: URL): boolean {
  return url.protocol === "http:" || url.protocol === "https:";
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

  const schemaAnalysis = analyzeJsonLd(result.html);

  return [
    httpStatusCheck(result),
    indexabilityCheck(result),
    canonicalCheck(result),
    htmlMetadataCheck(result),
    primaryHeadingCheck(result),
    schemaCheck(result, schemaAnalysis),
    schemaTypeCheck(result, schemaAnalysis),
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

function schemaCheck(result: Extract<PageFetchResult, { status: "ok" }>, analysis: JsonLdAnalysis): ReleaseCheck {
  if (analysis.scriptCount === 0) {
    return releaseCheck({
      checkKey: "schema_parse_check",
      scope: "page",
      severity: "warning",
      result: "failed",
      message: "No JSON-LD structured data was found on the live route.",
      evidence: { targetUrl: result.targetUrl, observed: { jsonLdScriptCount: 0 } }
    });
  }

  return releaseCheck({
    checkKey: "schema_parse_check",
    scope: "page",
    severity: "warning",
    result: analysis.parseFailures.length === 0 ? "passed" : "failed",
    message:
      analysis.parseFailures.length === 0
        ? "JSON-LD structured data parsed successfully."
        : "One or more JSON-LD structured data blocks could not be parsed.",
    evidence: {
      targetUrl: result.targetUrl,
      observed: {
        jsonLdScriptCount: analysis.scriptCount,
        parseFailures: analysis.parseFailures
      }
    }
  });
}

function schemaTypeCheck(result: Extract<PageFetchResult, { status: "ok" }>, analysis: JsonLdAnalysis): ReleaseCheck {
  if (analysis.scriptCount === 0) {
    return releaseCheck({
      checkKey: "schema_type_check",
      scope: "page",
      severity: "warning",
      result: "skipped",
      message: "Local SEO schema type verification skipped because no JSON-LD was found.",
      evidence: { targetUrl: result.targetUrl, observed: { jsonLdScriptCount: 0 } }
    });
  }

  if (analysis.parseFailures.length > 0) {
    return releaseCheck({
      checkKey: "schema_type_check",
      scope: "page",
      severity: "warning",
      result: "skipped",
      message: "Local SEO schema type verification skipped because JSON-LD could not be parsed.",
      evidence: {
        targetUrl: result.targetUrl,
        observed: {
          jsonLdScriptCount: analysis.scriptCount,
          parseFailures: analysis.parseFailures
        }
      }
    });
  }

  const matchingTypes = analysis.schemaTypes.filter((schemaType) => localSeoSchemaTypes.has(schemaType));

  return releaseCheck({
    checkKey: "schema_type_check",
    scope: "page",
    severity: "warning",
    result: matchingTypes.length > 0 ? "passed" : "failed",
    message:
      matchingTypes.length > 0
        ? "JSON-LD includes local SEO structured data types."
        : "JSON-LD parsed, but no LocalBusiness, Service, or FAQPage schema type was found.",
    evidence: {
      targetUrl: result.targetUrl,
      expected: { schemaTypes: [...localSeoSchemaTypes] },
      observed: { schemaTypes: analysis.schemaTypes }
    }
  });
}

function htmlMetadataCheck(result: Extract<PageFetchResult, { status: "ok" }>): ReleaseCheck {
  const metadata = htmlMetadata(result.html);
  const missing = [
    metadata.title ? undefined : "title",
    metadata.metaDescription ? undefined : "meta_description"
  ].filter((item): item is string => Boolean(item));

  return releaseCheck({
    checkKey: "html_metadata_check",
    scope: "page",
    severity: "warning",
    result: missing.length === 0 ? "passed" : "failed",
    message:
      missing.length === 0
        ? "Live route includes title and meta description source tags."
        : "Live route is missing title or meta description source tags.",
    evidence: {
      targetUrl: result.targetUrl,
      expected: { title: "present", metaDescription: "present" },
      observed: {
        missing,
        titleLength: metadata.title?.length ?? 0,
        metaDescriptionLength: metadata.metaDescription?.length ?? 0
      }
    }
  });
}

function primaryHeadingCheck(result: Extract<PageFetchResult, { status: "ok" }>): ReleaseCheck {
  const headings = h1Texts(result.html);
  const nonEmptyHeadings = headings.filter((heading) => heading.length > 0);
  const passed = nonEmptyHeadings.length === 1;

  return releaseCheck({
    checkKey: "primary_heading_check",
    scope: "page",
    severity: "warning",
    result: passed ? "passed" : "failed",
    message: passed
      ? "Live route includes exactly one non-empty H1."
      : "Live route should include exactly one non-empty H1.",
    evidence: {
      targetUrl: result.targetUrl,
      expected: { nonEmptyH1Count: 1 },
      observed: {
        h1Count: headings.length,
        nonEmptyH1Count: nonEmptyHeadings.length
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

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  limit: number,
  mapper: (value: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index] as T);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => worker()));

  return results;
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

function htmlMetadata(html: string): { title?: string; metaDescription?: string } {
  const title = firstTagText(html, "title");
  const metaTags = html.match(/<meta\b[^>]*>/giu) ?? [];
  const descriptionTag = metaTags.find((tag) => {
    const name = attributeValue(tag, "name") ?? "";
    return name.toLowerCase() === "description";
  });
  const metaDescription = descriptionTag ? attributeValue(descriptionTag, "content") : undefined;

  return {
    title: title && title.length > 0 ? title : undefined,
    metaDescription:
      metaDescription && metaDescription.trim().length > 0 ? htmlDecode(metaDescription).trim() : undefined
  };
}

function h1Texts(html: string): string[] {
  const headings: string[] = [];
  const pattern = /<h1\b[^>]*>([\s\S]*?)<\/h1>/giu;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html))) {
    headings.push(textContent(match[1] ?? ""));
  }

  return headings;
}

function firstTagText(html: string, tagName: string): string | undefined {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "iu");
  const value = pattern.exec(html)?.[1];
  return value ? textContent(value) : undefined;
}

function textContent(html: string): string {
  return htmlDecode(html.replace(/<[^>]+>/gu, " "))
    .replace(/\s+/gu, " ")
    .trim();
}

function attributeValue(tag: string, attribute: string): string | undefined {
  const pattern = new RegExp(`\\b${attribute}\\s*=\\s*["']([^"']+)["']`, "iu");
  return pattern.exec(tag)?.[1];
}

type JsonLdAnalysis = {
  scriptCount: number;
  parseFailures: number[];
  schemaTypes: string[];
};

function analyzeJsonLd(html: string): JsonLdAnalysis {
  const scripts = jsonLdScripts(html);
  const parseFailures: number[] = [];
  const schemaTypes = new Set<string>();

  scripts.forEach((script, index) => {
    const parsed = parseJsonValue(script);

    if (!parsed.ok) {
      parseFailures.push(index);
      return;
    }

    collectJsonLdTypes(parsed.value, schemaTypes);
  });

  return {
    scriptCount: scripts.length,
    parseFailures,
    schemaTypes: [...schemaTypes].sort()
  };
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

function parseJsonValue(value: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false };
  }
}

function collectJsonLdTypes(value: unknown, types: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectJsonLdTypes(item, types);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  const schemaType = value["@type"];

  if (typeof schemaType === "string" && schemaType.trim().length > 0) {
    types.add(normalizeSchemaType(schemaType));
  } else if (Array.isArray(schemaType)) {
    for (const item of schemaType) {
      if (typeof item === "string" && item.trim().length > 0) {
        types.add(normalizeSchemaType(item));
      }
    }
  }

  for (const nestedValue of Object.values(value)) {
    collectJsonLdTypes(nestedValue, types);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeSchemaType(value: string): string {
  const trimmed = value.trim();
  const separatorIndex = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("#"), trimmed.lastIndexOf(":"));

  return separatorIndex >= 0 ? trimmed.slice(separatorIndex + 1) || trimmed : trimmed;
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
