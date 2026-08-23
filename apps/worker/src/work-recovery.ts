import { randomUUID } from "node:crypto";
import {
  PageProposalJobDataSchema,
  CustomerReportGenerationJobDataSchema,
  CustomerReportHtmlRenderJobDataSchema,
  MediaProcessingJobDataSchema,
  OpportunityResearchJobDataSchema,
  ReleaseVerificationJobDataSchema,
  SectionCopySuggestionJobDataSchema,
  queueJobNames,
  secondaryJobNames,
  type AgentRunStatus
} from "@localseo/contracts";
import {
  agentRuns,
  agentRunEvents,
  failOpportunityResearchExecution,
  jobRuns,
  mediaAssets,
  pageSectionCopySuggestions,
  projectOpportunityResearchStates,
  releasePlans,
  releaseVerifications,
  reportArtifacts,
  reports,
  reportGenerationRuns
} from "@localseo/db";
import { classifyWorkRecovery, type WorkRecoveryDecision, type WorkRecoveryTransportState } from "@localseo/domain";
import type { JobsOptions } from "bullmq";
import { and, asc, eq, inArray, isNotNull, lte, or, sql } from "@localseo/db/query";
import type { WorkerDb } from "./job-run.js";
import { markReleaseVerificationRecoveryFailure } from "./handlers/release-verification.js";

const pageProposalQueueName = "page-generation";
const releaseVerificationQueueName = "release-verification";
const mediaProcessingQueueName = "media-processing";
const reportQueueName = "report";
const opportunityResearchQueueName = "opportunity-research";
const activeBullMqStates = new Set(["active", "waiting", "waiting-children", "delayed", "prioritized"]);
const terminalJobRunStatuses = new Set(["completed", "failed", "cancelled", "dry_run"]);
const activeJobRunStatuses = ["queued", "running", "retrying", "waiting_for_external", "waiting_for_approval"] as const;
const activeAgentRunStatuses = ["queued", "running"] as const satisfies readonly AgentRunStatus[];
const opportunityResearchLivenessAt = sql<Date>`CASE
  WHEN ${agentRuns.status} = 'running' THEN COALESCE(${agentRuns.lastHeartbeatAt}, ${agentRuns.updatedAt})
  ELSE ${agentRuns.updatedAt}
END`;

export type WorkRecoveryTransportJob = {
  readonly data?: unknown;
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
  "media-processing": WorkRecoveryQueue;
  "release-verification": WorkRecoveryQueue;
  "opportunity-research": WorkRecoveryQueue;
  report: WorkRecoveryQueue;
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
  expiredMediaUploads: number;
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

type MediaProcessingRecoveryCandidate = {
  kind: "media_processing";
  id: string;
  projectId: string;
  durableState: "running";
  recoveryCount: number;
};

type CustomerReportRecoveryCandidate = {
  kind: "customer_report";
  id: string;
  projectId: string;
  durableState: "queued" | "running";
  recoveryCount: number;
};

type CustomerReportArtifactRecoveryCandidate = {
  kind: "customer_report_artifact";
  id: string;
  projectId: string;
  reportId: string;
  reportIssueId: string;
  durableState: "queued" | "running";
  recoveryCount: number;
};

type OpportunityResearchRecoveryCandidate = {
  kind: "opportunity_research";
  id: string;
  projectId: string;
  materialDigest: string;
  durableState: "queued" | "running";
  recoveryCount: number;
};

type RecoveryCandidate =
  | PageProposalRecoveryCandidate
  | SectionCopySuggestionRecoveryCandidate
  | MediaProcessingRecoveryCandidate
  | CustomerReportRecoveryCandidate
  | CustomerReportArtifactRecoveryCandidate
  | OpportunityResearchRecoveryCandidate
  | ReleaseVerificationRecoveryCandidate;

type RecoveryJobSpec = {
  queueName: keyof WorkRecoveryQueues;
  jobName: string;
  jobId: string;
  jobType: string;
  data: Record<string, unknown>;
  options: JobsOptions;
};

type RecoveryClaim = {
  jobRunId: string;
  recoveryCount: number;
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
  try {
    result.expiredMediaUploads = await expirePendingMediaUploadIntents(input.db, now, input.batchSize);
  } catch (error) {
    result.errors += 1;
    console.error("Work recovery failed to expire pending media uploads", normalizeErrorMessage(error));
  }
  const [
    pageProposalLoad,
    sectionCopyLoad,
    mediaProcessingLoad,
    releaseVerificationLoad,
    customerReportLoad,
    customerReportArtifactLoad,
    opportunityResearchLoad
  ] = await Promise.allSettled([
    loadPageProposalRecoveryCandidates(input.db, staleBefore, input.batchSize),
    loadSectionCopySuggestionRecoveryCandidates(input.db, staleBefore, input.batchSize),
    loadMediaProcessingRecoveryCandidates(input.db, staleBefore, input.batchSize),
    loadReleaseVerificationRecoveryCandidates(input.db, staleBefore, input.batchSize),
    loadCustomerReportRecoveryCandidates(input.db, staleBefore, input.batchSize),
    loadCustomerReportArtifactRecoveryCandidates(input.db, staleBefore, input.batchSize),
    loadOpportunityResearchRecoveryCandidates(input.db, staleBefore, input.batchSize)
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

  if (mediaProcessingLoad.status === "fulfilled") {
    candidates.push(...mediaProcessingLoad.value);
  } else {
    result.errors += 1;
    console.error(
      "Work recovery failed to load media_processing candidates",
      normalizeErrorMessage(mediaProcessingLoad.reason)
    );
  }

  if (customerReportLoad.status === "fulfilled") {
    candidates.push(...customerReportLoad.value);
  } else {
    result.errors += 1;
    console.error(
      "Work recovery failed to load customer_report candidates",
      normalizeErrorMessage(customerReportLoad.reason)
    );
  }

  if (customerReportArtifactLoad.status === "fulfilled") {
    candidates.push(...customerReportArtifactLoad.value);
  } else {
    result.errors += 1;
    console.error(
      "Work recovery failed to load customer_report_artifact candidates",
      normalizeErrorMessage(customerReportArtifactLoad.reason)
    );
  }

  if (opportunityResearchLoad.status === "fulfilled") {
    candidates.push(...opportunityResearchLoad.value);
  } else {
    result.errors += 1;
    console.error(
      "Work recovery failed to load opportunity_research candidates",
      normalizeErrorMessage(opportunityResearchLoad.reason)
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
    errors: 0,
    expiredMediaUploads: 0
  };
}

async function expirePendingMediaUploadIntents(db: WorkerDb, now: Date, batchSize: number): Promise<number> {
  const expiresBefore = new Date(now.getTime() - 24 * 60 * 60_000);
  const candidates = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.status, "pending_upload"), lte(mediaAssets.createdAt, expiresBefore)))
    .orderBy(asc(mediaAssets.createdAt))
    .limit(batchSize);
  if (candidates.length === 0) {
    return 0;
  }
  const updated = await db
    .update(mediaAssets)
    .set({
      status: "failed",
      failureCode: "upload_expired",
      failureMessage: "Media upload intent expired before processing began.",
      updatedAt: now
    })
    .where(
      and(
        inArray(
          mediaAssets.id,
          candidates.map((candidate) => candidate.id)
        ),
        eq(mediaAssets.status, "pending_upload")
      )
    )
    .returning({ id: mediaAssets.id });
  return updated.length;
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
  const transportState = await observeTransportState(input.db, queue, spec, input.candidate);
  const decision = classifyWorkRecovery({
    workflowCategory:
      input.candidate.kind === "release_verification"
        ? "provider_handoff_warning"
        : input.candidate.kind === "media_processing" || input.candidate.kind === "customer_report_artifact"
          ? "artifact_capture"
          : "read_analyze",
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
  const currentJob = await input.queue.getJob(input.spec.jobId);
  if (currentJob) {
    const currentState = transportStateFromBullMqJobState(await currentJob.getState());

    if (currentState === "active" || currentState === "unknown") {
      input.result.coalesced += 1;
      return;
    }

    await currentJob.remove();
  }

  const reusableClaim = await loadReusableOpportunityResearchRecoveryClaim(input.db, input.candidate, input.spec);
  const claim =
    reusableClaim ??
    (await claimRecoveryAttempt(input.db, input.candidate, input.spec, input.now, input.staleBefore, reason));

  if (!claim) {
    input.result.staleNoop += 1;
    return;
  }

  const postClaimJob = await input.queue.getJob(input.spec.jobId);
  if (postClaimJob) {
    const postClaimState = transportStateFromBullMqJobState(await postClaimJob.getState());
    if (postClaimState === "active" || postClaimState === "unknown") {
      if (transportJobRunId(postClaimJob) !== claim.jobRunId) {
        await markRecoveryJobRunCancelled(input.db, claim.jobRunId, input.now);
      }
      input.result.coalesced += 1;
      return;
    }
    await postClaimJob.remove();
  }

  try {
    const spec = recoveryJobSpec(input.candidate, claim.jobRunId, claim.recoveryCount);
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
  spec: RecoveryJobSpec,
  candidate: RecoveryCandidate
): Promise<WorkRecoveryTransportState> {
  const job = await queue.getJob(spec.jobId);

  if (job) {
    return transportStateFromBullMqJobState(await job.getState());
  }

  const recoveryAuditExternalJobId =
    candidate.kind === "opportunity_research" && candidate.recoveryCount > 0
      ? `${candidate.id}:recovery:${candidate.recoveryCount}`
      : undefined;
  const [recoveryAudit] = recoveryAuditExternalJobId
    ? await db
        .select({ status: jobRuns.status })
        .from(jobRuns)
        .where(and(eq(jobRuns.externalJobId, recoveryAuditExternalJobId), eq(jobRuns.queueName, spec.queueName)))
        .limit(1)
    : [];
  const [baseAudit] = await db
    .select({ status: jobRuns.status })
    .from(jobRuns)
    .where(and(eq(jobRuns.externalJobId, spec.jobId), eq(jobRuns.queueName, spec.queueName)))
    .limit(1);
  const audit = recoveryAudit ?? baseAudit;

  if (audit?.status === "completed") {
    return "completed";
  }

  if (audit && terminalJobRunStatuses.has(audit.status)) {
    return "failed";
  }

  return "missing";
}

async function loadReusableOpportunityResearchRecoveryClaim(
  db: WorkerDb,
  candidate: RecoveryCandidate,
  spec: RecoveryJobSpec
): Promise<RecoveryClaim | undefined> {
  if (candidate.kind !== "opportunity_research" || candidate.recoveryCount <= 0) return undefined;
  const [audit] = await db
    .select({ id: jobRuns.id })
    .from(jobRuns)
    .where(
      and(
        eq(jobRuns.projectId, candidate.projectId),
        eq(jobRuns.externalJobId, `${candidate.id}:recovery:${candidate.recoveryCount}`),
        eq(jobRuns.queueName, spec.queueName),
        eq(jobRuns.type, spec.jobType),
        eq(jobRuns.triggerSource, "work_recovery"),
        inArray(jobRuns.status, activeJobRunStatuses)
      )
    )
    .limit(1);
  return audit ? { jobRunId: audit.id, recoveryCount: candidate.recoveryCount } : undefined;
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

async function loadMediaProcessingRecoveryCandidates(
  db: WorkerDb,
  staleBefore: Date,
  batchSize: number
): Promise<MediaProcessingRecoveryCandidate[]> {
  const rows = await db
    .select({
      id: mediaAssets.id,
      projectId: mediaAssets.projectId,
      recoveryCount: mediaAssets.recoveryCount
    })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.status, "processing"), lte(mediaAssets.updatedAt, staleBefore)))
    .orderBy(asc(mediaAssets.updatedAt))
    .limit(batchSize);

  return rows.map((row) => ({
    kind: "media_processing" as const,
    id: row.id,
    projectId: row.projectId,
    durableState: "running" as const,
    recoveryCount: row.recoveryCount
  }));
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

async function loadCustomerReportRecoveryCandidates(
  db: WorkerDb,
  staleBefore: Date,
  batchSize: number
): Promise<CustomerReportRecoveryCandidate[]> {
  const rows = await db
    .select({
      id: reportGenerationRuns.id,
      projectId: reportGenerationRuns.projectId,
      status: reportGenerationRuns.status,
      recoveryCount: reportGenerationRuns.recoveryCount
    })
    .from(reportGenerationRuns)
    .where(
      and(
        inArray(reportGenerationRuns.status, ["queued", "assembling", "narrative_running", "validating"]),
        lte(reportGenerationRuns.updatedAt, staleBefore)
      )
    )
    .orderBy(asc(reportGenerationRuns.updatedAt))
    .limit(batchSize);

  return rows.map((row) => ({
    kind: "customer_report" as const,
    id: row.id,
    projectId: row.projectId,
    durableState: row.status === "queued" ? ("queued" as const) : ("running" as const),
    recoveryCount: row.recoveryCount
  }));
}

async function loadCustomerReportArtifactRecoveryCandidates(
  db: WorkerDb,
  staleBefore: Date,
  batchSize: number
): Promise<CustomerReportArtifactRecoveryCandidate[]> {
  const rows = await db
    .select({
      id: reportArtifacts.id,
      projectId: reportArtifacts.projectId,
      reportId: reportArtifacts.reportId,
      reportIssueId: reports.reportIssueId,
      status: reportArtifacts.status,
      recoveryCount: reportArtifacts.recoveryCount
    })
    .from(reportArtifacts)
    .innerJoin(reports, and(eq(reports.id, reportArtifacts.reportId), eq(reports.projectId, reportArtifacts.projectId)))
    .where(and(inArray(reportArtifacts.status, ["pending", "running"]), lte(reportArtifacts.updatedAt, staleBefore)))
    .orderBy(asc(reportArtifacts.updatedAt))
    .limit(batchSize);

  return rows.map((row) => ({
    kind: "customer_report_artifact" as const,
    id: row.id,
    projectId: row.projectId,
    reportId: row.reportId,
    reportIssueId: row.reportIssueId,
    durableState: row.status === "pending" ? ("queued" as const) : ("running" as const),
    recoveryCount: row.recoveryCount
  }));
}

async function loadOpportunityResearchRecoveryCandidates(
  db: WorkerDb,
  staleBefore: Date,
  batchSize: number
): Promise<OpportunityResearchRecoveryCandidate[]> {
  const rows = await db
    .select({
      id: agentRuns.id,
      projectId: agentRuns.projectId,
      materialDigest: agentRuns.inputSha256,
      status: agentRuns.status,
      recoveryCount: agentRuns.recoveryCount
    })
    .from(agentRuns)
    .innerJoin(
      projectOpportunityResearchStates,
      and(
        eq(projectOpportunityResearchStates.projectId, agentRuns.projectId),
        eq(projectOpportunityResearchStates.activeRunId, agentRuns.id)
      )
    )
    .where(
      and(
        eq(agentRuns.workflowName, "opportunity_research"),
        eq(agentRuns.task, "opportunity_scout"),
        inArray(agentRuns.status, activeAgentRunStatuses),
        inArray(projectOpportunityResearchStates.status, ["queued", "running"]),
        isNotNull(agentRuns.inputSha256),
        lte(opportunityResearchLivenessAt, sql`${staleBefore.toISOString()}::timestamptz`)
      )
    )
    .orderBy(asc(opportunityResearchLivenessAt))
    .limit(batchSize);

  return rows.flatMap((row) =>
    row.materialDigest && (row.status === "queued" || row.status === "running")
      ? [
          {
            kind: "opportunity_research" as const,
            id: row.id,
            projectId: row.projectId,
            materialDigest: row.materialDigest,
            durableState: row.status,
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
): Promise<RecoveryClaim | undefined> {
  return db.transaction(async (tx) => {
    let claimedRows: Array<{ recoveryCount: number; executionEpoch?: number }>;
    if (candidate.kind === "opportunity_research") {
      await tx.execute(sql`SELECT "id" FROM "projects" WHERE "id" = ${candidate.projectId} FOR UPDATE`);
      await tx.execute(
        sql`SELECT "project_id" FROM "project_opportunity_research_states" WHERE "project_id" = ${candidate.projectId} FOR UPDATE`
      );
      const [state] = await tx
        .select({
          status: projectOpportunityResearchStates.status,
          activeRunId: projectOpportunityResearchStates.activeRunId
        })
        .from(projectOpportunityResearchStates)
        .where(eq(projectOpportunityResearchStates.projectId, candidate.projectId))
        .limit(1);
      if (!state || state.activeRunId !== candidate.id || !["queued", "running"].includes(state.status)) {
        return undefined;
      }
      await tx.execute(
        sql`SELECT "id" FROM "agent_runs" WHERE "id" = ${candidate.id} AND "project_id" = ${candidate.projectId} FOR UPDATE`
      );
      const [workflowRun] = await tx
        .select({
          status: agentRuns.status,
          recoveryCount: agentRuns.recoveryCount,
          updatedAt: agentRuns.updatedAt,
          lastHeartbeatAt: agentRuns.lastHeartbeatAt,
          executionEpoch: agentRuns.executionEpoch,
          workflowName: agentRuns.workflowName
        })
        .from(agentRuns)
        .where(and(eq(agentRuns.id, candidate.id), eq(agentRuns.projectId, candidate.projectId)))
        .limit(1);
      if (
        !workflowRun ||
        workflowRun.workflowName !== "opportunity_research" ||
        !activeAgentRunStatuses.includes(workflowRun.status as (typeof activeAgentRunStatuses)[number]) ||
        workflowRun.recoveryCount !== candidate.recoveryCount ||
        (workflowRun.status === "running"
          ? (workflowRun.lastHeartbeatAt ?? workflowRun.updatedAt)
          : workflowRun.updatedAt) > staleBefore
      ) {
        return undefined;
      }
      claimedRows = await tx
        .update(agentRuns)
        .set({
          recoveryCount: sql<number>`${agentRuns.recoveryCount} + 1`,
          lastRecoveryAt: now,
          lastHeartbeatAt: sql<Date>`CASE
            WHEN ${agentRuns.status} = 'running' THEN ${now.toISOString()}::timestamptz
            ELSE ${agentRuns.lastHeartbeatAt}
          END`,
          updatedAt: now
        })
        .where(
          and(
            eq(agentRuns.id, candidate.id),
            eq(agentRuns.projectId, candidate.projectId),
            eq(agentRuns.workflowName, "opportunity_research"),
            inArray(agentRuns.status, activeAgentRunStatuses),
            eq(agentRuns.recoveryCount, candidate.recoveryCount),
            lte(opportunityResearchLivenessAt, sql`${staleBefore.toISOString()}::timestamptz`)
          )
        )
        .returning({ recoveryCount: agentRuns.recoveryCount, executionEpoch: agentRuns.executionEpoch });
      const [claimedWorkflow] = claimedRows;
      if (claimedWorkflow) {
        await tx.insert(agentRunEvents).values({
          projectId: candidate.projectId,
          agentRunId: candidate.id,
          eventKey: `recovery.claimed.${claimedWorkflow.recoveryCount}`,
          eventType: "recovery.claimed",
          executionEpoch: claimedWorkflow.executionEpoch ?? 0,
          payloadJson: { recoveryCount: claimedWorkflow.recoveryCount, reason },
          occurredAt: now
        });
      }
    } else if (candidate.kind === "release_verification") {
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
    } else if (candidate.kind === "media_processing") {
      claimedRows = await tx
        .update(mediaAssets)
        .set({
          recoveryCount: sql<number>`${mediaAssets.recoveryCount} + 1`,
          lastRecoveryAt: now,
          updatedAt: now
        })
        .where(
          and(
            eq(mediaAssets.id, candidate.id),
            eq(mediaAssets.projectId, candidate.projectId),
            eq(mediaAssets.status, "processing"),
            eq(mediaAssets.recoveryCount, candidate.recoveryCount),
            lte(mediaAssets.updatedAt, staleBefore)
          )
        )
        .returning({ recoveryCount: mediaAssets.recoveryCount });
    } else if (candidate.kind === "customer_report_artifact") {
      await tx.execute(sql`SELECT "id" FROM "report_issues" WHERE "id" = ${candidate.reportIssueId} FOR UPDATE`);
      await tx.execute(
        sql`SELECT "id" FROM "reports" WHERE "id" = ${candidate.reportId} AND "project_id" = ${candidate.projectId} FOR UPDATE`
      );
      await tx.execute(
        sql`SELECT "id" FROM "report_artifacts" WHERE "id" = ${candidate.id} AND "report_id" = ${candidate.reportId} AND "project_id" = ${candidate.projectId} FOR UPDATE`
      );
      claimedRows = await tx
        .update(reportArtifacts)
        .set({
          recoveryCount: sql<number>`${reportArtifacts.recoveryCount} + 1`,
          lastRecoveryAt: now,
          updatedAt: now
        })
        .where(
          and(
            eq(reportArtifacts.id, candidate.id),
            eq(reportArtifacts.reportId, candidate.reportId),
            eq(reportArtifacts.projectId, candidate.projectId),
            inArray(reportArtifacts.status, ["pending", "running"]),
            eq(reportArtifacts.recoveryCount, candidate.recoveryCount),
            lte(reportArtifacts.updatedAt, staleBefore)
          )
        )
        .returning({ recoveryCount: reportArtifacts.recoveryCount });
    } else if (candidate.kind === "customer_report") {
      claimedRows = await tx
        .update(reportGenerationRuns)
        .set({
          recoveryCount: sql<number>`${reportGenerationRuns.recoveryCount} + 1`,
          lastRecoveryAt: now,
          updatedAt: now
        })
        .where(
          and(
            eq(reportGenerationRuns.id, candidate.id),
            eq(reportGenerationRuns.projectId, candidate.projectId),
            inArray(reportGenerationRuns.status, ["queued", "assembling", "narrative_running", "validating"]),
            eq(reportGenerationRuns.recoveryCount, candidate.recoveryCount),
            lte(reportGenerationRuns.updatedAt, staleBefore)
          )
        )
        .returning({ recoveryCount: reportGenerationRuns.recoveryCount });
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

    const auditExternalJobId =
      candidate.kind === "opportunity_research" ? `${candidate.id}:recovery:${claimed.recoveryCount}` : spec.jobId;
    const [existingAudit] = await tx
      .select({
        id: jobRuns.id,
        status: jobRuns.status
      })
      .from(jobRuns)
      .where(and(eq(jobRuns.externalJobId, auditExternalJobId), eq(jobRuns.queueName, spec.queueName)))
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
      externalJobId: auditExternalJobId,
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
  } else if (input.candidate.kind === "media_processing") {
    updated = await markMediaProcessingRecoveryFailed(input.db, input.candidate, input.now, input.staleBefore, reason);
  } else if (input.candidate.kind === "customer_report") {
    updated = await markCustomerReportRecoveryFailed(input.db, input.candidate, input.now, input.staleBefore, reason);
  } else if (input.candidate.kind === "customer_report_artifact") {
    updated = await markCustomerReportArtifactRecoveryFailed(
      input.db,
      input.candidate,
      input.now,
      input.staleBefore,
      reason
    );
  } else if (input.candidate.kind === "opportunity_research") {
    updated = await failOpportunityResearchExecution(input.db, {
      projectId: input.candidate.projectId,
      runId: input.candidate.id,
      failureCode:
        reason === "transport_completed_without_product_truth"
          ? "work_transport_inconsistent"
          : "work_recovery_exhausted",
      failureMessage:
        reason === "transport_completed_without_product_truth"
          ? "Queue transport completed without terminal Opportunity Research truth."
          : "Opportunity Research exhausted bounded recovery.",
      expectedRecoveryCount: input.candidate.recoveryCount,
      recordRecoveryExhausted: reason !== "transport_completed_without_product_truth",
      staleBefore: input.staleBefore,
      occurredAt: input.now
    });
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
    await markCurrentJobRunFailed(input.db, input.candidate, input.spec, input.now, reason);
  }

  return updated;
}

async function markCustomerReportArtifactRecoveryFailed(
  db: WorkerDb,
  candidate: CustomerReportArtifactRecoveryCandidate,
  now: Date,
  staleBefore: Date,
  reason: string
): Promise<boolean> {
  const failureCode =
    reason === "transport_completed_without_product_truth" ? "work_transport_inconsistent" : "work_recovery_exhausted";
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT "id" FROM "report_issues" WHERE "id" = ${candidate.reportIssueId} FOR UPDATE`);
    await tx.execute(
      sql`SELECT "id" FROM "reports" WHERE "id" = ${candidate.reportId} AND "project_id" = ${candidate.projectId} FOR UPDATE`
    );
    await tx.execute(
      sql`SELECT "id" FROM "report_artifacts" WHERE "id" = ${candidate.id} AND "report_id" = ${candidate.reportId} AND "project_id" = ${candidate.projectId} FOR UPDATE`
    );
    const [updated] = await tx
      .update(reportArtifacts)
      .set({
        status: "failed",
        failureCode,
        failureMessage:
          failureCode === "work_transport_inconsistent"
            ? "Queue transport completed without staged customer report HTML truth."
            : "Customer report HTML rendering exhausted bounded recovery.",
        updatedAt: now
      })
      .where(
        and(
          eq(reportArtifacts.id, candidate.id),
          eq(reportArtifacts.reportId, candidate.reportId),
          eq(reportArtifacts.projectId, candidate.projectId),
          inArray(reportArtifacts.status, ["pending", "running"]),
          eq(reportArtifacts.recoveryCount, candidate.recoveryCount),
          lte(reportArtifacts.updatedAt, staleBefore)
        )
      )
      .returning({ id: reportArtifacts.id });
    return Boolean(updated);
  });
}

async function markCustomerReportRecoveryFailed(
  db: WorkerDb,
  candidate: CustomerReportRecoveryCandidate,
  now: Date,
  staleBefore: Date,
  reason: string
): Promise<boolean> {
  const failureCode =
    reason === "transport_completed_without_product_truth" ? "work_transport_inconsistent" : "work_recovery_exhausted";
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(reportGenerationRuns)
      .set({
        status: "failed",
        failureCode,
        failureMessage:
          failureCode === "work_transport_inconsistent"
            ? "Queue transport completed without terminal customer report truth."
            : "Customer report generation exhausted bounded recovery.",
        finishedAt: now,
        updatedAt: now
      })
      .where(
        and(
          eq(reportGenerationRuns.id, candidate.id),
          eq(reportGenerationRuns.projectId, candidate.projectId),
          inArray(reportGenerationRuns.status, ["queued", "assembling", "narrative_running", "validating"]),
          eq(reportGenerationRuns.recoveryCount, candidate.recoveryCount),
          lte(reportGenerationRuns.updatedAt, staleBefore)
        )
      )
      .returning({ id: reportGenerationRuns.id });
    if (!updated) return false;
    await tx
      .update(agentRuns)
      .set({
        status: "failed",
        failureCode,
        diagnosticsJson: {
          gateId: "parent_report_recovery",
          message: "The parent customer report generation terminated during bounded recovery."
        },
        completedAt: now,
        updatedAt: now
      })
      .where(
        and(
          eq(agentRuns.id, candidate.id),
          eq(agentRuns.projectId, candidate.projectId),
          eq(agentRuns.task, "report_narrative"),
          inArray(agentRuns.status, activeAgentRunStatuses)
        )
      );
    return true;
  });
}

async function markMediaProcessingRecoveryFailed(
  db: WorkerDb,
  candidate: MediaProcessingRecoveryCandidate,
  now: Date,
  staleBefore: Date,
  reason: string
): Promise<boolean> {
  const failureCode =
    reason === "transport_completed_without_product_truth" ? "work_transport_inconsistent" : "work_recovery_exhausted";
  const [updated] = await db
    .update(mediaAssets)
    .set({
      status: "failed",
      failureCode,
      failureMessage:
        failureCode === "work_transport_inconsistent"
          ? "Queue transport completed without ready media asset truth."
          : "Media processing exhausted bounded recovery.",
      updatedAt: now
    })
    .where(
      and(
        eq(mediaAssets.id, candidate.id),
        eq(mediaAssets.projectId, candidate.projectId),
        eq(mediaAssets.status, "processing"),
        eq(mediaAssets.recoveryCount, candidate.recoveryCount),
        lte(mediaAssets.updatedAt, staleBefore)
      )
    )
    .returning({ id: mediaAssets.id });

  return Boolean(updated);
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

async function markCurrentJobRunFailed(
  db: WorkerDb,
  candidate: RecoveryCandidate,
  spec: RecoveryJobSpec,
  now: Date,
  reason: string
): Promise<void> {
  const externalJobPredicate =
    candidate.kind === "opportunity_research"
      ? or(eq(jobRuns.externalJobId, spec.jobId), sql`${jobRuns.externalJobId} LIKE ${`${candidate.id}:recovery:%`}`)
      : eq(jobRuns.externalJobId, spec.jobId);
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
      and(externalJobPredicate, eq(jobRuns.queueName, spec.queueName), inArray(jobRuns.status, activeJobRunStatuses))
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
      failureJson: { message: "Transport became active after the recovery reservation was committed." },
      updatedAt: now
    })
    .where(and(eq(jobRuns.id, jobRunId), inArray(jobRuns.status, activeJobRunStatuses)));
}

function transportJobRunId(job: WorkRecoveryTransportJob): string | undefined {
  if (!job.data || typeof job.data !== "object" || Array.isArray(job.data)) return undefined;
  const value = (job.data as Record<string, unknown>).jobRunId;
  return typeof value === "string" ? value : undefined;
}

type RecoveryCandidateKind = RecoveryCandidate["kind"];
type RecoveryCandidateByKind = {
  [Kind in RecoveryCandidateKind]: Extract<RecoveryCandidate, { kind: Kind }>;
};
type RecoveryJobDefinitionInput = {
  attempts: number;
  jobRunId: string | undefined;
  expectedRecoveryCount: number | undefined;
};
type RecoveryJobDefinition<Kind extends RecoveryCandidateKind> = {
  queueName: keyof WorkRecoveryQueues;
  jobName: string;
  jobType: string;
  backoffDelay?: number;
  buildData(candidate: RecoveryCandidateByKind[Kind], input: RecoveryJobDefinitionInput): Record<string, unknown>;
};
type RecoveryJobDefinitionTable = {
  [Kind in RecoveryCandidateKind]: RecoveryJobDefinition<Kind>;
};

const recoveryJobDefinitions: RecoveryJobDefinitionTable = {
  page_proposal: {
    queueName: pageProposalQueueName,
    jobName: queueJobNames["page-generation"],
    jobType: "page_generation",
    buildData: (candidate, { attempts, jobRunId }) =>
      PageProposalJobDataSchema.parse({
        projectId: candidate.projectId,
        runId: candidate.id,
        opportunityId: candidate.opportunityId,
        maxAttempts: attempts,
        ...(jobRunId ? { jobRunId } : {}),
        triggeredByUserId: null,
        triggerSource: "work_recovery"
      })
  },
  section_copy_suggestion: {
    queueName: pageProposalQueueName,
    jobName: secondaryJobNames.pageGeneration,
    jobType: "page_generation",
    buildData: (candidate, { attempts, jobRunId }) =>
      SectionCopySuggestionJobDataSchema.parse({
        projectId: candidate.projectId,
        runId: candidate.id,
        suggestionId: candidate.suggestionId,
        pageVersionId: candidate.pageVersionId,
        sectionId: candidate.sectionId,
        maxAttempts: attempts,
        ...(jobRunId ? { jobRunId } : {}),
        triggeredByUserId: null,
        triggerSource: "work_recovery"
      })
  },
  media_processing: {
    queueName: mediaProcessingQueueName,
    jobName: queueJobNames["media-processing"],
    jobType: "media_processing",
    buildData: (candidate, { attempts, jobRunId }) =>
      MediaProcessingJobDataSchema.parse({
        projectId: candidate.projectId,
        assetId: candidate.id,
        maxAttempts: attempts,
        ...(jobRunId ? { jobRunId } : {}),
        triggeredByUserId: null,
        triggerSource: "work_recovery"
      })
  },
  customer_report: {
    queueName: reportQueueName,
    jobName: queueJobNames.report,
    jobType: "report",
    buildData: (candidate, { attempts, jobRunId }) =>
      CustomerReportGenerationJobDataSchema.parse({
        projectId: candidate.projectId,
        runId: candidate.id,
        maxAttempts: attempts,
        ...(jobRunId ? { jobRunId } : {}),
        triggerSource: "work_recovery"
      })
  },
  customer_report_artifact: {
    queueName: reportQueueName,
    jobName: "customer_report_html_render",
    jobType: "report_artifact",
    buildData: (candidate, { attempts, jobRunId }) =>
      CustomerReportHtmlRenderJobDataSchema.parse({
        projectId: candidate.projectId,
        reportId: candidate.reportId,
        artifactId: candidate.id,
        maxAttempts: attempts,
        ...(jobRunId ? { jobRunId } : {}),
        triggerSource: "work_recovery"
      })
  },
  opportunity_research: {
    queueName: opportunityResearchQueueName,
    jobName: queueJobNames["opportunity-research"],
    jobType: "opportunity_research",
    buildData: (candidate, { jobRunId, expectedRecoveryCount }) =>
      jobRunId && expectedRecoveryCount !== undefined
        ? OpportunityResearchJobDataSchema.parse({
            projectId: candidate.projectId,
            runId: candidate.id,
            materialDigest: candidate.materialDigest,
            triggerSource: "work_recovery",
            jobRunId,
            expectedRecoveryCount
          })
        : {}
  },
  release_verification: {
    queueName: releaseVerificationQueueName,
    jobName: queueJobNames["release-verification"],
    jobType: "release_verification",
    backoffDelay: 10_000,
    buildData: (candidate, { attempts, jobRunId }) =>
      ReleaseVerificationJobDataSchema.parse({
        projectId: candidate.projectId,
        releasePlanId: candidate.releasePlanId,
        deploymentId: candidate.deploymentId,
        verificationId: candidate.id,
        maxAttempts: attempts,
        ...(jobRunId ? { jobRunId } : {}),
        triggeredByUserId: null,
        triggerSource: "work_recovery"
      })
  }
};

function recoveryJobSpec<Kind extends RecoveryCandidateKind>(
  candidate: RecoveryCandidateByKind[Kind],
  jobRunId?: string,
  expectedRecoveryCount?: number
): RecoveryJobSpec {
  const attempts = 3;
  const definition = recoveryJobDefinitions[candidate.kind];
  return {
    queueName: definition.queueName,
    jobName: definition.jobName,
    jobId: candidate.id,
    jobType: definition.jobType,
    data: definition.buildData(candidate, {
      attempts,
      jobRunId,
      expectedRecoveryCount
    }),
    options: {
      attempts,
      jobId: candidate.id,
      backoff: { type: "exponential", delay: definition.backoffDelay ?? 5000 }
    }
  };
}

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "unknown_work_recovery_error";
}
