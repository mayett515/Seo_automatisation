import * as cheerio from "cheerio";
import type { PublicWebSearchFailureCode, PublicWebSearchItem } from "@localseo/contracts";

const DEFAULT_ENDPOINT = "https://html.duckduckgo.com/html/";
const DEFAULT_MAX_RESPONSE_BYTES = 1_000_000;

export type DuckDuckGoHtmlSearchRequest = {
  query: string;
  requestedLocale: string;
  requestedRegion?: string;
  maxResults: number;
};

export type DuckDuckGoHtmlSearchResult = {
  effectiveLocale: string;
  observedLocale?: string;
  results: PublicWebSearchItem[];
};

export class DuckDuckGoHtmlSearchError extends Error {
  constructor(
    message: string,
    readonly code: PublicWebSearchFailureCode
  ) {
    super(message);
  }
}

export class DuckDuckGoHtmlSearchAdapter {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options?: {
    endpoint?: string;
    timeoutMs?: number;
    maxResponseBytes?: number;
    fetchImpl?: typeof fetch;
  }) {
    this.endpoint = options?.endpoint ?? DEFAULT_ENDPOINT;
    this.timeoutMs = options?.timeoutMs ?? 15_000;
    this.maxResponseBytes = options?.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    this.fetchImpl = options?.fetchImpl ?? fetch;
  }

  async search(input: DuckDuckGoHtmlSearchRequest): Promise<DuckDuckGoHtmlSearchResult> {
    const query = input.query.trim().replace(/\s+/gu, " ");
    if (!query || query.length > 240) {
      throw new DuckDuckGoHtmlSearchError("DuckDuckGo query is invalid.", "policy_denied");
    }
    const effectiveLocale = normalizeDuckDuckGoLocale(input.requestedLocale, input.requestedRegion);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const body = new URLSearchParams({ q: query, kl: effectiveLocale });
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          accept: "text/html,application/xhtml+xml",
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          "user-agent": "LocalSeoResearchBot/1.0 (+https://localhost.invalid/research-policy)"
        },
        body,
        redirect: "follow",
        signal: controller.signal
      });
      if (response.status === 403 || response.status === 429) {
        throw new DuckDuckGoHtmlSearchError(`DuckDuckGo blocked the request (${response.status}).`, "provider_blocked");
      }
      if (!response.ok) {
        throw new DuckDuckGoHtmlSearchError(
          `DuckDuckGo returned ${response.status}.`,
          response.status >= 500 ? "provider_unavailable" : "invalid_response"
        );
      }
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
        throw new DuckDuckGoHtmlSearchError("DuckDuckGo returned a non-HTML response.", "invalid_response");
      }
      const html = await readBoundedText(response, this.maxResponseBytes);
      const results = parseDuckDuckGoHtml(html, Math.min(Math.max(input.maxResults, 1), 5));
      if (results.length === 0 && /captcha|automated queries|unusual traffic|verify you are human/iu.test(html)) {
        throw new DuckDuckGoHtmlSearchError("DuckDuckGo returned an anti-automation challenge.", "provider_blocked");
      }
      return { effectiveLocale, observedLocale: detectObservedLocale(html), results };
    } catch (error) {
      if (error instanceof DuckDuckGoHtmlSearchError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new DuckDuckGoHtmlSearchError("DuckDuckGo request timed out.", "provider_timeout");
      }
      const message = error instanceof Error ? error.message : "Unknown DuckDuckGo transport failure.";
      throw new DuckDuckGoHtmlSearchError(message, "provider_unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function parseDuckDuckGoHtml(html: string, maxResults = 5): PublicWebSearchItem[] {
  const $ = cheerio.load(html);
  const results: PublicWebSearchItem[] = [];
  const seen = new Set<string>();
  $(".result").each((_, result) => {
    if (results.length >= Math.min(Math.max(maxResults, 1), 5)) return false;
    const anchor = $(result).find("a.result__a").first();
    const title = cleanText(anchor.text()).slice(0, 300);
    const url = normalizeResultUrl(anchor.attr("href"));
    if (!title || !url || seen.has(url)) return;
    seen.add(url);
    const snippet = cleanText($(result).find(".result__snippet").first().text()).slice(0, 1_000);
    const displayUrl = cleanText($(result).find(".result__url").first().text()).slice(0, 300);
    const parsed = new URL(url);
    results.push({
      title,
      url,
      domain: parsed.hostname.toLowerCase(),
      ...(displayUrl ? { displayUrl } : {}),
      ...(snippet ? { snippet } : {})
    });
  });
  return results;
}

export function normalizeDuckDuckGoLocale(locale: string, region?: string): string {
  const normalized = (region?.trim() || locale.trim()).toLowerCase().replace(/_/gu, "-");
  return /^[a-z]{2}(?:-[a-z]{2})?$/u.test(normalized) ? normalized : "de-de";
}

function normalizeResultUrl(rawHref: string | undefined): string | undefined {
  if (!rawHref) return undefined;
  try {
    const intermediary = new URL(rawHref, DEFAULT_ENDPOINT);
    const decoded = intermediary.searchParams.get("uddg");
    const target = new URL(decoded ?? intermediary.href);
    if (!["http:", "https:"].includes(target.protocol)) return undefined;
    target.hash = "";
    return target.href;
  } catch {
    return undefined;
  }
}

function cleanText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function detectObservedLocale(html: string): string | undefined {
  const $ = cheerio.load(html);
  const language = $("html").attr("lang")?.trim();
  return language ? language.slice(0, 80) : undefined;
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new DuckDuckGoHtmlSearchError("DuckDuckGo response exceeded the byte limit.", "invalid_response");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new DuckDuckGoHtmlSearchError("DuckDuckGo response exceeded the byte limit.", "invalid_response");
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}
