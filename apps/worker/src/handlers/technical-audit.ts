import type { CrawledWebsiteSnapshot, CrawlerPort } from "@localseo/adapters";
import { TechnicalAuditJobDataSchema, type TechnicalAuditJobData } from "@localseo/contracts";
import { deriveTechnicalAuditFindings, type TechnicalAuditFindingDraft } from "@localseo/domain";
import { technicalAuditFindings, technicalAuditRuns } from "@localseo/db";
import type { Job } from "bullmq";
import { and, eq } from "drizzle-orm";
import type { WorkerDb, WorkerDbHandle } from "../job-run.js";

type TechnicalAuditRunRow = typeof technicalAuditRuns.$inferSelect;

export type TechnicalAuditRepository = {
  loadRun(data: TechnicalAuditJobData): Promise<TechnicalAuditRunRow | undefined>;
  markRunning(data: TechnicalAuditJobData): Promise<void>;
  markCompleted(input: {
    data: TechnicalAuditJobData;
    snapshot: CrawledWebsiteSnapshot;
    findings: TechnicalAuditFindingDraft[];
  }): Promise<void>;
  markFailed(input: { data: TechnicalAuditJobData; error: unknown }): Promise<void>;
};

export class TechnicalAuditConfigurationError extends Error {}
export class TechnicalAuditEvidenceError extends Error {}

export async function handleTechnicalAuditJob(
  job: Job,
  dbHandle: WorkerDbHandle | undefined,
  crawler: CrawlerPort
): Promise<Record<string, unknown>> {
  const data = parseTechnicalAuditJobData(job.data);

  if (!dbHandle) {
    throw new TechnicalAuditConfigurationError("DATABASE_URL is required for technical audit jobs");
  }

  return executeTechnicalAudit({
    data,
    repository: createDrizzleTechnicalAuditRepository(dbHandle.db),
    crawler
  });
}

export async function executeTechnicalAudit(input: {
  data: TechnicalAuditJobData;
  repository: TechnicalAuditRepository;
  crawler: CrawlerPort;
}): Promise<Record<string, unknown>> {
  const run = await input.repository.loadRun(input.data);

  if (!run) {
    throw new TechnicalAuditEvidenceError(`Technical audit run ${input.data.auditRunId} was not found.`);
  }

  if (run.status === "completed" && run.artifactKey) {
    return {
      status: "already_completed",
      auditRunId: run.id,
      artifactKey: run.artifactKey
    };
  }

  await input.repository.markRunning(input.data);

  try {
    const snapshot = await input.crawler.crawlWebsite({
      projectId: input.data.projectId,
      sourceUrl: input.data.sourceUrl,
      importRunId: input.data.auditRunId
    });
    const findings = deriveTechnicalAuditFindings(snapshot);

    await input.repository.markCompleted({ data: input.data, snapshot, findings });

    return {
      status: "completed",
      auditRunId: input.data.auditRunId,
      artifactKey: snapshot.artifactKey,
      pageCount: snapshot.pages.length,
      findingCount: findings.length
    };
  } catch (error) {
    await input.repository.markFailed({ data: input.data, error }).catch(() => undefined);
    throw error;
  }
}

export function parseTechnicalAuditJobData(data: unknown): TechnicalAuditJobData {
  const parsed = TechnicalAuditJobDataSchema.safeParse(data);

  if (!parsed.success) {
    throw new TechnicalAuditEvidenceError("Technical audit jobs require projectId, auditRunId, and sourceUrl.");
  }

  return parsed.data;
}

export function createDrizzleTechnicalAuditRepository(db: WorkerDb): TechnicalAuditRepository {
  return {
    async loadRun(data) {
      const [run] = await db
        .select()
        .from(technicalAuditRuns)
        .where(and(eq(technicalAuditRuns.id, data.auditRunId), eq(technicalAuditRuns.projectId, data.projectId)))
        .limit(1);

      return run;
    },

    async markRunning(data) {
      await db
        .update(technicalAuditRuns)
        .set({
          status: "running",
          failureJson: null,
          startedAt: new Date(),
          updatedAt: new Date()
        })
        .where(and(eq(technicalAuditRuns.id, data.auditRunId), eq(technicalAuditRuns.projectId, data.projectId)));
    },

    async markCompleted(input) {
      await db.transaction(async (tx) => {
        const now = new Date();
        await tx
          .update(technicalAuditRuns)
          .set({
            status: "completed",
            artifactKey: input.snapshot.artifactKey,
            summaryJson: summarizeTechnicalAuditSnapshot(input.snapshot, input.findings),
            failureJson: null,
            completedAt: now,
            updatedAt: now
          })
          .where(
            and(
              eq(technicalAuditRuns.id, input.data.auditRunId),
              eq(technicalAuditRuns.projectId, input.data.projectId)
            )
          );

        await tx.delete(technicalAuditFindings).where(eq(technicalAuditFindings.auditRunId, input.data.auditRunId));

        if (input.findings.length > 0) {
          await tx.insert(technicalAuditFindings).values(
            input.findings.map((finding) => ({
              projectId: input.data.projectId,
              auditRunId: input.data.auditRunId,
              checkKey: finding.checkKey,
              category: finding.category,
              severity: finding.severity,
              route: finding.route,
              pageUrl: finding.pageUrl,
              message: finding.message,
              evidenceJson: finding.evidence,
              createdAt: now,
              updatedAt: now
            }))
          );
        }
      });
    },

    async markFailed(input) {
      await db
        .update(technicalAuditRuns)
        .set({
          status: "failed",
          failureJson: {
            message: normalizeTechnicalAuditFailureMessage(input.error)
          },
          completedAt: new Date(),
          updatedAt: new Date()
        })
        .where(
          and(eq(technicalAuditRuns.id, input.data.auditRunId), eq(technicalAuditRuns.projectId, input.data.projectId))
        );
    }
  };
}

export function summarizeTechnicalAuditSnapshot(
  snapshot: CrawledWebsiteSnapshot,
  findings: readonly TechnicalAuditFindingDraft[]
): Record<string, unknown> {
  return {
    crawledAt: snapshot.crawledAt,
    sourceUrl: snapshot.sourceUrl,
    pageCount: snapshot.pages.length,
    discoveredRoutes: snapshot.discoveredRoutes,
    skippedUrlCount: snapshot.skippedUrls.length,
    findingCount: findings.length,
    blockerCount: findings.filter((finding) => finding.severity === "blocker").length,
    warningCount: findings.filter((finding) => finding.severity === "warning").length,
    infoCount: findings.filter((finding) => finding.severity === "info").length
  };
}

function normalizeTechnicalAuditFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "technical_audit_failed";
  return message.slice(0, 500);
}
