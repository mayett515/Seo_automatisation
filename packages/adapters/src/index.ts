import type {
  DomainEventName,
  GscConnection,
  ReleaseVerification,
  RollbackPoint,
  TrackingEvent
} from "@localseo/contracts";

export type DeployReleaseInput = {
  releasePlanId: string;
  projectId: string;
  buildArtifactKey: string;
};

export type DeployReleaseResult = {
  deploymentId: string;
  liveUrls: string[];
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
  deployRelease(input: DeployReleaseInput): Promise<DeployReleaseResult>;
}

export interface SearchConsolePort {
  getConnection(input: { projectId: string }): Promise<GscConnection>;
  submitSitemap(input: { projectId: string; sitemapUrl: string }): Promise<void>;
  syncPerformance(input: { projectId: string; propertyUrl: string }): Promise<{ snapshotId: string }>;
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
  verifyRelease(input: { releasePlanId: string; deploymentId?: string; liveUrls: string[] }): Promise<ReleaseVerification>;
}

export interface SitemapPort {
  publishSitemap(input: { projectId: string; sitemapUrl: string }): Promise<void>;
}

export interface RollbackPort {
  prepareRollbackPoint(input: { projectId: string; releasePlanId: string; deploymentId?: string }): Promise<RollbackPoint>;
  executeRollback(input: { projectId: string; rollbackPointId: string }): Promise<{ status: "queued" | "completed" }>;
}

export class NotConfiguredSiteHostingAdapter implements SiteHostingPort {
  async deployRelease(input: DeployReleaseInput): Promise<DeployReleaseResult> {
    return {
      deploymentId: `dry_run_${input.releasePlanId}`,
      liveUrls: []
    };
  }
}
