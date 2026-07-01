import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  GscOAuthIntentSchema,
  GscPropertyListSchema,
  GscSearchAnalyticsRowSchema,
  GscSitemapSubmissionSchema,
  GscUrlInspectionResultSchema,
  type GscOAuthIntent,
  type GscPropertyList,
  type GscSearchAnalyticsRow,
  type GscSitemapSubmission,
  type GscUrlInspectionResult
} from "@localseo/contracts";
import type { SearchConsoleAuthorizationRequest, SearchConsoleAuthorizationState, SearchConsolePort } from "./index.js";
import {
  ProviderRequestError,
  providerReasonCodeFromResponseText,
  runProviderRequestWithTimeout
} from "./provider-errors.js";

const defaultScopes = ["https://www.googleapis.com/auth/webmasters.readonly"] as const;

export type SearchConsoleTokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
};

export type GoogleSearchConsoleAdapterConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
  scopes?: string[];
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
};

export class GoogleSearchConsoleAdapter implements SearchConsolePort {
  private readonly scopes: string[];
  private readonly fetchImpl: typeof fetch;
  private readonly requestTimeoutMs: number;

  constructor(private readonly config: GoogleSearchConsoleAdapterConfig) {
    this.scopes = config.scopes?.length ? config.scopes : [...defaultScopes];
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.requestTimeoutMs = config.requestTimeoutMs ?? 20_000;
  }

  createAuthorizationUrl(input: {
    projectId: string;
    customerId: string;
    userId: string;
    sessionId?: string;
    redirectTo?: string;
    now?: Date;
  }): GscOAuthIntent {
    return this.createAuthorizationRequest(input).intent;
  }

  createAuthorizationRequest(input: {
    projectId: string;
    customerId: string;
    userId: string;
    sessionId?: string;
    redirectTo?: string;
    now?: Date;
  }): SearchConsoleAuthorizationRequest {
    const now = input.now ?? new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
    const statePayload = {
      provider: "google_search_console",
      projectId: input.projectId,
      customerId: input.customerId,
      userId: input.userId,
      sessionId: input.sessionId,
      redirectTo: input.redirectTo,
      issuedAt: now.toISOString(),
      expiresAt,
      nonce: randomBytes(16).toString("base64url")
    } satisfies SearchConsoleAuthorizationState;
    const state = signOAuthState(statePayload, this.config.stateSecret);
    const pkce = createPkcePair();

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("scope", this.scopes.join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", pkce.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");

    return {
      intent: GscOAuthIntentSchema.parse({
        projectId: input.projectId,
        status: "connection_required",
        provider: "google_search_console",
        authUrl: url.toString(),
        expiresAt,
        scopes: this.scopes,
        message: "Connect Google Search Console with Google OAuth. Search Analytics sync uses readonly access first."
      }),
      state,
      statePayload,
      codeVerifier: pkce.codeVerifier
    };
  }

  verifyState(input: { state: string; now?: Date }): SearchConsoleAuthorizationState {
    return verifyOAuthState(input.state, this.config.stateSecret, input.now ?? new Date());
  }

  async exchangeCode(input: { code: string; codeVerifier: string }): Promise<SearchConsoleTokenSet> {
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code: input.code,
      code_verifier: input.codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: this.config.redirectUri
    });

    return parseTokenResponse(await postForm("https://oauth2.googleapis.com/token", body, this.request("oauth_token")));
  }

  async refreshAccessToken(input: { refreshToken: string }): Promise<SearchConsoleTokenSet> {
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: input.refreshToken
    });

    return parseTokenResponse(await postForm("https://oauth2.googleapis.com/token", body, this.request("oauth_token")));
  }

  async listSites(input: { accessToken: string; projectId: string }): Promise<GscPropertyList> {
    const response = await getJson(
      "https://www.googleapis.com/webmasters/v3/sites",
      input.accessToken,
      this.request("list_sites")
    );
    const body = asRecord(response);
    const siteEntries = Array.isArray(body.siteEntry) ? body.siteEntry : [];

    return GscPropertyListSchema.parse({
      projectId: input.projectId,
      properties: siteEntries.flatMap((entry) => {
        const record = asRecord(entry);
        return typeof record.siteUrl === "string" && typeof record.permissionLevel === "string"
          ? [{ siteUrl: record.siteUrl, permissionLevel: record.permissionLevel }]
          : [];
      })
    });
  }

  async querySearchAnalytics(input: {
    accessToken: string;
    projectId: string;
    propertyUrl: string;
    dateRange: { from: string; to: string };
    dimensions?: string[];
    rowLimit?: number;
  }): Promise<GscSearchAnalyticsRow[]> {
    const dimensions = input.dimensions?.length ? input.dimensions : ["query", "page"];
    const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(input.propertyUrl)}/searchAnalytics/query`;
    const response = await postJson(
      endpoint,
      input.accessToken,
      {
        startDate: input.dateRange.from,
        endDate: input.dateRange.to,
        dimensions,
        rowLimit: input.rowLimit ?? 25000,
        type: "web",
        dataState: "final"
      },
      this.request("query_search_analytics")
    );

    const body = asRecord(response);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const queryIndex = dimensions.indexOf("query");
    const pageIndex = dimensions.indexOf("page");

    return rows.flatMap((row) => {
      const record = asRecord(row);
      const keys = Array.isArray(record.keys) ? record.keys : [];
      const query = typeof keys[queryIndex] === "string" ? keys[queryIndex] : undefined;
      const pageUrl = typeof keys[pageIndex] === "string" ? keys[pageIndex] : undefined;

      if (!query || !pageUrl) {
        return [];
      }

      return [
        GscSearchAnalyticsRowSchema.parse({
          projectId: input.projectId,
          propertyUrl: input.propertyUrl,
          query,
          pageUrl,
          clicks: toNumber(record.clicks),
          impressions: toNumber(record.impressions),
          ctr: toNumber(record.ctr),
          position: toNumber(record.position)
        })
      ];
    });
  }

  async submitSitemap(input: {
    accessToken: string;
    projectId: string;
    propertyUrl: string;
    sitemapUrl: string;
  }): Promise<GscSitemapSubmission> {
    const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(input.propertyUrl)}/sitemaps/${encodeURIComponent(input.sitemapUrl)}`;
    await putJson(endpoint, input.accessToken, this.request("submit_sitemap"));

    return GscSitemapSubmissionSchema.parse({
      projectId: input.projectId,
      propertyUrl: input.propertyUrl,
      sitemapUrl: input.sitemapUrl,
      submittedAt: new Date().toISOString()
    });
  }

  async inspectUrl(input: {
    accessToken: string;
    siteUrl: string;
    inspectionUrl: string;
  }): Promise<GscUrlInspectionResult> {
    const response = await postJson(
      "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
      input.accessToken,
      {
        siteUrl: input.siteUrl,
        inspectionUrl: input.inspectionUrl
      },
      this.request("inspect_url")
    );
    const body = asRecord(response);
    const inspectionResult = asRecord(body.inspectionResult);
    const indexStatusResult = asRecord(inspectionResult.indexStatusResult);

    return GscUrlInspectionResultSchema.parse({
      siteUrl: input.siteUrl,
      inspectionUrl: input.inspectionUrl,
      verdict: typeof indexStatusResult.verdict === "string" ? indexStatusResult.verdict : undefined,
      coverageState: typeof indexStatusResult.coverageState === "string" ? indexStatusResult.coverageState : undefined,
      checkedAt: new Date().toISOString(),
      raw: body
    });
  }

  private request(operation: string): GoogleRequestContext {
    return {
      fetchImpl: this.fetchImpl,
      operation,
      timeoutMs: this.requestTimeoutMs
    };
  }
}

export function signOAuthState(payload: SearchConsoleAuthorizationState, secret: string): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifyOAuthState(state: string, secret: string, now: Date): SearchConsoleAuthorizationState {
  const [encodedPayload, signature, extra] = state.split(".");

  if (!encodedPayload || !signature || extra) {
    throw new Error("Invalid OAuth state format");
  }

  const expected = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw new Error("Invalid OAuth state signature");
  }

  const payload = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf8")
  ) as SearchConsoleAuthorizationState;

  if (
    payload.provider !== "google_search_console" ||
    !payload.projectId ||
    !payload.customerId ||
    !payload.userId ||
    !payload.issuedAt ||
    !payload.expiresAt ||
    !payload.nonce
  ) {
    throw new Error("Invalid OAuth state payload");
  }

  if (Date.parse(payload.expiresAt) < now.getTime()) {
    throw new Error("Expired OAuth state");
  }

  return payload;
}

export function createPkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

  return {
    codeVerifier,
    codeChallenge
  };
}

type GoogleRequestContext = {
  fetchImpl: typeof fetch;
  operation: string;
  timeoutMs: number;
};

async function postForm(url: string, body: URLSearchParams, context: GoogleRequestContext): Promise<unknown> {
  return runProviderRequestWithTimeout(
    {
      provider: "google_search_console",
      operation: context.operation,
      timeoutMs: context.timeoutMs
    },
    async (signal) => {
      const response = await context.fetchImpl(url, {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body
      });

      return parseJsonResponse(response, context.operation);
    }
  );
}

async function getJson(url: string, accessToken: string, context: GoogleRequestContext): Promise<unknown> {
  return runProviderRequestWithTimeout(
    {
      provider: "google_search_console",
      operation: context.operation,
      timeoutMs: context.timeoutMs
    },
    async (signal) => {
      const response = await context.fetchImpl(url, {
        signal,
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      return parseJsonResponse(response, context.operation);
    }
  );
}

async function postJson(
  url: string,
  accessToken: string,
  body: unknown,
  context: GoogleRequestContext
): Promise<unknown> {
  return runProviderRequestWithTimeout(
    {
      provider: "google_search_console",
      operation: context.operation,
      timeoutMs: context.timeoutMs
    },
    async (signal) => {
      const response = await context.fetchImpl(url, {
        method: "POST",
        signal,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      return parseJsonResponse(response, context.operation);
    }
  );
}

async function putJson(url: string, accessToken: string, context: GoogleRequestContext): Promise<unknown> {
  return runProviderRequestWithTimeout(
    {
      provider: "google_search_console",
      operation: context.operation,
      timeoutMs: context.timeoutMs
    },
    async (signal) => {
      const response = await context.fetchImpl(url, {
        method: "PUT",
        signal,
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      return parseJsonResponse(response, context.operation);
    }
  );
}

async function parseJsonResponse(response: Response, operation: string): Promise<unknown> {
  const text = await response.text();

  if (!response.ok) {
    throw new ProviderRequestError({
      provider: "google_search_console",
      operation,
      reasonCode: "http_error",
      statusCode: response.status,
      providerReasonCode: providerReasonCodeFromResponseText(text)
    });
  }

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new ProviderRequestError({
      provider: "google_search_console",
      operation,
      reasonCode: "invalid_json_response",
      statusCode: response.status
    });
  }
}

function parseTokenResponse(response: unknown): SearchConsoleTokenSet {
  const body = asRecord(response);
  const accessToken = body.access_token;

  if (typeof accessToken !== "string") {
    throw new ProviderRequestError({
      provider: "google_search_console",
      operation: "oauth_token",
      reasonCode: "invalid_provider_response"
    });
  }

  return {
    accessToken,
    refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : undefined,
    expiresIn: typeof body.expires_in === "number" ? body.expires_in : undefined,
    scope: typeof body.scope === "string" ? body.scope : undefined
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
