import type { ReleaseCheck, TrackingEvent } from "@localseo/contracts";

export type DeployReleaseInput = {
  releasePlanId: string;
  projectId: string;
  buildArtifactKey: string;
};

export type DeployReleaseResult = {
  deploymentId: string;
  liveUrls: string[];
};

export interface NetlifyPort {
  deployRelease(input: DeployReleaseInput): Promise<DeployReleaseResult>;
}

export interface GscPort {
  submitSitemap(input: { projectId: string; sitemapUrl: string }): Promise<void>;
  syncPerformance(input: { projectId: string; propertyUrl: string }): Promise<{ snapshotId: string }>;
}

export interface ObjectStoragePort {
  putJson(input: { key: string; value: unknown }): Promise<{ key: string }>;
  getJson(input: { key: string }): Promise<unknown>;
}

export interface TrackingPort {
  ingest(event: TrackingEvent): Promise<void>;
}

export interface VerificationPort {
  verifyRelease(input: { releasePlanId: string; liveUrls: string[] }): Promise<ReleaseCheck[]>;
}

export class NotConfiguredNetlifyAdapter implements NetlifyPort {
  async deployRelease(input: DeployReleaseInput): Promise<DeployReleaseResult> {
    return {
      deploymentId: `dry_run_${input.releasePlanId}`,
      liveUrls: []
    };
  }
}

