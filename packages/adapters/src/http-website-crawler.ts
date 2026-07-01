import type {
  CrawledWebsiteImage,
  CrawledWebsitePage,
  CrawledWebsiteSkippedUrl,
  CrawledWebsiteSnapshot,
  CrawlerPort,
  ObjectStoragePort
} from "./index.js";

type FetchLike = typeof fetch;

export type HttpWebsiteCrawlerOptions = {
  fetchImpl?: FetchLike;
  maxPages?: number;
  maxDepth?: number;
  requestTimeoutMs?: number;
  maxHtmlBytes?: number;
  userAgent?: string;
};

type QueuedUrl = {
  url: URL;
  depth: number;
};

const defaultMaxPages = 8;
const defaultMaxDepth = 1;
const defaultRequestTimeoutMs = 10_000;
const defaultMaxHtmlBytes = 512_000;
const defaultUserAgent = "LocalSEO-WebsiteImporter/0.1";

export class HttpWebsiteCrawlerAdapter implements CrawlerPort {
  private readonly fetchImpl: FetchLike;
  private readonly maxPages: number;
  private readonly maxDepth: number;
  private readonly requestTimeoutMs: number;
  private readonly maxHtmlBytes: number;
  private readonly userAgent: string;

  constructor(
    private readonly objectStorage: ObjectStoragePort,
    options: HttpWebsiteCrawlerOptions = {}
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxPages = options.maxPages ?? defaultMaxPages;
    this.maxDepth = options.maxDepth ?? defaultMaxDepth;
    this.requestTimeoutMs = options.requestTimeoutMs ?? defaultRequestTimeoutMs;
    this.maxHtmlBytes = options.maxHtmlBytes ?? defaultMaxHtmlBytes;
    this.userAgent = options.userAgent ?? defaultUserAgent;
  }

  async crawlWebsite(input: {
    projectId: string;
    sourceUrl: string;
    importRunId?: string;
  }): Promise<CrawledWebsiteSnapshot> {
    const rootUrl = normalizeHttpUrl(input.sourceUrl);
    const crawledAt = new Date().toISOString();
    const queue: QueuedUrl[] = [{ url: rootUrl, depth: 0 }];
    const seen = new Set<string>();
    const pages: CrawledWebsitePage[] = [];
    const skippedUrls: CrawledWebsiteSkippedUrl[] = [];

    while (queue.length > 0 && pages.length < this.maxPages) {
      const next = queue.shift();

      if (!next) {
        continue;
      }

      const normalizedUrl = normalizeUrlForVisit(next.url);

      if (seen.has(normalizedUrl)) {
        continue;
      }

      seen.add(normalizedUrl);

      if (next.url.origin !== rootUrl.origin) {
        skippedUrls.push({ url: normalizedUrl, reason: "external_origin" });
        continue;
      }

      const fetched = await this.fetchPage(next.url);
      const pageUrl = fetched.finalUrl;
      const normalizedPageUrl = normalizeUrlForVisit(pageUrl);
      seen.add(normalizedPageUrl);

      if (!fetched.html) {
        pages.push({
          url: normalizedPageUrl,
          route: routeForUrl(pageUrl),
          status: fetched.status,
          internalLinks: [],
          images: [],
          schemaTypes: []
        });
        continue;
      }

      const extracted = extractHtmlEvidence(pageUrl, fetched.html);
      pages.push({
        url: normalizedPageUrl,
        route: routeForUrl(pageUrl),
        status: fetched.status,
        ...extracted
      });

      if (next.depth >= this.maxDepth) {
        continue;
      }

      for (const link of extracted.internalLinks) {
        const linkUrl = new URL(link);
        const normalizedLink = normalizeUrlForVisit(linkUrl);

        if (!seen.has(normalizedLink) && queue.length + pages.length < this.maxPages * 2) {
          queue.push({ url: linkUrl, depth: next.depth + 1 });
        }
      }
    }

    const discoveredRoutes = [...new Set(pages.map((page) => page.route))].sort();
    const artifactKey = `website-imports/${input.projectId}/${input.importRunId ?? Date.now().toString()}.json`;
    const snapshot: CrawledWebsiteSnapshot = {
      projectId: input.projectId,
      sourceUrl: rootUrl.toString(),
      artifactKey,
      crawledAt,
      discoveredRoutes,
      pages,
      skippedUrls
    };

    await this.objectStorage.putJson({
      key: artifactKey,
      value: snapshot
    });

    return snapshot;
  }

  private async fetchPage(url: URL, redirectCount = 0): Promise<{ status: number; html?: string; finalUrl: URL }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await this.fetchImpl(url.toString(), {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": this.userAgent
        },
        redirect: "manual",
        signal: controller.signal
      });

      if (isRedirectStatus(response.status)) {
        const location = response.headers.get("location");

        if (!location || redirectCount >= 5) {
          return { status: response.status, finalUrl: url };
        }

        const redirectUrl = new URL(location, url);

        if (redirectUrl.origin !== url.origin) {
          return { status: response.status, finalUrl: url };
        }

        return this.fetchPage(redirectUrl, redirectCount + 1);
      }

      const contentType = response.headers.get("content-type") ?? "";

      if (!contentType.toLowerCase().includes("text/html")) {
        return { status: response.status, finalUrl: url };
      }

      return {
        status: response.status,
        finalUrl: url,
        html: await readResponseText(response, this.maxHtmlBytes)
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Website import request timed out: ${url.origin}${url.pathname}`, {
          cause: error
        });
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function normalizeHttpUrl(value: string): URL {
  const url = new URL(value);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Website import source URLs must use http or https.");
  }

  url.hash = "";
  return url;
}

function normalizeUrlForVisit(url: URL): string {
  const normalized = new URL(url.toString());
  normalized.hash = "";
  return normalized.toString();
}

function routeForUrl(url: URL): string {
  return `${url.pathname}${url.search}` || "/";
}

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
}

async function readResponseText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    return response.text();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done || !value) {
      break;
    }

    totalBytes += value.byteLength;
    chunks.push(value);

    if (totalBytes >= maxBytes) {
      break;
    }
  }

  const merged = new Uint8Array(Math.min(totalBytes, maxBytes));
  let offset = 0;

  for (const chunk of chunks) {
    const remaining = merged.length - offset;

    if (remaining <= 0) {
      break;
    }

    merged.set(chunk.subarray(0, remaining), offset);
    offset += Math.min(chunk.byteLength, remaining);
  }

  return new TextDecoder().decode(merged);
}

function extractHtmlEvidence(baseUrl: URL, html: string): Omit<CrawledWebsitePage, "url" | "route" | "status"> {
  return {
    title: firstMatchText(html, /<title[^>]*>([\s\S]*?)<\/title>/iu),
    metaDescription: metaContent(html, "description"),
    h1: firstMatchText(html, /<h1[^>]*>([\s\S]*?)<\/h1>/iu),
    canonical: linkHref(html, "canonical", baseUrl),
    robots: metaContent(html, "robots"),
    internalLinks: extractInternalLinks(baseUrl, html),
    images: extractImages(baseUrl, html),
    schemaTypes: extractSchemaTypes(html),
    visibleTextSummary: summarizeVisibleText(html)
  };
}

function firstMatchText(html: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(html);
  return match?.[1] ? normalizeText(stripTags(match[1])).slice(0, 240) : undefined;
}

function metaContent(html: string, name: string): string | undefined {
  const pattern = new RegExp(`<meta\\s+[^>]*(?:name|property)=["']${escapeRegExp(name)}["'][^>]*>`, "iu");
  const match = pattern.exec(html);
  return match?.[0] ? attributeValue(match[0], "content") : undefined;
}

function linkHref(html: string, rel: string, baseUrl: URL): string | undefined {
  const pattern = new RegExp(`<link\\s+[^>]*rel=["'][^"']*${escapeRegExp(rel)}[^"']*["'][^>]*>`, "iu");
  const match = pattern.exec(html);
  const href = match?.[0] ? attributeValue(match[0], "href") : undefined;

  if (!href) {
    return undefined;
  }

  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function extractInternalLinks(baseUrl: URL, html: string): string[] {
  const links = new Set<string>();
  const linkPattern = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/giu;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(html))) {
    const href = match[1];

    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      continue;
    }

    try {
      const url = new URL(href, baseUrl);

      if (url.origin === baseUrl.origin && (url.protocol === "http:" || url.protocol === "https:")) {
        links.add(normalizeUrlForVisit(url));
      }
    } catch {
      continue;
    }
  }

  return [...links].sort();
}

function extractImages(baseUrl: URL, html: string): CrawledWebsiteImage[] {
  const images: CrawledWebsiteImage[] = [];
  const imagePattern = /<img\s+[^>]*>/giu;
  let match: RegExpExecArray | null;

  while ((match = imagePattern.exec(html)) && images.length < 20) {
    const src = attributeValue(match[0], "src");

    if (!src) {
      continue;
    }

    try {
      const imageUrl = new URL(src, baseUrl);
      images.push({
        src: imageUrl.toString(),
        alt: attributeValue(match[0], "alt")
      });
    } catch {
      continue;
    }
  }

  return images;
}

function extractSchemaTypes(html: string): string[] {
  const types = new Set<string>();
  const scriptPattern = /<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu;
  let match: RegExpExecArray | null;

  while ((match = scriptPattern.exec(html))) {
    if (!match[1]) {
      continue;
    }

    try {
      collectSchemaTypes(JSON.parse(match[1]) as unknown, types);
    } catch {
      continue;
    }
  }

  return [...types].sort();
}

function collectSchemaTypes(value: unknown, types: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectSchemaTypes(item, types);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;
  const typeValue = record["@type"];

  if (typeof typeValue === "string") {
    types.add(typeValue);
  } else if (Array.isArray(typeValue)) {
    for (const item of typeValue) {
      if (typeof item === "string") {
        types.add(item);
      }
    }
  }

  if (record["@graph"]) {
    collectSchemaTypes(record["@graph"], types);
  }
}

function summarizeVisibleText(html: string): string | undefined {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/giu, " ")
    .replace(/<style[\s\S]*?<\/style>/giu, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/giu, " ");
  const summary = normalizeText(stripTags(withoutScripts)).slice(0, 1000);
  return summary.length > 0 ? summary : undefined;
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/gu, " ");
}

function normalizeText(value: string): string {
  return decodeBasicHtmlEntities(value).replace(/\s+/gu, " ").trim();
}

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">");
}

function attributeValue(tag: string, attribute: string): string | undefined {
  const pattern = new RegExp(`${escapeRegExp(attribute)}=["']([^"']*)["']`, "iu");
  const match = pattern.exec(tag);
  const value = match?.[1];
  return value ? decodeBasicHtmlEntities(value).trim() : undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
