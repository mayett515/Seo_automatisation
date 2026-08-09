import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException
} from "@nestjs/common";
import {
  CustomerReportGenerationRunSchema,
  CustomerReportIdentitySchema,
  CustomerReportNarrativeModeSchema,
  type CustomerReportIdentity,
  type CustomerReportNarrativeMode
} from "@localseo/contracts";
import { customerReportVersions } from "@localseo/domain";
import { reportGenerationRuns, reportIssues, reportLifecycleEvents, reports } from "@localseo/db";
import { and, eq, inArray, sql } from "@localseo/db/query";
import { DatabaseService } from "../../database/database.service.js";
import {
  assertCustomerReportGenerationWindow,
  assertEvidenceSourcesBelongToProject,
  assertSnapshotMatchesEvidencePacket,
  assertSnapshotMatchesRun,
  deleteReportProjection,
  generationAdmission,
  generationStaleReason,
  isActiveGenerationStatus,
  loadCurrentCandidate,
  lockAndLoadReportIssueByIdentity,
  lockReportGenerationRun,
  lockReportIssue,
  parseOptionalDecisionNote,
  parseTimestamp,
  persistReportProjection,
  persistedDraft,
  prepareSnapshot,
  reportSnapshotValues,
  reportValues,
  requireUuid,
  type CustomerReportDraftPersistence,
  type CustomerReportGenerationAdmission,
  type ReportRow
} from "./report-aggregate-store.js";

export class ReportGenerationCapability {
  constructor(private readonly database: DatabaseService) {}

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

  async persistGeneratedDraft(input: {
    projectId: string;
    runId: string;
    snapshot: unknown;
  }): Promise<CustomerReportDraftPersistence> {
    requireUuid(input.projectId, "Report project id must be a UUID.");
    requireUuid(input.runId, "Report generation run id must be a UUID.");
    const prepared = prepareSnapshot(input.snapshot);
    if (prepared.snapshot.narrativeMode === "bounded_ai") {
      throw new UnprocessableEntityException("Internal report draft persistence accepts fact-only snapshots only.");
    }
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
}
