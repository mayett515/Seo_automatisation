import { createHash, randomUUID } from "node:crypto";
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Injectable,
  Module,
  NotFoundException,
  Optional,
  Param,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UseGuards,
  UnprocessableEntityException
} from "@nestjs/common";
import {
  CreateCustomerReportGenerationRequestSchema,
  CustomerReportClaimSchema,
  CustomerReportCandidateDetailSchema,
  CustomerReportCandidateSummarySchema,
  CustomerReportCompletedRollbackEvidenceSchema,
  CustomerReportDecisionNoteSchema,
  CustomerReportArtifactSummarySchema,
  CustomerReportArtifactRetryCommandSchema,
  CustomerReportArtifactRetryResponseSchema,
  CustomerReportEvidencePacketSchema,
  CustomerReportEvidenceItemSchema,
  CustomerReportIdentitySchema,
  CustomerReportNarrativeModeSchema,
  CustomerReportGenerationJobDataSchema,
  CustomerReportGenerationResponseSchema,
  CustomerReportGenerationRunSchema,
  CustomerReportHtmlRenderJobDataSchema,
  CustomerReportPublicationCommandSchema,
  CustomerReportPublicationResponseSchema,
  CustomerReportPublishedDetailSchema,
  CustomerReportPublishedSummarySchema,
  CustomerReportReviewCommandSchema,
  CustomerReportReviewResponseSchema,
  CustomerReportSnapshotSchema,
  CustomerReportWorkspaceResponseSchema,
  customerReportHtmlMaxBytes,
  type CustomerReportIdentity,
  type CustomerReportArtifactSummary,
  type CustomerReportCandidateDetail,
  type CustomerReportCandidateSummary,
  type CustomerReportGenerationRun,
  type CustomerReportNarrativeMode,
  type CustomerReportPublishedDetail,
  type CustomerReportPublishedSummary,
  type CustomerReportSnapshot,
  type CustomerReportWorkspaceResponse
} from "@localseo/contracts";
import type { ImmutableArtifactReaderPort } from "@localseo/adapters";
import { parseAppEnv } from "@localseo/config";
import {
  assembleCustomerReportFactProjection,
  canonicalizeCustomerReportEvidencePacket,
  canonicalizeCustomerReportFactProjection,
  canonicalizeCustomerReportSnapshot,
  canonicalizeCustomerReportSourcePayload,
  canonicalizeCustomerReportHtmlRenderManifest,
  buildCustomerReportHtmlRenderManifest,
  customerReportVersions,
  customerSafeReleaseWarningForCheck,
  decideCustomerReportGenerationWindow,
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
  reportArtifacts,
  reportClaims,
  reportEvidenceItems,
  reportEvidenceAlerts,
  reportGenerationRuns,
  reportIssues,
  reportLifecycleEvents,
  reports,
  rollbackPoints,
  type DatabaseClient
} from "@localseo/db";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service.js";
import { BetterAuthGuard } from "../auth/guards/better-auth.guard.js";
import { PermissionGuard } from "../auth/permissions/permission.guard.js";
import { RequireProjectPermission } from "../auth/permissions/require-permission.decorator.js";
import { ProjectAccessGuard } from "../auth/project-access.guard.js";
import type { RequestWithAuth } from "../auth/types/authenticated-request.js";
import { QueueProducerService } from "../queue-producer.js";
import { CsrfGuard } from "../security/csrf/csrf.guard.js";
import { IMMUTABLE_ARTIFACT_READER } from "../media-storage.module.js";
import type { FastifyReply } from "fastify";

type DatabaseTransaction = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];
type ReportIssueRow = typeof reportIssues.$inferSelect;
type ReportGenerationRunRow = typeof reportGenerationRuns.$inferSelect;
type ReportRow = typeof reports.$inferSelect;
type ReportArtifactRow = typeof reportArtifacts.$inferSelect;

const env = parseAppEnv(process.env);

type CustomerReportArtifactRetryTransition = {
  kind: "applied" | "replayed";
  report: ReportRow;
  artifact: ReportArtifactRow;
};

type CustomerReportPublicationTransition = {
  kind: "applied" | "replayed";
  report: ReportRow;
  artifact: ReportArtifactRow;
  supersededReportId?: string;
};

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

export type CustomerReportReviewTransition =
  | {
      command: "submit_for_review";
      kind: "applied" | "replayed";
      reportId: string;
      status: "ready_for_review";
      rowVersion: number;
      snapshotSha256: string;
      artifact: ReportArtifactRow;
    }
  | {
      command: "request_changes";
      kind: "applied" | "replayed";
      reportId: string;
      status: "draft";
      rowVersion: number;
      snapshotSha256: string;
      renderArtifacts: "expired";
    };

@Injectable()
export class ReportsService {
  constructor(
    private readonly database: DatabaseService,
    @Optional()
    @Inject(IMMUTABLE_ARTIFACT_READER)
    private readonly artifactReader?: ImmutableArtifactReaderPort
  ) {}

  async admitGeneration(input: {
    identity: CustomerReportIdentity;
    requestedByUserId: string;
    idempotencyKey: string;
    evidenceCutoffAt: string;
    narrativeMode?: CustomerReportNarrativeMode;
    correctionReason?: string;
  }): Promise<CustomerReportGenerationAdmission> {
    const identity = CustomerReportIdentitySchema.parse(input.identity);
    requireUuid(input.requestedByUserId, "Report generation requires a persisted user id.");
    requireUuid(input.idempotencyKey, "Report generation idempotency key must be a UUID.");
    const evidenceCutoffAt = parseTimestamp(input.evidenceCutoffAt, "Report evidence cutoff must be an ISO timestamp.");
    assertCustomerReportGenerationWindow(identity.period, evidenceCutoffAt, new Date());
    const narrativeMode = CustomerReportNarrativeModeSchema.parse(input.narrativeMode ?? "fact_only");
    const correctionReason = parseOptionalDecisionNote(input.correctionReason);
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
          replayed.narrativeMode !== narrativeMode ||
          replayed.correctionReason !== correctionReason
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
      if (issue.currentPublishedReportId && !correctionReason) {
        throw new ConflictException("Generating a correction requires a bounded correction reason.");
      }
      if (!issue.currentPublishedReportId && correctionReason) {
        throw new ConflictException("A correction reason requires an existing published report.");
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
          correctionPredecessorReportId: issue.currentPublishedReportId,
          correctionReason,
          evidenceCutoffAt,
          ...customerReportVersions
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

  async markGenerationEnqueueFailed(projectId: string, runId: string, message: string): Promise<void> {
    const db = this.database.requireDb();
    await db
      .update(reportGenerationRuns)
      .set({
        status: "failed",
        failureCode: "queue_enqueue_failed",
        failureMessage: message,
        finishedAt: new Date(),
        updatedAt: new Date()
      })
      .where(
        and(
          eq(reportGenerationRuns.id, runId),
          eq(reportGenerationRuns.projectId, projectId),
          eq(reportGenerationRuns.status, "queued")
        )
      );
  }

  async getGeneration(projectId: string, runId: string) {
    requireUuid(projectId, "Report project id must be a UUID.");
    requireUuid(runId, "Report generation run id must be a UUID.");
    const db = this.database.requireDb();
    const [run] = await db
      .select()
      .from(reportGenerationRuns)
      .where(and(eq(reportGenerationRuns.projectId, projectId), eq(reportGenerationRuns.id, runId)))
      .limit(1);
    if (!run) throw new NotFoundException("Report generation run was not found.");
    return CustomerReportGenerationRunSchema.parse({
      reportIssueId: run.reportIssueId,
      runId: run.id,
      status: run.status,
      narrativeMode: run.narrativeMode,
      evidenceCutoffAt: run.evidenceCutoffAt.toISOString(),
      evidencePacketSha256: run.evidencePacketSha256 ?? undefined,
      resultReportId: run.resultReportId ?? undefined,
      failureCode: run.failureCode ?? undefined,
      failureMessage: run.failureMessage ?? undefined,
      createdAt: run.createdAt.toISOString(),
      startedAt: run.startedAt?.toISOString(),
      finishedAt: run.finishedAt?.toISOString()
    });
  }

  async listWorkspace(projectId: string): Promise<CustomerReportWorkspaceResponse> {
    requireUuid(projectId, "Report project id must be a UUID.");
    const db = this.database.requireDb();
    const issues = await db
      .select()
      .from(reportIssues)
      .where(eq(reportIssues.projectId, projectId))
      .orderBy(desc(reportIssues.period), desc(reportIssues.createdAt))
      .limit(36);
    if (issues.length === 0) {
      return CustomerReportWorkspaceResponseSchema.parse({ issues: [] });
    }

    const issueIds = issues.map((issue) => issue.id);
    const candidateIds = issues.flatMap((issue) =>
      issue.currentCandidateReportId ? [issue.currentCandidateReportId] : []
    );
    const candidateRows =
      candidateIds.length === 0
        ? []
        : await db
            .select()
            .from(reports)
            .where(
              and(
                eq(reports.projectId, projectId),
                inArray(reports.id, candidateIds),
                inArray(reports.status, ["draft", "ready_for_review"])
              )
            );
    const latestRuns = await db
      .selectDistinctOn([reportGenerationRuns.reportIssueId])
      .from(reportGenerationRuns)
      .where(and(eq(reportGenerationRuns.projectId, projectId), inArray(reportGenerationRuns.reportIssueId, issueIds)))
      .orderBy(asc(reportGenerationRuns.reportIssueId), desc(reportGenerationRuns.createdAt));
    const candidateById = new Map(candidateRows.map((row) => [row.id, row]));
    const latestRunByIssueId = new Map(latestRuns.map((run) => [run.reportIssueId, run]));

    return CustomerReportWorkspaceResponseSchema.parse({
      issues: issues.map((issue) => {
        const candidate = issue.currentCandidateReportId
          ? candidateById.get(issue.currentCandidateReportId)
          : undefined;
        const latestRun = latestRunByIssueId.get(issue.id);
        return {
          reportIssueId: issue.id,
          period: issue.period,
          currentPublishedReportId: issue.currentPublishedReportId ?? undefined,
          candidate: candidate ? reportCandidateSummary(candidate, issue) : undefined,
          latestGeneration: latestRun ? reportGenerationRunSummary(latestRun) : undefined
        };
      })
    });
  }

  async getCandidate(projectId: string, reportId: string): Promise<CustomerReportCandidateDetail> {
    requireUuid(projectId, "Report project id must be a UUID.");
    requireUuid(reportId, "Report id must be a UUID.");
    const db = this.database.requireDb();
    const [row] = await db
      .select({ report: reports, issue: reportIssues })
      .from(reports)
      .innerJoin(reportIssues, eq(reports.reportIssueId, reportIssues.id))
      .where(
        and(
          eq(reports.id, reportId),
          eq(reports.projectId, projectId),
          inArray(reports.status, ["draft", "ready_for_review"])
        )
      )
      .limit(1);
    if (!row) throw new NotFoundException("Report candidate was not found for this project.");
    const artifacts = await db
      .select()
      .from(reportArtifacts)
      .where(and(eq(reportArtifacts.projectId, projectId), eq(reportArtifacts.reportId, reportId)))
      .orderBy(desc(reportArtifacts.createdAt))
      .limit(20);
    return CustomerReportCandidateDetailSchema.parse({
      report: reportCandidateSummary(row.report, row.issue),
      snapshot: parseStoredReportSnapshot(row.report),
      artifacts: artifacts.map(reportArtifactSummary)
    });
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
      assertSnapshotMatchesEvidencePacket(run, prepared.snapshot);
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

  async getArtifact(projectId: string, reportId: string, artifactId: string): Promise<CustomerReportArtifactSummary> {
    requireUuid(projectId, "Report project id must be a UUID.");
    requireUuid(reportId, "Report id must be a UUID.");
    requireUuid(artifactId, "Report artifact id must be a UUID.");
    const [artifact] = await this.database
      .requireDb()
      .select()
      .from(reportArtifacts)
      .where(
        and(
          eq(reportArtifacts.id, artifactId),
          eq(reportArtifacts.reportId, reportId),
          eq(reportArtifacts.projectId, projectId)
        )
      )
      .limit(1);
    if (!artifact) throw new NotFoundException("Report artifact was not found for this project.");
    return reportArtifactSummary(artifact);
  }

  async getArtifactDocument(projectId: string, reportId: string, artifactId: string): Promise<Uint8Array> {
    requireUuid(projectId, "Report project id must be a UUID.");
    requireUuid(reportId, "Report id must be a UUID.");
    requireUuid(artifactId, "Report artifact id must be a UUID.");
    const [artifact] = await this.database
      .requireDb()
      .select()
      .from(reportArtifacts)
      .where(
        and(
          eq(reportArtifacts.id, artifactId),
          eq(reportArtifacts.reportId, reportId),
          eq(reportArtifacts.projectId, projectId),
          eq(reportArtifacts.status, "staged")
        )
      )
      .limit(1);
    if (!artifact) throw new NotFoundException("Staged report artifact was not found for this project.");
    return verifyImmutableArtifactBytes(this.requireArtifactReader(), artifact);
  }

  async retryArtifact(input: {
    projectId: string;
    reportId: string;
    actorUserId: string;
    requestId: string;
    expectedSnapshotSha256: string;
    expectedRowVersion: number;
  }): Promise<CustomerReportArtifactRetryTransition> {
    validateReportCommandTarget(input, "Report artifact retry");
    const db = this.database.requireDb();
    const [initial] = await db
      .select({ reportIssueId: reports.reportIssueId })
      .from(reports)
      .where(and(eq(reports.id, input.reportId), eq(reports.projectId, input.projectId)))
      .limit(1);
    if (!initial) throw new BadRequestException("Report was not found for this project.");

    let result: CustomerReportArtifactRetryTransition | undefined;
    await db.transaction(async (tx) => {
      await lockReportIssue(tx, initial.reportIssueId);
      await lockReport(tx, input.projectId, input.reportId);
      await lockReportArtifacts(tx, input.projectId, input.reportId);
      const [report] = await tx
        .select()
        .from(reports)
        .where(and(eq(reports.id, input.reportId), eq(reports.projectId, input.projectId)))
        .limit(1);
      const [issue] = await tx.select().from(reportIssues).where(eq(reportIssues.id, initial.reportIssueId)).limit(1);
      if (!report || !issue || issue.currentCandidateReportId !== report.id || report.status !== "ready_for_review") {
        throw new ConflictException("Only the current reviewed report candidate can retry rendering.");
      }

      const [prior] = await tx
        .select()
        .from(reportArtifacts)
        .where(and(eq(reportArtifacts.projectId, input.projectId), eq(reportArtifacts.requestId, input.requestId)))
        .limit(1);
      if (prior) {
        const [reviewAdmission] = await tx
          .select({ id: reportLifecycleEvents.id })
          .from(reportLifecycleEvents)
          .where(
            and(
              eq(reportLifecycleEvents.projectId, input.projectId),
              eq(reportLifecycleEvents.artifactId, prior.id),
              eq(reportLifecycleEvents.eventType, "submitted_for_review")
            )
          )
          .limit(1);
        if (reviewAdmission) {
          throw new ConflictException("Report artifact request id belongs to the submit-for-review decision.");
        }
        if (
          prior.reportId !== report.id ||
          prior.requestedByUserId !== input.actorUserId ||
          prior.snapshotSha256 !== input.expectedSnapshotSha256
        ) {
          throw new ConflictException("Report artifact request id belongs to another render decision.");
        }
        result = { kind: "replayed", report, artifact: prior };
        return;
      }

      assertReportCommandTarget(report, input, "Report artifact retry target changed; reload current truth.");
      const definition = reportArtifactDefinition(report, issue);
      const latest = await loadLatestMatchingArtifact(tx, report, definition.manifestSha256);
      if (!latest || latest.status !== "failed") {
        throw new ConflictException("Only a failed report artifact can be retried with a new request id.");
      }

      const artifactId = randomUUID();
      const [artifact] = await tx
        .insert(reportArtifacts)
        .values({
          id: artifactId,
          projectId: report.projectId,
          reportId: report.id,
          format: "html",
          status: "pending",
          snapshotSha256: report.snapshotSha256,
          renderManifestJson: definition.manifest,
          renderManifestCanonicalText: definition.manifestCanonicalText,
          renderManifestSha256: definition.manifestSha256,
          queueJobId: artifactId,
          requestedByUserId: input.actorUserId,
          requestId: input.requestId
        })
        .returning();
      if (!artifact) throw new Error("Report artifact retry did not create durable render work.");
      result = { kind: "applied", report, artifact };
    });

    if (!result) throw new Error("Report artifact retry produced no result.");
    return result;
  }

  async publish(input: {
    projectId: string;
    reportId: string;
    actorUserId: string;
    requestId: string;
    expectedSnapshotSha256: string;
    expectedRowVersion: number;
    artifactId: string;
    command: "publish" | "publish_correction";
  }): Promise<CustomerReportPublicationTransition> {
    validateReportCommandTarget(input, "Report publication");
    requireUuid(input.artifactId, "Report publication requires a persisted artifact id.");
    const db = this.database.requireDb();
    const [initialReport] = await db
      .select()
      .from(reports)
      .where(and(eq(reports.id, input.reportId), eq(reports.projectId, input.projectId)))
      .limit(1);
    if (!initialReport) throw new BadRequestException("Report was not found for this project.");
    const [initialArtifact] = await db
      .select()
      .from(reportArtifacts)
      .where(
        and(
          eq(reportArtifacts.id, input.artifactId),
          eq(reportArtifacts.reportId, input.reportId),
          eq(reportArtifacts.projectId, input.projectId)
        )
      )
      .limit(1);
    if (!initialArtifact) throw new BadRequestException("Report artifact was not found for this project.");
    const snapshot = parseStoredReportSnapshot(initialReport);
    await verifyImmutableArtifactBytes(this.requireArtifactReader(), initialArtifact);

    let result: CustomerReportPublicationTransition | undefined;
    await db.transaction(async (tx) => {
      await lockCustomerReportEvidenceSources(tx, snapshot);
      await lockReportIssue(tx, initialReport.reportIssueId);
      await lockReports(tx, input.projectId, [input.reportId, initialReport.supersedesReportId].filter(isString));
      await lockReportArtifacts(tx, input.projectId, input.reportId);

      const [report] = await tx
        .select()
        .from(reports)
        .where(and(eq(reports.id, input.reportId), eq(reports.projectId, input.projectId)))
        .limit(1);
      const [issue] = await tx
        .select()
        .from(reportIssues)
        .where(eq(reportIssues.id, initialReport.reportIssueId))
        .limit(1);
      const [artifact] = await tx
        .select()
        .from(reportArtifacts)
        .where(
          and(
            eq(reportArtifacts.id, input.artifactId),
            eq(reportArtifacts.reportId, input.reportId),
            eq(reportArtifacts.projectId, input.projectId)
          )
        )
        .limit(1);
      if (!report || !issue || !artifact) throw new ConflictException("Report publication target changed.");
      if (report.snapshotSha256 !== initialReport.snapshotSha256) {
        throw new ConflictException("Report snapshot changed after the publication source lock set was computed.");
      }

      const [priorEvent] = await tx
        .select()
        .from(reportLifecycleEvents)
        .where(
          and(
            eq(reportLifecycleEvents.projectId, input.projectId),
            eq(reportLifecycleEvents.reportId, input.reportId),
            eq(reportLifecycleEvents.requestId, input.requestId),
            eq(reportLifecycleEvents.eventType, "published")
          )
        )
        .limit(1);
      const expectedCommand = report.supersedesReportId ? "publish_correction" : "publish";
      if (input.command !== expectedCommand) {
        throw new ConflictException("Report publication command does not match its correction lineage.");
      }
      if (priorEvent) {
        if (
          priorEvent.actorUserId !== input.actorUserId ||
          priorEvent.snapshotSha256 !== input.expectedSnapshotSha256 ||
          priorEvent.artifactId !== input.artifactId ||
          report.status !== "published" ||
          issue.currentPublishedReportId !== report.id
        ) {
          throw new ConflictException("Report publication request advanced or belongs to another decision.");
        }
        result = {
          kind: "replayed",
          report,
          artifact,
          supersededReportId: report.supersedesReportId ?? undefined
        };
        return;
      }

      if (issue.currentCandidateReportId !== report.id || report.status !== "ready_for_review") {
        throw new ConflictException("Only the current reviewed report candidate can be published.");
      }
      assertReportCommandTarget(report, input, "Report publication target changed; reload current truth.");
      if (
        artifact.status !== "staged" ||
        artifact.snapshotSha256 !== report.snapshotSha256 ||
        artifact.storageKey !== initialArtifact.storageKey ||
        artifact.artifactSha256 !== initialArtifact.artifactSha256 ||
        artifact.byteSize !== initialArtifact.byteSize
      ) {
        throw new ConflictException("Report publication requires the exact pre-verified staged artifact.");
      }

      const storedSnapshot = await validateStoredReport(tx, report);
      await assertEvidenceSourcesBelongToProject(tx, input.projectId, storedSnapshot);
      const now = new Date();
      await tx
        .update(reportArtifacts)
        .set({ status: "expired", expiredAt: now, updatedAt: now })
        .where(
          and(
            eq(reportArtifacts.projectId, input.projectId),
            eq(reportArtifacts.reportId, report.id),
            sql`${reportArtifacts.id} <> ${artifact.id}`,
            inArray(reportArtifacts.status, ["pending", "running", "staged"])
          )
        );

      let predecessor: ReportRow | undefined;
      if (report.supersedesReportId) {
        [predecessor] = await tx
          .select()
          .from(reports)
          .where(
            and(
              eq(reports.id, report.supersedesReportId),
              eq(reports.projectId, input.projectId),
              eq(reports.reportIssueId, report.reportIssueId)
            )
          )
          .limit(1);
        if (!predecessor || predecessor.status !== "published" || issue.currentPublishedReportId !== predecessor.id) {
          throw new ConflictException("Report correction predecessor is no longer current published truth.");
        }
        const [superseded] = await tx
          .update(reports)
          .set({ status: "superseded", supersededAt: now, rowVersion: predecessor.rowVersion + 1, updatedAt: now })
          .where(
            and(
              eq(reports.id, predecessor.id),
              eq(reports.status, "published"),
              eq(reports.rowVersion, predecessor.rowVersion)
            )
          )
          .returning();
        if (!superseded) throw new ConflictException("Published predecessor changed during correction publication.");
        predecessor = superseded;
      } else if (issue.currentPublishedReportId) {
        throw new ConflictException("Initial publication cannot replace existing published truth.");
      }

      const [published] = await tx
        .update(reports)
        .set({
          status: "published",
          publishedArtifactId: artifact.id,
          publishedByUserId: input.actorUserId,
          publishedAt: now,
          rowVersion: report.rowVersion + 1,
          updatedAt: now
        })
        .where(
          and(
            eq(reports.id, report.id),
            eq(reports.status, "ready_for_review"),
            eq(reports.rowVersion, report.rowVersion),
            eq(reports.snapshotSha256, report.snapshotSha256)
          )
        )
        .returning();
      if (!published) throw new ConflictException("Report publication target changed during the decision.");

      const [updatedIssue] = await tx
        .update(reportIssues)
        .set({
          currentCandidateReportId: null,
          currentPublishedReportId: published.id,
          rowVersion: issue.rowVersion + 1,
          updatedAt: now
        })
        .where(and(eq(reportIssues.id, issue.id), eq(reportIssues.rowVersion, issue.rowVersion)))
        .returning({ id: reportIssues.id });
      if (!updatedIssue) throw new ConflictException("Report issue changed during publication.");

      if (predecessor) {
        await tx
          .update(reportEvidenceAlerts)
          .set({ status: "resolved", resolvedAt: now, resolvedByReportId: published.id, updatedAt: now })
          .where(and(eq(reportEvidenceAlerts.reportId, predecessor.id), eq(reportEvidenceAlerts.status, "open")));
        await tx.insert(reportLifecycleEvents).values({
          projectId: input.projectId,
          reportIssueId: issue.id,
          reportId: predecessor.id,
          artifactId: predecessor.publishedArtifactId,
          eventType: "superseded",
          fromStatus: "published",
          toStatus: "superseded",
          actorType: "human",
          actorUserId: input.actorUserId,
          requestId: input.requestId,
          snapshotSha256: predecessor.snapshotSha256,
          decisionNote: report.correctionReason
        });
      }
      await tx.insert(reportLifecycleEvents).values({
        projectId: input.projectId,
        reportIssueId: issue.id,
        reportId: published.id,
        artifactId: artifact.id,
        eventType: "published",
        fromStatus: "ready_for_review",
        toStatus: "published",
        actorType: "human",
        actorUserId: input.actorUserId,
        requestId: input.requestId,
        snapshotSha256: published.snapshotSha256
      });
      result = {
        kind: "applied",
        report: published,
        artifact,
        supersededReportId: predecessor?.id
      };
    });

    if (!result) throw new Error("Report publication produced no result.");
    return result;
  }

  async listPublished(projectId: string): Promise<CustomerReportPublishedSummary[]> {
    requireUuid(projectId, "Report project id must be a UUID.");
    const rows = await this.database
      .requireDb()
      .select({ report: reports, issue: reportIssues, artifact: reportArtifacts })
      .from(reports)
      .innerJoin(reportIssues, eq(reports.reportIssueId, reportIssues.id))
      .innerJoin(reportArtifacts, eq(reports.publishedArtifactId, reportArtifacts.id))
      .where(and(eq(reports.projectId, projectId), inArray(reports.status, ["published", "superseded"])))
      .orderBy(desc(reports.publishedAt), desc(reports.versionNumber))
      .limit(100);
    return Promise.all(rows.map((row) => this.publishedSummary(row.report, row.issue, row.artifact)));
  }

  async getPublished(projectId: string, reportId: string): Promise<CustomerReportPublishedDetail> {
    const { report, issue, artifact } = await this.loadPublishedRow(projectId, reportId);
    return CustomerReportPublishedDetailSchema.parse({
      report: await this.publishedSummary(report, issue, artifact),
      snapshot: parseStoredReportSnapshot(report)
    });
  }

  async getPublishedDocument(projectId: string, reportId: string): Promise<Uint8Array> {
    const { artifact } = await this.loadPublishedRow(projectId, reportId);
    return verifyImmutableArtifactBytes(this.requireArtifactReader(), artifact);
  }

  private async loadPublishedRow(projectId: string, reportId: string) {
    requireUuid(projectId, "Report project id must be a UUID.");
    requireUuid(reportId, "Report id must be a UUID.");
    const [row] = await this.database
      .requireDb()
      .select({ report: reports, issue: reportIssues, artifact: reportArtifacts })
      .from(reports)
      .innerJoin(reportIssues, eq(reports.reportIssueId, reportIssues.id))
      .innerJoin(reportArtifacts, eq(reports.publishedArtifactId, reportArtifacts.id))
      .where(
        and(
          eq(reports.id, reportId),
          eq(reports.projectId, projectId),
          inArray(reports.status, ["published", "superseded"])
        )
      )
      .limit(1);
    if (!row) throw new NotFoundException("Published report was not found for this project.");
    return row;
  }

  private async publishedSummary(
    report: ReportRow,
    issue: ReportIssueRow,
    artifact: ReportArtifactRow
  ): Promise<CustomerReportPublishedSummary> {
    const db = this.database.requireDb();
    const [alert] = await db
      .select({ id: reportEvidenceAlerts.id })
      .from(reportEvidenceAlerts)
      .where(and(eq(reportEvidenceAlerts.reportId, report.id), eq(reportEvidenceAlerts.status, "open")))
      .limit(1);
    const [successor] = await db
      .select({ id: reports.id })
      .from(reports)
      .where(eq(reports.supersedesReportId, report.id))
      .limit(1);
    const snapshot = parseStoredReportSnapshot(report);
    return CustomerReportPublishedSummarySchema.parse({
      reportId: report.id,
      reportIssueId: report.reportIssueId,
      versionNumber: report.versionNumber,
      status: report.status,
      period: issue.period,
      title: snapshot.title,
      snapshotSha256: report.snapshotSha256,
      artifactId: artifact.id,
      artifactSha256: artifact.artifactSha256,
      publishedAt: report.publishedAt?.toISOString(),
      supersededAt: report.supersededAt?.toISOString(),
      supersededByReportId: successor?.id,
      correctionRequired: report.status === "published" && Boolean(alert)
    });
  }

  private requireArtifactReader(): ImmutableArtifactReaderPort {
    if (!this.artifactReader) {
      throw new ServiceUnavailableException("Immutable report artifact storage is unavailable.");
    }
    return this.artifactReader;
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
      await lockReportArtifacts(tx, input.projectId, report.id);

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
        if (input.command === "submit_for_review") {
          const definition = reportArtifactDefinition(report, issue);
          const artifact = await loadLatestMatchingArtifact(tx, report, definition.manifestSha256);
          if (!artifact) {
            throw new Error("Submitted report review is missing its durable HTML artifact.");
          }
          result = submitReviewResult("replayed", report, artifact);
        } else {
          result = requestChangesResult("replayed", report);
        }
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
      let artifact: ReportArtifactRow | undefined;
      if (input.command === "submit_for_review") {
        const artifactId = randomUUID();
        const definition = reportArtifactDefinition(report, issue);
        [artifact] = await tx
          .insert(reportArtifacts)
          .values({
            id: artifactId,
            projectId: input.projectId,
            reportId: report.id,
            format: "html",
            status: "pending",
            snapshotSha256: report.snapshotSha256,
            renderManifestJson: definition.manifest,
            renderManifestCanonicalText: definition.manifestCanonicalText,
            renderManifestSha256: definition.manifestSha256,
            queueJobId: artifactId,
            requestedByUserId: input.actorUserId,
            requestId: input.requestId
          })
          .returning();
        if (!artifact) {
          throw new Error("Report review did not create its durable HTML artifact.");
        }
      }
      if (input.command === "request_changes") {
        await tx
          .update(reportArtifacts)
          .set({ status: "expired", expiredAt: now, updatedAt: now })
          .where(
            and(
              eq(reportArtifacts.projectId, input.projectId),
              eq(reportArtifacts.reportId, report.id),
              inArray(reportArtifacts.status, ["pending", "running", "staged"])
            )
          );
      }
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
        artifactId: input.command === "submit_for_review" ? requiredArtifact(artifact).id : null,
        eventType,
        fromStatus: report.status,
        toStatus: updated.status,
        actorType: "human",
        actorUserId: input.actorUserId,
        requestId: input.requestId,
        snapshotSha256: report.snapshotSha256,
        decisionNote: input.decisionNote
      });
      result =
        input.command === "submit_for_review"
          ? submitReviewResult("applied", updated, requiredArtifact(artifact))
          : requestChangesResult("applied", updated);
    });

    if (!result) {
      throw new Error("Report review transition produced no result.");
    }
    return result;
  }
}

@Controller("projects/:projectId/reports")
@UseGuards(BetterAuthGuard, CsrfGuard, ProjectAccessGuard, PermissionGuard)
@RequireProjectPermission("project:read")
class ReportsController {
  constructor(
    @Inject(ReportsService) private readonly reports: ReportsService,
    @Inject(QueueProducerService) private readonly queues: QueueProducerService
  ) {}

  @Get("workspace")
  @RequireProjectPermission("report:review")
  listWorkspace(@Param("projectId") projectId: string) {
    return this.reports.listWorkspace(projectId);
  }

  @Get("candidates/:reportId")
  @RequireProjectPermission("report:review")
  getCandidate(@Param("projectId") projectId: string, @Param("reportId") reportId: string) {
    return this.reports.getCandidate(projectId, reportId);
  }

  @Post(":reportId/review")
  @RequireProjectPermission("report:review")
  async review(
    @Param("projectId") projectId: string,
    @Param("reportId") reportId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth
  ) {
    const parsed = CustomerReportReviewCommandSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException("Report review requires a valid digest-bound command.");
    const actorUserId = persistedActorUserId(request);
    if (!actorUserId) throw new BadRequestException("Report review requires a persisted user id.");
    if (parsed.data.command === "submit_for_review" && !this.queues.isQueueConfigured("report")) {
      throw new ServiceUnavailableException("Report review requires configured report rendering transport.");
    }

    const transition =
      parsed.data.command === "submit_for_review"
        ? await this.reports.submitForReview({ projectId, reportId, actorUserId, ...parsed.data })
        : await this.reports.requestChanges({ projectId, reportId, actorUserId, ...parsed.data });

    if (transition.command === "request_changes") {
      return CustomerReportReviewResponseSchema.parse(transition);
    }

    let renderDispatch: "accepted" | "not_required" = "not_required";
    if (transition.artifact.status === "pending" || transition.artifact.status === "running") {
      let accepted: boolean;
      try {
        accepted = await this.queues.enqueue({
          queueName: "report",
          jobName: "customer_report_html_render",
          jobId: transition.artifact.id,
          data: CustomerReportHtmlRenderJobDataSchema.parse({
            projectId,
            reportId,
            artifactId: transition.artifact.id,
            triggerSource: "user_action"
          }),
          options: { attempts: 3, backoff: { type: "exponential", delay: 5_000 } },
          audit: {
            projectId,
            type: "report_artifact",
            inputRef: transition.artifact.id,
            actorType: "user",
            actorUserId,
            triggerSource: "user_action"
          }
        });
      } catch (error) {
        throw new ServiceUnavailableException("Report rendering transport failed after review.", { cause: error });
      }
      if (!accepted) {
        throw new ServiceUnavailableException("Report rendering transport became unavailable after review.");
      }
      renderDispatch = "accepted";
    }

    return CustomerReportReviewResponseSchema.parse({
      command: transition.command,
      kind: transition.kind,
      reportId: transition.reportId,
      status: transition.status,
      rowVersion: transition.rowVersion,
      snapshotSha256: transition.snapshotSha256,
      artifact: reportArtifactSummary(transition.artifact),
      renderDispatch
    });
  }

  @Get(":reportId/artifacts/:artifactId")
  @RequireProjectPermission("report:review")
  getArtifact(
    @Param("projectId") projectId: string,
    @Param("reportId") reportId: string,
    @Param("artifactId") artifactId: string
  ) {
    return this.reports.getArtifact(projectId, reportId, artifactId);
  }

  @Get(":reportId/artifacts/:artifactId/document")
  @RequireProjectPermission("report:review")
  async getArtifactDocument(
    @Param("projectId") projectId: string,
    @Param("reportId") reportId: string,
    @Param("artifactId") artifactId: string,
    @Res() reply: FastifyReply
  ) {
    const body = await this.reports.getArtifactDocument(projectId, reportId, artifactId);
    return sendCustomerReportDocument(reply, body);
  }

  @Post(":reportId/artifacts/retry")
  @RequireProjectPermission("report:review")
  async retryArtifact(
    @Param("projectId") projectId: string,
    @Param("reportId") reportId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth
  ) {
    const parsed = CustomerReportArtifactRetryCommandSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException("Report artifact retry requires a valid digest-bound command.");
    const actorUserId = persistedActorUserId(request);
    if (!actorUserId) throw new BadRequestException("Report artifact retry requires a persisted user id.");
    if (!this.queues.isQueueConfigured("report")) {
      throw new ServiceUnavailableException("Report artifact retry requires configured rendering transport.");
    }
    const transition = await this.reports.retryArtifact({ projectId, reportId, actorUserId, ...parsed.data });
    const renderDispatch = await this.enqueueReportArtifact(projectId, reportId, actorUserId, transition.artifact);
    return CustomerReportArtifactRetryResponseSchema.parse({
      command: "retry_render",
      kind: transition.kind,
      reportId,
      status: "ready_for_review",
      rowVersion: transition.report.rowVersion,
      snapshotSha256: transition.report.snapshotSha256,
      artifact: reportArtifactSummary(transition.artifact),
      renderDispatch
    });
  }

  @Post(":reportId/publish")
  @RequireProjectPermission("report:publish")
  async publish(
    @Param("projectId") projectId: string,
    @Param("reportId") reportId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth
  ) {
    return this.publishCommand(projectId, reportId, body, request, "publish");
  }

  @Post(":reportId/publish-correction")
  @RequireProjectPermission("report:correct")
  async publishCorrection(
    @Param("projectId") projectId: string,
    @Param("reportId") reportId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth
  ) {
    return this.publishCommand(projectId, reportId, body, request, "publish_correction");
  }

  @Get("published")
  listPublished(@Param("projectId") projectId: string) {
    return this.reports.listPublished(projectId);
  }

  @Get("published/:reportId")
  getPublished(@Param("projectId") projectId: string, @Param("reportId") reportId: string) {
    return this.reports.getPublished(projectId, reportId);
  }

  @Get("published/:reportId/document")
  async getPublishedDocument(
    @Param("projectId") projectId: string,
    @Param("reportId") reportId: string,
    @Res() reply: FastifyReply
  ) {
    const body = await this.reports.getPublishedDocument(projectId, reportId);
    return sendCustomerReportDocument(reply, body);
  }

  @Post("generations")
  @RequireProjectPermission("report:generate")
  async generate(@Param("projectId") projectId: string, @Body() body: unknown, @Req() request: RequestWithAuth) {
    const parsed = CreateCustomerReportGenerationRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException("Report generation requires a valid month, cutoff, and idempotency key.");
    }
    const actorUserId = persistedActorUserId(request);
    if (!actorUserId) throw new BadRequestException("Report generation requires a persisted user id.");
    assertCustomerReportGenerationWindow(parsed.data.period, new Date(parsed.data.evidenceCutoffAt), new Date());

    if (!this.queues.isQueueConfigured("report")) {
      if (isUuid(projectId)) {
        await this.queues.enqueue({
          queueName: "report",
          jobName: "customer_report_generation",
          jobId: randomUUID(),
          data: { kind: "customer_report_generation_dry_run", period: parsed.data.period },
          audit: {
            projectId,
            type: "report",
            inputRef: "dry-run",
            actorType: "user",
            actorUserId,
            triggerSource: "user_action"
          }
        });
      }
      return CustomerReportGenerationResponseSchema.parse({
        kind: "dry_run",
        status: "dry_run",
        enqueuedByRequest: false
      });
    }

    const admission = await this.reports.admitGeneration({
      identity: {
        projectId,
        reportKind: "monthly_seo_progress",
        period: parsed.data.period,
        locale: "de-DE",
        timezone: "Europe/Berlin"
      },
      requestedByUserId: actorUserId,
      idempotencyKey: parsed.data.idempotencyKey,
      evidenceCutoffAt: parsed.data.evidenceCutoffAt,
      narrativeMode: parsed.data.narrativeMode,
      correctionReason: parsed.data.correctionReason
    });

    let enqueuedByRequest = false;
    if (admission.kind === "created") {
      try {
        enqueuedByRequest = await this.queues.enqueue({
          queueName: "report",
          jobName: "customer_report_generation",
          jobId: admission.runId,
          data: CustomerReportGenerationJobDataSchema.parse({ projectId, runId: admission.runId }),
          options: { attempts: 3, backoff: { type: "exponential", delay: 5_000 } },
          audit: {
            projectId,
            type: "report",
            inputRef: admission.runId,
            actorType: "user",
            actorUserId,
            triggerSource: "user_action"
          }
        });
      } catch (error) {
        await this.reports.markGenerationEnqueueFailed(projectId, admission.runId, normalizeErrorMessage(error));
        throw error;
      }
      if (!enqueuedByRequest) {
        await this.reports.markGenerationEnqueueFailed(
          projectId,
          admission.runId,
          "Report queue was not configured after generation admission."
        );
      }
    }

    return CustomerReportGenerationResponseSchema.parse({ ...admission, enqueuedByRequest });
  }

  @Get("generations/:runId")
  @RequireProjectPermission("report:generate")
  getGeneration(@Param("projectId") projectId: string, @Param("runId") runId: string) {
    return this.reports.getGeneration(projectId, runId);
  }

  private async enqueueReportArtifact(
    projectId: string,
    reportId: string,
    actorUserId: string,
    artifact: ReportArtifactRow
  ): Promise<"accepted" | "not_required"> {
    if (artifact.status !== "pending" && artifact.status !== "running") return "not_required";
    let accepted: boolean;
    try {
      accepted = await this.queues.enqueue({
        queueName: "report",
        jobName: "customer_report_html_render",
        jobId: artifact.id,
        data: CustomerReportHtmlRenderJobDataSchema.parse({ projectId, reportId, artifactId: artifact.id }),
        options: { attempts: 3, backoff: { type: "exponential", delay: 5_000 } },
        audit: {
          projectId,
          type: "report_artifact",
          inputRef: artifact.id,
          actorType: "user",
          actorUserId,
          triggerSource: "user_action"
        }
      });
    } catch (error) {
      throw new ServiceUnavailableException("Report rendering transport failed after artifact admission.", {
        cause: error
      });
    }
    if (!accepted) throw new ServiceUnavailableException("Report rendering transport became unavailable.");
    return "accepted";
  }

  private async publishCommand(
    projectId: string,
    reportId: string,
    body: unknown,
    request: RequestWithAuth,
    command: "publish" | "publish_correction"
  ) {
    const parsed = CustomerReportPublicationCommandSchema.safeParse(body ?? {});
    if (!parsed.success || parsed.data.command !== command) {
      throw new BadRequestException("Report publication requires a valid digest-bound command.");
    }
    const actorUserId = persistedActorUserId(request);
    if (!actorUserId) throw new BadRequestException("Report publication requires a persisted user id.");
    const transition = await this.reports.publish({ projectId, reportId, actorUserId, ...parsed.data });
    const report = transition.report;
    const artifact = transition.artifact;
    if (!report.publishedAt || !artifact.artifactSha256) {
      throw new Error("Published report is missing immutable publication evidence.");
    }
    return CustomerReportPublicationResponseSchema.parse({
      command,
      kind: transition.kind,
      reportId: report.id,
      status: "published",
      rowVersion: report.rowVersion,
      snapshotSha256: report.snapshotSha256,
      artifactId: artifact.id,
      artifactSha256: artifact.artifactSha256,
      publishedAt: report.publishedAt.toISOString(),
      supersededReportId: transition.supersededReportId
    });
  }
}

@Module({ controllers: [ReportsController], providers: [ReportsService], exports: [ReportsService] })
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

function submitReviewResult(
  kind: "applied" | "replayed",
  report: ReportRow,
  artifact: ReportArtifactRow
): Extract<CustomerReportReviewTransition, { command: "submit_for_review" }> {
  if (report.status !== "ready_for_review") throw new Error("Submitted report review is not frozen for review.");
  return {
    command: "submit_for_review",
    kind,
    reportId: report.id,
    status: report.status,
    rowVersion: report.rowVersion,
    snapshotSha256: report.snapshotSha256,
    artifact
  };
}

function requestChangesResult(
  kind: "applied" | "replayed",
  report: ReportRow
): Extract<CustomerReportReviewTransition, { command: "request_changes" }> {
  if (report.status !== "draft") throw new Error("Requested report changes did not restore draft truth.");
  return {
    command: "request_changes",
    kind,
    reportId: report.id,
    status: report.status,
    rowVersion: report.rowVersion,
    snapshotSha256: report.snapshotSha256,
    renderArtifacts: "expired"
  };
}

function reportArtifactDefinition(report: ReportRow, issue: ReportIssueRow) {
  const identity = CustomerReportIdentitySchema.parse({
    projectId: issue.projectId,
    reportKind: issue.reportKind,
    period: issue.period,
    locale: issue.locale,
    timezone: issue.timezone
  });
  const manifest = buildCustomerReportHtmlRenderManifest({
    projectId: report.projectId,
    reportId: report.id,
    snapshotSha256: report.snapshotSha256,
    reportSchemaVersion: report.schemaVersion,
    templateVersion: report.templateVersion,
    locale: identity.locale,
    timezone: identity.timezone
  });
  const manifestCanonicalText = canonicalizeCustomerReportHtmlRenderManifest(manifest);
  return { manifest, manifestCanonicalText, manifestSha256: sha256(manifestCanonicalText) };
}

async function loadLatestMatchingArtifact(
  tx: DatabaseTransaction,
  report: ReportRow,
  manifestSha256: string
): Promise<ReportArtifactRow | undefined> {
  const [artifact] = await tx
    .select()
    .from(reportArtifacts)
    .where(
      and(
        eq(reportArtifacts.reportId, report.id),
        eq(reportArtifacts.projectId, report.projectId),
        eq(reportArtifacts.snapshotSha256, report.snapshotSha256),
        eq(reportArtifacts.renderManifestSha256, manifestSha256)
      )
    )
    .orderBy(desc(reportArtifacts.createdAt), desc(reportArtifacts.id))
    .limit(1);
  return artifact;
}

function reportArtifactSummary(artifact: ReportArtifactRow): CustomerReportArtifactSummary {
  return CustomerReportArtifactSummarySchema.parse({
    artifactId: artifact.id,
    reportId: artifact.reportId,
    format: artifact.format,
    status: artifact.status,
    snapshotSha256: artifact.snapshotSha256,
    manifestSha256: artifact.renderManifestSha256,
    artifactSha256: artifact.artifactSha256 ?? undefined,
    byteSize: artifact.byteSize ?? undefined,
    failureCode: artifact.failureCode ?? undefined,
    failureMessage: artifact.failureMessage ?? undefined,
    createdAt: artifact.createdAt.toISOString(),
    stagedAt: artifact.stagedAt?.toISOString()
  });
}

function reportCandidateSummary(report: ReportRow, issue: ReportIssueRow): CustomerReportCandidateSummary {
  const snapshot = parseStoredReportSnapshot(report);
  return CustomerReportCandidateSummarySchema.parse({
    reportId: report.id,
    reportIssueId: report.reportIssueId,
    versionNumber: report.versionNumber,
    status: report.status,
    period: issue.period,
    title: snapshot.title,
    snapshotSha256: report.snapshotSha256,
    rowVersion: report.rowVersion,
    narrativeMode: report.narrativeMode,
    generatedAt: snapshot.generatedAt,
    evidenceCutoffAt: snapshot.evidenceCutoffAt,
    supersedesReportId: report.supersedesReportId ?? undefined,
    correctionReason: report.correctionReason ?? undefined,
    readyAt: report.readyAt?.toISOString(),
    createdAt: report.createdAt.toISOString()
  });
}

function reportGenerationRunSummary(run: ReportGenerationRunRow): CustomerReportGenerationRun {
  return CustomerReportGenerationRunSchema.parse({
    reportIssueId: run.reportIssueId,
    runId: run.id,
    status: run.status,
    narrativeMode: run.narrativeMode,
    evidenceCutoffAt: run.evidenceCutoffAt.toISOString(),
    evidencePacketSha256: run.evidencePacketSha256 ?? undefined,
    resultReportId: run.resultReportId ?? undefined,
    failureCode: run.failureCode ?? undefined,
    failureMessage: run.failureMessage ?? undefined,
    createdAt: run.createdAt.toISOString(),
    startedAt: run.startedAt?.toISOString(),
    finishedAt: run.finishedAt?.toISOString()
  });
}

function sendCustomerReportDocument(reply: FastifyReply, body: Uint8Array) {
  reply.header("content-type", "text/html; charset=utf-8");
  reply.header("content-length", body.byteLength);
  reply.header("cache-control", "private, no-store");
  reply.header("x-content-type-options", "nosniff");
  reply.header("referrer-policy", "no-referrer");
  reply.removeHeader("x-frame-options");
  reply.header(
    "content-security-policy",
    `default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; script-src 'none'; connect-src 'none'; frame-ancestors ${env.WEB_ORIGIN}; base-uri 'none'; form-action 'none'`
  );
  return reply.send(Buffer.from(body));
}

function requiredArtifact(artifact: ReportArtifactRow | undefined): ReportArtifactRow {
  if (!artifact) throw new Error("Report review did not produce a durable HTML artifact.");
  return artifact;
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

async function lockReportArtifacts(tx: DatabaseTransaction, projectId: string, reportId: string): Promise<void> {
  await tx.execute(sql`
    SELECT "id"
    FROM "report_artifacts"
    WHERE "project_id" = ${projectId} AND "report_id" = ${reportId}
    ORDER BY "id"
    FOR UPDATE
  `);
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
  if (issue.currentPublishedReportId !== run.correctionPredecessorReportId) {
    return "The published report changed after correction generation admission.";
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
  await assertRankingSources(tx, projectId, evidence);
  await assertPageVersionSources(tx, projectId, evidence);
  await assertDeploymentSources(tx, projectId, evidence);
  await assertReleaseVerificationSources(tx, projectId, evidence);
  await assertReleaseVerificationCheckSources(tx, projectId, evidence);
  await assertRollbackSources(tx, projectId, evidence);
  await assertOpportunitySources(tx, projectId, evidence);
  await assertReleaseActionTargets(tx, projectId, snapshot);
}

type ReportEvidenceItem = CustomerReportSnapshot["factProjection"]["evidence"][number];

async function assertRankingSources(
  tx: DatabaseTransaction,
  projectId: string,
  evidence: ReportEvidenceItem[]
): Promise<void> {
  const items = evidence.filter(
    (item): item is Extract<ReportEvidenceItem, { sourceKind: "ranking_proof" }> => item.sourceKind === "ranking_proof"
  );
  if (items.length === 0) return;
  const rows = await tx
    .select()
    .from(rankingProofs)
    .where(
      and(
        eq(rankingProofs.projectId, projectId),
        inArray(
          rankingProofs.id,
          items.map((item) => item.sourceId)
        )
      )
    );
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  for (const item of items) {
    const row = rowsById.get(item.sourceId);
    if (
      !row ||
      row.status !== "reviewed" ||
      row.query !== item.query ||
      row.pageUrl !== item.pageUrl ||
      row.rank !== item.rank ||
      row.searchEngine !== item.searchEngine ||
      row.device !== item.device ||
      (row.locale ?? "de-DE") !== item.locale ||
      row.capturedAt.toISOString() !== item.observedAt
    ) {
      throwEvidenceSourceMismatch();
    }
    expectSourceDigest(item, {
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
    });
  }
}

async function assertPageVersionSources(
  tx: DatabaseTransaction,
  projectId: string,
  evidence: ReportEvidenceItem[]
): Promise<void> {
  const items = evidence.filter(
    (item): item is Extract<ReportEvidenceItem, { sourceKind: "page_version" }> => item.sourceKind === "page_version"
  );
  if (items.length === 0) return;
  const rows = await tx
    .select({ version: pageVersions, proposal: pageProposals })
    .from(pageVersions)
    .innerJoin(pageProposals, eq(pageVersions.pageProposalId, pageProposals.id))
    .where(
      and(
        eq(pageProposals.projectId, projectId),
        inArray(
          pageVersions.id,
          items.map((item) => item.pageVersionId)
        )
      )
    );
  const rowsById = new Map(rows.map((row) => [row.version.id, row]));
  for (const item of items) {
    const row = rowsById.get(item.pageVersionId);
    if (
      !row ||
      !row.version.approvedAt ||
      row.proposal.route !== item.route ||
      row.version.versionNumber !== item.versionNumber ||
      row.version.status !== item.status ||
      row.version.approvedAt.toISOString() !== item.approvedAt ||
      row.version.updatedAt.toISOString() !== item.observedAt
    ) {
      throwEvidenceSourceMismatch();
    }
    expectSourceDigest(item, {
      sourceKind: "page_version",
      id: row.version.id,
      projectId,
      route: row.proposal.route,
      versionNumber: row.version.versionNumber,
      status: row.version.status,
      approvedAt: row.version.approvedAt.toISOString(),
      updatedAt: row.version.updatedAt.toISOString()
    });
  }
}

async function assertDeploymentSources(
  tx: DatabaseTransaction,
  projectId: string,
  evidence: ReportEvidenceItem[]
): Promise<void> {
  const items = evidence.filter(
    (item): item is Extract<ReportEvidenceItem, { sourceKind: "deployment" }> => item.sourceKind === "deployment"
  );
  if (items.length === 0) return;
  const rows = await tx
    .select({ deployment: deployments, releasePlan: releasePlans })
    .from(deployments)
    .innerJoin(releasePlans, eq(deployments.releasePlanId, releasePlans.id))
    .where(
      and(
        eq(deployments.projectId, projectId),
        inArray(
          deployments.id,
          items.map((item) => item.deploymentId)
        )
      )
    );
  const rowsById = new Map(rows.map((row) => [row.deployment.id, row]));
  for (const item of items) {
    const row = rowsById.get(item.deploymentId);
    if (
      !row ||
      !row.deployment.providerDeployId ||
      !row.releasePlan.deployedAt ||
      row.releasePlan.id !== item.releasePlanId ||
      row.deployment.provider !== item.provider ||
      row.deployment.providerDeployId !== item.providerDeployId ||
      row.deployment.status !== item.status ||
      row.releasePlan.deployedAt.toISOString() !== item.handedOffAt ||
      row.releasePlan.deployedAt.toISOString() !== item.observedAt
    ) {
      throwEvidenceSourceMismatch();
    }
    expectSourceDigest(item, {
      sourceKind: "deployment",
      id: row.deployment.id,
      projectId: row.deployment.projectId,
      releasePlanId: row.releasePlan.id,
      provider: row.deployment.provider,
      providerDeployId: row.deployment.providerDeployId,
      status: row.deployment.status,
      handedOffAt: row.releasePlan.deployedAt.toISOString()
    });
  }
}

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
    .select({ verification: releaseVerifications, deployment: deployments })
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
  const rowsById = new Map(rows.map((row) => [row.verification.id, row]));
  for (const item of items) {
    const row = rowsById.get(item.verificationId);
    if (
      !row ||
      row.verification.deploymentId !== item.deploymentId ||
      row.verification.releasePlanId !== item.releasePlanId ||
      row.verification.status !== item.status ||
      row.verification.checkedAt.toISOString() !== item.checkedAt ||
      row.verification.checkedAt.toISOString() !== item.observedAt
    ) {
      throwEvidenceSourceMismatch();
    }
    expectSourceDigest(item, {
      sourceKind: "release_verification",
      id: row.verification.id,
      projectId: row.deployment.projectId,
      releasePlanId: row.verification.releasePlanId,
      deploymentId: row.verification.deploymentId,
      status: row.verification.status,
      checkedAt: row.verification.checkedAt.toISOString()
    });
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
    .select({ check: releaseVerificationChecks, projectId: releasePlans.projectId, releasePlanId: releasePlans.id })
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
  const rowsById = new Map(rows.map((row) => [row.check.id, row]));
  for (const item of items) {
    const row = rowsById.get(item.sourceId);
    const customerCopy = row ? customerSafeReleaseWarningForCheck(row.check.checkKey, row.check.scope) : undefined;
    if (
      !row ||
      !customerCopy ||
      row.check.verificationId !== item.verificationId ||
      row.releasePlanId !== item.releasePlanId ||
      row.check.checkKey !== item.checkKey ||
      row.check.severity !== item.severity ||
      row.check.result !== "failed" ||
      customerCopy.title !== item.customerLabel ||
      customerCopy.summary !== item.summary ||
      row.check.checkedAt.toISOString() !== item.checkedAt ||
      row.check.checkedAt.toISOString() !== item.observedAt
    ) {
      throwEvidenceSourceMismatch();
    }
    expectSourceDigest(item, {
      sourceKind: "release_verification_check",
      id: row.check.id,
      projectId: row.projectId,
      releasePlanId: row.releasePlanId,
      verificationId: row.check.verificationId,
      checkKey: row.check.checkKey,
      scope: row.check.scope,
      severity: row.check.severity,
      result: row.check.result,
      message: row.check.message,
      checkedAt: row.check.checkedAt.toISOString()
    });
  }
}

function assertSnapshotMatchesEvidencePacket(run: ReportGenerationRunRow, snapshot: CustomerReportSnapshot): void {
  if (!run.evidencePacketCanonicalText || !run.evidencePacketSha256) {
    throw new UnprocessableEntityException("Report generation has no server-owned evidence packet.");
  }
  let packetInput: unknown;
  try {
    packetInput = JSON.parse(run.evidencePacketCanonicalText);
  } catch {
    throw new UnprocessableEntityException("Stored report evidence packet is not canonical JSON.");
  }
  const packet = CustomerReportEvidencePacketSchema.parse(packetInput);
  if (
    canonicalizeCustomerReportEvidencePacket(packet) !== run.evidencePacketCanonicalText ||
    sha256(run.evidencePacketCanonicalText) !== run.evidencePacketSha256 ||
    packet.identity.projectId !== snapshot.identity.projectId ||
    packet.identity.reportKind !== snapshot.identity.reportKind ||
    packet.identity.period !== snapshot.identity.period ||
    packet.identity.locale !== snapshot.identity.locale ||
    packet.identity.timezone !== snapshot.identity.timezone ||
    packet.evidenceCutoffAt !== snapshot.evidenceCutoffAt ||
    packet.assembledAt !== snapshot.generatedAt ||
    canonicalizeCustomerReportFactProjection(assembleCustomerReportFactProjection(packet)) !==
      canonicalizeCustomerReportFactProjection(snapshot.factProjection)
  ) {
    throw new UnprocessableEntityException(
      "Customer report snapshot does not match its server-owned evidence packet and assembly policy."
    );
  }
}

async function assertReleaseActionTargets(
  tx: DatabaseTransaction,
  projectId: string,
  snapshot: CustomerReportSnapshot
): Promise<void> {
  const actions = snapshot.factProjection.nextActions.filter(
    (action): action is typeof action & { target: { surface: "release_review"; releasePlanId: string } } =>
      action.target.surface === "release_review"
  );
  if (actions.length === 0) return;
  const planIds = [...new Set(actions.map((action) => action.target.releasePlanId))];
  const planRows = await tx
    .select({ id: releasePlans.id })
    .from(releasePlans)
    .where(and(eq(releasePlans.projectId, projectId), inArray(releasePlans.id, planIds)));
  if (planRows.length !== planIds.length) throwEvidenceSourceMismatch();
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
    .select({ rollbackPoint: rollbackPoints, deployment: deployments })
    .from(rollbackPoints)
    .innerJoin(deployments, eq(rollbackPoints.releasePlanId, deployments.releasePlanId))
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
  const rowsById = new Map(rows.map((row) => [row.rollbackPoint.id, row]));
  for (const item of items) {
    const row = rowsById.get(item.rollbackPointId);
    const execution = CustomerReportCompletedRollbackEvidenceSchema.safeParse(
      recordFromUnknown(row?.rollbackPoint.evidenceJson).rollbackExecution
    );
    if (
      !row ||
      !execution.success ||
      row.rollbackPoint.releasePlanId !== item.releasePlanId ||
      row.deployment.id !== item.deploymentId ||
      row.deployment.status !== "rolled_back" ||
      execution.data.executedAt !== item.rolledBackAt ||
      execution.data.executedAt !== item.observedAt
    ) {
      throwEvidenceSourceMismatch();
    }
    expectSourceDigest(item, {
      sourceKind: "rollback",
      id: row.rollbackPoint.id,
      projectId: row.rollbackPoint.projectId,
      releasePlanId: row.rollbackPoint.releasePlanId,
      deploymentId: row.deployment.id,
      restoreSourceDeploymentId: row.rollbackPoint.deploymentId,
      status: execution.data.status,
      rolledBackAt: execution.data.executedAt,
      providerDeployId: execution.data.providerDeployId
    });
  }
}

async function assertOpportunitySources(
  tx: DatabaseTransaction,
  projectId: string,
  evidence: ReportEvidenceItem[]
): Promise<void> {
  const items = evidence.filter(
    (item): item is Extract<ReportEvidenceItem, { sourceKind: "opportunity" }> => item.sourceKind === "opportunity"
  );
  if (items.length === 0) return;
  const rows = await tx
    .select()
    .from(opportunities)
    .where(
      and(
        eq(opportunities.projectId, projectId),
        inArray(
          opportunities.id,
          items.map((item) => item.opportunityId)
        )
      )
    );
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  for (const item of items) {
    const row = rowsById.get(item.opportunityId);
    if (
      !row ||
      row.classification !== item.classification ||
      row.status !== item.status ||
      row.primaryKeyword !== item.title ||
      row.updatedAt.toISOString() !== item.observedAt
    ) {
      throwEvidenceSourceMismatch();
    }
    expectSourceDigest(item, {
      sourceKind: "opportunity",
      id: row.id,
      projectId: row.projectId,
      classification: row.classification,
      status: row.status,
      title: row.primaryKeyword,
      score: row.score,
      updatedAt: row.updatedAt.toISOString()
    });
  }
}

function throwEvidenceSourceMismatch(): never {
  throw new UnprocessableEntityException(
    "Customer report evidence source relationship was missing, mismatched, or belonged to another project."
  );
}

function expectSourceDigest(item: ReportEvidenceItem, payload: unknown): void {
  const digest = sha256(canonicalizeCustomerReportSourcePayload(payload));
  if (item.payloadSha256 !== digest || item.sourceVersion !== digest) throwEvidenceSourceMismatch();
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
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

function parseOptionalDecisionNote(value: string | undefined): string | null {
  if (value === undefined) return null;
  const parsed = CustomerReportDecisionNoteSchema.safeParse(value);
  if (!parsed.success || parsed.data.trim().length === 0) {
    throw new BadRequestException("Report correction requires a bounded decision note.");
  }
  return parsed.data;
}

function validateReportCommandTarget(
  input: {
    projectId: string;
    reportId: string;
    actorUserId: string;
    requestId: string;
    expectedSnapshotSha256: string;
    expectedRowVersion: number;
  },
  label: string
): void {
  requireUuid(input.projectId, "Report project id must be a UUID.");
  requireUuid(input.reportId, "Report id must be a UUID.");
  requireUuid(input.actorUserId, `${label} requires a persisted human actor.`);
  requireUuid(input.requestId, `${label} request id must be a UUID.`);
  requireSha256(input.expectedSnapshotSha256, `${label} requires an exact snapshot digest.`);
  if (!Number.isSafeInteger(input.expectedRowVersion) || input.expectedRowVersion < 0) {
    throw new BadRequestException(`${label} requires a non-negative expected row version.`);
  }
}

function assertReportCommandTarget(
  report: ReportRow,
  input: { expectedSnapshotSha256: string; expectedRowVersion: number },
  message: string
): void {
  if (report.snapshotSha256 !== input.expectedSnapshotSha256 || report.rowVersion !== input.expectedRowVersion) {
    throw new ConflictException(message);
  }
}

function parseStoredReportSnapshot(report: ReportRow): CustomerReportSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(report.snapshotCanonicalText);
  } catch {
    throw new UnprocessableEntityException("Stored customer report snapshot is not valid JSON.");
  }
  const prepared = prepareSnapshot(parsed);
  if (
    prepared.snapshotCanonicalText !== report.snapshotCanonicalText ||
    prepared.snapshotSha256 !== report.snapshotSha256 ||
    prepared.factProjectionSha256 !== report.factProjectionSha256
  ) {
    throw new UnprocessableEntityException("Stored customer report snapshot or digest is inconsistent.");
  }
  return prepared.snapshot;
}

async function verifyImmutableArtifactBytes(
  reader: ImmutableArtifactReaderPort,
  artifact: ReportArtifactRow
): Promise<Uint8Array> {
  if (
    artifact.status !== "staged" ||
    !artifact.storageKey ||
    !artifact.artifactSha256 ||
    artifact.byteSize === null ||
    artifact.byteSize > customerReportHtmlMaxBytes
  ) {
    throw new ConflictException(
      "Report document access requires a bounded staged artifact with immutable byte evidence."
    );
  }
  let body: Uint8Array;
  try {
    body = await reader.readImmutableArtifact({ key: artifact.storageKey, maxBytes: artifact.byteSize + 1 });
  } catch (error) {
    throw new ServiceUnavailableException("Report artifact bytes are unavailable.", { cause: error });
  }
  if (body.byteLength !== artifact.byteSize || sha256Bytes(body) !== artifact.artifactSha256) {
    throw new ServiceUnavailableException("Report artifact bytes failed immutable digest verification.");
  }
  return body;
}

async function lockReports(tx: DatabaseTransaction, projectId: string, reportIds: string[]): Promise<void> {
  for (const reportId of [...new Set(reportIds)].sort()) {
    await lockReport(tx, projectId, reportId);
  }
}

async function lockCustomerReportEvidenceSources(
  tx: DatabaseTransaction,
  snapshot: CustomerReportSnapshot
): Promise<void> {
  const projectId = snapshot.identity.projectId;
  // Release writers pin rv -> checks -> rollback -> deployment -> page version.
  const sourceKinds = [
    "ranking_proof",
    "release_verification",
    "release_verification_check",
    "rollback",
    "deployment",
    "page_version",
    "opportunity"
  ] as const;
  for (const sourceKind of sourceKinds) {
    const sourceIds = [
      ...new Set(
        snapshot.factProjection.evidence
          .filter((evidence) => evidence.sourceKind === sourceKind)
          .map((evidence) => evidence.sourceId)
      )
    ].sort();
    for (const sourceId of sourceIds) {
      switch (sourceKind) {
        case "ranking_proof":
          await tx.execute(
            sql`SELECT "id" FROM "ranking_proofs" WHERE "id" = ${sourceId} AND "project_id" = ${projectId} FOR UPDATE`
          );
          break;
        case "page_version":
          await tx.execute(sql`
            SELECT pv."id" FROM "page_versions" pv
            INNER JOIN "page_proposals" pp ON pp."id" = pv."page_proposal_id"
            WHERE pv."id" = ${sourceId} AND pp."project_id" = ${projectId}
            FOR UPDATE OF pv
          `);
          break;
        case "deployment":
          await tx.execute(
            sql`SELECT "id" FROM "deployments" WHERE "id" = ${sourceId} AND "project_id" = ${projectId} FOR UPDATE`
          );
          break;
        case "release_verification":
          await tx.execute(sql`
            SELECT rv."id" FROM "release_verifications" rv
            INNER JOIN "deployments" d ON d."id" = rv."deployment_id"
            WHERE rv."id" = ${sourceId} AND d."project_id" = ${projectId}
            FOR UPDATE OF rv
          `);
          break;
        case "release_verification_check":
          await tx.execute(sql`
            SELECT rvc."id" FROM "release_verification_checks" rvc
            INNER JOIN "release_verifications" rv ON rv."id" = rvc."release_verification_id"
            INNER JOIN "deployments" d ON d."id" = rv."deployment_id"
            WHERE rvc."id" = ${sourceId} AND d."project_id" = ${projectId}
            FOR UPDATE OF rvc
          `);
          break;
        case "rollback":
          await tx.execute(
            sql`SELECT "id" FROM "rollback_points" WHERE "id" = ${sourceId} AND "project_id" = ${projectId} FOR UPDATE`
          );
          break;
        case "opportunity":
          await tx.execute(
            sql`SELECT "id" FROM "opportunities" WHERE "id" = ${sourceId} AND "project_id" = ${projectId} FOR UPDATE`
          );
          break;
      }
    }
  }
}

function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function isString(value: string | null | undefined): value is string {
  return typeof value === "string";
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
  if (!isUuid(value)) {
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

function persistedActorUserId(request: RequestWithAuth): string | undefined {
  const userId = request.auth?.user.id;
  return userId && isUuid(userId) ? userId : undefined;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function assertCustomerReportGenerationWindow(period: string, evidenceCutoffAt: Date, now: Date): void {
  const generationWindow = decideCustomerReportGenerationWindow({ period, evidenceCutoffAt, now });
  if (generationWindow.kind === "deny") {
    throw new BadRequestException(
      `Report evidence cutoff is outside the accepted monthly window: ${generationWindow.reason}.`
    );
  }
}

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "report_queue_enqueue_failed";
}
