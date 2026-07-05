import type { SerpScoutPort } from "@localseo/adapters";
import {
  SerpScoutJobDataSchema,
  SerpSnapshotSchema,
  type SerpScoutFailureCode,
  type SerpScoutJobData,
  type SerpSnapshot
} from "@localseo/contracts";
import { serpSnapshots } from "@localseo/db";
import type { Job } from "bullmq";
import { and, eq } from "drizzle-orm";
import type { WorkerDb, WorkerDbHandle } from "../job-run.js";

export type SerpScoutRepository = {
  loadSnapshot(data: SerpScoutJobData): Promise<SerpSnapshotRow | undefined>;
  persistSnapshot(snapshot: SerpSnapshot): Promise<void>;
  persistFailure(input: { data: SerpScoutJobData; failureCode: SerpScoutFailureCode; message?: string }): Promise<void>;
};

type SerpSnapshotRow = typeof serpSnapshots.$inferSelect;

export class SerpScoutConfigurationError extends Error {}

export class SerpScoutEvidenceError extends Error {}

export class SerpScoutProviderError extends Error {}

export class SerpScoutTerminalError extends Error {}

export async function handleSerpScoutJob(
  job: Job,
  dbHandle: WorkerDbHandle | undefined,
  serpScout: SerpScoutPort,
  options: { timeoutMs?: number } = {}
): Promise<Record<string, unknown>> {
  const data = parseSerpScoutJobData(job.data);

  if (!dbHandle) {
    throw new SerpScoutConfigurationError("DATABASE_URL is required for SERP scout jobs");
  }

  return executeSerpScout({
    data,
    repository: createDrizzleSerpScoutRepository(dbHandle.db),
    serpScout,
    timeoutMs: options.timeoutMs ?? 45_000
  });
}

export async function executeSerpScout(input: {
  data: SerpScoutJobData;
  repository: SerpScoutRepository;
  serpScout: SerpScoutPort;
  timeoutMs: number;
}): Promise<Record<string, unknown>> {
  const existing = await input.repository.loadSnapshot(input.data);

  if (existing?.status === "captured") {
    return {
      status: "already_captured",
      snapshotId: existing.id,
      resultCount: existing.resultsJson.length
    };
  }

  const result = await input.serpScout.search({
    projectId: input.data.projectId,
    snapshotId: input.data.snapshotId,
    agentRunId: input.data.agentRunId,
    query: input.data.query,
    searchEngine: input.data.searchEngine,
    device: input.data.device,
    locale: input.data.locale,
    region: input.data.region,
    maxResults: input.data.maxResults,
    timeoutMs: input.timeoutMs
  });

  if (!result.ok) {
    await input.repository.persistFailure({
      data: input.data,
      failureCode: result.failureCode,
      message: result.diagnostics.detail
    });

    if (isRetryableSerpScoutFailure(result.failureCode)) {
      throw new SerpScoutProviderError(result.failureCode);
    }

    throw new SerpScoutTerminalError(result.failureCode);
  }

  const snapshot = SerpSnapshotSchema.parse(result.snapshot);

  if (snapshot.id !== input.data.snapshotId || snapshot.projectId !== input.data.projectId) {
    throw new SerpScoutEvidenceError("SERP adapter returned a snapshot for the wrong project or snapshot id.");
  }

  await input.repository.persistSnapshot(snapshot);

  return {
    status: "captured",
    snapshotId: snapshot.id,
    resultCount: snapshot.results.length,
    provider: snapshot.provider
  };
}

export function parseSerpScoutJobData(data: unknown): SerpScoutJobData {
  const parsed = SerpScoutJobDataSchema.safeParse(data);

  if (!parsed.success) {
    throw new SerpScoutEvidenceError("SERP scout jobs require projectId, snapshotId, and query.");
  }

  return parsed.data;
}

export function createDrizzleSerpScoutRepository(db: WorkerDb): SerpScoutRepository {
  return {
    async loadSnapshot(data) {
      const [snapshot] = await db
        .select()
        .from(serpSnapshots)
        .where(and(eq(serpSnapshots.id, data.snapshotId), eq(serpSnapshots.projectId, data.projectId)))
        .limit(1);

      return snapshot;
    },

    async persistSnapshot(snapshot) {
      await db
        .insert(serpSnapshots)
        .values({
          id: snapshot.id,
          projectId: snapshot.projectId,
          agentRunId: snapshot.agentRunId,
          status: snapshot.status,
          query: snapshot.query,
          searchEngine: snapshot.searchEngine,
          device: snapshot.device,
          locale: snapshot.locale,
          region: snapshot.region,
          cacheKey: snapshot.cacheKey,
          provider: snapshot.provider,
          resultsJson: snapshot.results,
          serpFeaturesJson: snapshot.serpFeatures,
          engineErrorsJson: snapshot.engineErrors,
          artifactRefsJson: snapshot.artifactRefs,
          capturedAt: new Date(snapshot.capturedAt)
        })
        .onConflictDoUpdate({
          target: serpSnapshots.id,
          set: {
            status: snapshot.status,
            query: snapshot.query,
            searchEngine: snapshot.searchEngine,
            device: snapshot.device,
            locale: snapshot.locale,
            region: snapshot.region,
            cacheKey: snapshot.cacheKey,
            provider: snapshot.provider,
            resultsJson: snapshot.results,
            serpFeaturesJson: snapshot.serpFeatures,
            engineErrorsJson: snapshot.engineErrors,
            artifactRefsJson: snapshot.artifactRefs,
            capturedAt: new Date(snapshot.capturedAt),
            updatedAt: new Date()
          }
        });
    },

    async persistFailure(input) {
      const capturedAt = new Date();

      await db
        .insert(serpSnapshots)
        .values({
          id: input.data.snapshotId,
          projectId: input.data.projectId,
          agentRunId: input.data.agentRunId,
          status: "failed",
          query: input.data.query,
          searchEngine: input.data.searchEngine,
          device: input.data.device,
          locale: input.data.locale,
          region: input.data.region,
          cacheKey: buildSerpCacheKey(input.data),
          provider: "unavailable",
          resultsJson: [],
          serpFeaturesJson: [],
          engineErrorsJson: [
            {
              code: input.failureCode,
              message: input.message?.slice(0, 500)
            }
          ],
          artifactRefsJson: [],
          capturedAt
        })
        .onConflictDoUpdate({
          target: serpSnapshots.id,
          set: {
            status: "failed",
            provider: "unavailable",
            resultsJson: [],
            serpFeaturesJson: [],
            engineErrorsJson: [
              {
                code: input.failureCode,
                message: input.message?.slice(0, 500)
              }
            ],
            artifactRefsJson: [],
            capturedAt,
            updatedAt: new Date()
          }
        });
    }
  };
}

function isRetryableSerpScoutFailure(code: SerpScoutFailureCode): boolean {
  return code === "provider_timeout" || code === "provider_error" || code === "provider_overloaded";
}

function buildSerpCacheKey(input: SerpScoutJobData): string {
  return [
    input.searchEngine,
    input.device,
    input.locale ?? "default-locale",
    input.region ?? "default-region",
    input.query.trim().toLowerCase()
  ].join(":");
}
