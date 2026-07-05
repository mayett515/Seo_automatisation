import type {
  DomainEventName,
  AiReasoningAdapterFailureCode,
  GscOAuthIntent,
  GscPropertyList,
  GscSearchAnalyticsRow,
  GscSitemapSubmission,
  GscUrlInspectionResult,
  ReasoningTask,
  ReleaseVerification,
  ReleaseVerificationCheck,
  RollbackPoint,
  SerpScoutFailureCode,
  SerpScoutRequest,
  SerpSnapshot,
  TrackingEvent
} from "@localseo/contracts";

export * from "./google-search-console.js";
export * from "./file-system-object-storage.js";
export * from "./http-website-crawler.js";
export * from "./http-release-verification.js";
export * from "./playwright-browser-verification.js";
export * from "./provider-errors.js";
export * from "./redis-connection.js";
export * from "./netlify-site-hosting.js";
export * from "./not-configured-ai-reasoning.js";
export * from "./s3-object-storage.js";
export * from "./token-cipher.js";
export * from "./mock-ai-reasoning.js";
export * from "./opencode-go-reasoning.js";

export type DeployReleaseInput = {
  releasePlanId: string;
  projectId: string;
  buildArtifactKey: string;
  hostingSiteId?: string;
};

export type DeployReleaseResult =
  | {
      status: "ready";
      providerDeployId: string;
      liveUrls: string[];
      evidence?: Record<string, unknown>;
    }
  | {
      status: "pending";
      providerDeployId: string;
      liveUrls: string[];
      evidence?: Record<string, unknown>;
    }
  | {
      status: "not_configured";
      message: string;
      liveUrls: [];
    };

export type ProviderUploadResumeToken = Record<string, unknown>;

export type CreateDeployInput = DeployReleaseInput & {
  deploymentId?: string;
  deploymentKey: string;
  jobRunId?: string;
  evidence?: Record<string, unknown>;
};

export type BeginDeployResult =
  | {
      status: "started";
      providerDeployId: string;
      liveUrls: string[];
      resumeToken?: ProviderUploadResumeToken;
      evidence?: Record<string, unknown>;
    }
  | {
      status: "not_configured";
      message: string;
      liveUrls: [];
    };

export type UploadDeployFilesInput = {
  projectId: string;
  releasePlanId: string;
  deploymentKey: string;
  buildArtifactKey: string;
  providerDeployId: string;
  resumeToken?: ProviderUploadResumeToken;
};

export type UploadDeployFilesResult = {
  evidence?: Record<string, unknown>;
};

export type ProviderDeployStatus = "pending" | "deploying" | "ready" | "failed" | "rolled_back" | "unknown";

export type ProviderDeploySnapshot = {
  providerDeployId: string;
  status: ProviderDeployStatus;
  liveUrls: string[];
  evidence?: Record<string, unknown>;
};

export type PublishedDeploySnapshot = {
  providerDeployId: string;
  status: ProviderDeployStatus;
  liveUrls: string[];
  evidence?: Record<string, unknown>;
};

export type RestoreDeployInput = {
  projectId: string;
  releasePlanId: string;
  deploymentKey: string;
};

export type RestoreDeployResult = {
  artifactKey: string;
  providerDeployId?: string;
  liveUrl?: string;
  evidence?: Record<string, unknown>;
};

export type RollbackDeployInput = {
  projectId: string;
  releasePlanId: string;
  rollbackPointId: string;
  hostingSiteId?: string;
  providerDeployId?: string;
};

export type RollbackDeployResult = {
  status: "queued" | "completed" | "failed";
  providerDeployId?: string;
  liveUrl?: string;
  evidence?: Record<string, unknown>;
};

export type CrawledWebsiteImage = {
  src: string;
  alt?: string;
};

export type CrawledWebsitePage = {
  url: string;
  route: string;
  status: number;
  title?: string;
  metaDescription?: string;
  h1?: string;
  canonical?: string;
  robots?: string;
  internalLinks: string[];
  images: CrawledWebsiteImage[];
  schemaTypes: string[];
  visibleTextSummary?: string;
};

export type CrawledWebsiteSkippedUrl = {
  url: string;
  reason: string;
};

export type CrawledWebsiteSnapshot = {
  projectId: string;
  sourceUrl: string;
  artifactKey: string;
  crawledAt: string;
  discoveredRoutes: string[];
  pages: CrawledWebsitePage[];
  skippedUrls: CrawledWebsiteSkippedUrl[];
};

export type AnalyticsSnapshot = {
  projectId: string;
  source: string;
  dateRange: { from: string; to: string };
  metrics: Record<string, number>;
};

export type SerpScoutDiagnostics = {
  latencyMs: number;
  detail?: string;
};

export type SerpScoutResult =
  | {
      ok: true;
      snapshot: SerpSnapshot;
      diagnostics: SerpScoutDiagnostics;
    }
  | {
      ok: false;
      failureCode: SerpScoutFailureCode;
      diagnostics: SerpScoutDiagnostics;
    };

export interface SerpScoutPort {
  search(input: SerpScoutRequest & { timeoutMs: number; agentRunId?: string }): Promise<SerpScoutResult>;
}

export type AiReasoningToolCategory = "read_evidence" | "search_web" | "read_public_page" | "analyze" | "draft_content";

export type AiReasoningRunPolicy = {
  canMutateProduction: false;
  allowedToolCategories: AiReasoningToolCategory[];
  maxCostCents?: number;
};

export type AiReasoningRunInput = {
  task: ReasoningTask;
  projectId: string;
  runId: string;
  prompt: string;
  inputJson: unknown;
  outputSchemaName: string;
  timeoutMs: number;
  policy: AiReasoningRunPolicy;
};

export type AiReasoningUsage = {
  inputTokens?: number;
  outputTokens?: number;
  costCents?: number;
};

export type AiReasoningDiagnostics = {
  latencyMs: number;
  finishReason?: string;
  detail?: string;
};

export type AiReasoningRunResult =
  | {
      ok: true;
      provider: string;
      model: string;
      outputJson: unknown;
      usage?: AiReasoningUsage;
      diagnostics: AiReasoningDiagnostics;
    }
  | {
      ok: false;
      failureCode: AiReasoningAdapterFailureCode;
      provider: string;
      model?: string;
      diagnostics: AiReasoningDiagnostics;
    };

export type DomainEvent = {
  name: DomainEventName;
  projectId?: string;
  aggregateId?: string;
  payload: Record<string, unknown>;
  occurredAt: string;
};

export interface SiteHostingPort {
  beginDeploy(input: CreateDeployInput): Promise<BeginDeployResult>;
  uploadDeployFiles(input: UploadDeployFilesInput): Promise<UploadDeployFilesResult>;
  createDeploy(input: CreateDeployInput): Promise<DeployReleaseResult>;
  getDeploy(input: { providerDeployId: string }): Promise<ProviderDeploySnapshot>;
  getPublishedDeploy(input: { hostingSiteId: string }): Promise<PublishedDeploySnapshot | undefined>;
  restoreDeploy(input: RestoreDeployInput): Promise<RestoreDeployResult>;
  rollbackDeploy(input: RollbackDeployInput): Promise<RollbackDeployResult>;
}

export interface SearchConsolePort {
  createAuthorizationRequest(input: {
    projectId: string;
    customerId: string;
    userId: string;
    sessionId?: string;
    redirectTo?: string;
  }): SearchConsoleAuthorizationRequest;
  createAuthorizationUrl(input: {
    projectId: string;
    customerId: string;
    userId: string;
    sessionId?: string;
    redirectTo?: string;
  }): GscOAuthIntent;
  verifyState(input: { state: string }): {
    provider: "google_search_console";
    projectId: string;
    customerId: string;
    userId: string;
    sessionId?: string;
    issuedAt: string;
    expiresAt: string;
    nonce: string;
    redirectTo?: string;
  };
  exchangeCode(input: {
    code: string;
    codeVerifier: string;
  }): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number; scope?: string }>;
  refreshAccessToken(input: {
    refreshToken: string;
  }): Promise<{ accessToken: string; expiresIn?: number; scope?: string }>;
  listSites(input: { accessToken: string; projectId: string }): Promise<GscPropertyList>;
  querySearchAnalytics(input: {
    accessToken: string;
    projectId: string;
    propertyUrl: string;
    dateRange: { from: string; to: string };
    dimensions?: string[];
    rowLimit?: number;
  }): Promise<GscSearchAnalyticsRow[]>;
  submitSitemap(input: {
    accessToken: string;
    projectId: string;
    propertyUrl: string;
    sitemapUrl: string;
  }): Promise<GscSitemapSubmission>;
  inspectUrl(input: { accessToken: string; siteUrl: string; inspectionUrl: string }): Promise<GscUrlInspectionResult>;
}

export type SearchConsoleAuthorizationState = {
  provider: "google_search_console";
  projectId: string;
  customerId: string;
  userId: string;
  sessionId?: string;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  redirectTo?: string;
};

export type SearchConsoleAuthorizationRequest = {
  intent: GscOAuthIntent;
  state: string;
  statePayload: SearchConsoleAuthorizationState;
  codeVerifier: string;
};

export interface CrawlerPort {
  crawlWebsite(input: { projectId: string; sourceUrl: string; importRunId?: string }): Promise<CrawledWebsiteSnapshot>;
}

export interface AnalyticsPort {
  collectSnapshot(input: { projectId: string; from: string; to: string }): Promise<AnalyticsSnapshot>;
}

export interface AiReasoningPort {
  runStructured(input: AiReasoningRunInput): Promise<AiReasoningRunResult>;
}

export interface ObjectStoragePort {
  putJson(input: { key: string; value: unknown }): Promise<{ key: string }>;
  getJson(input: { key: string }): Promise<unknown>;
}

export interface TrackingPort {
  ingest(event: TrackingEvent): Promise<void>;
}

export interface EventPublisherPort {
  publish(event: DomainEvent): Promise<void>;
}

export interface VerificationPort {
  verifyRelease(input: {
    releasePlanId: string;
    deploymentId?: string;
    liveUrls: string[];
    trackingExpected?: boolean;
  }): Promise<ReleaseVerification>;
}

export type VerificationCheckEvidence = {
  targetUrl?: string;
  expected?: Record<string, unknown>;
  observed?: Record<string, unknown>;
  [key: string]: unknown;
};

export type DetailedReleaseVerificationCheck = ReleaseVerificationCheck & {
  evidence?: VerificationCheckEvidence;
};

export interface SitemapPort {
  publishSitemap(input: { projectId: string; sitemapUrl: string }): Promise<void>;
}

export interface RollbackPort {
  prepareRollbackPoint(input: {
    projectId: string;
    releasePlanId: string;
    deploymentId?: string;
  }): Promise<RollbackPoint>;
  executeRollback(input: { projectId: string; rollbackPointId: string }): Promise<{ status: "queued" | "completed" }>;
}

export class NotConfiguredSiteHostingAdapter implements SiteHostingPort {
  beginDeploy(input: CreateDeployInput): Promise<BeginDeployResult> {
    return Promise.resolve({
      status: "not_configured",
      message: `Site hosting is not configured for release plan ${input.releasePlanId}.`,
      liveUrls: []
    });
  }

  uploadDeployFiles(): Promise<UploadDeployFilesResult> {
    return Promise.resolve({
      evidence: { adapter: "not_configured" }
    });
  }

  createDeploy(input: CreateDeployInput): Promise<DeployReleaseResult> {
    return Promise.resolve({
      status: "not_configured",
      message: `Site hosting is not configured for release plan ${input.releasePlanId}.`,
      liveUrls: []
    });
  }

  getDeploy(input: { providerDeployId: string }): Promise<ProviderDeploySnapshot> {
    return Promise.resolve({
      providerDeployId: input.providerDeployId,
      status: "unknown",
      liveUrls: []
    });
  }

  getPublishedDeploy(): Promise<PublishedDeploySnapshot | undefined> {
    return Promise.resolve(undefined);
  }

  restoreDeploy(input: RestoreDeployInput): Promise<RestoreDeployResult> {
    return Promise.resolve({
      artifactKey: `dry_run/${input.releasePlanId}/rollback.json`,
      evidence: { adapter: "not_configured" }
    });
  }

  rollbackDeploy(input: RollbackDeployInput): Promise<RollbackDeployResult> {
    return Promise.resolve({
      status: "failed",
      providerDeployId: input.providerDeployId,
      evidence: { adapter: "not_configured" }
    });
  }
}
