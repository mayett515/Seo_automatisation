import { randomUUID } from "node:crypto";
import {
  OpportunityResearchJobDataSchema,
  opportunityResearchConstraintProfileVersion,
  opportunityResearchWorkflowVersion
} from "@localseo/contracts";
import {
  agentRunEvents,
  agentRuns,
  failOpportunityResearchExecution,
  jobRuns,
  loadOpportunityResearchMaterial,
  projectOpportunityResearchStates
} from "@localseo/db";
import { and, asc, eq, isNull, lte, sql } from "@localseo/db/query";
import type { WorkerDb } from "./job-run.js";
import type { WorkRecoveryQueue } from "./work-recovery.js";

export type OpportunityResearchScheduleResult = {
  checked: number;
  admitted: number;
  enqueued: number;
  notReady: number;
  staleNoop: number;
  enqueueFailed: number;
  errors: number;
};

type DueResearchState = {
  projectId: string;
  rowVersion: number;
  materialDirty: boolean;
};

export async function scanDueOpportunityResearch(input: {
  db: WorkerDb;
  queue: WorkRecoveryQueue;
  now?: Date;
  batchSize: number;
}): Promise<OpportunityResearchScheduleResult> {
  const now = input.now ?? new Date();
  const result = emptyOpportunityResearchScheduleResult();
  const candidates = await loadDueResearchStates(input.db, now, input.batchSize);
  for (const candidate of candidates) {
    result.checked += 1;
    try {
      const admission = await admitScheduledResearch(input.db, candidate, now);
      if (admission.kind === "stale_noop") {
        result.staleNoop += 1;
        continue;
      }
      if (admission.kind === "not_ready") {
        result.notReady += 1;
        continue;
      }
      result.admitted += 1;
      try {
        await input.queue.add(
          "opportunity_research",
          OpportunityResearchJobDataSchema.parse({
            projectId: admission.projectId,
            runId: admission.runId,
            materialDigest: admission.materialDigest,
            triggerSource: admission.triggerSource,
            maxAttempts: 3,
            jobRunId: admission.jobRunId
          }),
          {
            attempts: 3,
            jobId: admission.runId,
            backoff: { type: "exponential", delay: 5_000 }
          }
        );
        result.enqueued += 1;
      } catch (error) {
        const completedAt = new Date();
        await input.db
          .update(jobRuns)
          .set({
            status: "failed",
            completedAt,
            failureJson: { message: errorMessage(error) },
            updatedAt: completedAt
          })
          .where(eq(jobRuns.id, admission.jobRunId));
        await failOpportunityResearchExecution(input.db, {
          projectId: admission.projectId,
          runId: admission.runId,
          failureCode: "enqueue_failed",
          failureMessage: errorMessage(error),
          occurredAt: completedAt
        });
        result.enqueueFailed += 1;
      }
    } catch (error) {
      result.errors += 1;
      console.error(`Opportunity Research scheduling failed for project ${candidate.projectId}`, errorMessage(error));
    }
  }
  return result;
}

export function emptyOpportunityResearchScheduleResult(): OpportunityResearchScheduleResult {
  return { checked: 0, admitted: 0, enqueued: 0, notReady: 0, staleNoop: 0, enqueueFailed: 0, errors: 0 };
}

async function loadDueResearchStates(db: WorkerDb, now: Date, batchSize: number): Promise<DueResearchState[]> {
  return db
    .select({
      projectId: projectOpportunityResearchStates.projectId,
      rowVersion: projectOpportunityResearchStates.rowVersion,
      materialDirty: projectOpportunityResearchStates.materialDirty
    })
    .from(projectOpportunityResearchStates)
    .where(
      and(
        isNull(projectOpportunityResearchStates.activeRunId),
        isNull(projectOpportunityResearchStates.pausedAt),
        lte(projectOpportunityResearchStates.nextScheduledAt, now)
      )
    )
    .orderBy(asc(projectOpportunityResearchStates.nextScheduledAt), asc(projectOpportunityResearchStates.projectId))
    .limit(batchSize);
}

async function admitScheduledResearch(
  db: WorkerDb,
  candidate: DueResearchState,
  now: Date
): Promise<
  | { kind: "stale_noop" }
  | { kind: "not_ready" }
  | {
      kind: "created";
      projectId: string;
      runId: string;
      jobRunId: string;
      materialDigest: string;
      triggerSource: "material_dirty" | "weekly_scan";
    }
> {
  return db.transaction(async (tx) => {
    const projectRows = await tx.execute(
      sql`SELECT "id" FROM "projects" WHERE "id" = ${candidate.projectId} FOR UPDATE`
    );
    if (projectRows.length === 0) return { kind: "stale_noop" as const };
    await tx.execute(
      sql`SELECT "project_id" FROM "project_opportunity_research_states" WHERE "project_id" = ${candidate.projectId} FOR UPDATE`
    );
    const [state] = await tx
      .select()
      .from(projectOpportunityResearchStates)
      .where(eq(projectOpportunityResearchStates.projectId, candidate.projectId))
      .limit(1);
    if (
      !state ||
      state.rowVersion !== candidate.rowVersion ||
      state.activeRunId !== null ||
      state.pausedAt !== null ||
      !state.nextScheduledAt ||
      state.nextScheduledAt > now
    ) {
      return { kind: "stale_noop" as const };
    }
    const [activeRun] = await tx
      .select({ id: agentRuns.id })
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.projectId, candidate.projectId),
          eq(agentRuns.task, "opportunity_scout"),
          sql`${agentRuns.status} in ('queued', 'running')`
        )
      )
      .limit(1);
    if (activeRun) {
      await tx
        .update(projectOpportunityResearchStates)
        .set({ nextScheduledAt: minutesFrom(now, 15), updatedAt: now })
        .where(
          and(
            eq(projectOpportunityResearchStates.projectId, candidate.projectId),
            eq(projectOpportunityResearchStates.rowVersion, state.rowVersion),
            isNull(projectOpportunityResearchStates.activeRunId)
          )
        );
      return { kind: "stale_noop" as const };
    }

    const material = await loadOpportunityResearchMaterial(tx, candidate.projectId, { asOf: now });
    if (material.readinessIssues.length > 0) {
      await tx
        .update(projectOpportunityResearchStates)
        .set({
          status: "needs_research",
          materialDigest: material.materialDigest,
          materialDirty: true,
          nextScheduledAt: daysFrom(now, 1),
          updatedAt: now
        })
        .where(
          and(
            eq(projectOpportunityResearchStates.projectId, candidate.projectId),
            eq(projectOpportunityResearchStates.rowVersion, state.rowVersion)
          )
        );
      return { kind: "not_ready" as const };
    }

    const triggerSource = state.materialDirty ? "material_dirty" : "weekly_scan";
    const runId = randomUUID();
    const jobRunId = randomUUID();
    await tx.insert(agentRuns).values({
      id: runId,
      projectId: candidate.projectId,
      subjectId: candidate.projectId,
      task: "opportunity_scout",
      status: "queued",
      workflowName: "opportunity_research",
      workflowVersion: opportunityResearchWorkflowVersion,
      constraintProfileVersion: opportunityResearchConstraintProfileVersion,
      triggerSource,
      idempotencyKey: `${triggerSource}:${material.materialDigest}:${isoDay(now)}`,
      inputSha256: material.materialDigest,
      createdAt: now,
      updatedAt: now
    });
    await tx.insert(agentRunEvents).values({
      projectId: candidate.projectId,
      agentRunId: runId,
      eventKey: "run.queued",
      eventType: "run.queued",
      executionEpoch: 0,
      payloadJson: { triggerSource, materialDigest: material.materialDigest },
      occurredAt: now
    });
    const [stateUpdated] = await tx
      .update(projectOpportunityResearchStates)
      .set({
        status: "queued",
        activeRunId: runId,
        materialDigest: material.materialDigest,
        materialDirty: false,
        lastRunAt: now,
        nextScheduledAt: null,
        updatedAt: now
      })
      .where(
        and(
          eq(projectOpportunityResearchStates.projectId, candidate.projectId),
          eq(projectOpportunityResearchStates.rowVersion, state.rowVersion)
        )
      )
      .returning({ projectId: projectOpportunityResearchStates.projectId });
    if (!stateUpdated) throw new Error("Opportunity Research scheduler lost its state compare-and-set.");
    await tx.insert(jobRuns).values({
      id: jobRunId,
      projectId: candidate.projectId,
      externalJobId: runId,
      queueName: "opportunity-research",
      type: "opportunity_research",
      status: "queued",
      inputRef: runId,
      actorType: "system",
      triggerSource
    });
    return {
      kind: "created" as const,
      projectId: candidate.projectId,
      runId,
      jobRunId,
      materialDigest: material.materialDigest,
      triggerSource
    };
  });
}

function daysFrom(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1_000);
}

function minutesFrom(value: Date, minutes: number): Date {
  return new Date(value.getTime() + minutes * 60 * 1_000);
}

function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : "unknown_opportunity_research_scheduler_error").slice(0, 500);
}
