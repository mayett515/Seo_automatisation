import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { CustomerReportSnapshotSchema, type CustomerReportSnapshot } from "@localseo/contracts";
import {
  customers,
  opportunities,
  projects,
  reportClaimEvidence,
  reportClaims,
  reportEvidenceItems,
  reportGenerationRuns,
  reportIssues,
  reportLifecycleEvents,
  reports,
  users,
  type DatabaseClient
} from "@localseo/db";
import { canonicalizeCustomerReportFactProjection } from "@localseo/domain";
import { and, eq, inArray } from "drizzle-orm";
import {
  createIntegrationTestDatabase,
  truncateIntegrationTables
} from "../../../../packages/db/test-support/integration-database.js";
import { DatabaseService } from "../database/database.service.js";
import { ReportsService } from "./reports.module.js";

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

    before(async () => {
      assert.ok(testDatabaseUrl);
      handle = await createIntegrationTestDatabase(testDatabaseUrl);
      db = handle.db;
    });

    beforeEach(async () => {
      await truncateIntegrationTables(handle.sql);
      service = new ReportsService(testDatabaseService(db));
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

      const persisted = await service.persistGeneratedDraft({
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
        postgresErrorMatches(/publication and supersession are not enabled/u)
      );
    });

    void it("returns a reviewed candidate to draft and regenerates it with an expected-version CAS", async () => {
      const fixture = await createReportFixture(db, "Draft regeneration");
      const firstAdmission = await admit(service, fixture);
      const first = await service.persistGeneratedDraft({
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

      const secondAdmission = await admit(service, fixture);
      const second = await service.persistGeneratedDraft({
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

      const first = await service.persistGeneratedDraft({
        projectId: fixture.projectId,
        runId: admission.runId,
        snapshot
      });
      const second = await service.persistGeneratedDraft({
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
      const first = await service.persistGeneratedDraft({
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
        service.persistGeneratedDraft({
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
          service.persistGeneratedDraft({
            projectId: fixture.projectId,
            runId: admission.runId,
            snapshot
          }),
        /missing or belonged to another project/u
      );
      assert.equal((await db.select().from(reports)).length, 0);
    });
  }
);

type ReportFixture = { projectId: string; userId: string; opportunityId: string };

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
      score: 70
    })
    .returning();
  assert.ok(opportunity);
  return { projectId: project.id, userId: user.id, opportunityId: opportunity.id };
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
  const factProjection = {
    claims: [
      {
        claimKey: "opportunity:facade-cleaning",
        kind: "future_opportunity" as const,
        section: "future_opportunities" as const,
        evidenceKeys: ["opportunity:facade-cleaning"],
        opportunityId: fixture.opportunityId,
        title: "Fassadenreinigung Dachau",
        recommendedAction: "create_page_proposal" as const
      }
    ],
    evidence: [
      {
        evidenceKey: "opportunity:facade-cleaning",
        projectId: fixture.projectId,
        sourceId: fixture.opportunityId,
        sourceVersion: "1",
        observedAt: "2026-07-30T09:00:00.000Z",
        selectedAtCutoff: cutoff,
        payloadSha256: "b".repeat(64),
        customerLabel: "Zukuenftige Chance",
        sourceKind: "opportunity" as const,
        proofTier: "supporting_context" as const,
        opportunityId: fixture.opportunityId,
        classification: "near_term_target" as const,
        status: "monitoring" as const,
        title: "Fassadenreinigung Dachau"
      }
    ],
    nextActions: [
      {
        actionKey: "action:review-opportunity",
        kind: "navigation_ref" as const,
        label: "Chance ansehen",
        supportingClaimKeys: ["opportunity:facade-cleaning"],
        target: { surface: "opportunity" as const, opportunityId: fixture.opportunityId }
      }
    ]
  };
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
