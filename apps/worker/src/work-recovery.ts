import { randomUUID } from "node:crypto";
import {
  PageProposalJobDataSchema,
  ReleaseVerificationJobDataSchema,
  SectionCopySuggestionJobDataSchema,
  type AgentRunStatus
} from "@localseo/contracts";
import { agentRuns, jobRuns, pageSectionCopySuggestions, releasePlans, releaseVerifications } from "@localseo/db";
import { classifyWorkRecovery, type WorkRecoveryDecision, type WorkRecoveryTransportState } from "@localseo/domain";
import type { JobsOptions } from "bullmq";
import { and, asc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import type { WorkerDb } from "./job-run.js";
import { markReleaseVerificationRecoveryFailure } from "./handlers/release-verification.js";

const pageProposalQueueName = "page-generation";
const releaseVerificationQueueName = "release-verification";
const activeBullMqStates = new Set(["active", "waiting", "waiting-children", "delayed", "prioritized"]);
const terminalJobRunStatuses = new Set(["completed", "failed", "cancelled", "dry_run"]);
const activeAgentRunStatuses = ["queued", "running"] as const satisfies readonly AgentRunStatus[];

export type WorkRecoveryTransportJob = {
  getState(): Promise<string>;
  remove(): Promise<void>;
};

export type WorkRecoveryQueue = {
  getJob(jobId: string): Promise<WorkRecoveryTransportJob | undefined>;
  add(name: string, data: Record<string, unknown>, options: JobsOptions): Promise<unknown>;
  close(): Promise<void>;
};

export type WorkRecoveryQueues = {
  "page-generation": WorkRecoveryQueue;
  "release-verification": WorkRecoveryQueue;
};

export type WorkRecoveryScanResult = {
  checked: number;
  reEnqueued: number;
  markedExecutionFailed: number;
  warningEvidenceRecorded: number;
  noops: number;
  coalesced: number;
  staleNoop: number;
  enqueueFailed: number;
  errors: number;
};

type PageProposalRecoveryCandidate = {
  kind: "page_proposal";
  id: string;
  projectId: string;
  opportunityId: string;
  durableState: "queued" | "running";
  recoveryCount: number;
};

type SectionCopySuggestionRecoveryCandidate = {
  kind: "section_copy_suggestion";
  id: string;
  projectId: string;
  suggestionId: string;
  pageVersionId: string;
  sectionId: string;
  durableState: "queued" | "running";
  recoveryCount: number;
};

type ReleaseVerificationRecoveryCandidate = {
  kind: "release_verification";
  id: string;
  projectId: string;
  releasePlanId: string;
  deploymentId: string;
  durableState: "running";
  recoveryCount: number;
};

type RecoveryCandidate =
  | PageProposalRecoveryCandidate
  | SectionCopySuggestionRecoveryCandidate
  | ReleaseVerificationRecoveryCandidate;

type RecoveryJobSpec = {
  queueName: keyof WorkRecoveryQueues;
  jobName: string;
  jobId: string;
  jobType: string;
  data: Record<string, unknown>;
  options: JobsOptions;
};

export async function scanStaleWork(input: {
  db: WorkerDb;
  queues: WorkRecoveryQueues;
  now?: Date;
  staleAfterMs: number;
  maxRecoveryCount: number;
  batchSize: number;
}): Promise<WorkRecoveryScanResult> {
  const now = input.now ?? new Date();
  const staleBefore = new Date(now.getTime() - input.staleAfterMs);
  const result = emptyWorkRecoveryScanResult();
  const [pageProposalLoad, sectionCopyLoad, releaseVerificationLoad] = await Promise.allSettled([
    loadPageProposalRecoveryCandidates(input.db, staleBefore, input.batchSize),
    loadSectionCopySuggestionRecoveryCandidates(input.db, staleBefore, input.batchSize),
    loadReleaseVerificationRecoveryCandidates(input.db, staleBefore, input.batchSize)
  ]);
  const candidates: RecoveryCandidate[] = [];

  if (pageProposalLoad.status === "fulfilled") {
    candidates.push(...pageProposalLoad.value);
  } else {
    result.errors += 1;
    console.error(
      "Work recovery failed to load page_proposal candidates",
      normalizeErrorMessage(pageProposalLoad.reason)
    );
  }

  if (releaseVerificationLoad.status === "fulfilled") {
    candidates.push(...releaseVerificationLoad.value);
  } else {
    result.errors += 1;
    console.error(
      "Work recovery failed to load release_verification candidates",
      normalizeErrorMessage(releaseVerificationLoad.reason)
    );
  }

  if (sectionCopyLoad.status === "fulfilled") {
    candidates.push(...sectionCopyLoad.value);
  } else {
    result.errors += 1;
    console.error(
      "Work recovery failed to load section_copy_suggestion candidates",
      normalizeErrorMessage(sectionCopyLoad.reason)
    );
  }

  for (const candidate of candidates) {
    result.checked += 1;

    try {
      await recoverCandidate({
        db: input.db,
        queues: input.queues,
        candidate,
        now,
        staleBefore,
        maxRecoveryCount: input.maxRecoveryCount,
        result
      });
    } catch (error) {
      result.errors += 1;
      console.error(`Work recovery failed for ${candidate.kind}:${candidate.id}`, normalizeErrorMessage(error));
    }
  }

  return result;
}

export function emptyWorkRecoveryScanResult(): WorkRecoveryScanResult {
  return {
    checked: 0,
    reEnqueued: 0,
    markedExecutionFailed: 0,
    warningEvidenceRecorded: 0,
    noops: 0,
    coalesced: 0,
    staleNoop: 0,
    enqueueFailed: 0,
    errors: 0
  };
}

export function transportStateFromBullMqJobState(state: string): WorkRecoveryTransportState {
  if (activeBullMqStates.has(state)) {
    return "active";
  }

  if (state === "completed") {
    return "completed";
  }

  if (state === "failed") {
    return "failed";
  }

  return "unknown";
}

async function recoverCandidate(input: {
  db: WorkerDb;
  queues: WorkRecoveryQueues;
  candidate: RecoveryCandidate;
  now: Date;
  staleBefore: Date;
  maxRecoveryCount: number;
  result: WorkRecoveryScanResult;
}): Promise<void> {
  const spec = recoveryJobSpec(input.candidate);
  const queue = input.queues[spec.queueName];
  const transportState = await observeTransportState(input.db, queue, spec);
  const decision = classifyWorkRecovery({
    workflowCategory: input.candidate.kind === "release_verification" ? "provider_handoff_warning" : "read_analyze",
    durableState: input.candidate.durableState,
    transportState,
    workerFreshness: "stale",
    recoveryCount: input.candidate.recoveryCount,
    maxRecoveryCount: input.maxRecoveryCount,
    jobId: spec.jobId,
    artifactWritesAreIdempotent: true,
    providerMutationUncertain: false
  });

  await applyRecoveryDecision({ ...input, queue, spec, decision });
}

async function applyRecoveryDecision(input: {
  db: WorkerDb;
  queue: WorkRecoveryQueue;
  candidate: RecoveryCandidate;
  spec: RecoveryJobSpec;
  decision: WorkRecoveryDecision;
  now: Date;
  staleBefore: Date;
  result: WorkRecoveryScanResult;
}): Promise<void> {
  switch (input.decision.kind) {
    case "noop":
      input.result.noops += 1;
      return;
    case "reenqueue":
      await reenqueueCandidate(input, input.decision.reason);
      return;
    case "mark_execution_failed": {
      const updated = await markCandidateRecoveryFailed(input, input.decision.reason);
      input.result.markedExecutionFailed += updated ? 1 : 0;
      input.result.staleNoop += updated ? 0 : 1;
      return;
    }
    case "record_warning": {
      const updated = await markCandidateRecoveryFailed(input, input.decision.reason);
      input.result.warningEvidenceRecorded += updated ? 1 : 0;
      input.result.staleNoop += updated ? 0 : 1;
      return;
    }
    case "manual_reconciliation":
    case "reconcile_provider":
      throw new Error(`Safe work recovery lane produced unsupported decision ${input.decision.kind}.`);
  }
}

async function reenqueueCandidate(
  input: {
    db: WorkerDb;
    queue: WorkRecoveryQueue;
    candidate: RecoveryCandidate;
    spec: RecoveryJobSpec;
    now: Date;
    staleBefore: Date;
    result: WorkRecoveryScanResult;
  },
  reason: Extract<WorkRecoveryDecision, { kind: "reenqueue" }>["reason"]
): Promise<void> {
  const claim = await claimRecoveryAttempt(input.db, input.candidate, input.spec, input.now, input.staleBefore, reason);

  if (!claim) {
    input.result.staleNoop += 1;
    return;
  }

  const currentJob = await input.queue.getJob(input.spec.jobId);
  if (currentJob) {
    const currentState = transportStateFromBullMqJobState(await currentJob.getState());

    if (currentState === "active" || currentState === "unknown") {
      await markRecoveryJobRunCancelled(input.db, claim.jobRunId, input.now);
      input.result.coalesced += 1;
      return;
    }

    await currentJob.remove();
  }

  try {
    const spec = recoveryJobSpec(input.candidate, claim.jobRunId);
    await input.queue.add(spec.jobName, spec.data, spec.options);
    input.result.reEnqueued += 1;
  } catch (error) {
    await markRecoveryJobRunFailed(input.db, claim.jobRunId, input.now, error);
    input.result.enqueueFailed += 1;
  }
}

async function observeTransportState(
  db: WorkerDb,
  queue: WorkRecoveryQueue,
  spec: RecoveryJobSpec
): Promise<WorkRecoveryTransportState> {
  const job = await queue.getJob(spec.jobId);

  if (job) {
    return transportStateFromBullMqJobState(await job.getState());
  }

  const [audit] = await db
    .select({ status: jobRuns.status })
    .from(jobRuns)
    .where(and(eq(jobRuns.externalJobId, spec.jobId), eq(jobRuns.queueName, spec.queueName)))
    .limit(1);

  if (audit?.status === "completed") {
    return "completed";
  }

  if (audit && terminalJobRunStatuses.has(audit.status)) {
    return "failed";
  }

  return "missing";
}

async function loadPageProposalRecoveryCandidates(
  db: WorkerDb,
  staleBefore: Date,
  batchSize: number
): Promise<PageProposalRecoveryCandidate[]> {
  const rows = await db
    .select({
      id: agentRuns.id,
      projectId: agentRuns.projectId,
      opportunityId: agentRuns.subjectId,
      status: agentRuns.status,
      recoveryCount: agentRuns.recoveryCount
    })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.task, "page_brief_draft"),
        inArray(agentRuns.status, activeAgentRunStatuses),
        isNotNull(agentRuns.subjectId),
        lte(agentRuns.updatedAt, staleBefore)
      )
    )
    .orderBy(asc(agentRuns.updatedAt))
    .limit(batchSize);

  return rows.flatMap((row) => {
    if (!row.opportunityId || (row.status !== "queued" && row.status !== "running")) {
      return [];
    }

    return [
      {
        kind: "page_proposal" as const,
        id: row.id,
        projectId: row.projectId,
        opportunityId: row.opportunityId,
        durableState: row.status,
        recoveryCount: row.recoveryCount
      }
    ];
  });
}

async function loadSectionCopySuggestionRecoveryCandidates(
  db: WorkerDb,
  staleBefore: Date,
  batchSize: number
): Promise<SectionCopySuggestionRecoveryCandidate[]> {
  const rows = await db
    .select({
      id: agentRuns.id,
      projectId: agentRuns.projectId,
      suggestionId: pageSectionCopySuggestions.id,
      pageVersionId: pageSectionCopySuggestions.pageVersionId,
      sectionId: pageSectionCopySuggestions.sectionId,
      status: agentRuns.status,
      recoveryCount: agentRuns.recoveryCount
    })
    .from(agentRuns)
    .innerJoin(pageSectionCopySuggestions, eq(pageSectionCopySuggestions.agentRunId, agentRuns.id))
    .where(
      and(
        eq(agentRuns.task, "section_text_generation"),
        inArray(agentRuns.status, activeAgentRunStatuses),
        inArray(pageSectionCopySuggestions.status, ["queued", "generating"]),
        lte(agentRuns.updatedAt, staleBefore)
      )
    )
    .orderBy(asc(agentRuns.updatedAt))
    .limit(batchSize);

  return rows.flatMap((row) =>
    row.status === "queued" || row.status === "running"
      ? [
          {
            kind: "section_copy_suggestion" as const,
            id: row.id,
            projectId: row.projectId,
            suggestionId: row.suggestionId,
            pageVersionId: row.pageVersionId,
            sectionId: row.sectionId,
            durableState: row.status,
            recoveryCount: row.recoveryCount
          }
        ]
      : []
  );
}

async function loadReleaseVerificationRecoveryCandidates(
  db: WorkerDb,
  staleBefore: Date,
  batchSize: number
): Promise<ReleaseVerificationRecoveryCandidate[]> {
  const rows = await db
    .select({
      id: releaseVerifications.id,
      projectId: releasePlans.projectId,
      releasePlanId: releaseVerifications.releasePlanId,
      deploymentId: releaseVerifications.deploymentId,
      recoveryCount: releaseVerifications.recoveryCount
    })
    .from(releaseVerifications)
    .innerJoin(releasePlans, eq(releaseVerifications.releasePlanId, releasePlans.id))
    .where(
      and(
        eq(releaseVerifications.status, "running"),
        isNotNull(releaseVerifications.deploymentId),
        lte(releaseVerifications.updatedAt, staleBefore)
      )
    )
    .orderBy(asc(releaseVerifications.updatedAt))
    .limit(batchSize);

  return rows.flatMap((row) =>
    row.deploymentId
      ? [
          {
            kind: "release_verification" as const,
            id: row.id,
            projectId: row.projectId,
            releasePlanId: row.releasePlanId,
            deploymentId: row.deploymentId,
            durableState: "running" as const,
            recoveryCount: row.recoveryCount
          }
        ]
      : []
  );
}

async function claimRecoveryAttempt(
  db: WorkerDb,
  candidate: RecoveryCandidate,
  spec: RecoveryJobSpec,
  now: Date,
  staleBefore: Date,
  reason: string
): Promise<{ jobRunId: string; recoveryCount: number } | undefined> {
  return db.transaction(async (tx) => {
    let claimedRows: Array<{ recoveryCount: number }>;
    if (candidate.kind === "release_verification") {
      claimedRows = await tx
        .update(releaseVerifications)
        .set({
          recoveryCount: sql<number>`${releaseVerifications.recoveryCount} + 1`,
          lastRecoveryAt: now,
          updatedAt: now
        })
        .where(
          and(
            eq(releaseVerifications.id, candidate.id),
            eq(releaseVerifications.releasePlanId, candidate.releasePlanId),
            eq(releaseVerifications.deploymentId, candidate.deploymentId),
            eq(releaseVerifications.status, "running"),
            eq(releaseVerifications.recoveryCount, candidate.recoveryCount),
            lte(releaseVerifications.updatedAt, staleBefore)
          )
        )
        .returning({ recoveryCount: releaseVerifications.recoveryCount });
    } else {
      const task = candidate.kind === "page_proposal" ? "page_brief_draft" : "section_text_generation";
      const subjectId = candidate.kind === "page_proposal" ? candidate.opportunityId : candidate.suggestionId;
      claimedRows = await tx
        .update(agentRuns)
        .set({
          recoveryCount: sql<number>`${agentRuns.recoveryCount} + 1`,
          lastRecoveryAt: now,
          updatedAt: now
        })
        .where(
          and(
            eq(agentRuns.id, candidate.id),
            eq(agentRuns.projectId, candidate.projectId),
            eq(agentRuns.task, task),
            eq(agentRuns.subjectId, subjectId),
            inArray(agentRuns.status, activeAgentRunStatuses),
            eq(agentRuns.recoveryCount, candidate.recoveryCount),
            lte(agentRuns.updatedAt, staleBefore)
          )
        )
        .returning({ recoveryCount: agentRuns.recoveryCount });
    }

    const [claimed] = claimedRows;

    if (!claimed) {
      return undefined;
    }

    const [existingAudit] = await tx
      .select({ id: jobRuns.id, status: jobRuns.status })
      .from(jobRuns)
      .where(and(eq(jobRuns.externalJobId, spec.jobId), eq(jobRuns.queueName, spec.queueName)))
      .limit(1);

    if (existingAudit) {
      const archivedExternalJobId = sql<string>`${jobRuns.externalJobId} || ':recovery-archived:' || ${jobRuns.id}::text`;

      if (terminalJobRunStatuses.has(existingAudit.status)) {
        await tx
          .update(jobRuns)
          .set({ externalJobId: archivedExternalJobId, updatedAt: now })
          .where(eq(jobRuns.id, existingAudit.id));
      } else {
        await tx
          .update(jobRuns)
          .set({
            externalJobId: archivedExternalJobId,
            status: "failed",
            completedAt: now,
            failureJson: {
              message: "Stale transport audit was replaced by bounded work recovery.",
              recoveryReason: reason
            },
            updatedAt: now
          })
          .where(eq(jobRuns.id, existingAudit.id));
      }
    }

    const jobRunId = randomUUID();
    await tx.insert(jobRuns).values({
      id: jobRunId,
      projectId: candidate.projectId,
      externalJobId: spec.jobId,
      queueName: spec.queueName,
      type: spec.jobType,
      status: "queued",
      inputRef: candidate.kind === "section_copy_suggestion" ? candidate.suggestionId : candidate.id,
      actorType: "system",
      triggerSource: "work_recovery"
    });

    return { jobRunId, recoveryCount: claimed.recoveryCount };
  });
}

async function markCandidateRecoveryFailed(
  input: {
    db: WorkerDb;
    candidate: RecoveryCandidate;
    spec: RecoveryJobSpec;
    now: Date;
    staleBefore: Date;
  },
  reason: string
): Promise<boolean> {
  let updated: boolean;
  if (input.candidate.kind === "page_proposal") {
    updated = await markPageProposalRecoveryFailed(input.db, input.candidate, input.now, input.staleBefore, reason);
  } else if (input.candidate.kind === "section_copy_suggestion") {
    updated = await markSectionCopySuggestionRecoveryFailed(
      input.db,
      input.candidate,
      input.now,
      input.staleBefore,
      reason
    );
  } else {
    updated = await markReleaseVerificationRecoveryFailure({
      db: input.db,
      data: ReleaseVerificationJobDataSchema.parse({
        projectId: input.candidate.projectId,
        releasePlanId: input.candidate.releasePlanId,
        deploymentId: input.candidate.deploymentId,
        verificationId: input.candidate.id,
        triggerSource: "work_recovery"
      }),
      checkedAt: input.now,
      staleBefore: input.staleBefore,
      reason,
      recoveryCount: input.candidate.recoveryCount
    });
  }

  if (updated) {
    await markCurrentJobRunFailed(input.db, input.spec, input.now, reason);
  }

  return updated;
}

async function markSectionCopySuggestionRecoveryFailed(
  db: WorkerDb,
  candidate: SectionCopySuggestionRecoveryCandidate,
  now: Date,
  staleBefore: Date,
  reason: string
): Promise<boolean> {
  const failureCode =
    reason === "transport_completed_without_product_truth" ? "work_transport_inconsistent" : "work_recovery_exhausted";

  return db.transaction(async (tx) => {
    const [run] = await tx
      .update(agentRuns)
      .set({
        status: "failed",
        failureCode,
        diagnosticsJson: {
          message:
            failureCode === "work_transport_inconsistent"
              ? "Queue transport completed without terminal section copy suggestion truth."
              : "Section copy suggestion recovery exhausted its bounded retry count.",
          recoveryReason: reason,
          recoveryCount: candidate.recoveryCount,
          suggestionId: candidate.suggestionId
        },
        completedAt: now,
        updatedAt: now
      })
      .where(
        and(
          eq(agentRuns.id, candidate.id),
          eq(agentRuns.projectId, candidate.projectId),
          eq(agentRuns.task, "section_text_generation"),
          eq(agentRuns.subjectId, candidate.suggestionId),
          inArray(agentRuns.status, activeAgentRunStatuses),
          eq(agentRuns.recoveryCount, candidate.recoveryCount),
          lte(agentRuns.updatedAt, staleBefore)
        )
      )
      .returning({ id: agentRuns.id });
    if (!run) {
      return false;
    }

    const [suggestion] = await tx
      .update(pageSectionCopySuggestions)
      .set({
        status: "failed",
        failureCode,
        failureMessage:
          failureCode === "work_transport_inconsistent"
            ? "Queue transport completed without a ready suggestion."
            : "Suggestion generation exhausted bounded recovery.",
        updatedAt: now
      })
      .where(
        and(
          eq(pageSectionCopySuggestions.id, candidate.suggestionId),
          eq(pageSectionCopySuggestions.projectId, candidate.projectId),
          eq(pageSectionCopySuggestions.pageVersionId, candidate.pageVersionId),
          eq(pageSectionCopySuggestions.sectionId, candidate.sectionId),
          eq(pageSectionCopySuggestions.agentRunId, candidate.id),
          inArray(pageSectionCopySuggestions.status, ["queued", "generating"])
        )
      )
      .returning({ id: pageSectionCopySuggestions.id });
    if (!suggestion) {
      throw new Error(`Section copy suggestion ${candidate.suggestionId} was not recoverable at terminalization.`);
    }
    return true;
  });
}

async function markPageProposalRecoveryFailed(
  db: WorkerDb,
  candidate: PageProposalRecoveryCandidate,
  now: Date,
  staleBefore: Date,
  reason: string
): Promise<boolean> {
  const failureCode =
    reason === "transport_completed_without_product_truth" ? "work_transport_inconsistent" : "work_recovery_exhausted";
  const [updated] = await db
    .update(agentRuns)
    .set({
      status: "failed",
      failureCode,
      diagnosticsJson: {
        message:
          failureCode === "work_transport_inconsistent"
            ? "Queue transport completed without terminal Page Proposal product truth."
            : "Page Proposal recovery exhausted its bounded retry count.",
        recoveryReason: reason,
        recoveryCount: candidate.recoveryCount
      },
      completedAt: now,
      updatedAt: now
    })
    .where(
      and(
        eq(agentRuns.id, candidate.id),
        eq(agentRuns.projectId, candidate.projectId),
        eq(agentRuns.task, "page_brief_draft"),
        inArray(agentRuns.status, activeAgentRunStatuses),
        eq(agentRuns.recoveryCount, candidate.recoveryCount),
        lte(agentRuns.updatedAt, staleBefore)
      )
    )
    .returning({ id: agentRuns.id });

  return Boolean(updated);
}

async function markCurrentJobRunFailed(db: WorkerDb, spec: RecoveryJobSpec, now: Date, reason: string): Promise<void> {
  await db
    .update(jobRuns)
    .set({
      status: "failed",
      completedAt: now,
      failureJson: {
        message: "Durable work was terminalized by bounded work recovery.",
        recoveryReason: reason
      },
      updatedAt: now
    })
    .where(
      and(
        eq(jobRuns.externalJobId, spec.jobId),
        eq(jobRuns.queueName, spec.queueName),
        inArray(jobRuns.status, ["queued", "running", "retrying", "waiting_for_external", "waiting_for_approval"])
      )
    );
}

async function markRecoveryJobRunFailed(db: WorkerDb, jobRunId: string, now: Date, error: unknown): Promise<void> {
  await db
    .update(jobRuns)
    .set({
      status: "failed",
      completedAt: now,
      failureJson: { message: normalizeErrorMessage(error) },
      updatedAt: now
    })
    .where(eq(jobRuns.id, jobRunId));
}

async function markRecoveryJobRunCancelled(db: WorkerDb, jobRunId: string, now: Date): Promise<void> {
  await db
    .update(jobRuns)
    .set({
      status: "cancelled",
      completedAt: now,
      failureJson: { message: "Transport became active before the recovery enqueue was applied." },
      updatedAt: now
    })
    .where(eq(jobRuns.id, jobRunId));
}

function recoveryJobSpec(candidate: RecoveryCandidate, jobRunId?: string): RecoveryJobSpec {
  if (candidate.kind === "page_proposal") {
    const attempts = 3;
    return {
      queueName: pageProposalQueueName,
      jobName: "page_generation",
      jobId: candidate.id,
      jobType: "page_generation",
      data: PageProposalJobDataSchema.parse({
        projectId: candidate.projectId,
        runId: candidate.id,
        opportunityId: candidate.opportunityId,
        maxAttempts: attempts,
        ...(jobRunId ? { jobRunId } : {}),
        triggeredByUserId: null,
        triggerSource: "work_recovery"
      }),
      options: {
        attempts,
        jobId: candidate.id,
        backoff: { type: "exponential", delay: 5000 }
      }
    };
  }

  if (candidate.kind === "section_copy_suggestion") {
    const attempts = 3;
    return {
      queueName: pageProposalQueueName,
      jobName: "section_text_generation",
      jobId: candidate.id,
      jobType: "page_generation",
      data: SectionCopySuggestionJobDataSchema.parse({
        projectId: candidate.projectId,
        runId: candidate.id,
        suggestionId: candidate.suggestionId,
        pageVersionId: candidate.pageVersionId,
        sectionId: candidate.sectionId,
        maxAttempts: attempts,
        ...(jobRunId ? { jobRunId } : {}),
        triggeredByUserId: null,
        triggerSource: "work_recovery"
      }),
      options: {
        attempts,
        jobId: candidate.id,
        backoff: { type: "exponential", delay: 5000 }
      }
    };
  }

  const attempts = 3;
  return {
    queueName: releaseVerificationQueueName,
    jobName: "release_verification",
    jobId: candidate.id,
    jobType: "release_verification",
    data: ReleaseVerificationJobDataSchema.parse({
      projectId: candidate.projectId,
      releasePlanId: candidate.releasePlanId,
      deploymentId: candidate.deploymentId,
      verificationId: candidate.id,
      maxAttempts: attempts,
      ...(jobRunId ? { jobRunId } : {}),
      triggeredByUserId: null,
      triggerSource: "work_recovery"
    }),
    options: {
      attempts,
      jobId: candidate.id,
      backoff: { type: "exponential", delay: 10_000 }
    }
  };
}

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "unknown_work_recovery_error";
}
