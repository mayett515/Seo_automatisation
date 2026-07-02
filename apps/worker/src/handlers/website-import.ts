import type { CrawlerPort, CrawledWebsiteSnapshot } from "@localseo/adapters";
import { WebsiteImportJobDataSchema, type WebsiteImportJobData } from "@localseo/contracts";
import { deriveWebsiteImportFacts } from "@localseo/domain";
import { websiteImportRuns } from "@localseo/db";
import type { Job } from "bullmq";
import { and, eq } from "drizzle-orm";
import type { WorkerDb, WorkerDbHandle } from "../job-run.js";

type WebsiteImportRunRow = typeof websiteImportRuns.$inferSelect;

export type WebsiteImportRepository = {
  loadRun(data: WebsiteImportJobData): Promise<WebsiteImportRunRow | undefined>;
  markRunning(data: WebsiteImportJobData): Promise<void>;
  markCompleted(input: { data: WebsiteImportJobData; snapshot: CrawledWebsiteSnapshot }): Promise<void>;
  markFailed(input: { data: WebsiteImportJobData; error: unknown }): Promise<void>;
};

export class WebsiteImportConfigurationError extends Error {}

export class WebsiteImportEvidenceError extends Error {}

export async function handleWebsiteImportJob(
  job: Job,
  dbHandle: WorkerDbHandle | undefined,
  crawler: CrawlerPort
): Promise<Record<string, unknown>> {
  const data = parseWebsiteImportJobData(job.data);

  if (!dbHandle) {
    throw new WebsiteImportConfigurationError("DATABASE_URL is required for website import jobs");
  }

  return executeWebsiteImport({
    data,
    repository: createDrizzleWebsiteImportRepository(dbHandle.db),
    crawler
  });
}

export async function executeWebsiteImport(input: {
  data: WebsiteImportJobData;
  repository: WebsiteImportRepository;
  crawler: CrawlerPort;
}): Promise<Record<string, unknown>> {
  const run = await input.repository.loadRun(input.data);

  if (!run) {
    throw new WebsiteImportEvidenceError(`Website import run ${input.data.importRunId} was not found.`);
  }

  if (run.status === "completed" && run.artifactKey) {
    return {
      status: "already_completed",
      importRunId: run.id,
      artifactKey: run.artifactKey
    };
  }

  await input.repository.markRunning(input.data);

  try {
    const snapshot = await input.crawler.crawlWebsite({
      projectId: input.data.projectId,
      sourceUrl: input.data.sourceUrl,
      importRunId: input.data.importRunId
    });

    await input.repository.markCompleted({ data: input.data, snapshot });

    return {
      status: "completed",
      importRunId: input.data.importRunId,
      artifactKey: snapshot.artifactKey,
      pageCount: snapshot.pages.length,
      discoveredRoutes: snapshot.discoveredRoutes
    };
  } catch (error) {
    await input.repository.markFailed({ data: input.data, error }).catch(() => undefined);
    throw error;
  }
}

export function parseWebsiteImportJobData(data: unknown): WebsiteImportJobData {
  const parsed = WebsiteImportJobDataSchema.safeParse(data);

  if (!parsed.success) {
    throw new WebsiteImportEvidenceError("Website import jobs require projectId, importRunId, and sourceUrl.");
  }

  return parsed.data;
}

export function createDrizzleWebsiteImportRepository(db: WorkerDb): WebsiteImportRepository {
  return {
    async loadRun(data) {
      const [run] = await db
        .select()
        .from(websiteImportRuns)
        .where(and(eq(websiteImportRuns.id, data.importRunId), eq(websiteImportRuns.projectId, data.projectId)))
        .limit(1);

      return run;
    },

    async markRunning(data) {
      await db
        .update(websiteImportRuns)
        .set({
          status: "running",
          startedAt: new Date(),
          failureJson: null,
          updatedAt: new Date()
        })
        .where(and(eq(websiteImportRuns.id, data.importRunId), eq(websiteImportRuns.projectId, data.projectId)));
    },

    async markCompleted(input) {
      await db
        .update(websiteImportRuns)
        .set({
          status: "completed",
          artifactKey: input.snapshot.artifactKey,
          summaryJson: summarizeWebsiteImportSnapshot(input.snapshot),
          failureJson: null,
          completedAt: new Date(),
          updatedAt: new Date()
        })
        .where(
          and(eq(websiteImportRuns.id, input.data.importRunId), eq(websiteImportRuns.projectId, input.data.projectId))
        );
    },

    async markFailed(input) {
      await db
        .update(websiteImportRuns)
        .set({
          status: "failed",
          failureJson: {
            message: normalizeWebsiteImportFailureMessage(input.error)
          },
          completedAt: new Date(),
          updatedAt: new Date()
        })
        .where(
          and(eq(websiteImportRuns.id, input.data.importRunId), eq(websiteImportRuns.projectId, input.data.projectId))
        );
    }
  };
}

export function summarizeWebsiteImportSnapshot(snapshot: CrawledWebsiteSnapshot): Record<string, unknown> {
  return {
    crawledAt: snapshot.crawledAt,
    sourceUrl: snapshot.sourceUrl,
    pageCount: snapshot.pages.length,
    discoveredRoutes: snapshot.discoveredRoutes,
    skippedUrlCount: snapshot.skippedUrls.length,
    facts: deriveWebsiteImportFacts(snapshot),
    pages: snapshot.pages.map((page) => ({
      route: page.route,
      status: page.status,
      title: page.title,
      h1: page.h1,
      schemaTypes: page.schemaTypes
    }))
  };
}

function normalizeWebsiteImportFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "website_import_failed";
  return message.slice(0, 500);
}
