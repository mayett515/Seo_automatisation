import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { ImmutableArtifactReaderPort } from "@localseo/adapters";
import {
  CustomerReportPublishedDetailSchema,
  CustomerReportPublishedSummarySchema,
  type CustomerReportPublishedDetail,
  type CustomerReportPublishedSummary
} from "@localseo/contracts";
import { reportArtifacts, reportEvidenceAlerts, reportIssues, reportLifecycleEvents, reports } from "@localseo/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { DatabaseService } from "../../database/database.service.js";
import type { ReportDocumentCapabilityClaims } from "../../report-document-capability.js";
import {
  assertEvidenceSourcesBelongToProject,
  assertReportCommandTarget,
  isString,
  lockCustomerReportEvidenceSources,
  lockReportArtifacts,
  lockReportIssue,
  lockReports,
  parseStoredReportSnapshot,
  requireArtifactReader,
  requireUuid,
  validateReportCommandTarget,
  validateStoredReport,
  verifyImmutableArtifactBytes,
  type CustomerReportPublicationTransition,
  type ReportArtifactRow,
  type ReportIssueRow,
  type ReportRow
} from "./report-aggregate-store.js";

export class ReportPublicationCapability {
  constructor(
    private readonly database: DatabaseService,
    private readonly artifactReader?: ImmutableArtifactReaderPort
  ) {}

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
    await verifyImmutableArtifactBytes(requireArtifactReader(this.artifactReader), initialArtifact);

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

  async getPublishedDocument(claims: ReportDocumentCapabilityClaims): Promise<Uint8Array> {
    if (claims.kind !== "published") {
      throw new UnauthorizedException("Published report document capability is required.");
    }
    const { report, artifact } = await this.loadPublishedRow(claims.projectId, claims.reportId, claims.artifactId);
    if (report.snapshotSha256 !== claims.snapshotSha256 || artifact.artifactSha256 !== claims.artifactSha256) {
      throw new NotFoundException("The capability-bound published report artifact is unavailable.");
    }
    return verifyImmutableArtifactBytes(requireArtifactReader(this.artifactReader), artifact);
  }

  private async loadPublishedRow(projectId: string, reportId: string, artifactId?: string) {
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
          artifactId ? eq(reportArtifacts.id, artifactId) : undefined,
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
}
