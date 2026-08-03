import { createHash, randomUUID } from "node:crypto";
import {
  CustomerReportCompletedRollbackEvidenceSchema,
  CustomerReportEvidencePacketSchema,
  CustomerReportGenerationJobDataSchema,
  CustomerReportSnapshotSchema,
  DeploymentReportEvidenceSchema,
  OpportunityReportEvidenceSchema,
  PageVersionReportEvidenceSchema,
  RankingReportEvidenceSchema,
  ReleaseVerificationCheckReportEvidenceSchema,
  ReleaseVerificationReportEvidenceSchema,
  RollbackReportEvidenceSchema,
  type CustomerReportEvidenceItem,
  type CustomerReportEvidencePacket,
  type CustomerReportGenerationJobData,
  type CustomerReportSnapshot
} from "@localseo/contracts";
import {
  deployments,
  opportunities,
  pageProposals,
  pageVersions,
  rankingProofs,
  releasePlans,
  releaseVerificationChecks,
  releaseVerifications,
  reportClaimEvidence,
  reportClaims,
  reportEvidenceItems,
  reportGenerationRuns,
  reportIssues,
  reportLifecycleEvents,
  reports,
  rollbackPoints,
  type DatabaseClient
} from "@localseo/db";
import {
  assembleCustomerReportFactProjection,
  buildFactOnlyCustomerReportSnapshot,
  canonicalizeCustomerReportEvidencePacket,
  canonicalizeCustomerReportFactProjection,
  canonicalizeCustomerReportSnapshot,
  canonicalizeCustomerReportSourcePayload,
  customerReportPeriodWindow,
  customerReportRankingProofMaxAgeDays,
  customerSafeReleaseWarningCheckKeys,
  customerSafeReleaseWarningForCheck,
  decideCustomerReportGenerationWindow,
  decideCustomerReportSnapshotEligibility,
  normalizeCustomerReportFactProjection
} from "@localseo/domain";
import type { Job } from "bullmq";
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, lte, not, sql } from "drizzle-orm";
import type { WorkerDb, WorkerDbHandle } from "../job-run.js";

const activeGenerationStatuses = ["queued", "assembling", "narrative_running", "validating"] as const;
export const reportEvidenceLimits = {
  rankingProofs: 40,
  pageVersions: 30,
  deployments: 20,
  verifications: 20,
  checks: 30,
  rollbacks: 20,
  opportunities: 20
} as const;

type DatabaseTransaction = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];
type ReportIssueRow = typeof reportIssues.$inferSelect;
type ReportGenerationRunRow = typeof reportGenerationRuns.$inferSelect;
type ReportRow = typeof reports.$inferSelect;

export class CustomerReportConfigurationError extends Error {}
export class CustomerReportEvidenceError extends Error {
  constructor(
    message: string,
    readonly failureCode: string
  ) {
    super(message);
  }
}

export function parseCustomerReportGenerationJobData(data: unknown): CustomerReportGenerationJobData {
  return CustomerReportGenerationJobDataSchema.parse(data);
}

export async function handleCustomerReportGenerationJob(
  job: Job,
  dbHandle: WorkerDbHandle | undefined
): Promise<Record<string, unknown>> {
  const data = parseCustomerReportGenerationJobData(job.data);
  if (!dbHandle) {
    throw new CustomerReportConfigurationError("DATABASE_URL is required for customer report generation jobs");
  }
  return executeCustomerReportGeneration({ db: dbHandle.db, data });
}

export async function executeCustomerReportGeneration(input: {
  db: WorkerDb;
  data: CustomerReportGenerationJobData;
  now?: Date;
}): Promise<Record<string, unknown>> {
  const now = input.now ?? new Date();
  const run = await claimGenerationRun(input.db, input.data, now);
  if (run.status === "succeeded" && run.resultReportId) {
    return { status: "already_generated", runId: run.id, reportId: run.resultReportId };
  }
  if (!activeGenerationStatuses.includes(run.status as (typeof activeGenerationStatuses)[number])) {
    throw new CustomerReportEvidenceError(`Report generation run is already ${run.status}.`, "invalid_run_status");
  }

  try {
    const packet = await loadCustomerReportEvidencePacket(input.db, run, run.startedAt ?? run.createdAt);
    const packetCanonicalText = canonicalizeCustomerReportEvidencePacket(packet);
    const packetSha256 = sha256(packetCanonicalText);
    await persistEvidencePacket(input.db, run, packetCanonicalText, packetSha256, now);

    const factProjection = assembleCustomerReportFactProjection(packet);
    const factProjectionSha256 = sha256(canonicalizeCustomerReportFactProjection(factProjection));
    const snapshot = buildFactOnlyCustomerReportSnapshot({
      packet,
      factProjection,
      factProjectionSha256,
      assemblerVersion: run.assemblerVersion,
      eligibilityPolicyVersion: run.eligibilityPolicyVersion,
      actionSelectionPolicyVersion: run.actionSelectionPolicyVersion
    });
    const persisted = await persistGeneratedDraft(input.db, run, snapshot, now);
    if (persisted.kind === "stale") {
      return {
        status: "stale",
        runId: run.id,
        reportIssueId: persisted.reportIssueId,
        reason: persisted.reason
      };
    }
    return {
      status: persisted.kind,
      runId: run.id,
      reportIssueId: persisted.reportIssueId,
      reportId: persisted.reportId,
      snapshotSha256: persisted.snapshotSha256
    };
  } catch (error) {
    const terminalError =
      error instanceof CustomerReportEvidenceError
        ? error
        : isZodLikeError(error)
          ? new CustomerReportEvidenceError(
              "Report evidence or assembled output failed its strict contract.",
              "contract_mismatch"
            )
          : undefined;
    if (terminalError) {
      await markGenerationFailed(input.db, run.id, terminalError.failureCode, terminalError.message, now);
      throw terminalError;
    }
    throw error;
  }
}

async function claimGenerationRun(
  db: WorkerDb,
  data: CustomerReportGenerationJobData,
  now: Date
): Promise<ReportGenerationRunRow> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT "id" FROM "report_generation_runs"
      WHERE "id" = ${data.runId} AND "project_id" = ${data.projectId}
      FOR UPDATE
    `);
    const [run] = await tx
      .select()
      .from(reportGenerationRuns)
      .where(and(eq(reportGenerationRuns.id, data.runId), eq(reportGenerationRuns.projectId, data.projectId)))
      .limit(1);
    if (!run) throw new CustomerReportEvidenceError("Report generation run was not found.", "run_not_found");
    if (run.status === "succeeded") return run;
    if (!activeGenerationStatuses.includes(run.status as (typeof activeGenerationStatuses)[number])) return run;

    const [claimed] = await tx
      .update(reportGenerationRuns)
      .set({
        status: run.status === "queued" ? "assembling" : run.status,
        attemptCount: run.attemptCount + 1,
        startedAt: run.startedAt ?? now,
        failureCode: null,
        failureMessage: null,
        updatedAt: now
      })
      .where(and(eq(reportGenerationRuns.id, run.id), eq(reportGenerationRuns.status, run.status)))
      .returning();
    if (!claimed) throw new CustomerReportEvidenceError("Report generation claim was lost.", "run_claim_lost");
    return claimed;
  });
}

async function loadCustomerReportEvidencePacket(
  db: WorkerDb | DatabaseTransaction,
  run: ReportGenerationRunRow,
  assembledAt: Date
): Promise<CustomerReportEvidencePacket> {
  const [issue] = await db.select().from(reportIssues).where(eq(reportIssues.id, run.reportIssueId)).limit(1);
  if (!issue || issue.projectId !== run.projectId) {
    throw new CustomerReportEvidenceError("Report issue was not found for the generation run.", "issue_not_found");
  }
  const cutoff = run.evidenceCutoffAt;
  const periodDecision = decideCustomerReportGenerationWindow({
    period: issue.period,
    evidenceCutoffAt: cutoff,
    now: assembledAt
  });
  if (periodDecision.kind === "deny") {
    throw new CustomerReportEvidenceError(
      `Report evidence cutoff is outside the accepted monthly window: ${periodDecision.reason}.`,
      "invalid_evidence_window"
    );
  }
  const periodWindow = customerReportPeriodWindow(issue.period);
  const rankingFreshAfter = new Date(cutoff.getTime() - customerReportRankingProofMaxAgeDays * 24 * 60 * 60 * 1_000);
  const evidence: CustomerReportEvidenceItem[] = [];

  const rankingRows = await db
    .select()
    .from(rankingProofs)
    .where(
      and(
        eq(rankingProofs.projectId, run.projectId),
        eq(rankingProofs.status, "reviewed"),
        gte(rankingProofs.capturedAt, rankingFreshAfter),
        lte(rankingProofs.capturedAt, cutoff),
        lte(rankingProofs.updatedAt, cutoff),
        gte(rankingProofs.rank, 1),
        lte(rankingProofs.rank, 10)
      )
    )
    .orderBy(desc(rankingProofs.capturedAt), asc(rankingProofs.id))
    .limit(reportEvidenceLimits.rankingProofs);
  evidence.push(...rankingRows.map((row) => rankingEvidence(row, cutoff)));

  const latestPageVersionIds = db
    .selectDistinctOn([pageVersions.pageProposalId], {
      id: pageVersions.id,
      pageProposalId: pageVersions.pageProposalId
    })
    .from(pageVersions)
    .innerJoin(pageProposals, eq(pageVersions.pageProposalId, pageProposals.id))
    .where(
      and(
        eq(pageProposals.projectId, run.projectId),
        inArray(pageVersions.status, ["approved", "release_candidate", "released", "superseded"]),
        isNotNull(pageVersions.approvedAt),
        gte(pageVersions.approvedAt, periodWindow.startsAt),
        lt(pageVersions.approvedAt, periodWindow.endsAt),
        lte(pageVersions.approvedAt, cutoff),
        lte(pageVersions.updatedAt, cutoff)
      )
    )
    .orderBy(asc(pageVersions.pageProposalId), desc(pageVersions.versionNumber), asc(pageVersions.id))
    .as("latest_customer_report_page_version");
  const pageRows = await db
    .select({ version: pageVersions, proposal: pageProposals })
    .from(latestPageVersionIds)
    .innerJoin(pageVersions, eq(latestPageVersionIds.id, pageVersions.id))
    .innerJoin(pageProposals, eq(pageVersions.pageProposalId, pageProposals.id))
    .orderBy(desc(pageVersions.approvedAt), asc(pageVersions.id))
    .limit(reportEvidenceLimits.pageVersions);
  evidence.push(...pageRows.map((row) => pageVersionEvidence(row.version, row.proposal.route, run.projectId, cutoff)));

  const deploymentRows = await db
    .select({ deployment: deployments, releasePlan: releasePlans })
    .from(deployments)
    .innerJoin(releasePlans, eq(deployments.releasePlanId, releasePlans.id))
    .where(
      and(
        eq(deployments.projectId, run.projectId),
        inArray(deployments.status, ["provider_succeeded", "verifying", "live_healthy", "live_with_warnings"]),
        isNotNull(deployments.providerDeployId),
        isNotNull(releasePlans.deployedAt),
        gte(releasePlans.deployedAt, periodWindow.startsAt),
        lt(releasePlans.deployedAt, periodWindow.endsAt),
        lte(deployments.updatedAt, cutoff),
        lte(releasePlans.deployedAt, cutoff)
      )
    )
    .orderBy(desc(releasePlans.deployedAt), asc(deployments.id))
    .limit(reportEvidenceLimits.deployments);
  evidence.push(...deploymentRows.map((row) => deploymentEvidence(row.deployment, row.releasePlan, cutoff)));

  const latestVerificationIds = db
    .selectDistinctOn([releaseVerifications.deploymentId], {
      id: releaseVerifications.id,
      deploymentId: releaseVerifications.deploymentId,
      checkedAt: releaseVerifications.checkedAt
    })
    .from(releaseVerifications)
    .innerJoin(deployments, eq(releaseVerifications.deploymentId, deployments.id))
    .where(
      and(
        eq(deployments.projectId, run.projectId),
        isNotNull(releaseVerifications.deploymentId),
        inArray(releaseVerifications.status, ["live_healthy", "live_with_warnings"]),
        gte(releaseVerifications.checkedAt, periodWindow.startsAt),
        lte(releaseVerifications.updatedAt, cutoff),
        lte(deployments.updatedAt, cutoff),
        lte(releaseVerifications.checkedAt, cutoff)
      )
    )
    .orderBy(asc(releaseVerifications.deploymentId), desc(releaseVerifications.checkedAt), asc(releaseVerifications.id))
    .as("latest_customer_report_verification");
  const verificationRows = await db
    .select({ verification: releaseVerifications, deployment: deployments })
    .from(latestVerificationIds)
    .innerJoin(releaseVerifications, eq(latestVerificationIds.id, releaseVerifications.id))
    .innerJoin(deployments, eq(releaseVerifications.deploymentId, deployments.id))
    .orderBy(desc(releaseVerifications.checkedAt), asc(releaseVerifications.id))
    .limit(reportEvidenceLimits.verifications);
  evidence.push(...verificationRows.map((row) => verificationEvidence(row.verification, row.deployment, cutoff)));

  const verificationIds = verificationRows.map((row) => row.verification.id);
  const releasePlanIdByVerificationId = new Map(
    verificationRows.map((row) => [row.verification.id, row.verification.releasePlanId] as const)
  );
  if (verificationIds.length > 0) {
    const checkRows = await db
      .select()
      .from(releaseVerificationChecks)
      .where(
        and(
          inArray(releaseVerificationChecks.verificationId, verificationIds),
          inArray(releaseVerificationChecks.severity, ["warning", "blocker"]),
          inArray(releaseVerificationChecks.checkKey, customerSafeReleaseWarningCheckKeys),
          not(eq(releaseVerificationChecks.scope, "gsc")),
          eq(releaseVerificationChecks.result, "failed"),
          gte(releaseVerificationChecks.checkedAt, periodWindow.startsAt),
          lte(releaseVerificationChecks.updatedAt, cutoff),
          lte(releaseVerificationChecks.checkedAt, cutoff)
        )
      )
      .orderBy(desc(releaseVerificationChecks.checkedAt), asc(releaseVerificationChecks.id))
      .limit(reportEvidenceLimits.checks);
    evidence.push(
      ...checkRows.flatMap((row) => {
        const releasePlanId = releasePlanIdByVerificationId.get(row.verificationId);
        const item = releasePlanId ? verificationCheckEvidence(row, run.projectId, releasePlanId, cutoff) : undefined;
        return item ? [item] : [];
      })
    );
  }

  const rollbackRows = await db
    .select({ rollbackPoint: rollbackPoints, deployment: deployments })
    .from(rollbackPoints)
    .innerJoin(deployments, eq(rollbackPoints.releasePlanId, deployments.releasePlanId))
    .where(
      and(
        eq(rollbackPoints.projectId, run.projectId),
        eq(deployments.status, "rolled_back"),
        lte(rollbackPoints.updatedAt, cutoff),
        lte(deployments.updatedAt, cutoff)
      )
    )
    .orderBy(desc(rollbackPoints.updatedAt), asc(rollbackPoints.id))
    .limit(reportEvidenceLimits.rollbacks);
  for (const row of rollbackRows) {
    const item = rollbackEvidence(row.rollbackPoint, row.deployment, periodWindow.startsAt, cutoff);
    if (item) evidence.push(item);
  }

  const opportunityRows = await db
    .select()
    .from(opportunities)
    .where(
      and(
        eq(opportunities.projectId, run.projectId),
        eq(opportunities.classification, "near_term_target"),
        inArray(opportunities.status, ["new", "monitoring", "held", "brief_created"]),
        lte(opportunities.updatedAt, cutoff)
      )
    )
    .orderBy(desc(opportunities.score), asc(opportunities.id))
    .limit(reportEvidenceLimits.opportunities);
  evidence.push(...opportunityRows.map((row) => opportunityEvidence(row, cutoff)));

  return CustomerReportEvidencePacketSchema.parse({
    schemaVersion: "customer_report_evidence_packet.v1",
    identity: {
      projectId: issue.projectId,
      reportKind: issue.reportKind,
      period: issue.period,
      locale: issue.locale,
      timezone: issue.timezone
    },
    assembledAt: assembledAt.toISOString(),
    evidenceCutoffAt: cutoff.toISOString(),
    evidence
  });
}

function rankingEvidence(
  row: typeof rankingProofs.$inferSelect,
  cutoff: Date
): Extract<CustomerReportEvidenceItem, { sourceKind: "ranking_proof" }> {
  const payload = {
    sourceKind: "ranking_proof",
    id: row.id,
    projectId: row.projectId,
    query: row.query,
    pageUrl: row.pageUrl,
    rank: row.rank,
    capturedAt: row.capturedAt.toISOString(),
    searchEngine: row.searchEngine,
    device: row.device,
    locale: row.locale ?? "de-DE",
    status: row.status
  };
  const digest = sourceDigest(payload);
  return RankingReportEvidenceSchema.parse({
    evidenceKey: `ranking_proof:${row.id}`,
    projectId: row.projectId,
    sourceId: row.id,
    sourceVersion: digest,
    observedAt: row.capturedAt.toISOString(),
    selectedAtCutoff: cutoff.toISOString(),
    payloadSha256: digest,
    customerLabel: `Ranking für ${row.query}`,
    sourceKind: "ranking_proof",
    proofTier: "customer_safe_proof",
    query: row.query,
    pageUrl: row.pageUrl,
    rank: row.rank,
    searchEngine: row.searchEngine,
    device: row.device,
    locale: row.locale ?? "de-DE",
    status: "reviewed"
  });
}

function pageVersionEvidence(
  row: typeof pageVersions.$inferSelect,
  route: string,
  projectId: string,
  cutoff: Date
): Extract<CustomerReportEvidenceItem, { sourceKind: "page_version" }> {
  if (!row.approvedAt) {
    throw new CustomerReportEvidenceError(`Page version ${row.id} has no approval timestamp.`, "invalid_page_version");
  }
  const payload = {
    sourceKind: "page_version",
    id: row.id,
    projectId,
    route,
    versionNumber: row.versionNumber,
    status: row.status,
    approvedAt: row.approvedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
  const digest = sourceDigest(payload);
  return PageVersionReportEvidenceSchema.parse({
    evidenceKey: `page_version:${row.id}`,
    projectId,
    sourceId: row.id,
    sourceVersion: digest,
    observedAt: row.updatedAt.toISOString(),
    selectedAtCutoff: cutoff.toISOString(),
    payloadSha256: digest,
    customerLabel: `Seite ${route}`,
    sourceKind: "page_version",
    proofTier: "customer_safe_proof",
    pageVersionId: row.id,
    route,
    versionNumber: row.versionNumber,
    status: row.status,
    approvedAt: row.approvedAt.toISOString()
  });
}

function deploymentEvidence(
  deployment: typeof deployments.$inferSelect,
  releasePlan: typeof releasePlans.$inferSelect,
  cutoff: Date
): Extract<CustomerReportEvidenceItem, { sourceKind: "deployment" }> {
  if (!deployment.providerDeployId || !releasePlan.deployedAt) {
    throw new CustomerReportEvidenceError(
      `Deployment ${deployment.id} lacks provider handoff evidence.`,
      "invalid_deployment_evidence"
    );
  }
  const payload = {
    sourceKind: "deployment",
    id: deployment.id,
    projectId: deployment.projectId,
    releasePlanId: releasePlan.id,
    provider: deployment.provider,
    providerDeployId: deployment.providerDeployId,
    status: deployment.status,
    handedOffAt: releasePlan.deployedAt.toISOString()
  };
  const digest = sourceDigest(payload);
  return DeploymentReportEvidenceSchema.parse({
    evidenceKey: `deployment:${deployment.id}`,
    projectId: deployment.projectId,
    sourceId: deployment.id,
    sourceVersion: digest,
    observedAt: releasePlan.deployedAt.toISOString(),
    selectedAtCutoff: cutoff.toISOString(),
    payloadSha256: digest,
    customerLabel: `Provider-Uebergabe ${deployment.provider}`,
    sourceKind: "deployment",
    proofTier: "customer_safe_proof",
    deploymentId: deployment.id,
    releasePlanId: releasePlan.id,
    provider: deployment.provider,
    providerDeployId: deployment.providerDeployId,
    status: deployment.status,
    handedOffAt: releasePlan.deployedAt.toISOString()
  });
}

function verificationEvidence(
  verification: typeof releaseVerifications.$inferSelect,
  deployment: typeof deployments.$inferSelect,
  cutoff: Date
): Extract<CustomerReportEvidenceItem, { sourceKind: "release_verification" }> {
  if (!verification.deploymentId) {
    throw new CustomerReportEvidenceError(
      `Verification ${verification.id} lacks deployment evidence.`,
      "invalid_verification_evidence"
    );
  }
  const payload = {
    sourceKind: "release_verification",
    id: verification.id,
    projectId: deployment.projectId,
    releasePlanId: verification.releasePlanId,
    deploymentId: verification.deploymentId,
    status: verification.status,
    checkedAt: verification.checkedAt.toISOString()
  };
  const digest = sourceDigest(payload);
  return ReleaseVerificationReportEvidenceSchema.parse({
    evidenceKey: `release_verification:${verification.id}`,
    projectId: deployment.projectId,
    sourceId: verification.id,
    sourceVersion: digest,
    observedAt: verification.checkedAt.toISOString(),
    selectedAtCutoff: cutoff.toISOString(),
    payloadSha256: digest,
    customerLabel: "Live-Prüfung",
    sourceKind: "release_verification",
    proofTier: "customer_safe_proof",
    verificationId: verification.id,
    deploymentId: verification.deploymentId,
    releasePlanId: verification.releasePlanId,
    status: verification.status,
    checkedAt: verification.checkedAt.toISOString()
  });
}

function verificationCheckEvidence(
  row: typeof releaseVerificationChecks.$inferSelect,
  projectId: string,
  releasePlanId: string,
  cutoff: Date
): Extract<CustomerReportEvidenceItem, { sourceKind: "release_verification_check" }> | undefined {
  const customerCopy = customerSafeReleaseWarningForCheck(row.checkKey, row.scope);
  if (!customerCopy) return undefined;
  const payload = {
    sourceKind: "release_verification_check",
    id: row.id,
    projectId,
    releasePlanId,
    verificationId: row.verificationId,
    checkKey: row.checkKey,
    scope: row.scope,
    severity: row.severity,
    result: row.result,
    message: row.message,
    checkedAt: row.checkedAt.toISOString()
  };
  const digest = sourceDigest(payload);
  return ReleaseVerificationCheckReportEvidenceSchema.parse({
    evidenceKey: `release_verification_check:${row.id}`,
    projectId,
    sourceId: row.id,
    sourceVersion: digest,
    observedAt: row.checkedAt.toISOString(),
    selectedAtCutoff: cutoff.toISOString(),
    payloadSha256: digest,
    customerLabel: customerCopy.title,
    sourceKind: "release_verification_check",
    proofTier: "customer_safe_proof",
    verificationId: row.verificationId,
    releasePlanId,
    checkKey: row.checkKey,
    severity: row.severity,
    result: "failed",
    summary: customerCopy.summary,
    checkedAt: row.checkedAt.toISOString()
  });
}

function rollbackEvidence(
  rollbackPoint: typeof rollbackPoints.$inferSelect,
  deployment: typeof deployments.$inferSelect,
  periodStartsAt: Date,
  cutoff: Date
): Extract<CustomerReportEvidenceItem, { sourceKind: "rollback" }> | undefined {
  const raw = recordFromUnknown(rollbackPoint.evidenceJson).rollbackExecution;
  const parsed = CustomerReportCompletedRollbackEvidenceSchema.safeParse(raw);
  if (!parsed.success || !rollbackPoint.deploymentId) {
    return undefined;
  }
  if (
    Date.parse(parsed.data.executedAt) < periodStartsAt.getTime() ||
    Date.parse(parsed.data.executedAt) > cutoff.getTime()
  ) {
    return undefined;
  }
  const payload = {
    sourceKind: "rollback",
    id: rollbackPoint.id,
    projectId: rollbackPoint.projectId,
    releasePlanId: rollbackPoint.releasePlanId,
    deploymentId: deployment.id,
    restoreSourceDeploymentId: rollbackPoint.deploymentId,
    status: parsed.data.status,
    rolledBackAt: parsed.data.executedAt,
    providerDeployId: parsed.data.providerDeployId
  };
  const digest = sourceDigest(payload);
  return RollbackReportEvidenceSchema.parse({
    evidenceKey: `rollback:${rollbackPoint.id}`,
    projectId: rollbackPoint.projectId,
    sourceId: rollbackPoint.id,
    sourceVersion: digest,
    observedAt: parsed.data.executedAt,
    selectedAtCutoff: cutoff.toISOString(),
    payloadSha256: digest,
    customerLabel: "Rollback-Korrektur",
    sourceKind: "rollback",
    proofTier: "customer_safe_proof",
    rollbackPointId: rollbackPoint.id,
    deploymentId: deployment.id,
    releasePlanId: rollbackPoint.releasePlanId,
    status: "rolled_back",
    rolledBackAt: parsed.data.executedAt
  });
}

function opportunityEvidence(
  row: typeof opportunities.$inferSelect,
  cutoff: Date
): Extract<CustomerReportEvidenceItem, { sourceKind: "opportunity" }> {
  const payload = {
    sourceKind: "opportunity",
    id: row.id,
    projectId: row.projectId,
    classification: row.classification,
    status: row.status,
    title: row.primaryKeyword,
    score: row.score,
    updatedAt: row.updatedAt.toISOString()
  };
  const digest = sourceDigest(payload);
  return OpportunityReportEvidenceSchema.parse({
    evidenceKey: `opportunity:${row.id}`,
    projectId: row.projectId,
    sourceId: row.id,
    sourceVersion: digest,
    observedAt: row.updatedAt.toISOString(),
    selectedAtCutoff: cutoff.toISOString(),
    payloadSha256: digest,
    customerLabel: row.primaryKeyword,
    sourceKind: "opportunity",
    proofTier: "supporting_context",
    opportunityId: row.id,
    classification: row.classification,
    status: row.status,
    title: row.primaryKeyword
  });
}

async function persistEvidencePacket(
  db: WorkerDb,
  run: ReportGenerationRunRow,
  canonicalText: string,
  digest: string,
  now: Date
): Promise<void> {
  const [updated] = await db
    .update(reportGenerationRuns)
    .set({
      evidencePacketCanonicalText: canonicalText,
      evidencePacketSha256: digest,
      updatedAt: now
    })
    .where(
      and(
        eq(reportGenerationRuns.id, run.id),
        eq(reportGenerationRuns.projectId, run.projectId),
        inArray(reportGenerationRuns.status, activeGenerationStatuses)
      )
    )
    .returning({ id: reportGenerationRuns.id });
  if (!updated) {
    throw new CustomerReportEvidenceError("Report generation changed before packet persistence.", "packet_cas_lost");
  }
}

async function persistGeneratedDraft(
  db: WorkerDb,
  initialRun: ReportGenerationRunRow,
  snapshotInput: unknown,
  now: Date
): Promise<
  | {
      kind: "persisted" | "replayed";
      reportIssueId: string;
      reportId: string;
      snapshotSha256: string;
    }
  | {
      kind: "stale";
      reportIssueId: string;
      reason: string;
    }
> {
  const prepared = prepareSnapshot(snapshotInput);
  return db.transaction(async (tx) => {
    await lockReportIssue(tx, initialRun.reportIssueId);
    await lockReportGenerationRun(tx, initialRun.projectId, initialRun.id);
    const [run] = await tx
      .select()
      .from(reportGenerationRuns)
      .where(and(eq(reportGenerationRuns.id, initialRun.id), eq(reportGenerationRuns.projectId, initialRun.projectId)))
      .limit(1);
    if (!run) throw new CustomerReportEvidenceError("Report generation run disappeared.", "run_not_found");
    if (run.status === "succeeded" && run.resultReportId) {
      const [existing] = await tx.select().from(reports).where(eq(reports.id, run.resultReportId)).limit(1);
      if (!existing || existing.snapshotSha256 !== prepared.snapshotSha256) {
        throw new CustomerReportEvidenceError(
          "Completed report generation does not match the assembled snapshot.",
          "completed_digest_mismatch"
        );
      }
      return persistedDraft("replayed", existing);
    }
    if (!activeGenerationStatuses.includes(run.status as (typeof activeGenerationStatuses)[number])) {
      throw new CustomerReportEvidenceError(`Report generation run is already ${run.status}.`, "invalid_run_status");
    }

    const [issue] = await tx.select().from(reportIssues).where(eq(reportIssues.id, run.reportIssueId)).limit(1);
    if (!issue || issue.projectId !== run.projectId) {
      throw new CustomerReportEvidenceError("Report issue was not found for this project.", "issue_not_found");
    }
    assertSnapshotMatchesRun(prepared.snapshot, issue, run);
    const refreshedPacket = await loadCustomerReportEvidencePacket(tx, run, new Date(prepared.snapshot.generatedAt));
    if (
      !run.evidencePacketCanonicalText ||
      canonicalizeCustomerReportEvidencePacket(refreshedPacket) !== run.evidencePacketCanonicalText
    ) {
      const reason = "Customer report evidence changed before draft persistence.";
      await tx
        .update(reportGenerationRuns)
        .set({
          status: "stale",
          failureCode: "evidence_changed_before_persistence",
          failureMessage: reason,
          finishedAt: now,
          updatedAt: now
        })
        .where(
          and(eq(reportGenerationRuns.id, run.id), inArray(reportGenerationRuns.status, activeGenerationStatuses))
        );
      return { kind: "stale", reportIssueId: issue.id, reason };
    }
    const staleReason = await generationStaleReason(tx, issue, run);
    if (staleReason) {
      await tx
        .update(reportGenerationRuns)
        .set({
          status: "stale",
          failureCode: "stale_generation_base",
          failureMessage: staleReason,
          finishedAt: now,
          updatedAt: now
        })
        .where(
          and(eq(reportGenerationRuns.id, run.id), inArray(reportGenerationRuns.status, activeGenerationStatuses))
        );
      return { kind: "stale", reportIssueId: issue.id, reason: staleReason };
    }

    const [validating] = await tx
      .update(reportGenerationRuns)
      .set({ status: "validating", updatedAt: now })
      .where(and(eq(reportGenerationRuns.id, run.id), inArray(reportGenerationRuns.status, activeGenerationStatuses)))
      .returning({ id: reportGenerationRuns.id });
    if (!validating) {
      throw new CustomerReportEvidenceError("Report generation changed before validation.", "validation_cas_lost");
    }

    const currentCandidate = await loadCurrentCandidate(tx, issue);
    let persisted: ReportRow;
    if (!currentCandidate) {
      const [latest] = await tx
        .select({ versionNumber: reports.versionNumber })
        .from(reports)
        .where(eq(reports.reportIssueId, issue.id))
        .orderBy(sql`${reports.versionNumber} desc`)
        .limit(1);
      const [created] = await tx
        .insert(reports)
        .values(reportValues(prepared.snapshot, prepared, run, issue, (latest?.versionNumber ?? 0) + 1))
        .returning();
      if (!created) throw new Error("Failed to create the report draft.");
      persisted = created;
    } else {
      await deleteReportProjection(tx, currentCandidate.id);
      const [updated] = await tx
        .update(reports)
        .set({
          ...reportSnapshotValues(prepared.snapshot, prepared, run),
          rowVersion: currentCandidate.rowVersion + 1,
          updatedAt: now
        })
        .where(
          and(
            eq(reports.id, currentCandidate.id),
            eq(reports.status, "draft"),
            eq(reports.rowVersion, currentCandidate.rowVersion),
            eq(reports.snapshotSha256, currentCandidate.snapshotSha256)
          )
        )
        .returning();
      if (!updated) {
        throw new CustomerReportEvidenceError("Report draft changed before completion.", "draft_cas_lost");
      }
      persisted = updated;
    }

    await persistReportProjection(tx, persisted, prepared.snapshot);
    const [updatedIssue] = await tx
      .update(reportIssues)
      .set({ currentCandidateReportId: persisted.id, rowVersion: issue.rowVersion + 1, updatedAt: now })
      .where(and(eq(reportIssues.id, issue.id), eq(reportIssues.rowVersion, issue.rowVersion)))
      .returning({ id: reportIssues.id });
    if (!updatedIssue)
      throw new CustomerReportEvidenceError("Report issue changed before completion.", "issue_cas_lost");

    const [completedRun] = await tx
      .update(reportGenerationRuns)
      .set({
        status: "succeeded",
        resultReportId: persisted.id,
        failureCode: null,
        failureMessage: null,
        finishedAt: now,
        updatedAt: now
      })
      .where(and(eq(reportGenerationRuns.id, run.id), eq(reportGenerationRuns.status, "validating")))
      .returning({ id: reportGenerationRuns.id });
    if (!completedRun) {
      throw new CustomerReportEvidenceError("Report generation changed before completion.", "completion_cas_lost");
    }
    await tx.insert(reportLifecycleEvents).values({
      projectId: run.projectId,
      reportIssueId: issue.id,
      reportId: persisted.id,
      generationRunId: run.id,
      eventType: "report_generated",
      fromStatus: currentCandidate ? "draft" : null,
      toStatus: "draft",
      actorType: "system",
      requestId: run.id,
      snapshotSha256: persisted.snapshotSha256,
      occurredAt: now
    });
    return persistedDraft("persisted", persisted);
  });
}

function prepareSnapshot(input: unknown): {
  snapshot: CustomerReportSnapshot;
  snapshotCanonicalText: string;
  snapshotSha256: string;
  factProjectionSha256: string;
} {
  const snapshot = CustomerReportSnapshotSchema.parse(input);
  const eligibility = decideCustomerReportSnapshotEligibility(snapshot);
  if (eligibility.kind === "ineligible") {
    throw new CustomerReportEvidenceError(
      `Customer report snapshot contains ineligible claims: ${JSON.stringify(eligibility.claims)}`,
      "ineligible_claims"
    );
  }
  const factProjectionSha256 = sha256(canonicalizeCustomerReportFactProjection(snapshot.factProjection));
  if (snapshot.factProjectionSha256 !== factProjectionSha256) {
    throw new CustomerReportEvidenceError(
      "Customer report fact projection digest does not match its canonical facts.",
      "fact_projection_digest_mismatch"
    );
  }
  const snapshotCanonicalText = canonicalizeCustomerReportSnapshot(snapshot);
  return {
    snapshot,
    snapshotCanonicalText,
    snapshotSha256: sha256(snapshotCanonicalText),
    factProjectionSha256
  };
}

function assertSnapshotMatchesRun(
  snapshot: CustomerReportSnapshot,
  issue: ReportIssueRow,
  run: ReportGenerationRunRow
): void {
  if (
    snapshot.identity.projectId !== issue.projectId ||
    snapshot.identity.reportKind !== issue.reportKind ||
    snapshot.identity.period !== issue.period ||
    snapshot.identity.locale !== issue.locale ||
    snapshot.identity.timezone !== issue.timezone ||
    snapshot.evidenceCutoffAt !== run.evidenceCutoffAt.toISOString() ||
    snapshot.schemaVersion !== run.reportSchemaVersion ||
    snapshot.assemblerVersion !== run.assemblerVersion ||
    snapshot.eligibilityPolicyVersion !== run.eligibilityPolicyVersion ||
    snapshot.actionSelectionPolicyVersion !== run.actionSelectionPolicyVersion ||
    snapshot.narrativeMode !== run.narrativeMode
  ) {
    throw new CustomerReportEvidenceError(
      "Customer report snapshot does not match its issue or generation policy.",
      "snapshot_run_mismatch"
    );
  }
}

async function generationStaleReason(
  tx: DatabaseTransaction,
  issue: ReportIssueRow,
  run: ReportGenerationRunRow
): Promise<string | undefined> {
  if (issue.rowVersion !== run.baseIssueRowVersion) return "The report issue changed after generation admission.";
  if (issue.currentCandidateReportId !== run.baseCandidateReportId) {
    return "The current report candidate changed after generation admission.";
  }
  if (issue.currentPublishedReportId !== run.correctionPredecessorReportId) {
    return "The published report changed after correction generation admission.";
  }
  if (!run.baseCandidateReportId) return undefined;
  const [candidate] = await tx.select().from(reports).where(eq(reports.id, run.baseCandidateReportId)).limit(1);
  if (
    !candidate ||
    candidate.status !== "draft" ||
    candidate.rowVersion !== run.baseCandidateRowVersion ||
    candidate.snapshotSha256 !== run.baseCandidateSnapshotSha256
  ) {
    return "The report draft was reviewed or regenerated after generation admission.";
  }
  return undefined;
}

async function loadCurrentCandidate(tx: DatabaseTransaction, issue: ReportIssueRow): Promise<ReportRow | undefined> {
  if (!issue.currentCandidateReportId) return undefined;
  const [candidate] = await tx
    .select()
    .from(reports)
    .where(and(eq(reports.id, issue.currentCandidateReportId), eq(reports.reportIssueId, issue.id)))
    .limit(1);
  if (!candidate || (candidate.status !== "draft" && candidate.status !== "ready_for_review")) {
    throw new CustomerReportEvidenceError(
      "Report issue candidate pointer does not reference an open candidate.",
      "invalid_candidate_pointer"
    );
  }
  return candidate;
}

function reportValues(
  snapshot: CustomerReportSnapshot,
  prepared: ReturnType<typeof prepareSnapshot>,
  run: ReportGenerationRunRow,
  issue: ReportIssueRow,
  versionNumber: number
): typeof reports.$inferInsert {
  return {
    projectId: issue.projectId,
    reportIssueId: issue.id,
    versionNumber,
    status: "draft",
    ...reportSnapshotValues(snapshot, prepared, run),
    supersedesReportId: run.correctionPredecessorReportId,
    correctionReason: run.correctionReason,
    createdByActorType: "system",
    createdByUserId: run.requestedByUserId
  };
}

function reportSnapshotValues(
  snapshot: CustomerReportSnapshot,
  prepared: ReturnType<typeof prepareSnapshot>,
  run: ReportGenerationRunRow
) {
  return {
    snapshotCanonicalText: prepared.snapshotCanonicalText,
    snapshotSha256: prepared.snapshotSha256,
    factProjectionSha256: prepared.factProjectionSha256,
    schemaVersion: snapshot.schemaVersion,
    assemblerVersion: snapshot.assemblerVersion,
    eligibilityPolicyVersion: snapshot.eligibilityPolicyVersion,
    actionSelectionPolicyVersion: snapshot.actionSelectionPolicyVersion,
    narrativePolicyVersion: snapshot.narrativePolicyVersion,
    templateVersion: snapshot.templateVersion,
    narrativeMode: snapshot.narrativeMode,
    sourceGenerationRunId: run.id,
    sourceAgentRunId: null,
    reviewedSnapshotSha256: null,
    readyAt: null
  } as const;
}

async function persistReportProjection(
  tx: DatabaseTransaction,
  report: ReportRow,
  snapshot: CustomerReportSnapshot
): Promise<void> {
  const projection = normalizeCustomerReportFactProjection(snapshot.factProjection);
  const claimIds = new Map<string, string>();
  const evidenceIds = new Map<string, string>();
  if (projection.claims.length > 0) {
    await tx.insert(reportClaims).values(
      projection.claims.map((claim, ordinal) => {
        const id = randomUUID();
        claimIds.set(claim.claimKey, id);
        return {
          id,
          reportId: report.id,
          projectId: report.projectId,
          claimKey: claim.claimKey,
          claimKind: claim.kind,
          section: claim.section,
          ordinal,
          claimJson: claim
        };
      })
    );
  }
  if (projection.evidence.length > 0) {
    await tx.insert(reportEvidenceItems).values(
      projection.evidence.map((evidence) => {
        const id = randomUUID();
        evidenceIds.set(evidence.evidenceKey, id);
        return {
          id,
          reportId: report.id,
          projectId: report.projectId,
          evidenceKey: evidence.evidenceKey,
          sourceKind: evidence.sourceKind,
          sourceId: evidence.sourceId,
          sourceVersion: evidence.sourceVersion,
          proofTier: evidence.proofTier,
          observedAt: new Date(evidence.observedAt),
          selectedAtCutoff: new Date(evidence.selectedAtCutoff),
          payloadSha256: evidence.payloadSha256,
          ...evidenceSourceReferences(evidence),
          evidenceJson: evidence
        };
      })
    );
  }
  const links = projection.claims.flatMap((claim) =>
    claim.evidenceKeys.map((evidenceKey) => ({
      reportId: report.id,
      projectId: report.projectId,
      claimId: requiredMapValue(claimIds, claim.claimKey),
      evidenceId: requiredMapValue(evidenceIds, evidenceKey)
    }))
  );
  if (links.length > 0) await tx.insert(reportClaimEvidence).values(links);
}

async function deleteReportProjection(tx: DatabaseTransaction, reportId: string): Promise<void> {
  await tx.delete(reportClaimEvidence).where(eq(reportClaimEvidence.reportId, reportId));
  await tx.delete(reportClaims).where(eq(reportClaims.reportId, reportId));
  await tx.delete(reportEvidenceItems).where(eq(reportEvidenceItems.reportId, reportId));
}

async function lockReportIssue(tx: DatabaseTransaction, reportIssueId: string): Promise<void> {
  await tx.execute(sql`SELECT "id" FROM "report_issues" WHERE "id" = ${reportIssueId} FOR UPDATE`);
}

async function lockReportGenerationRun(tx: DatabaseTransaction, projectId: string, runId: string): Promise<void> {
  await tx.execute(sql`
    SELECT "id" FROM "report_generation_runs"
    WHERE "id" = ${runId} AND "project_id" = ${projectId}
    FOR UPDATE
  `);
}

async function markGenerationFailed(
  db: WorkerDb,
  runId: string,
  failureCode: string,
  failureMessage: string,
  now: Date
): Promise<void> {
  await db
    .update(reportGenerationRuns)
    .set({ status: "failed", failureCode, failureMessage, finishedAt: now, updatedAt: now })
    .where(and(eq(reportGenerationRuns.id, runId), inArray(reportGenerationRuns.status, activeGenerationStatuses)));
}

function evidenceSourceReferences(evidence: CustomerReportEvidenceItem) {
  switch (evidence.sourceKind) {
    case "ranking_proof":
      return { rankingProofId: evidence.sourceId };
    case "page_version":
      return { pageVersionId: evidence.pageVersionId };
    case "deployment":
      return { deploymentId: evidence.deploymentId };
    case "release_verification":
      return { releaseVerificationId: evidence.verificationId };
    case "release_verification_check":
      return { releaseVerificationCheckId: evidence.sourceId, releaseVerificationId: evidence.verificationId };
    case "rollback":
      return { rollbackPointId: evidence.rollbackPointId };
    case "opportunity":
      return { opportunityId: evidence.opportunityId };
  }
}

function persistedDraft(kind: "persisted" | "replayed", report: ReportRow) {
  return {
    kind,
    reportIssueId: report.reportIssueId,
    reportId: report.id,
    snapshotSha256: report.snapshotSha256
  } as const;
}

function requiredMapValue(map: Map<string, string>, key: string): string {
  const value = map.get(key);
  if (!value) throw new Error(`Missing report projection id for ${key}.`);
  return value;
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function sourceDigest(payload: unknown): string {
  return sha256(canonicalizeCustomerReportSourcePayload(payload));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isZodLikeError(error: unknown): boolean {
  return error instanceof Error && error.name === "ZodError";
}
