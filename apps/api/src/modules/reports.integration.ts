import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { type ImmutableArtifactReaderPort, type ImmutableArtifactStoredObject } from "@localseo/adapters";
import {
  CustomerReportEvidencePacketSchema,
  CustomerReportSnapshotSchema,
  type CustomerReportSnapshot
} from "@localseo/contracts";
import {
  customers,
  opportunities,
  projects,
  rankingProofs,
  reportClaimEvidence,
  reportArtifacts,
  reportClaims,
  reportEvidenceAlerts,
  reportEvidenceItems,
  reportGenerationRuns,
  reportIssues,
  reportLifecycleEvents,
  reports,
  users,
  type DatabaseClient
} from "@localseo/db";
import {
  assembleCustomerReportFactProjection,
  canonicalizeCustomerReportEvidencePacket,
  canonicalizeCustomerReportFactProjection,
  canonicalizeCustomerReportSourcePayload
} from "@localseo/domain";
import { and, eq, inArray } from "drizzle-orm";
import {
  createIntegrationTestDatabase,
  truncateIntegrationTables
} from "../../../../packages/db/test-support/integration-database.js";
import { DatabaseService } from "../database/database.service.js";
import { ReportsService } from "./reports.module.js";
import { OpportunitiesService } from "./opportunities.module.js";

type IntegrationDatabase = Awaited<ReturnType<typeof createIntegrationTestDatabase>>;

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = Boolean(testDatabaseUrl);
const cutoff = "2026-08-01T10:00:00.000Z";

void describe(
  "ReportsService integration",
  { skip: runIntegration ? false : "TEST_DATABASE_URL is not configured" },
  () => {
    let handle: IntegrationDatabase;
    let db: DatabaseClient;
    let service: ReportsService;
    let opportunitiesService: OpportunitiesService;
    let artifactReader: MemoryArtifactReader;

    before(async () => {
      assert.ok(testDatabaseUrl);
      handle = await createIntegrationTestDatabase(testDatabaseUrl);
      db = handle.db;
    });

    beforeEach(async () => {
      await truncateIntegrationTables(handle.sql);
      artifactReader = new MemoryArtifactReader();
      service = new ReportsService(testDatabaseService(db), artifactReader);
      opportunitiesService = new OpportunitiesService(testDatabaseService(db));
    });

    after(async () => {
      await handle?.close();
    });

    void it("serializes the first report generation empty-set race on one stable issue", async () => {
      const fixture = await createReportFixture(db, "First generation race");
      const identity = reportIdentity(fixture.projectId);
      const firstIdempotencyKey = randomUUID();
      const secondIdempotencyKey = randomUUID();

      const [first, second] = await Promise.all([
        service.admitGeneration({
          identity,
          requestedByUserId: fixture.userId,
          idempotencyKey: firstIdempotencyKey,
          evidenceCutoffAt: cutoff
        }),
        service.admitGeneration({
          identity,
          requestedByUserId: fixture.userId,
          idempotencyKey: secondIdempotencyKey,
          evidenceCutoffAt: cutoff
        })
      ]);

      assert.deepEqual(new Set([first.kind, second.kind]), new Set(["created", "already_active"]));
      assert.equal(first.reportIssueId, second.reportIssueId);
      assert.equal(first.runId, second.runId);
      assert.equal((await db.select().from(reportIssues)).length, 1);
      assert.equal((await db.select().from(reportGenerationRuns)).length, 1);

      const createdIdempotencyKey = first.kind === "created" ? firstIdempotencyKey : secondIdempotencyKey;
      const replayed = await service.admitGeneration({
        identity,
        requestedByUserId: fixture.userId,
        idempotencyKey: createdIdempotencyKey,
        evidenceCutoffAt: cutoff
      });
      assert.equal(replayed.kind, "replayed");
      assert.equal(replayed.runId, first.runId);
      await assert.rejects(
        () =>
          service.admitGeneration({
            identity,
            requestedByUserId: fixture.userId,
            idempotencyKey: createdIdempotencyKey,
            evidenceCutoffAt: "2026-08-01T11:00:00.000Z"
          }),
        /Report generation idempotency key belongs to another request/u
      );
    });

    void it("persists one canonical draft and exact normalized provenance before human review", async () => {
      const fixture = await createReportFixture(db, "Canonical draft");
      const admission = await admit(service, fixture);
      const snapshot = reportSnapshot(fixture, "Local SEO Fortschritt Juli 2026");

      const persisted = await persistGeneratedDraft(service, db, {
        projectId: fixture.projectId,
        runId: admission.runId,
        snapshot
      });

      assert.equal(persisted.kind, "persisted");
      const [report] = await db.select().from(reports).where(eq(reports.id, persisted.reportId));
      assert.ok(report);
      assert.equal(report.status, "draft");
      assert.equal(report.snapshotSha256, persisted.snapshotSha256);
      assert.equal(report.factProjectionSha256, snapshot.factProjectionSha256);
      assert.equal(report.versionNumber, 1);
      assert.equal(report.rowVersion, 0);
      assert.equal((await db.select().from(reportClaims)).length, 1);
      assert.equal((await db.select().from(reportEvidenceItems)).length, 1);
      assert.equal((await db.select().from(reportClaimEvidence)).length, 1);

      const [event] = await db.select().from(reportLifecycleEvents);
      assert.equal(event?.eventType, "report_generated");
      assert.equal(event?.actorType, "system");
      assert.equal(event?.snapshotSha256, report.snapshotSha256);

      const [claim] = await db.select().from(reportClaims).where(eq(reportClaims.reportId, report.id));
      const [evidence] = await db.select().from(reportEvidenceItems).where(eq(reportEvidenceItems.reportId, report.id));
      assert.ok(claim);
      assert.ok(evidence);

      await assert.rejects(
        () =>
          db
            .update(reportEvidenceItems)
            .set({ proofTier: "internal_signal" })
            .where(eq(reportEvidenceItems.id, evidence.id)),
        postgresErrorMatches(/report_evidence_items_proof_tier_check/u)
      );
      await db
        .update(reportClaims)
        .set({ claimJson: { ...claim.claimJson, claimKey: "opportunity:forged" } })
        .where(eq(reportClaims.id, claim.id));
      await assert.rejects(
        () =>
          db
            .update(reports)
            .set({
              status: "ready_for_review",
              reviewedSnapshotSha256: report.snapshotSha256,
              readyAt: new Date(),
              rowVersion: report.rowVersion + 1
            })
            .where(eq(reports.id, report.id)),
        postgresErrorMatches(/must match the exact canonical snapshot/u)
      );
      await db.update(reportClaims).set({ claimJson: claim.claimJson }).where(eq(reportClaims.id, claim.id));

      await assert.rejects(
        () =>
          db
            .update(reports)
            .set({
              status: "ready_for_review",
              reviewedSnapshotSha256: report.snapshotSha256,
              readyAt: new Date(),
              rowVersion: report.rowVersion + 1
            })
            .where(eq(reports.id, report.id)),
        postgresErrorMatches(/requires an exact pending or staged HTML artifact/u)
      );

      await assert.rejects(
        () =>
          db.insert(reportLifecycleEvents).values({
            projectId: fixture.projectId,
            reportIssueId: report.reportIssueId,
            reportId: report.id,
            eventType: "submitted_for_review",
            fromStatus: "ready_for_review",
            toStatus: "draft",
            actorType: "human",
            actorUserId: fixture.userId,
            requestId: randomUUID(),
            snapshotSha256: report.snapshotSha256
          }),
        postgresErrorMatches(/must describe one exact human review transition/u)
      );

      const other = await createReportFixture(db, "Cross-issue generation reference");
      const otherAdmission = await admit(service, other);
      await assert.rejects(
        () =>
          db
            .update(reportGenerationRuns)
            .set({
              baseCandidateReportId: report.id,
              baseCandidateRowVersion: report.rowVersion,
              baseCandidateSnapshotSha256: report.snapshotSha256
            })
            .where(eq(reportGenerationRuns.id, otherAdmission.runId)),
        postgresErrorMatches(/base candidate must belong to the same issue and project/u)
      );

      const reviewed = await service.submitForReview({
        projectId: fixture.projectId,
        reportId: report.id,
        actorUserId: fixture.userId,
        requestId: randomUUID(),
        expectedSnapshotSha256: report.snapshotSha256,
        expectedRowVersion: report.rowVersion
      });
      assert.equal(reviewed.status, "ready_for_review");
      assert.equal(reviewed.rowVersion, 1);
      assert.equal(reviewed.command, "submit_for_review");
      if (reviewed.command !== "submit_for_review") return;
      assert.equal(reviewed.artifact.status, "pending");
      assert.equal(reviewed.artifact.reportId, report.id);
      assert.equal(reviewed.artifact.snapshotSha256, report.snapshotSha256);
      assert.equal((await db.select().from(reportArtifacts)).length, 1);

      await assert.rejects(
        () => db.update(reports).set({ snapshotCanonicalText: "{}", rowVersion: 2 }).where(eq(reports.id, report.id)),
        postgresErrorMatches(/Reviewed and published report semantics are immutable/u)
      );
      await assert.rejects(
        () => db.delete(reportClaims).where(eq(reportClaims.reportId, report.id)),
        postgresErrorMatches(/only while the report is draft/u)
      );
      await assert.rejects(
        () =>
          db
            .update(reports)
            .set({
              status: "published",
              publishedByUserId: fixture.userId,
              publishedAt: new Date(),
              rowVersion: 2
            })
            .where(eq(reports.id, report.id)),
        postgresErrorMatches(/publication requires one exact staged immutable artifact/u)
      );
    });

    void it("returns a reviewed candidate to draft and regenerates it with an expected-version CAS", async () => {
      const fixture = await createReportFixture(db, "Draft regeneration");
      const firstAdmission = await admit(service, fixture);
      const first = await persistGeneratedDraft(service, db, {
        projectId: fixture.projectId,
        runId: firstAdmission.runId,
        snapshot: reportSnapshot(fixture, "Erster Entwurf")
      });
      assert.notEqual(first.kind, "stale");
      if (first.kind === "stale") return;

      const reviewed = await service.submitForReview({
        projectId: fixture.projectId,
        reportId: first.reportId,
        actorUserId: fixture.userId,
        requestId: randomUUID(),
        expectedSnapshotSha256: first.snapshotSha256,
        expectedRowVersion: first.reportRowVersion
      });
      assert.equal(reviewed.command, "submit_for_review");
      if (reviewed.command !== "submit_for_review") return;
      const artifactSha256 = "b".repeat(64);
      const storageKey = `reports/${fixture.projectId}/${first.reportId}/html/${reviewed.artifact.id}/${artifactSha256}.html`;
      await db
        .update(reportArtifacts)
        .set({ status: "running", startedAt: new Date("2026-08-01T12:00:00.000Z") })
        .where(eq(reportArtifacts.id, reviewed.artifact.id));
      await db
        .update(reportArtifacts)
        .set({
          status: "staged",
          storageKey,
          artifactSha256,
          byteSize: 128,
          stagedAt: new Date("2026-08-01T12:01:00.000Z")
        })
        .where(eq(reportArtifacts.id, reviewed.artifact.id));
      await assert.rejects(
        () => admit(service, fixture),
        /Return the reviewed report candidate to draft before regenerating it/u
      );
      await assert.rejects(
        () =>
          service.requestChanges({
            projectId: fixture.projectId,
            reportId: first.reportId,
            actorUserId: fixture.userId,
            requestId: randomUUID(),
            expectedSnapshotSha256: reviewed.snapshotSha256,
            expectedRowVersion: reviewed.rowVersion,
            decisionNote: "Ungueltig\u0000"
          }),
        /bounded decision note/u
      );
      const returned = await service.requestChanges({
        projectId: fixture.projectId,
        reportId: first.reportId,
        actorUserId: fixture.userId,
        requestId: randomUUID(),
        expectedSnapshotSha256: reviewed.snapshotSha256,
        expectedRowVersion: reviewed.rowVersion,
        decisionNote: "Bitte den Ausblick klarer formulieren."
      });
      assert.equal(returned.status, "draft");
      const [expiredArtifact] = await db
        .select()
        .from(reportArtifacts)
        .where(eq(reportArtifacts.reportId, first.reportId));
      assert.equal(expiredArtifact?.status, "expired");
      assert.ok(expiredArtifact?.expiredAt);
      assert.equal(expiredArtifact?.storageKey, storageKey);
      assert.equal(expiredArtifact?.artifactSha256, artifactSha256);

      const secondAdmission = await admit(service, fixture);
      const second = await persistGeneratedDraft(service, db, {
        projectId: fixture.projectId,
        runId: secondAdmission.runId,
        snapshot: reportSnapshot(fixture, "Ueberarbeiteter Entwurf")
      });
      assert.equal(second.kind, "persisted");
      assert.equal(second.reportId, first.reportId);
      assert.equal(second.reportVersion, 1);
      assert.equal(second.reportRowVersion, 3);
      assert.notEqual(second.snapshotSha256, first.snapshotSha256);
      assert.equal((await db.select().from(reports)).length, 1);
      assert.equal((await db.select().from(reportClaims)).length, 1);
      assert.equal((await db.select().from(reportEvidenceItems)).length, 1);
      assert.equal((await db.select().from(reportClaimEvidence)).length, 1);
    });

    void it("replays one completed generation without duplicating report or lifecycle evidence", async () => {
      const fixture = await createReportFixture(db, "Completion replay");
      const admission = await admit(service, fixture);
      const snapshot = reportSnapshot(fixture, "Idempotenter Entwurf");

      const first = await persistGeneratedDraft(service, db, {
        projectId: fixture.projectId,
        runId: admission.runId,
        snapshot
      });
      const second = await persistGeneratedDraft(service, db, {
        projectId: fixture.projectId,
        runId: admission.runId,
        snapshot
      });

      assert.equal(first.kind, "persisted");
      assert.equal(second.kind, "replayed");
      assert.equal((await db.select().from(reports)).length, 1);
      assert.equal((await db.select().from(reportLifecycleEvents)).length, 1);
    });

    void it("allows only one legal winner when review races regeneration completion", async () => {
      const fixture = await createReportFixture(db, "Review regeneration race");
      const firstAdmission = await admit(service, fixture);
      const first = await persistGeneratedDraft(service, db, {
        projectId: fixture.projectId,
        runId: firstAdmission.runId,
        snapshot: reportSnapshot(fixture, "Vor dem Rennen")
      });
      assert.notEqual(first.kind, "stale");
      if (first.kind === "stale") return;
      const regeneration = await admit(service, fixture);

      const [reviewResult, generationResult] = await Promise.allSettled([
        service.submitForReview({
          projectId: fixture.projectId,
          reportId: first.reportId,
          actorUserId: fixture.userId,
          requestId: randomUUID(),
          expectedSnapshotSha256: first.snapshotSha256,
          expectedRowVersion: first.reportRowVersion
        }),
        persistGeneratedDraft(service, db, {
          projectId: fixture.projectId,
          runId: regeneration.runId,
          snapshot: reportSnapshot(fixture, "Nach dem Rennen")
        })
      ]);

      const [report] = await db.select().from(reports).where(eq(reports.id, first.reportId));
      const [run] = await db.select().from(reportGenerationRuns).where(eq(reportGenerationRuns.id, regeneration.runId));
      assert.ok(report);
      assert.ok(run);

      if (reviewResult.status === "fulfilled") {
        assert.equal(reviewResult.value.status, "ready_for_review");
        assert.equal(generationResult.status, "fulfilled");
        if (generationResult.status === "fulfilled") {
          assert.equal(generationResult.value.kind, "stale");
        }
        assert.equal(report.status, "ready_for_review");
        assert.equal(report.snapshotSha256, first.snapshotSha256);
        assert.equal(run.status, "stale");
      } else {
        assert.equal(generationResult.status, "fulfilled");
        if (generationResult.status === "fulfilled") {
          assert.equal(generationResult.value.kind, "persisted");
        }
        assert.equal(report.status, "draft");
        assert.notEqual(report.snapshotSha256, first.snapshotSha256);
        assert.equal(run.status, "succeeded");
      }

      const openCandidates = await db
        .select()
        .from(reports)
        .where(
          and(eq(reports.reportIssueId, report.reportIssueId), inArray(reports.status, ["draft", "ready_for_review"]))
        );
      assert.equal(openCandidates.length, 1);
    });

    void it("rejects evidence whose durable source belongs to another project", async () => {
      const fixture = await createReportFixture(db, "Evidence tenant");
      const other = await createReportFixture(db, "Evidence other tenant");
      const admission = await admit(service, fixture);
      const snapshot = reportSnapshot({ ...fixture, opportunityId: other.opportunityId }, "Wrong tenant source");

      await assert.rejects(
        () =>
          persistGeneratedDraft(service, db, {
            projectId: fixture.projectId,
            runId: admission.runId,
            snapshot
          }),
        /missing, mismatched, or belonged to another project/u
      );
      assert.equal((await db.select().from(reports)).length, 0);
    });

    void it("rejects review when a durable evidence source changed after generation", async () => {
      const fixture = await createReportFixture(db, "Evidence drift");
      const admission = await admit(service, fixture);
      const persisted = await persistGeneratedDraft(service, db, {
        projectId: fixture.projectId,
        runId: admission.runId,
        snapshot: reportSnapshot(fixture, "Evidence drift candidate")
      });
      assert.notEqual(persisted.kind, "stale");
      if (persisted.kind === "stale") return;

      await db
        .update(opportunities)
        .set({ status: "held", updatedAt: new Date("2026-08-01T09:30:00.000Z") })
        .where(eq(opportunities.id, fixture.opportunityId));

      await assert.rejects(
        () =>
          service.submitForReview({
            projectId: fixture.projectId,
            reportId: persisted.reportId,
            actorUserId: fixture.userId,
            requestId: randomUUID(),
            expectedSnapshotSha256: persisted.snapshotSha256,
            expectedRowVersion: persisted.reportRowVersion
          }),
        /missing, mismatched, or belonged to another project/u
      );
    });

    void it("creates a new actor-backed artifact when reviewed rendering fails", async () => {
      const fixture = await createReportFixture(db, "Artifact retry");
      const candidate = await createReviewedCandidate(service, db, fixture, reportSnapshot(fixture, "Retry report"));
      await db
        .update(reportArtifacts)
        .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
        .where(eq(reportArtifacts.id, candidate.artifact.id));

      await assert.rejects(
        () =>
          service.retryArtifact({
            projectId: fixture.projectId,
            reportId: candidate.reportId,
            actorUserId: fixture.userId,
            requestId: candidate.reviewRequestId,
            expectedSnapshotSha256: candidate.snapshotSha256,
            expectedRowVersion: candidate.rowVersion
          }),
        /belongs to the submit-for-review decision/u
      );
      await db
        .update(reportArtifacts)
        .set({
          status: "failed",
          failureCode: "render_failed",
          failureMessage: "renderer failed",
          updatedAt: new Date()
        })
        .where(eq(reportArtifacts.id, candidate.artifact.id));

      const requestId = randomUUID();
      const retried = await service.retryArtifact({
        projectId: fixture.projectId,
        reportId: candidate.reportId,
        actorUserId: fixture.userId,
        requestId,
        expectedSnapshotSha256: candidate.snapshotSha256,
        expectedRowVersion: candidate.rowVersion
      });
      const replayed = await service.retryArtifact({
        projectId: fixture.projectId,
        reportId: candidate.reportId,
        actorUserId: fixture.userId,
        requestId,
        expectedSnapshotSha256: candidate.snapshotSha256,
        expectedRowVersion: candidate.rowVersion
      });

      assert.equal(retried.kind, "applied");
      assert.equal(replayed.kind, "replayed");
      assert.notEqual(retried.artifact.id, candidate.artifact.id);
      assert.equal(replayed.artifact.id, retried.artifact.id);
      assert.equal(retried.artifact.requestedByUserId, fixture.userId);
      assert.equal((await db.select().from(reportArtifacts)).length, 2);
    });

    void it("publishes one exact staged artifact and reads only the immutable snapshot", async () => {
      const fixture = await createReportFixture(db, "Initial publication");
      const candidate = await createReviewedCandidate(
        service,
        db,
        fixture,
        reportSnapshot(fixture, "Published July report")
      );
      const body = await stageArtifact(db, artifactReader, candidate.artifact);
      const requestId = randomUUID();
      const published = await service.publish({
        projectId: fixture.projectId,
        reportId: candidate.reportId,
        actorUserId: fixture.userId,
        requestId,
        expectedSnapshotSha256: candidate.snapshotSha256,
        expectedRowVersion: candidate.rowVersion,
        artifactId: candidate.artifact.id,
        command: "publish"
      });
      const replayed = await service.publish({
        projectId: fixture.projectId,
        reportId: candidate.reportId,
        actorUserId: fixture.userId,
        requestId,
        expectedSnapshotSha256: candidate.snapshotSha256,
        expectedRowVersion: candidate.rowVersion,
        artifactId: candidate.artifact.id,
        command: "publish"
      });

      assert.equal(published.kind, "applied");
      assert.equal(replayed.kind, "replayed");
      assert.equal(published.report.status, "published");
      assert.equal(published.report.publishedArtifactId, candidate.artifact.id);
      const [issue] = await db.select().from(reportIssues).where(eq(reportIssues.id, published.report.reportIssueId));
      assert.equal(issue?.currentCandidateReportId, null);
      assert.equal(issue?.currentPublishedReportId, published.report.id);
      const detail = await service.getPublished(fixture.projectId, published.report.id);
      assert.equal(detail.snapshot.title, "Published July report");
      assert.deepEqual(Buffer.from(await service.getPublishedDocument(fixture.projectId, published.report.id)), body);
      const [event] = await db
        .select()
        .from(reportLifecycleEvents)
        .where(eq(reportLifecycleEvents.eventType, "published"));
      assert.equal(event?.artifactId, candidate.artifact.id);
      await assert.rejects(
        () =>
          db
            .update(reportArtifacts)
            .set({ artifactSha256: "f".repeat(64) })
            .where(eq(reportArtifacts.id, candidate.artifact.id)),
        postgresErrorMatches(/Terminal report artifact evidence is immutable/u)
      );
    });

    void it("terminalizes a generation admitted before publication and then admits the required correction", async () => {
      const fixture = await createReportFixture(db, "Publication generation staleness");
      const firstAdmission = await admit(service, fixture);
      const firstPersisted = await persistGeneratedDraft(service, db, {
        projectId: fixture.projectId,
        runId: firstAdmission.runId,
        snapshot: reportSnapshot(fixture, "Initial candidate")
      });
      assert.notEqual(firstPersisted.kind, "stale");
      if (firstPersisted.kind === "stale") return;
      const activeRegeneration = await admit(service, fixture);
      const reviewRequestId = randomUUID();
      const reviewed = await service.submitForReview({
        projectId: fixture.projectId,
        reportId: firstPersisted.reportId,
        actorUserId: fixture.userId,
        requestId: reviewRequestId,
        expectedSnapshotSha256: firstPersisted.snapshotSha256,
        expectedRowVersion: firstPersisted.reportRowVersion
      });
      assert.equal(reviewed.command, "submit_for_review");
      if (reviewed.command !== "submit_for_review") throw new Error("Expected reviewed report candidate.");
      await stageArtifact(db, artifactReader, reviewed.artifact);
      await service.publish({
        projectId: fixture.projectId,
        reportId: reviewed.reportId,
        actorUserId: fixture.userId,
        requestId: randomUUID(),
        expectedSnapshotSha256: reviewed.snapshotSha256,
        expectedRowVersion: reviewed.rowVersion,
        artifactId: reviewed.artifact.id,
        command: "publish"
      });

      const [terminalized] = await db
        .update(reportGenerationRuns)
        .set({
          status: "stale",
          failureCode: "stale_generation_base",
          failureMessage: "Publication advanced the report issue.",
          finishedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(reportGenerationRuns.id, activeRegeneration.runId))
        .returning();
      assert.equal(terminalized?.status, "stale");

      const correction = await service.admitGeneration({
        identity: reportIdentity(fixture.projectId),
        requestedByUserId: fixture.userId,
        idempotencyKey: randomUUID(),
        evidenceCutoffAt: cutoff,
        correctionReason: "Publication advanced while the prior regeneration was queued."
      });
      assert.equal(correction.kind, "created");
    });

    void it("blocks invalidated ranking evidence and resolves its alert only through a published correction", async () => {
      const fixture = await createReportFixture(db, "Evidence correction");
      const first = await createReviewedCandidate(
        service,
        db,
        fixture,
        rankingReportSnapshot(fixture, "Ranking report")
      );
      await stageArtifact(db, artifactReader, first.artifact);
      await opportunitiesService.updateRankingProofStatus(
        fixture.projectId,
        fixture.rankingProofId,
        { status: "invalidated", reason: "Source screenshot was incorrect." },
        fixture.userId
      );
      await assert.rejects(
        () =>
          service.publish({
            projectId: fixture.projectId,
            reportId: first.reportId,
            actorUserId: fixture.userId,
            requestId: randomUUID(),
            expectedSnapshotSha256: first.snapshotSha256,
            expectedRowVersion: first.rowVersion,
            artifactId: first.artifact.id,
            command: "publish"
          }),
        /missing, mismatched, or belonged to another project/u
      );

      await opportunitiesService.updateRankingProofStatus(
        fixture.projectId,
        fixture.rankingProofId,
        { status: "reviewed" },
        fixture.userId
      );
      const firstPublished = await service.publish({
        projectId: fixture.projectId,
        reportId: first.reportId,
        actorUserId: fixture.userId,
        requestId: randomUUID(),
        expectedSnapshotSha256: first.snapshotSha256,
        expectedRowVersion: first.rowVersion,
        artifactId: first.artifact.id,
        command: "publish"
      });
      await opportunitiesService.updateRankingProofStatus(
        fixture.projectId,
        fixture.rankingProofId,
        { status: "invalidated", reason: "Later audit invalidated the proof." },
        fixture.userId
      );
      const [openAlert] = await db
        .select()
        .from(reportEvidenceAlerts)
        .where(and(eq(reportEvidenceAlerts.reportId, first.reportId), eq(reportEvidenceAlerts.status, "open")));
      assert.ok(openAlert);
      assert.equal((await service.getPublished(fixture.projectId, first.reportId)).report.correctionRequired, true);

      const correctionAdmission = await service.admitGeneration({
        identity: reportIdentity(fixture.projectId),
        requestedByUserId: fixture.userId,
        idempotencyKey: randomUUID(),
        evidenceCutoffAt: cutoff,
        correctionReason: "Invalidated ranking proof removed from the customer report."
      });
      const correctionPersisted = await persistGeneratedDraft(service, db, {
        projectId: fixture.projectId,
        runId: correctionAdmission.runId,
        snapshot: reportSnapshot(fixture, "Corrected July report")
      });
      assert.notEqual(correctionPersisted.kind, "stale");
      if (correctionPersisted.kind === "stale") return;
      const correction = await service.submitForReview({
        projectId: fixture.projectId,
        reportId: correctionPersisted.reportId,
        actorUserId: fixture.userId,
        requestId: randomUUID(),
        expectedSnapshotSha256: correctionPersisted.snapshotSha256,
        expectedRowVersion: correctionPersisted.reportRowVersion
      });
      assert.equal(correction.command, "submit_for_review");
      if (correction.command !== "submit_for_review") throw new Error("Expected reviewed correction candidate.");
      await stageArtifact(db, artifactReader, correction.artifact);
      const corrected = await service.publish({
        projectId: fixture.projectId,
        reportId: correction.reportId,
        actorUserId: fixture.userId,
        requestId: randomUUID(),
        expectedSnapshotSha256: correction.snapshotSha256,
        expectedRowVersion: correction.rowVersion,
        artifactId: correction.artifact.id,
        command: "publish_correction"
      });

      assert.equal(corrected.supersededReportId, firstPublished.report.id);
      const [oldReport] = await db.select().from(reports).where(eq(reports.id, first.reportId));
      const [resolvedAlert] = await db
        .select()
        .from(reportEvidenceAlerts)
        .where(eq(reportEvidenceAlerts.id, openAlert.id));
      assert.equal(oldReport?.status, "superseded");
      assert.equal(resolvedAlert?.status, "resolved");
      assert.equal(resolvedAlert?.resolvedByReportId, corrected.report.id);
    });
  }
);

type ReportFixture = {
  projectId: string;
  userId: string;
  opportunityId: string;
  opportunityObservedAt: string;
  rankingProofId: string;
  rankingCapturedAt: string;
};

async function createReportFixture(db: DatabaseClient, name: string): Promise<ReportFixture> {
  const suffix = randomUUID();
  const [user] = await db
    .insert(users)
    .values({ email: `${suffix}@example.test`, name: `${name} Operator` })
    .returning();
  assert.ok(user);
  const [customer] = await db
    .insert(customers)
    .values({ name: `${name} Customer` })
    .returning();
  assert.ok(customer);
  const [project] = await db
    .insert(projects)
    .values({ customerId: customer.id, name: `${name} Project` })
    .returning();
  assert.ok(project);
  const [opportunity] = await db
    .insert(opportunities)
    .values({
      projectId: project.id,
      primaryKeyword: "fassadenreinigung dachau",
      classification: "near_term_target",
      status: "monitoring",
      score: 70,
      updatedAt: new Date("2026-07-25T10:00:00.000Z")
    })
    .returning();
  assert.ok(opportunity);
  const [rankingProof] = await db
    .insert(rankingProofs)
    .values({
      projectId: project.id,
      query: "dachreinigung dachau",
      pageUrl: "https://example.test/dachreinigung-dachau/",
      rank: 2,
      capturedAt: new Date("2026-07-25T09:00:00.000Z"),
      searchEngine: "google",
      device: "mobile",
      locale: "de-DE",
      status: "reviewed",
      createdByUserId: user.id
    })
    .returning();
  assert.ok(rankingProof);
  return {
    projectId: project.id,
    userId: user.id,
    opportunityId: opportunity.id,
    opportunityObservedAt: opportunity.updatedAt.toISOString(),
    rankingProofId: rankingProof.id,
    rankingCapturedAt: rankingProof.capturedAt.toISOString()
  };
}

async function admit(service: ReportsService, fixture: ReportFixture) {
  return service.admitGeneration({
    identity: reportIdentity(fixture.projectId),
    requestedByUserId: fixture.userId,
    idempotencyKey: randomUUID(),
    evidenceCutoffAt: cutoff
  });
}

function reportIdentity(projectId: string) {
  return {
    projectId,
    reportKind: "monthly_seo_progress" as const,
    period: "2026-07",
    locale: "de-DE" as const,
    timezone: "Europe/Berlin" as const
  };
}

function reportSnapshot(fixture: ReportFixture, title: string): CustomerReportSnapshot {
  const opportunityPayload = {
    sourceKind: "opportunity",
    id: fixture.opportunityId,
    projectId: fixture.projectId,
    classification: "near_term_target",
    status: "monitoring",
    title: "fassadenreinigung dachau",
    score: 70,
    updatedAt: fixture.opportunityObservedAt
  };
  const opportunityDigest = createHash("sha256")
    .update(canonicalizeCustomerReportSourcePayload(opportunityPayload), "utf8")
    .digest("hex");
  const evidence = [
    {
      evidenceKey: `opportunity:${fixture.opportunityId}`,
      projectId: fixture.projectId,
      sourceId: fixture.opportunityId,
      sourceVersion: opportunityDigest,
      observedAt: fixture.opportunityObservedAt,
      selectedAtCutoff: cutoff,
      payloadSha256: opportunityDigest,
      customerLabel: "fassadenreinigung dachau",
      sourceKind: "opportunity" as const,
      proofTier: "supporting_context" as const,
      opportunityId: fixture.opportunityId,
      classification: "near_term_target" as const,
      status: "monitoring" as const,
      title: "fassadenreinigung dachau"
    }
  ];
  const factProjection = assembleCustomerReportFactProjection({
    schemaVersion: "customer_report_evidence_packet.v1",
    identity: reportIdentity(fixture.projectId),
    assembledAt: cutoff,
    evidenceCutoffAt: cutoff,
    evidence
  });
  const factProjectionSha256 = createHash("sha256")
    .update(canonicalizeCustomerReportFactProjection(factProjection), "utf8")
    .digest("hex");

  return CustomerReportSnapshotSchema.parse({
    schemaVersion: "customer_report_snapshot.v1",
    identity: reportIdentity(fixture.projectId),
    generatedAt: cutoff,
    evidenceCutoffAt: cutoff,
    assemblerVersion: "customer_report_assembler.v1",
    eligibilityPolicyVersion: "customer_report_eligibility.v1",
    actionSelectionPolicyVersion: "customer_report_actions.v1",
    narrativePolicyVersion: "customer_report_narrative.v1",
    templateVersion: "customer_report_html.v1",
    narrativeMode: "fact_only",
    title,
    factProjectionSha256,
    factProjection,
    narrative: []
  });
}

function rankingReportSnapshot(fixture: ReportFixture, title: string): CustomerReportSnapshot {
  const rankingPayload = {
    sourceKind: "ranking_proof",
    id: fixture.rankingProofId,
    projectId: fixture.projectId,
    query: "dachreinigung dachau",
    pageUrl: "https://example.test/dachreinigung-dachau/",
    rank: 2,
    capturedAt: fixture.rankingCapturedAt,
    searchEngine: "google",
    device: "mobile",
    locale: "de-DE",
    status: "reviewed"
  };
  const digest = createHash("sha256")
    .update(canonicalizeCustomerReportSourcePayload(rankingPayload), "utf8")
    .digest("hex");
  const evidence = [
    {
      evidenceKey: `ranking:${fixture.rankingProofId}`,
      projectId: fixture.projectId,
      sourceId: fixture.rankingProofId,
      sourceVersion: digest,
      observedAt: fixture.rankingCapturedAt,
      selectedAtCutoff: cutoff,
      payloadSha256: digest,
      customerLabel: "Gepruefter Ranking-Nachweis",
      sourceKind: "ranking_proof" as const,
      proofTier: "customer_safe_proof" as const,
      query: "dachreinigung dachau",
      pageUrl: "https://example.test/dachreinigung-dachau/",
      rank: 2,
      searchEngine: "google" as const,
      device: "mobile" as const,
      locale: "de-DE" as const,
      status: "reviewed" as const
    }
  ];
  const factProjection = assembleCustomerReportFactProjection({
    schemaVersion: "customer_report_evidence_packet.v1",
    identity: reportIdentity(fixture.projectId),
    assembledAt: cutoff,
    evidenceCutoffAt: cutoff,
    evidence
  });
  const factProjectionSha256 = createHash("sha256")
    .update(canonicalizeCustomerReportFactProjection(factProjection), "utf8")
    .digest("hex");
  return CustomerReportSnapshotSchema.parse({
    schemaVersion: "customer_report_snapshot.v1",
    identity: reportIdentity(fixture.projectId),
    generatedAt: cutoff,
    evidenceCutoffAt: cutoff,
    assemblerVersion: "customer_report_assembler.v1",
    eligibilityPolicyVersion: "customer_report_eligibility.v1",
    actionSelectionPolicyVersion: "customer_report_actions.v1",
    narrativePolicyVersion: "customer_report_narrative.v1",
    templateVersion: "customer_report_html.v1",
    narrativeMode: "fact_only",
    title,
    factProjectionSha256,
    factProjection,
    narrative: []
  });
}

async function persistGeneratedDraft(
  service: ReportsService,
  db: DatabaseClient,
  input: { projectId: string; runId: string; snapshot: CustomerReportSnapshot }
) {
  const packet = CustomerReportEvidencePacketSchema.parse({
    schemaVersion: "customer_report_evidence_packet.v1",
    identity: input.snapshot.identity,
    assembledAt: input.snapshot.generatedAt,
    evidenceCutoffAt: input.snapshot.evidenceCutoffAt,
    evidence: input.snapshot.factProjection.evidence
  });
  const canonicalText = canonicalizeCustomerReportEvidencePacket(packet);
  const packetSha256 = createHash("sha256").update(canonicalText, "utf8").digest("hex");
  await db
    .update(reportGenerationRuns)
    .set({ evidencePacketCanonicalText: canonicalText, evidencePacketSha256: packetSha256 })
    .where(eq(reportGenerationRuns.id, input.runId));
  return service.persistGeneratedDraft(input);
}

async function createReviewedCandidate(
  service: ReportsService,
  db: DatabaseClient,
  fixture: ReportFixture,
  snapshot: CustomerReportSnapshot
) {
  const admission = await admit(service, fixture);
  const persisted = await persistGeneratedDraft(service, db, {
    projectId: fixture.projectId,
    runId: admission.runId,
    snapshot
  });
  assert.notEqual(persisted.kind, "stale");
  if (persisted.kind === "stale") throw new Error("Expected a persisted report candidate.");
  const reviewRequestId = randomUUID();
  const reviewed = await service.submitForReview({
    projectId: fixture.projectId,
    reportId: persisted.reportId,
    actorUserId: fixture.userId,
    requestId: reviewRequestId,
    expectedSnapshotSha256: persisted.snapshotSha256,
    expectedRowVersion: persisted.reportRowVersion
  });
  assert.equal(reviewed.command, "submit_for_review");
  if (reviewed.command !== "submit_for_review") throw new Error("Expected submitted report review.");
  return {
    reportId: reviewed.reportId,
    snapshotSha256: reviewed.snapshotSha256,
    rowVersion: reviewed.rowVersion,
    artifact: reviewed.artifact,
    reviewRequestId
  };
}

async function stageArtifact(
  db: DatabaseClient,
  reader: MemoryArtifactReader,
  artifact: typeof reportArtifacts.$inferSelect
): Promise<Buffer> {
  const body = Buffer.from(`<!doctype html><html><body>${artifact.reportId}:${artifact.id}</body></html>`, "utf8");
  const artifactSha256 = createHash("sha256").update(body).digest("hex");
  const storageKey = `reports/${artifact.projectId}/${artifact.reportId}/${artifact.id}/${artifactSha256}.html`;
  await db
    .update(reportArtifacts)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(eq(reportArtifacts.id, artifact.id));
  await db
    .update(reportArtifacts)
    .set({
      status: "staged",
      storageKey,
      artifactSha256,
      byteSize: body.byteLength,
      stagedAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(reportArtifacts.id, artifact.id));
  reader.objects.set(storageKey, {
    body,
    metadata: {
      key: storageKey,
      contentType: "text/html; charset=utf-8",
      contentLength: body.byteLength,
      sha256: artifactSha256
    }
  });
  return body;
}

class MemoryArtifactReader implements ImmutableArtifactReaderPort {
  readonly objects = new Map<string, { body: Uint8Array; metadata: ImmutableArtifactStoredObject }>();

  readImmutableArtifact(input: { key: string; maxBytes: number }): Promise<Uint8Array> {
    const object = this.objects.get(input.key);
    if (!object) return Promise.reject(new Error("artifact_not_found"));
    if (object.body.byteLength > input.maxBytes) {
      return Promise.reject(new Error("artifact_read_overflow"));
    }
    return Promise.resolve(object.body);
  }

  headImmutableArtifact(input: { key: string }): Promise<ImmutableArtifactStoredObject | undefined> {
    return Promise.resolve(this.objects.get(input.key)?.metadata);
  }
}

function testDatabaseService(db: DatabaseClient): DatabaseService {
  return {
    get db() {
      return db;
    },
    requireDb: () => db,
    isConfigured: () => true,
    ping: () => Promise.resolve("up"),
    onModuleDestroy: () => Promise.resolve()
  } as unknown as DatabaseService;
}

function postgresErrorMatches(pattern: RegExp): (error: unknown) => boolean {
  return (error) => {
    const messages: string[] = [];
    let current: unknown = error;
    while (current && typeof current === "object") {
      const record = current as { message?: unknown; cause?: unknown };
      if (typeof record.message === "string") {
        messages.push(record.message);
      }
      current = record.cause;
    }
    assert.match(messages.join("\n"), pattern);
    return true;
  };
}
