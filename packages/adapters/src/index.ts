import type {
  DomainEventName,
  GscOAuthIntent,
  GscPropertyList,
  GscSearchAnalyticsRow,
  GscSitemapSubmission,
  GscUrlInspectionResult,
  ReleaseVerification,
  RollbackPoint,
  TrackingEvent
} from "@localseo/contracts";

export * from "./google-search-console.js";
export * from "./redis-connection.js";
export * from "./token-cipher.js";

export type DeployReleaseInput = {
  releasePlanId: string;
  projectId: string;
  buildArtifactKey: string;
};

export type DeployReleaseResult = {
  deploymentId: string;
  liveUrls: string[];
};

export type CreateDeployInput = DeployReleaseInput & {
  deploymentKey: string;
  jobRunId?: string;
  evidence?: Record<string, unknown>;
};

export type ProviderDeployStatus = "pending" | "deploying" | "ready" | "failed" | "rolled_back" | "unknown";

export type ProviderDeploySnapshot = {
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
  providerDeployId?: string;
};

export type RollbackDeployResult = {
  status: "queued" | "completed" | "failed";
  providerDeployId?: string;
  liveUrl?: string;
  evidence?: Record<string, unknown>;
};

export type CrawledWebsiteSnapshot = {
  projectId: string;
  sourceUrl: string;
  artifactKey: string;
  discoveredRoutes: string[];
};

export type AnalyticsSnapshot = {
  projectId: string;
  source: string;
  dateRange: { from: string; to: string };
  metrics: Record<string, number>;
};

export type AiReasoningResult = {
  workflowId: string;
  status: "completed" | "blocked" | "failed";
  output: unknown;
};

export type DomainEvent = {
  name: DomainEventName;
  projectId?: string;
  aggregateId?: string;
  payload: Record<string, unknown>;
  occurredAt: string;
};

export interface SiteHostingPort {
  createDeploy(input: CreateDeployInput): Promise<DeployReleaseResult>;
  getDeploy(input: { providerDeployId: string }): Promise<ProviderDeploySnapshot>;
  restoreDeploy(input: RestoreDeployInput): Promise<RestoreDeployResult>;
  rollbackDeploy(input: RollbackDeployInput): Promise<RollbackDeployResult>;
}

export interface SearchConsolePort {
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

export interface CrawlerPort {
  crawlWebsite(input: { projectId: string; sourceUrl: string }): Promise<CrawledWebsiteSnapshot>;
}

export interface AnalyticsPort {
  collectSnapshot(input: { projectId: string; from: string; to: string }): Promise<AnalyticsSnapshot>;
}

export interface AiReasoningPort {
  runWorkflow(input: { workflowId: string; projectId: string; input: unknown }): Promise<AiReasoningResult>;
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
  }): Promise<ReleaseVerification>;
}

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
  createDeploy(input: CreateDeployInput): Promise<DeployReleaseResult> {
    return Promise.resolve({
      deploymentId: `dry_run_${input.releasePlanId}`,
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
