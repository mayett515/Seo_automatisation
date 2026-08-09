import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { ImmutableArtifactReaderPort } from "@localseo/adapters";
import {
  CustomerReportCandidateDetailSchema,
  CustomerReportDecisionNoteSchema,
  CustomerReportWorkspaceResponseSchema,
  type CustomerReportArtifactSummary,
  type CustomerReportCandidateDetail,
  type CustomerReportWorkspaceResponse
} from "@localseo/contracts";
import { decideCustomerReportTransition } from "@localseo/domain";
import { reportArtifacts, reportGenerationRuns, reportIssues, reportLifecycleEvents, reports } from "@localseo/db";
import { and, asc, desc, eq, inArray } from "@localseo/db/query";
import { DatabaseService } from "../../database/database.service.js";
import type { ReportDocumentCapabilityClaims } from "../../report-document-capability.js";
import {
  assertEvidenceSourcesBelongToProject,
  assertReportCommandTarget,
  loadLatestMatchingArtifact,
  lockReport,
  lockReportArtifacts,
  lockReportIssue,
  parseStoredReportSnapshot,
  reportArtifactDefinition,
  reportArtifactSummary,
  reportCandidateSummary,
  reportGenerationRunSummary,
  requestChangesResult,
  requireArtifactReader,
  requiredArtifact,
  requireSha256,
  requireUuid,
  submitReviewResult,
  validateReportCommandTarget,
  validateStoredReport,
  verifyImmutableArtifactBytes,
  type CustomerReportArtifactRetryTransition,
  type CustomerReportReviewTransition,
  type ReportArtifactRow
} from "./report-aggregate-store.js";

export class ReportReviewCapability {
  constructor(
    private readonly database: DatabaseService,
    private readonly artifactReader?: ImmutableArtifactReaderPort
  ) {}

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

  async getArtifactDocument(claims: ReportDocumentCapabilityClaims): Promise<Uint8Array> {
    if (claims.kind !== "candidate") {
      throw new UnauthorizedException("Candidate report document capability is required.");
    }
    const [row] = await this.database
      .requireDb()
      .select({ artifact: reportArtifacts })
      .from(reportArtifacts)
      .innerJoin(reports, eq(reportArtifacts.reportId, reports.id))
      .where(
        and(
          eq(reportArtifacts.id, claims.artifactId),
          eq(reportArtifacts.reportId, claims.reportId),
          eq(reportArtifacts.projectId, claims.projectId),
          eq(reportArtifacts.status, "staged"),
          eq(reportArtifacts.snapshotSha256, claims.snapshotSha256),
          eq(reportArtifacts.artifactSha256, claims.artifactSha256),
          eq(reports.projectId, claims.projectId),
          eq(reports.status, "ready_for_review"),
          eq(reports.snapshotSha256, claims.snapshotSha256)
        )
      )
      .limit(1);
    if (!row) throw new NotFoundException("The capability-bound staged report artifact is unavailable.");
    return verifyImmutableArtifactBytes(requireArtifactReader(this.artifactReader), row.artifact);
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
