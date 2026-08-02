import { createHash, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Module,
  UnprocessableEntityException
} from "@nestjs/common";
import {
  CustomerReportClaimSchema,
  CustomerReportDecisionNoteSchema,
  CustomerReportEvidenceItemSchema,
  CustomerReportIdentitySchema,
  CustomerReportNarrativeModeSchema,
  CustomerReportSnapshotSchema,
  type CustomerReportIdentity,
  type CustomerReportNarrativeMode,
  type CustomerReportSnapshot
} from "@localseo/contracts";
import {
  canonicalizeCustomerReportFactProjection,
  canonicalizeCustomerReportSnapshot,
  decideCustomerReportSnapshotEligibility,
  decideCustomerReportTransition,
  normalizeCustomerReportFactProjection
} from "@localseo/domain";
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
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service.js";

const reportVersions = {
  assemblerVersion: "customer_report_assembler.v1",
  reportSchemaVersion: "customer_report_snapshot.v1",
  eligibilityPolicyVersion: "customer_report_eligibility.v1",
  actionSelectionPolicyVersion: "customer_report_actions.v1",
  customerSafetyPolicyVersion: "customer_report_safety.v1"
} as const;

type DatabaseTransaction = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];
type ReportIssueRow = typeof reportIssues.$inferSelect;
type ReportGenerationRunRow = typeof reportGenerationRuns.$inferSelect;
type ReportRow = typeof reports.$inferSelect;

export type CustomerReportGenerationAdmission = {
  kind: "created" | "already_active" | "replayed";
  reportIssueId: string;
  runId: string;
  status: ReportGenerationRunRow["status"];
};

export type CustomerReportDraftPersistence =
  | {
      kind: "persisted" | "replayed";
      reportIssueId: string;
      reportId: string;
      reportVersion: number;
      reportRowVersion: number;
      snapshotSha256: string;
    }
  | { kind: "stale"; reportIssueId: string; runId: string; reason: string };

export type CustomerReportReviewTransition = {
  kind: "applied" | "replayed";
  reportId: string;
  status: ReportRow["status"];
  rowVersion: number;
  snapshotSha256: string;
};

@Injectable()
export class ReportsService {
  constructor(private readonly database: DatabaseService) {}

  async admitGeneration(input: {
    identity: CustomerReportIdentity;
    requestedByUserId: string;
    idempotencyKey: string;
    evidenceCutoffAt: string;
    narrativeMode?: CustomerReportNarrativeMode;
  }): Promise<CustomerReportGenerationAdmission> {
    const identity = CustomerReportIdentitySchema.parse(input.identity);
    requireUuid(input.requestedByUserId, "Report generation requires a persisted user id.");
    requireUuid(input.idempotencyKey, "Report generation idempotency key must be a UUID.");
    const evidenceCutoffAt = parseTimestamp(input.evidenceCutoffAt, "Report evidence cutoff must be an ISO timestamp.");
    const narrativeMode = CustomerReportNarrativeModeSchema.parse(input.narrativeMode ?? "fact_only");
    const db = this.database.requireDb();
    let admission: CustomerReportGenerationAdmission | undefined;

    await db.transaction(async (tx) => {
      await tx
        .insert(reportIssues)
        .values({
          projectId: identity.projectId,
          reportKind: identity.reportKind,
          period: identity.period,
          locale: identity.locale,
          timezone: identity.timezone,
          createdByUserId: input.requestedByUserId
        })
        .onConflictDoNothing();

      const issue = await lockAndLoadReportIssueByIdentity(tx, identity);
      if (!issue) {
        throw new Error("Failed to create or load the report issue.");
      }

      const [replayed] = await tx
        .select()
        .from(reportGenerationRuns)
        .where(
          and(
            eq(reportGenerationRuns.projectId, identity.projectId),
            eq(reportGenerationRuns.idempotencyKey, input.idempotencyKey)
          )
        )
        .limit(1);
      if (replayed) {
        if (
          replayed.reportIssueId !== issue.id ||
          replayed.requestedByUserId !== input.requestedByUserId ||
          replayed.evidenceCutoffAt.getTime() !== evidenceCutoffAt.getTime() ||
          replayed.narrativeMode !== narrativeMode
        ) {
          throw new ConflictException("Report generation idempotency key belongs to another request.");
        }
        admission = generationAdmission("replayed", replayed);
        return;
      }

      const [active] = await tx
        .select()
        .from(reportGenerationRuns)
        .where(
          and(
            eq(reportGenerationRuns.reportIssueId, issue.id),
            inArray(reportGenerationRuns.status, ["queued", "assembling", "narrative_running", "validating"])
          )
        )
        .limit(1);
      if (active) {
        admission = generationAdmission("already_active", active);
        return;
      }

      const baseCandidate = await loadCurrentCandidate(tx, issue);
      if (baseCandidate?.status === "ready_for_review") {
        throw new ConflictException("Return the reviewed report candidate to draft before regenerating it.");
      }
      const runId = randomUUID();
      const [created] = await tx
        .insert(reportGenerationRuns)
        .values({
          id: runId,
          projectId: identity.projectId,
          reportIssueId: issue.id,
          status: "queued",
          narrativeMode,
          idempotencyKey: input.idempotencyKey,
          queueJobId: runId,
          requestedByUserId: input.requestedByUserId,
          baseIssueRowVersion: issue.rowVersion,
          baseCandidateReportId: baseCandidate?.id,
          baseCandidateRowVersion: baseCandidate?.rowVersion,
          baseCandidateSnapshotSha256: baseCandidate?.snapshotSha256,
          evidenceCutoffAt,
          ...reportVersions
        })
        .returning();
      if (!created) {
        throw new Error("Failed to create the report generation run.");
      }

      admission = generationAdmission("created", created);
    });

    if (!admission) {
      throw new Error("Report generation admission produced no result.");
    }
    return admission;
  }

  async persistGeneratedDraft(input: {
    projectId: string;
    runId: string;
    snapshot: unknown;
  }): Promise<CustomerReportDraftPersistence> {
    requireUuid(input.projectId, "Report project id must be a UUID.");
    requireUuid(input.runId, "Report generation run id must be a UUID.");
    const prepared = prepareSnapshot(input.snapshot);
    const db = this.database.requireDb();
    const [initialRun] = await db
      .select()
      .from(reportGenerationRuns)
      .where(and(eq(reportGenerationRuns.id, input.runId), eq(reportGenerationRuns.projectId, input.projectId)))
      .limit(1);
    if (!initialRun) {
      throw new BadRequestException("Report generation run was not found for this project.");
    }

    let result: CustomerReportDraftPersistence | undefined;
    await db.transaction(async (tx) => {
      await lockReportIssue(tx, initialRun.reportIssueId);
      await lockReportGenerationRun(tx, input.projectId, input.runId);
      const [run] = await tx
        .select()
        .from(reportGenerationRuns)
        .where(and(eq(reportGenerationRuns.id, input.runId), eq(reportGenerationRuns.projectId, input.projectId)))
        .limit(1);
      if (!run) {
        throw new BadRequestException("Report generation run was not found for this project.");
      }

      if (run.status === "succeeded" && run.resultReportId) {
        const [existing] = await tx.select().from(reports).where(eq(reports.id, run.resultReportId)).limit(1);
        if (!existing || existing.snapshotSha256 !== prepared.snapshotSha256) {
          throw new ConflictException("Completed report generation does not match the submitted snapshot digest.");
        }
        result = persistedDraft("replayed", existing);
        return;
      }
      if (!isActiveGenerationStatus(run.status)) {
        throw new ConflictException(`Report generation run is already ${run.status}.`);
      }

      const [issue] = await tx.select().from(reportIssues).where(eq(reportIssues.id, run.reportIssueId)).limit(1);
      if (!issue || issue.projectId !== input.projectId) {
        throw new BadRequestException("Report issue was not found for this project.");
      }

      assertSnapshotMatchesRun(prepared.snapshot, issue, run);
      await assertEvidenceSourcesBelongToProject(tx, input.projectId, prepared.snapshot);

      const staleReason = await generationStaleReason(tx, issue, run);
      if (staleReason) {
        await tx
          .update(reportGenerationRuns)
          .set({
            status: "stale",
            failureCode: "stale_generation_base",
            failureMessage: staleReason,
            finishedAt: new Date(),
            updatedAt: new Date()
          })
          .where(eq(reportGenerationRuns.id, run.id));
        result = { kind: "stale", reportIssueId: issue.id, runId: run.id, reason: staleReason };
        return;
      }

      if (run.status !== "validating") {
        const [validating] = await tx
          .update(reportGenerationRuns)
          .set({ status: "validating", startedAt: run.startedAt ?? new Date(), updatedAt: new Date() })
          .where(and(eq(reportGenerationRuns.id, run.id), eq(reportGenerationRuns.status, run.status)))
          .returning({ id: reportGenerationRuns.id });
        if (!validating) {
          throw new ConflictException("Report generation status changed before validation.");
        }
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
        if (!created) {
          throw new Error("Failed to create the report draft.");
        }
        persisted = created;
      } else {
        await deleteReportProjection(tx, currentCandidate.id);
        const [updated] = await tx
          .update(reports)
          .set({
            ...reportSnapshotValues(prepared.snapshot, prepared, run),
            rowVersion: currentCandidate.rowVersion + 1,
            updatedAt: new Date()
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
          throw new ConflictException("Report draft changed before generation completion.");
        }
        persisted = updated;
      }

      await persistReportProjection(tx, persisted, prepared.snapshot);
      const [updatedIssue] = await tx
        .update(reportIssues)
        .set({
          currentCandidateReportId: persisted.id,
          rowVersion: issue.rowVersion + 1,
          updatedAt: new Date()
        })
        .where(and(eq(reportIssues.id, issue.id), eq(reportIssues.rowVersion, issue.rowVersion)))
        .returning({ id: reportIssues.id });
      if (!updatedIssue) {
        throw new ConflictException("Report issue changed before generation completion.");
      }
      const [completedRun] = await tx
        .update(reportGenerationRuns)
        .set({
          status: "succeeded",
          resultReportId: persisted.id,
          failureCode: null,
          failureMessage: null,
          finishedAt: new Date(),
          updatedAt: new Date()
        })
        .where(and(eq(reportGenerationRuns.id, run.id), eq(reportGenerationRuns.status, "validating")))
        .returning({ id: reportGenerationRuns.id });
      if (!completedRun) {
        throw new ConflictException("Report generation status changed before completion.");
      }
      await tx.insert(reportLifecycleEvents).values({
        projectId: input.projectId,
        reportIssueId: issue.id,
        reportId: persisted.id,
        generationRunId: run.id,
        eventType: "report_generated",
        fromStatus: currentCandidate ? "draft" : null,
        toStatus: "draft",
        actorType: "system",
        requestId: run.id,
        snapshotSha256: persisted.snapshotSha256
      });

      result = persistedDraft("persisted", persisted);
    });

    if (!result) {
      throw new Error("Report generation completion produced no result.");
    }
    return result;
  }

  async submitForReview(input: {
    projectId: string;
    reportId: string;
    actorUserId: string;
    requestId: string;
    expectedSnapshotSha256: string;
    expectedRowVersion: number;
  }): Promise<CustomerReportReviewTransition> {
    return this.reviewTransition({ ...input, command: "submit_for_review" });
  }

  async requestChanges(input: {
    projectId: string;
    reportId: string;
    actorUserId: string;
    requestId: string;
    expectedSnapshotSha256: string;
    expectedRowVersion: number;
    decisionNote: string;
  }): Promise<CustomerReportReviewTransition> {
    const decisionNote = CustomerReportDecisionNoteSchema.safeParse(input.decisionNote);
    if (!decisionNote.success || decisionNote.data.trim().length === 0) {
      throw new BadRequestException("Requesting report changes requires a bounded decision note.");
    }
    return this.reviewTransition({ ...input, decisionNote: decisionNote.data, command: "request_changes" });
  }

  private async reviewTransition(input: {
    projectId: string;
    reportId: string;
    actorUserId: string;
    requestId: string;
    expectedSnapshotSha256: string;
    expectedRowVersion: number;
    decisionNote?: string;
    command: "submit_for_review" | "request_changes";
  }): Promise<CustomerReportReviewTransition> {
    requireUuid(input.projectId, "Report project id must be a UUID.");
    requireUuid(input.reportId, "Report id must be a UUID.");
    requireUuid(input.actorUserId, "Report review requires a persisted human actor.");
    requireUuid(input.requestId, "Report review request id must be a UUID.");
    requireSha256(input.expectedSnapshotSha256, "Report review requires an exact snapshot digest.");
    if (!Number.isSafeInteger(input.expectedRowVersion) || input.expectedRowVersion < 0) {
      throw new BadRequestException("Report review requires a non-negative expected row version.");
    }

    const db = this.database.requireDb();
    const [initial] = await db
      .select({ reportIssueId: reports.reportIssueId })
      .from(reports)
      .where(and(eq(reports.id, input.reportId), eq(reports.projectId, input.projectId)))
      .limit(1);
    if (!initial) {
      throw new BadRequestException("Report was not found for this project.");
    }

    let result: CustomerReportReviewTransition | undefined;
    await db.transaction(async (tx) => {
      await lockReportIssue(tx, initial.reportIssueId);
      await lockReport(tx, input.projectId, input.reportId);
      const [report] = await tx
        .select()
        .from(reports)
        .where(and(eq(reports.id, input.reportId), eq(reports.projectId, input.projectId)))
        .limit(1);
      const [issue] = await tx.select().from(reportIssues).where(eq(reportIssues.id, initial.reportIssueId)).limit(1);
      if (!report || !issue || issue.currentCandidateReportId !== report.id) {
        throw new ConflictException("Only the current report candidate can be reviewed.");
      }

      const eventType = input.command === "submit_for_review" ? "submitted_for_review" : "changes_requested";
      const [priorEvent] = await tx
        .select()
        .from(reportLifecycleEvents)
        .where(
          and(
            eq(reportLifecycleEvents.projectId, input.projectId),
            eq(reportLifecycleEvents.reportId, input.reportId),
            eq(reportLifecycleEvents.requestId, input.requestId),
            eq(reportLifecycleEvents.eventType, eventType)
          )
        )
        .limit(1);
      if (priorEvent) {
        if (
          priorEvent.actorUserId !== input.actorUserId ||
          priorEvent.snapshotSha256 !== input.expectedSnapshotSha256
        ) {
          throw new ConflictException("Report review request id belongs to another decision.");
        }
        if (report.snapshotSha256 !== priorEvent.snapshotSha256 || report.status !== priorEvent.toStatus) {
          throw new ConflictException("Report advanced after the prior review decision; reload current truth.");
        }
        result = reviewResult("replayed", report);
        return;
      }

      if (report.snapshotSha256 !== input.expectedSnapshotSha256 || report.rowVersion !== input.expectedRowVersion) {
        throw new ConflictException("Report review target changed; reload the current candidate.");
      }
      const decision = decideCustomerReportTransition(report.status, input.command);
      if (decision.kind === "deny") {
        throw new ConflictException("Report is not in a reviewable lifecycle state for this decision.");
      }

      const storedSnapshot = await validateStoredReport(tx, report);
      if (input.command === "submit_for_review") {
        await assertEvidenceSourcesBelongToProject(tx, input.projectId, storedSnapshot);
      }

      const now = new Date();
      const [updated] = await tx
        .update(reports)
        .set(
          input.command === "submit_for_review"
            ? {
                status: "ready_for_review",
                reviewedSnapshotSha256: report.snapshotSha256,
                readyAt: now,
                rowVersion: report.rowVersion + 1,
                updatedAt: now
              }
            : {
                status: "draft",
                reviewedSnapshotSha256: null,
                readyAt: null,
                rowVersion: report.rowVersion + 1,
                updatedAt: now
              }
        )
        .where(
          and(
            eq(reports.id, report.id),
            eq(reports.status, report.status),
            eq(reports.rowVersion, report.rowVersion),
            eq(reports.snapshotSha256, report.snapshotSha256)
          )
        )
        .returning();
      if (!updated) {
        throw new ConflictException("Report review target changed during the decision.");
      }

      const [updatedIssue] = await tx
        .update(reportIssues)
        .set({ rowVersion: issue.rowVersion + 1, updatedAt: now })
        .where(and(eq(reportIssues.id, issue.id), eq(reportIssues.rowVersion, issue.rowVersion)))
        .returning({ id: reportIssues.id });
      if (!updatedIssue) {
        throw new ConflictException("Report issue changed during the review decision.");
      }
      await tx.insert(reportLifecycleEvents).values({
        projectId: input.projectId,
        reportIssueId: issue.id,
        reportId: report.id,
        eventType,
        fromStatus: report.status,
        toStatus: updated.status,
        actorType: "human",
        actorUserId: input.actorUserId,
        requestId: input.requestId,
        snapshotSha256: report.snapshotSha256,
        decisionNote: input.decisionNote
      });
      result = reviewResult("applied", updated);
    });

    if (!result) {
      throw new Error("Report review transition produced no result.");
    }
    return result;
  }
}

@Module({ providers: [ReportsService], exports: [ReportsService] })
export class ReportsModule {}

function generationAdmission(
  kind: CustomerReportGenerationAdmission["kind"],
  run: ReportGenerationRunRow
): CustomerReportGenerationAdmission {
  return { kind, reportIssueId: run.reportIssueId, runId: run.id, status: run.status };
}

function persistedDraft(kind: "persisted" | "replayed", report: ReportRow): CustomerReportDraftPersistence {
  return {
    kind,
    reportIssueId: report.reportIssueId,
    reportId: report.id,
    reportVersion: report.versionNumber,
    reportRowVersion: report.rowVersion,
    snapshotSha256: report.snapshotSha256
  };
}

function reviewResult(kind: "applied" | "replayed", report: ReportRow): CustomerReportReviewTransition {
  return {
    kind,
    reportId: report.id,
    status: report.status,
    rowVersion: report.rowVersion,
    snapshotSha256: report.snapshotSha256
  };
}

async function lockAndLoadReportIssueByIdentity(
  tx: DatabaseTransaction,
  identity: CustomerReportIdentity
): Promise<ReportIssueRow | undefined> {
  await tx.execute(sql`
    SELECT "id"
    FROM "report_issues"
    WHERE "project_id" = ${identity.projectId}
      AND "report_kind" = ${identity.reportKind}
      AND "period" = ${identity.period}
      AND "locale" = ${identity.locale}
      AND "timezone" = ${identity.timezone}
    FOR UPDATE
  `);
  const [issue] = await tx
    .select()
    .from(reportIssues)
    .where(
      and(
        eq(reportIssues.projectId, identity.projectId),
        eq(reportIssues.reportKind, identity.reportKind),
        eq(reportIssues.period, identity.period),
        eq(reportIssues.locale, identity.locale),
        eq(reportIssues.timezone, identity.timezone)
      )
    )
    .limit(1);
  return issue;
}

async function lockReportIssue(tx: DatabaseTransaction, reportIssueId: string): Promise<void> {
  await tx.execute(sql`SELECT "id" FROM "report_issues" WHERE "id" = ${reportIssueId} FOR UPDATE`);
}

async function lockReportGenerationRun(tx: DatabaseTransaction, projectId: string, runId: string): Promise<void> {
  await tx.execute(
    sql`SELECT "id" FROM "report_generation_runs" WHERE "id" = ${runId} AND "project_id" = ${projectId} FOR UPDATE`
  );
}

async function lockReport(tx: DatabaseTransaction, projectId: string, reportId: string): Promise<void> {
  await tx.execute(sql`SELECT "id" FROM "reports" WHERE "id" = ${reportId} AND "project_id" = ${projectId} FOR UPDATE`);
}

async function loadCurrentCandidate(tx: DatabaseTransaction, issue: ReportIssueRow): Promise<ReportRow | undefined> {
  if (!issue.currentCandidateReportId) {
    const [untracked] = await tx
      .select()
      .from(reports)
      .where(and(eq(reports.reportIssueId, issue.id), inArray(reports.status, ["draft", "ready_for_review"])))
      .limit(1);
    if (untracked) {
      throw new Error("Report issue candidate pointer is inconsistent with the open candidate index.");
    }
    return undefined;
  }

  const [candidate] = await tx
    .select()
    .from(reports)
    .where(and(eq(reports.id, issue.currentCandidateReportId), eq(reports.reportIssueId, issue.id)))
    .limit(1);
  if (!candidate || (candidate.status !== "draft" && candidate.status !== "ready_for_review")) {
    throw new Error("Report issue candidate pointer does not reference an open candidate.");
  }
  return candidate;
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
    throw new UnprocessableEntityException({
      message: "Customer report snapshot contains ineligible claims.",
      claims: eligibility.claims
    });
  }

  const factProjectionSha256 = sha256(canonicalizeCustomerReportFactProjection(snapshot.factProjection));
  if (snapshot.factProjectionSha256 !== factProjectionSha256) {
    throw new UnprocessableEntityException(
      "Customer report fact projection digest does not match its canonical facts."
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
  const identity = snapshot.identity;
  if (
    identity.projectId !== issue.projectId ||
    identity.reportKind !== issue.reportKind ||
    identity.period !== issue.period ||
    identity.locale !== issue.locale ||
    identity.timezone !== issue.timezone
  ) {
    throw new UnprocessableEntityException("Customer report snapshot identity does not match its report issue.");
  }
  if (snapshot.evidenceCutoffAt !== run.evidenceCutoffAt.toISOString()) {
    throw new UnprocessableEntityException("Customer report snapshot cutoff does not match its generation run.");
  }
  if (
    snapshot.schemaVersion !== run.reportSchemaVersion ||
    snapshot.assemblerVersion !== run.assemblerVersion ||
    snapshot.eligibilityPolicyVersion !== run.eligibilityPolicyVersion ||
    snapshot.actionSelectionPolicyVersion !== run.actionSelectionPolicyVersion ||
    snapshot.narrativeMode !== run.narrativeMode
  ) {
    throw new UnprocessableEntityException("Customer report snapshot policy versions do not match its generation run.");
  }
}

async function generationStaleReason(
  tx: DatabaseTransaction,
  issue: ReportIssueRow,
  run: ReportGenerationRunRow
): Promise<string | undefined> {
  if (issue.rowVersion !== run.baseIssueRowVersion) {
    return "The report issue changed after generation admission.";
  }
  if (issue.currentCandidateReportId !== run.baseCandidateReportId) {
    return "The current report candidate changed after generation admission.";
  }
  if (!run.baseCandidateReportId) {
    return undefined;
  }

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
  if (links.length > 0) {
    await tx.insert(reportClaimEvidence).values(links);
  }
}

async function deleteReportProjection(tx: DatabaseTransaction, reportId: string): Promise<void> {
  await tx.delete(reportClaimEvidence).where(eq(reportClaimEvidence.reportId, reportId));
  await tx.delete(reportClaims).where(eq(reportClaims.reportId, reportId));
  await tx.delete(reportEvidenceItems).where(eq(reportEvidenceItems.reportId, reportId));
}

async function validateStoredReport(tx: DatabaseTransaction, report: ReportRow): Promise<CustomerReportSnapshot> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(report.snapshotCanonicalText);
  } catch {
    throw new UnprocessableEntityException("Stored customer report snapshot is not valid JSON.");
  }
  const prepared = prepareSnapshot(parsedJson);
  if (
    prepared.snapshotCanonicalText !== report.snapshotCanonicalText ||
    prepared.snapshotSha256 !== report.snapshotSha256 ||
    prepared.factProjectionSha256 !== report.factProjectionSha256
  ) {
    throw new UnprocessableEntityException("Stored customer report snapshot or digest is inconsistent.");
  }

  const claimRows = await tx
    .select()
    .from(reportClaims)
    .where(eq(reportClaims.reportId, report.id))
    .orderBy(asc(reportClaims.ordinal));
  const evidenceRows = await tx
    .select()
    .from(reportEvidenceItems)
    .where(eq(reportEvidenceItems.reportId, report.id))
    .orderBy(asc(reportEvidenceItems.evidenceKey));
  const linkRows = await tx
    .select({ claimId: reportClaimEvidence.claimId, evidenceId: reportClaimEvidence.evidenceId })
    .from(reportClaimEvidence)
    .where(eq(reportClaimEvidence.reportId, report.id));

  const evidenceKeyById = new Map(evidenceRows.map((row) => [row.id, row.evidenceKey]));
  const linkedKeysByClaimId = new Map<string, string[]>();
  for (const link of linkRows) {
    const evidenceKey = evidenceKeyById.get(link.evidenceId);
    if (!evidenceKey) {
      throw new UnprocessableEntityException("Stored report claim/evidence projection contains a dangling link.");
    }
    const keys = linkedKeysByClaimId.get(link.claimId) ?? [];
    keys.push(evidenceKey);
    linkedKeysByClaimId.set(link.claimId, keys);
  }

  const claims = claimRows.map((row, ordinal) => {
    const claim = CustomerReportClaimSchema.parse(row.claimJson);
    const linkedKeys = (linkedKeysByClaimId.get(row.id) ?? []).sort();
    const expectedKeys = [...claim.evidenceKeys].sort();
    if (
      row.projectId !== report.projectId ||
      row.claimKey !== claim.claimKey ||
      row.claimKind !== claim.kind ||
      row.section !== claim.section ||
      row.ordinal !== ordinal ||
      JSON.stringify(linkedKeys) !== JSON.stringify(expectedKeys)
    ) {
      throw new UnprocessableEntityException("Stored report claim projection does not match its canonical claim.");
    }
    return claim;
  });
  const evidence = evidenceRows.map((row) => {
    const item = CustomerReportEvidenceItemSchema.parse(row.evidenceJson);
    if (
      row.projectId !== report.projectId ||
      row.evidenceKey !== item.evidenceKey ||
      row.sourceKind !== item.sourceKind ||
      row.sourceId !== item.sourceId ||
      row.sourceVersion !== item.sourceVersion ||
      row.proofTier !== item.proofTier ||
      row.observedAt.toISOString() !== item.observedAt ||
      row.selectedAtCutoff.toISOString() !== item.selectedAtCutoff ||
      row.payloadSha256 !== item.payloadSha256 ||
      !evidenceProjectionReferencesMatch(row, item)
    ) {
      throw new UnprocessableEntityException(
        "Stored report evidence projection does not match its canonical evidence."
      );
    }
    return item;
  });

  const reconstructed = canonicalizeCustomerReportFactProjection({
    claims,
    evidence,
    nextActions: prepared.snapshot.factProjection.nextActions
  });
  if (reconstructed !== canonicalizeCustomerReportFactProjection(prepared.snapshot.factProjection)) {
    throw new UnprocessableEntityException(
      "Stored report provenance projection does not match the canonical snapshot."
    );
  }
  return prepared.snapshot;
}

async function assertEvidenceSourcesBelongToProject(
  tx: DatabaseTransaction,
  projectId: string,
  snapshot: CustomerReportSnapshot
): Promise<void> {
  const evidence = snapshot.factProjection.evidence;
  const ids = (kind: (typeof evidence)[number]["sourceKind"]) => [
    ...new Set(evidence.filter((item) => item.sourceKind === kind).map((item) => item.sourceId))
  ];

  await assertScopedIds(
    ids("ranking_proof"),
    tx
      .select({ id: rankingProofs.id })
      .from(rankingProofs)
      .where(and(eq(rankingProofs.projectId, projectId), inArray(rankingProofs.id, ids("ranking_proof"))))
  );
  await assertScopedIds(
    ids("page_version"),
    tx
      .select({ id: pageVersions.id })
      .from(pageVersions)
      .innerJoin(pageProposals, eq(pageVersions.pageProposalId, pageProposals.id))
      .where(and(eq(pageProposals.projectId, projectId), inArray(pageVersions.id, ids("page_version"))))
  );
  await assertScopedIds(
    ids("deployment"),
    tx
      .select({ id: deployments.id })
      .from(deployments)
      .where(and(eq(deployments.projectId, projectId), inArray(deployments.id, ids("deployment"))))
  );
  await assertReleaseVerificationSources(tx, projectId, evidence);
  await assertReleaseVerificationCheckSources(tx, projectId, evidence);
  await assertRollbackSources(tx, projectId, evidence);
  await assertScopedIds(
    ids("opportunity"),
    tx
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(and(eq(opportunities.projectId, projectId), inArray(opportunities.id, ids("opportunity"))))
  );
}

type ReportEvidenceItem = CustomerReportSnapshot["factProjection"]["evidence"][number];

async function assertReleaseVerificationSources(
  tx: DatabaseTransaction,
  projectId: string,
  evidence: ReportEvidenceItem[]
): Promise<void> {
  const items = evidence.filter(
    (item): item is Extract<ReportEvidenceItem, { sourceKind: "release_verification" }> =>
      item.sourceKind === "release_verification"
  );
  if (items.length === 0) return;

  const rows = await tx
    .select({ id: releaseVerifications.id, deploymentId: releaseVerifications.deploymentId })
    .from(releaseVerifications)
    .innerJoin(releasePlans, eq(releaseVerifications.releasePlanId, releasePlans.id))
    .innerJoin(deployments, eq(releaseVerifications.deploymentId, deployments.id))
    .where(
      and(
        eq(releasePlans.projectId, projectId),
        eq(deployments.projectId, projectId),
        inArray(
          releaseVerifications.id,
          items.map((item) => item.verificationId)
        )
      )
    );
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  for (const item of items) {
    if (rowsById.get(item.verificationId)?.deploymentId !== item.deploymentId) {
      throwEvidenceSourceMismatch();
    }
  }
}

async function assertReleaseVerificationCheckSources(
  tx: DatabaseTransaction,
  projectId: string,
  evidence: ReportEvidenceItem[]
): Promise<void> {
  const items = evidence.filter(
    (item): item is Extract<ReportEvidenceItem, { sourceKind: "release_verification_check" }> =>
      item.sourceKind === "release_verification_check"
  );
  if (items.length === 0) return;

  const rows = await tx
    .select({ id: releaseVerificationChecks.id, verificationId: releaseVerificationChecks.verificationId })
    .from(releaseVerificationChecks)
    .innerJoin(releaseVerifications, eq(releaseVerificationChecks.verificationId, releaseVerifications.id))
    .innerJoin(releasePlans, eq(releaseVerifications.releasePlanId, releasePlans.id))
    .where(
      and(
        eq(releasePlans.projectId, projectId),
        inArray(
          releaseVerificationChecks.id,
          items.map((item) => item.sourceId)
        )
      )
    );
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  for (const item of items) {
    if (rowsById.get(item.sourceId)?.verificationId !== item.verificationId) {
      throwEvidenceSourceMismatch();
    }
  }
}

async function assertRollbackSources(
  tx: DatabaseTransaction,
  projectId: string,
  evidence: ReportEvidenceItem[]
): Promise<void> {
  const items = evidence.filter(
    (item): item is Extract<ReportEvidenceItem, { sourceKind: "rollback" }> => item.sourceKind === "rollback"
  );
  if (items.length === 0) return;

  const rows = await tx
    .select({ id: rollbackPoints.id, deploymentId: rollbackPoints.deploymentId })
    .from(rollbackPoints)
    .innerJoin(deployments, eq(rollbackPoints.deploymentId, deployments.id))
    .where(
      and(
        eq(rollbackPoints.projectId, projectId),
        eq(deployments.projectId, projectId),
        inArray(
          rollbackPoints.id,
          items.map((item) => item.rollbackPointId)
        )
      )
    );
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  for (const item of items) {
    if (rowsById.get(item.rollbackPointId)?.deploymentId !== item.deploymentId) {
      throwEvidenceSourceMismatch();
    }
  }
}

function throwEvidenceSourceMismatch(): never {
  throw new UnprocessableEntityException(
    "Customer report evidence source relationship was missing, mismatched, or belonged to another project."
  );
}

async function assertScopedIds(requested: string[], query: PromiseLike<Array<{ id: string }>>): Promise<void> {
  if (requested.length === 0) {
    return;
  }
  const rows = await query;
  if (new Set(rows.map((row) => row.id)).size !== requested.length) {
    throw new UnprocessableEntityException(
      "Customer report evidence source was missing or belonged to another project."
    );
  }
}

function evidenceSourceReferences(evidence: CustomerReportSnapshot["factProjection"]["evidence"][number]) {
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

function evidenceProjectionReferencesMatch(
  row: typeof reportEvidenceItems.$inferSelect,
  evidence: CustomerReportSnapshot["factProjection"]["evidence"][number]
): boolean {
  const expected = evidenceSourceReferences(evidence);
  return (
    row.rankingProofId === ("rankingProofId" in expected ? expected.rankingProofId : null) &&
    row.pageVersionId === ("pageVersionId" in expected ? expected.pageVersionId : null) &&
    row.deploymentId === ("deploymentId" in expected ? expected.deploymentId : null) &&
    row.releaseVerificationId === ("releaseVerificationId" in expected ? expected.releaseVerificationId : null) &&
    row.releaseVerificationCheckId ===
      ("releaseVerificationCheckId" in expected ? expected.releaseVerificationCheckId : null) &&
    row.rollbackPointId === ("rollbackPointId" in expected ? expected.rollbackPointId : null) &&
    row.opportunityId === ("opportunityId" in expected ? expected.opportunityId : null)
  );
}

function requiredMapValue(map: Map<string, string>, key: string): string {
  const value = map.get(key);
  if (!value) {
    throw new Error(`Missing report projection id for ${key}.`);
  }
  return value;
}

function isActiveGenerationStatus(status: ReportGenerationRunRow["status"]): boolean {
  return ["queued", "assembling", "narrative_running", "validating"].includes(status);
}

function parseTimestamp(value: string, message: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new BadRequestException(message);
  }
  return date;
}

function requireUuid(value: string, message: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new BadRequestException(message);
  }
}

function requireSha256(value: string, message: string): void {
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new BadRequestException(message);
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
