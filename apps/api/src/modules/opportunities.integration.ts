import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { agentRuns, customers, opportunities, projects, rankingProofs, users, type DatabaseClient } from "@localseo/db";
import {
  OpportunityBriefSchema,
  UpdateOpportunityLifecycleRequestSchema,
  UpdateRankingProofStatusRequestSchema
} from "@localseo/contracts";
import { eq } from "@localseo/db/query";
import { DatabaseService } from "../database/database.service.js";
import { OpportunitiesService } from "./opportunities.module.js";
import {
  createIntegrationTestDatabase,
  truncateIntegrationTables
} from "../../../../packages/db/test-support/integration-database.js";

type IntegrationDatabase = Awaited<ReturnType<typeof createIntegrationTestDatabase>>;

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = Boolean(testDatabaseUrl);

void describe(
  "OpportunitiesService ranking proof integration",
  { skip: runIntegration ? false : "TEST_DATABASE_URL is not configured" },
  () => {
    let handle: IntegrationDatabase;
    let db: DatabaseClient;

    before(async () => {
      assert.ok(testDatabaseUrl);
      handle = await createIntegrationTestDatabase(testDatabaseUrl);
      db = handle.db;
    });

    beforeEach(async () => {
      await truncateIntegrationTables(handle.sql);
    });

    after(async () => {
      await handle?.close();
    });

    void it("creates manual ranking proof as project-owned evidence pending human review", async () => {
      const fixture = await createProjectFixture(db);
      const service = new OpportunitiesService(testDatabaseService(db));

      const proof = await service.createRankingProof(
        fixture.projectId,
        {
          query: "entruempelung dachau",
          pageUrl: "https://customer.example/entruempelung-dachau/",
          rank: 4,
          capturedAt: "2026-07-03T10:00:00.000Z",
          searchEngine: "google",
          device: "desktop",
          locale: "de-DE",
          notes: "Manual incognito SERP check."
        },
        fixture.userId
      );

      assert.equal(proof.projectId, fixture.projectId);
      assert.equal(proof.rank, 4);
      assert.equal(proof.createdByUserId, fixture.userId);
      assert.equal(proof.capturedAt, "2026-07-03T10:00:00.000Z");
      assert.equal(Object.hasOwn(proof, "screenshotArtifactKey"), false);

      const [row] = await db.select().from(rankingProofs).where(eq(rankingProofs.id, proof.id));
      assert.equal(row?.projectId, fixture.projectId);
      assert.deepEqual(row?.evidenceJson, {
        sourceType: "ranking_proof",
        proofTier: "internal_signal",
        locator: {
          query: "entruempelung dachau",
          pageUrl: "https://customer.example/entruempelung-dachau/"
        },
        observedMetric: {
          name: "rank",
          value: 4
        },
        entrySource: "manual_operator_capture"
      });
    });

    void it("lists ranking proof only for the requested project", async () => {
      const first = await createProjectFixture(db, "First");
      const second = await createProjectFixture(db, "Second");
      const service = new OpportunitiesService(testDatabaseService(db));

      await service.createRankingProof(
        first.projectId,
        {
          query: "dachdecker dachau",
          pageUrl: "https://first.example/dachdecker-dachau/",
          rank: 3,
          capturedAt: "2026-07-03T09:00:00.000Z",
          searchEngine: "google",
          device: "desktop"
        },
        first.userId
      );
      await service.createRankingProof(
        second.projectId,
        {
          query: "dachdecker karlsfeld",
          pageUrl: "https://second.example/dachdecker-karlsfeld/",
          rank: 2,
          capturedAt: "2026-07-03T11:00:00.000Z",
          searchEngine: "google",
          device: "desktop"
        },
        second.userId
      );
      await service.createRankingProof(
        first.projectId,
        {
          query: "dachdecker indersdorf",
          pageUrl: "https://first.example/dachdecker-indersdorf/",
          rank: 1,
          capturedAt: "2026-07-03T12:00:00.000Z",
          searchEngine: "google",
          device: "desktop"
        },
        first.userId
      );

      const list = await service.listRankingProofs(first.projectId);

      assert.equal(list.projectId, first.projectId);
      assert.deepEqual(
        list.proofs.map((proof) => proof.query),
        ["dachdecker indersdorf", "dachdecker dachau"]
      );
    });

    void it("reviews and then invalidates ranking proof with actor-bound revisions", async () => {
      const fixture = await createProjectFixture(db, "Proof Status");
      const service = new OpportunitiesService(testDatabaseService(db));
      const proof = await service.createRankingProof(
        fixture.projectId,
        {
          query: "dachdecker dachau",
          pageUrl: "https://customer.example/dachdecker-dachau/",
          rank: 7,
          capturedAt: "2026-07-03T10:00:00.000Z",
          searchEngine: "google",
          device: "desktop"
        },
        fixture.userId
      );

      const reviewed = await service.updateRankingProofStatus(
        fixture.projectId,
        proof.id,
        { status: "reviewed", expectedStatus: "captured", expectedRowVersion: proof.rowVersion },
        fixture.userId
      );

      assert.equal(reviewed.status, "reviewed");
      assert.equal(reviewed.rowVersion, 1);
      assert.equal(reviewed.reviewedByUserId, fixture.userId);
      assert.ok(reviewed.reviewedAt);

      const invalidated = await service.updateRankingProofStatus(
        fixture.projectId,
        proof.id,
        {
          status: "invalidated",
          expectedStatus: "reviewed",
          expectedRowVersion: reviewed.rowVersion,
          reason: "Rank was entered for the wrong URL."
        },
        fixture.userId
      );

      assert.equal(invalidated.status, "invalidated");
      assert.equal(invalidated.rowVersion, 2);
      assert.equal(invalidated.invalidatedByUserId, fixture.userId);
      assert.equal(invalidated.invalidationReason, "Rank was entered for the wrong URL.");
      assert.ok(invalidated.invalidatedAt);
    });

    void it("rejects ranking-proof actors without project evidence authority at the database boundary", async () => {
      const fixture = await createProjectFixture(db, "Proof Authority");
      const [outsider] = await db
        .insert(users)
        .values({ email: `${randomUUID()}@example.com`, name: "Proof Outsider" })
        .returning();
      assert.ok(outsider);
      await assert.rejects(
        () =>
          db.insert(rankingProofs).values({
            projectId: fixture.projectId,
            query: "unauthorized proof",
            pageUrl: "https://customer.example/unauthorized/",
            rank: 9,
            capturedAt: new Date(),
            createdByUserId: outsider.id
          }),
        postgresErrorMatches(/actor must have evidence authority/iu)
      );

      const service = new OpportunitiesService(testDatabaseService(db));
      const captured = await service.createRankingProof(
        fixture.projectId,
        {
          query: "authorized capture",
          pageUrl: "https://customer.example/authorized/",
          rank: 6,
          capturedAt: new Date().toISOString(),
          searchEngine: "google",
          device: "desktop"
        },
        fixture.userId
      );
      await assert.rejects(
        () =>
          db
            .update(rankingProofs)
            .set({ status: "reviewed", reviewedAt: new Date(), reviewedByUserId: outsider.id })
            .where(eq(rankingProofs.id, captured.id)),
        postgresErrorMatches(/actor must have evidence authority/iu)
      );
    });

    void it("rejects invalidating ranking proof without a reason", () => {
      assert.equal(
        UpdateRankingProofStatusRequestSchema.safeParse({
          status: "invalidated",
          expectedStatus: "reviewed",
          expectedRowVersion: 1
        }).success,
        false
      );
    });

    void it("lists explorer opportunities only for the requested project", async () => {
      const first = await createProjectFixture(db, "Explorer First");
      const second = await createProjectFixture(db, "Explorer Second");
      const service = new OpportunitiesService(testDatabaseService(db));

      await db.insert(opportunities).values({
        projectId: first.projectId,
        classification: "near_term_target",
        primaryKeyword: "entruempelung dachau",
        score: 72,
        status: "new",
        evidenceJson: validBrief(first.projectId, {
          service: "Entruempelung",
          primaryKeyword: "entruempelung dachau",
          location: {
            name: "Dachau",
            kind: "city",
            adjacencyReason: "manual_seed",
            existingClusterStrength: "weak"
          }
        })
      });
      await db.insert(opportunities).values({
        projectId: second.projectId,
        classification: "near_term_target",
        primaryKeyword: "dachdecker karlsfeld",
        score: 81,
        status: "new",
        evidenceJson: validBrief(second.projectId, {
          service: "Dachdecker",
          primaryKeyword: "dachdecker karlsfeld",
          location: {
            name: "Karlsfeld",
            kind: "municipality",
            adjacencyReason: "manual_seed",
            existingClusterStrength: "medium"
          }
        })
      });

      const list = await service.listOpportunities(first.projectId);

      assert.equal(list.projectId, first.projectId);
      assert.deepEqual(
        list.opportunities.map((opportunity) => opportunity.primaryKeyword),
        ["entruempelung dachau"]
      );
      assert.equal(list.opportunities[0]?.evidenceJson?.projectId, first.projectId);
    });

    void it("returns null brief evidence for invalid legacy opportunity JSON", async () => {
      const fixture = await createProjectFixture(db, "Invalid Brief");
      const service = new OpportunitiesService(testDatabaseService(db));

      await db.insert(opportunities).values({
        projectId: fixture.projectId,
        classification: "internal_radar",
        primaryKeyword: "legacy invalid brief",
        score: 12,
        status: "new",
        evidenceJson: { legacy: true }
      });

      const list = await service.listOpportunities(fixture.projectId);

      assert.equal(list.opportunities.length, 1);
      assert.equal(list.opportunities[0]?.evidenceJson, null);
    });

    void it("records operator lifecycle decisions with reason and user provenance", async () => {
      const fixture = await createProjectFixture(db, "Lifecycle Decision");
      const service = new OpportunitiesService(testDatabaseService(db));
      const [row] = await db
        .insert(opportunities)
        .values({
          projectId: fixture.projectId,
          classification: "near_term_target",
          primaryKeyword: "entruempelung dachau",
          score: 72,
          status: "new",
          evidenceJson: validBrief(fixture.projectId)
        })
        .returning();
      assert.ok(row);

      const rejected = await service.updateOpportunityLifecycle(
        fixture.projectId,
        row.id,
        {
          expectedStatus: "new",
          expectedRowVersion: 0,
          status: "rejected",
          reason: "No service fit for this Ort yet."
        },
        fixture.userId
      );

      assert.equal(rejected.status, "rejected");
      assert.equal(rejected.rowVersion, 1);
      assert.equal(rejected.statusReason, "No service fit for this Ort yet.");
      assert.equal(rejected.decidedByUserId, fixture.userId);

      const reopened = await service.updateOpportunityLifecycle(fixture.projectId, row.id, {
        expectedStatus: "rejected",
        expectedRowVersion: 1,
        status: "monitoring"
      });

      assert.equal(reopened.status, "monitoring");
      assert.equal(reopened.rowVersion, 2);
      assert.equal(reopened.statusReason, undefined);
      assert.equal(reopened.decidedByUserId, undefined);
    });

    void it("rejects a stale opportunity decision instead of overwriting newer operator truth", async () => {
      const fixture = await createProjectFixture(db, "Lifecycle Decision CAS");
      const service = new OpportunitiesService(testDatabaseService(db));
      const [row] = await db
        .insert(opportunities)
        .values({
          projectId: fixture.projectId,
          classification: "near_term_target",
          primaryKeyword: "fassadenreinigung unterschleissheim",
          score: 67,
          status: "new",
          evidenceJson: validBrief(fixture.projectId)
        })
        .returning();
      assert.ok(row);

      await service.updateOpportunityLifecycle(
        fixture.projectId,
        row.id,
        {
          expectedStatus: "new",
          expectedRowVersion: 0,
          status: "held",
          reason: "Awaiting service confirmation."
        },
        fixture.userId
      );

      await assert.rejects(
        () =>
          service.updateOpportunityLifecycle(
            fixture.projectId,
            row.id,
            {
              expectedStatus: "new",
              expectedRowVersion: 0,
              status: "rejected",
              reason: "Stale rejection must not win."
            },
            fixture.userId
          ),
        /changed after it was loaded/u
      );

      const [current] = await db.select().from(opportunities).where(eq(opportunities.id, row.id));
      assert.equal(current?.status, "held");
      assert.equal(current?.rowVersion, 1);
      assert.equal(current?.statusReason, "Awaiting service confirmation.");
    });

    void it("keeps opportunity row versions database-owned on insert and update", async () => {
      const fixture = await createProjectFixture(db, "Owned Opportunity Revision");
      const [row] = await db
        .insert(opportunities)
        .values({
          projectId: fixture.projectId,
          classification: "near_term_target",
          primaryKeyword: "dachreinigung freising",
          score: 64,
          status: "new",
          rowVersion: 9,
          evidenceJson: validBrief(fixture.projectId)
        })
        .returning();
      assert.ok(row);
      assert.equal(row.rowVersion, 0);

      await assert.rejects(
        () => db.update(opportunities).set({ rowVersion: 9 }).where(eq(opportunities.id, row.id)),
        postgresErrorMatches(/Opportunity row_version is database-managed/u)
      );

      const [unchanged] = await db.select().from(opportunities).where(eq(opportunities.id, row.id));
      assert.equal(unchanged?.rowVersion, 0);
    });

    void it("rejects lifecycle decision bodies that reject without a reason or use invalid status", () => {
      const expected = { expectedStatus: "new", expectedRowVersion: 0 };
      assert.equal(
        UpdateOpportunityLifecycleRequestSchema.safeParse({ ...expected, status: "rejected" }).success,
        false
      );
      assert.equal(
        UpdateOpportunityLifecycleRequestSchema.safeParse({ ...expected, status: "brief_created" }).success,
        false
      );
      assert.equal(
        UpdateOpportunityLifecycleRequestSchema.safeParse({ ...expected, status: "not_real", reason: "No." }).success,
        false
      );
    });

    void it("does not update opportunities outside the requested project", async () => {
      const first = await createProjectFixture(db, "Lifecycle First");
      const second = await createProjectFixture(db, "Lifecycle Second");
      const service = new OpportunitiesService(testDatabaseService(db));
      const [row] = await db
        .insert(opportunities)
        .values({
          projectId: second.projectId,
          classification: "near_term_target",
          primaryKeyword: "dachdecker karlsfeld",
          score: 81,
          status: "new",
          evidenceJson: validBrief(second.projectId, {
            service: "Dachdecker",
            primaryKeyword: "dachdecker karlsfeld"
          })
        })
        .returning();
      assert.ok(row);

      await assert.rejects(
        () =>
          service.updateOpportunityLifecycle(first.projectId, row.id, {
            expectedStatus: "new",
            expectedRowVersion: 0,
            status: "held",
            reason: "Later."
          }),
        /not found/u
      );

      const [unchanged] = await db.select().from(opportunities).where(eq(opportunities.id, row.id));
      assert.equal(unchanged?.status, "new");
      assert.equal(unchanged?.statusReason, null);
    });

    void it("rejects unsupported agent-run task filters", async () => {
      const fixture = await createProjectFixture(db, "Invalid Task");
      const service = new OpportunitiesService(testDatabaseService(db));

      await assert.rejects(() => service.listAgentRuns(fixture.projectId, "not_a_real_task"), /task filter/u);
    });

    void it("lists agent runs without exposing raw diagnostics or output JSON", async () => {
      const first = await createProjectFixture(db, "Agent Run First");
      const second = await createProjectFixture(db, "Agent Run Second");
      const service = new OpportunitiesService(testDatabaseService(db));

      const [firstRun] = await db
        .insert(agentRuns)
        .values({
          projectId: first.projectId,
          task: "opportunity_scout",
          status: "failed",
          failureCode: "qa_rejected",
          provider: "mock",
          model: "mock-opportunity-scout",
          outputJson: { hidden: "raw model output" },
          diagnosticsJson: {
            gateId: "dedupe_gate",
            message: "Duplicate opportunity."
          },
          latencyMs: 123,
          completedAt: new Date("2026-07-03T10:00:00.000Z")
        })
        .returning();
      assert.ok(firstRun);

      await db.insert(agentRuns).values({
        projectId: second.projectId,
        task: "opportunity_scout",
        status: "failed",
        failureCode: "provider_timeout",
        diagnosticsJson: { message: "Timeout" }
      });
      await db.insert(opportunities).values({
        projectId: first.projectId,
        agentRunId: firstRun.id,
        classification: "internal_radar",
        primaryKeyword: "hausmeisterservice dachau",
        score: 44,
        status: "new",
        evidenceJson: validBrief(first.projectId, {
          service: "Hausmeisterservice",
          primaryKeyword: "hausmeisterservice dachau"
        })
      });

      const list = await service.listAgentRuns(first.projectId, "opportunity_scout");

      assert.equal(list.projectId, first.projectId);
      assert.equal(list.runs.length, 1);
      assert.equal(list.runs[0]?.id, firstRun.id);
      assert.equal(list.runs[0]?.subjectId, undefined);
      assert.equal(list.runs[0]?.opportunityCount, 1);
      assert.equal(list.runs[0]?.failureCode, "qa_rejected");
      assert.equal(list.runs[0]?.failure?.gateId, "dedupe_gate");
      assert.match(list.runs[0]?.failure?.message ?? "", /No new opportunities/u);
      assert.equal("outputJson" in (list.runs[0] as Record<string, unknown>), false);
      assert.equal("diagnosticsJson" in (list.runs[0] as Record<string, unknown>), false);
    });

    void it("lists subject-scoped page proposal runs with their subject id", async () => {
      const fixture = await createProjectFixture(db, "Subject Run");
      const service = new OpportunitiesService(testDatabaseService(db));
      const subjectId = "33333333-3333-4333-8333-333333333333";

      const [run] = await db
        .insert(agentRuns)
        .values({
          projectId: fixture.projectId,
          subjectId,
          task: "page_brief_draft",
          status: "queued",
          diagnosticsJson: {
            opportunityId: subjectId
          }
        })
        .returning();
      assert.ok(run);

      const list = await service.listAgentRuns(fixture.projectId, "page_brief_draft");

      assert.equal(list.runs.length, 1);
      assert.equal(list.runs[0]?.id, run.id);
      assert.equal(list.runs[0]?.subjectId, subjectId);
      assert.equal(list.runs[0]?.task, "page_brief_draft");
      assert.equal("diagnosticsJson" in (list.runs[0] as Record<string, unknown>), false);
    });
  }
);

async function createProjectFixture(
  db: DatabaseClient,
  name = "Ranking Proof"
): Promise<{ projectId: string; userId: string }> {
  const [user] = await db
    .insert(users)
    .values({
      email: `${name.toLowerCase().replaceAll(" ", "-")}@example.com`,
      name: `${name} Operator`
    })
    .returning();
  assert.ok(user);

  const [customer] = await db
    .insert(customers)
    .values({ name: `${name} Customer`, ownerUserId: user.id })
    .returning();
  assert.ok(customer);

  const [project] = await db
    .insert(projects)
    .values({ customerId: customer.id, name: `${name} Project` })
    .returning();
  assert.ok(project);

  return { projectId: project.id, userId: user.id };
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

function validBrief(
  projectId: string,
  overrides: Partial<Parameters<typeof OpportunityBriefSchema.parse>[0]> = {}
): ReturnType<typeof OpportunityBriefSchema.parse> {
  return OpportunityBriefSchema.parse({
    projectId,
    classification: "near_term_target",
    service: "Entruempelung",
    location: {
      name: "Dachau",
      kind: "city",
      adjacencyReason: "manual_seed",
      existingClusterStrength: "weak"
    },
    primaryKeyword: "entruempelung dachau",
    secondaryKeywords: [],
    suggestedPageType: "normal_page",
    evidence: [
      {
        sourceType: "manual_note",
        sourceId: "manual-note-1",
        summary: "Manual evidence for the opportunity.",
        strength: "medium",
        proofTier: "supporting_context"
      }
    ],
    competitorObservations: [],
    groupHints: [],
    cannibalizationRisk: { level: "low", conflictingRoutes: [] },
    missingEvidence: ["Customer-safe ranking proof"],
    confidence: 0.7,
    recommendedAction: "create_brief",
    hubSpokeRole: "spoke",
    uniquenessRationale: "The location has a specific service-area reason.",
    ...overrides
  });
}
