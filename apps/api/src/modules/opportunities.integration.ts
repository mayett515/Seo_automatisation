import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { agentRuns, customers, opportunities, projects, rankingProofs, users, type DatabaseClient } from "@localseo/db";
import { OpportunityBriefSchema } from "@localseo/contracts";
import { eq } from "drizzle-orm";
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

    void it("creates manual ranking proof as project-owned customer-safe evidence", async () => {
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
          screenshotArtifactKey: "ranking-proofs/example.png",
          notes: "Manual incognito SERP check."
        },
        fixture.userId
      );

      assert.equal(proof.projectId, fixture.projectId);
      assert.equal(proof.rank, 4);
      assert.equal(proof.createdByUserId, fixture.userId);
      assert.equal(proof.capturedAt, "2026-07-03T10:00:00.000Z");

      const [row] = await db.select().from(rankingProofs).where(eq(rankingProofs.id, proof.id));
      assert.equal(row?.projectId, fixture.projectId);
      assert.deepEqual(row?.evidenceJson, {
        sourceType: "ranking_proof",
        proofTier: "customer_safe_proof",
        locator: {
          query: "entruempelung dachau",
          pageUrl: "https://customer.example/entruempelung-dachau/"
        },
        observedMetric: {
          name: "rank",
          value: 4
        },
        entrySource: "manual_operator_entry"
      });
    });

    void it("lists ranking proof only for the requested project", async () => {
      const first = await createProjectFixture(db, "First");
      const second = await createProjectFixture(db, "Second");
      const service = new OpportunitiesService(testDatabaseService(db));

      await service.createRankingProof(first.projectId, {
        query: "dachdecker dachau",
        pageUrl: "https://first.example/dachdecker-dachau/",
        rank: 3,
        capturedAt: "2026-07-03T09:00:00.000Z",
        searchEngine: "google",
        device: "desktop"
      });
      await service.createRankingProof(second.projectId, {
        query: "dachdecker karlsfeld",
        pageUrl: "https://second.example/dachdecker-karlsfeld/",
        rank: 2,
        capturedAt: "2026-07-03T11:00:00.000Z",
        searchEngine: "google",
        device: "desktop"
      });
      await service.createRankingProof(first.projectId, {
        query: "dachdecker indersdorf",
        pageUrl: "https://first.example/dachdecker-indersdorf/",
        rank: 1,
        capturedAt: "2026-07-03T12:00:00.000Z",
        searchEngine: "google",
        device: "desktop"
      });

      const list = await service.listRankingProofs(first.projectId);

      assert.equal(list.projectId, first.projectId);
      assert.deepEqual(
        list.proofs.map((proof) => proof.query),
        ["dachdecker indersdorf", "dachdecker dachau"]
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
      assert.equal(list.runs[0]?.opportunityCount, 1);
      assert.equal(list.runs[0]?.failureCode, "qa_rejected");
      assert.equal(list.runs[0]?.failure?.gateId, "dedupe_gate");
      assert.match(list.runs[0]?.failure?.message ?? "", /No new opportunities/u);
      assert.equal("outputJson" in (list.runs[0] as Record<string, unknown>), false);
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
    .values({ name: `${name} Customer` })
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
