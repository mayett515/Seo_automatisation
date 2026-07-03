import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { MockReasoningAdapter, type ObjectStoragePort } from "@localseo/adapters";
import type { OpportunityScoutOutput } from "@localseo/contracts";
import {
  agentRuns,
  customers,
  gscOpportunitySignals,
  gscSearchAnalyticsRows,
  gscSyncRuns,
  opportunities,
  projects,
  rankingProofs,
  trackingEvents,
  websiteImportRuns,
  type DatabaseClient
} from "@localseo/db";
import { eq } from "drizzle-orm";
import {
  createIntegrationTestDatabase,
  truncateIntegrationTables
} from "../../../../packages/db/test-support/integration-database.js";
import {
  OpportunityScoutEvidenceError,
  OpportunityScoutProviderError,
  OpportunityScoutWorkflowError,
  createDrizzleOpportunityScoutRepository,
  executeOpportunityScout
} from "./opportunity-scout.js";

type IntegrationDatabase = Awaited<ReturnType<typeof createIntegrationTestDatabase>>;

type ScoutFixture = {
  projectId: string;
  runId: string;
  rowId: string;
  signalId: string;
  proofId: string;
};

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = Boolean(testDatabaseUrl);

void describe(
  "opportunity scout worker database integration",
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

    void it("persists opportunities only with a succeeded agent run", async () => {
      const fixture = await createScoutFixture(db);
      const storage = new MemoryObjectStorage();
      const reasoning = new MockReasoningAdapter({
        ok: true,
        provider: "mock",
        model: "mock-opportunity-scout",
        outputJson: validOpportunityScoutOutput(fixture),
        usage: { inputTokens: 10, outputTokens: 20, costCents: 3 },
        diagnostics: { latencyMs: 11, finishReason: "stop" }
      });

      const result = await executeOpportunityScout({
        data: { projectId: fixture.projectId, runId: fixture.runId },
        repository: createDrizzleOpportunityScoutRepository(db),
        reasoning,
        objectStorage: storage
      });

      assert.equal(result.status, "succeeded");
      assert.equal(result.opportunityCount, 1);
      assert.equal(reasoning.calls.length, 1);
      assert.equal(reasoning.calls[0]?.policy.canMutateProduction, false);
      assert.deepEqual(reasoning.calls[0]?.policy.allowedToolCategories, ["read_evidence", "analyze"]);
      assert.equal(storage.writes.length, 1);
      assert.match(storage.writes[0]?.key ?? "", /opportunity-scout-input\.json$/u);

      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.equal(run?.status, "succeeded");
      assert.equal(run?.failureCode, null);
      assert.equal(run?.provider, "mock");
      assert.equal(run?.model, "mock-opportunity-scout");
      assert.equal(run?.inputRef, storage.writes[0]?.key);
      assert.deepEqual(run?.usageJson, { inputTokens: 10, outputTokens: 20, costCents: 3 });
      assert.equal(run?.latencyMs, 11);
      assert.ok(run?.startedAt instanceof Date);
      assert.ok(run?.completedAt instanceof Date);

      const rows = await db.select().from(opportunities).where(eq(opportunities.agentRunId, fixture.runId));
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.projectId, fixture.projectId);
      assert.equal(rows[0]?.classification, "near_term_target");
      assert.equal(rows[0]?.primaryKeyword, "entruempelung dachau");
      assert.equal(rows[0]?.status, "new");
      assert.ok((rows[0]?.score ?? 0) > 0);
      const evidenceJson = recordFromUnknown(rows[0]?.evidenceJson);
      assert.equal(evidenceJson.service, "Entruempelung");
      assert.equal(recordFromUnknown(evidenceJson.location).name, "Dachau");
      assert.equal(rows[0]?.classification, evidenceJson.classification);
      assert.equal(rows[0]?.score, evidenceJson.score);
    });

    void it("allows a succeeded run with zero briefs and no opportunity rows", async () => {
      const fixture = await createScoutFixture(db);

      const result = await executeOpportunityScout({
        data: { projectId: fixture.projectId, runId: fixture.runId },
        repository: createDrizzleOpportunityScoutRepository(db),
        reasoning: new MockReasoningAdapter(),
        objectStorage: new MemoryObjectStorage()
      });

      assert.equal(result.status, "succeeded");
      assert.equal(result.opportunityCount, 0);

      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.equal(run?.status, "succeeded");
      const rows = await db.select().from(opportunities).where(eq(opportunities.agentRunId, fixture.runId));
      assert.equal(rows.length, 0);
    });

    void it("accepts proven wins that cite project-owned ranking proof", async () => {
      const fixture = await createScoutFixture(db);
      const reasoning = new MockReasoningAdapter({
        ok: true,
        provider: "mock",
        model: "mock-opportunity-scout",
        outputJson: validOpportunityScoutOutput(fixture, {
          classification: "proven_win",
          recommendedAction: "monitor",
          suggestedPageType: "monitor_only",
          evidence: [rankingProofEvidence(fixture)],
          missingEvidence: []
        }),
        diagnostics: { latencyMs: 9 }
      });

      const result = await executeOpportunityScout({
        data: { projectId: fixture.projectId, runId: fixture.runId },
        repository: createDrizzleOpportunityScoutRepository(db),
        reasoning,
        objectStorage: new MemoryObjectStorage()
      });

      assert.equal(result.status, "succeeded");
      const packet = recordFromUnknown(reasoning.calls[0]?.inputJson);
      assert.deepEqual(
        arrayFromUnknown(packet.rankingProofs).map((proof) => recordFromUnknown(proof).sourceId),
        [fixture.proofId]
      );

      const rows = await db.select().from(opportunities).where(eq(opportunities.agentRunId, fixture.runId));
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.classification, "proven_win");
      assert.equal(rows[0]?.status, "monitoring");
    });

    void it("rejects proven wins when model-claimed rank differs from the proof row", async () => {
      const fixture = await createScoutFixture(db);

      await assert.rejects(
        executeOpportunityScout({
          data: { projectId: fixture.projectId, runId: fixture.runId },
          repository: createDrizzleOpportunityScoutRepository(db),
          reasoning: new MockReasoningAdapter({
            ok: true,
            provider: "mock",
            model: "mock-opportunity-scout",
            outputJson: validOpportunityScoutOutput(fixture, {
              classification: "proven_win",
              recommendedAction: "monitor",
              suggestedPageType: "monitor_only",
              evidence: [rankingProofEvidence(fixture, { observedMetric: { name: "rank", value: 3 } })],
              missingEvidence: []
            }),
            diagnostics: { latencyMs: 9 }
          }),
          objectStorage: new MemoryObjectStorage()
        }),
        (error) => error instanceof OpportunityScoutWorkflowError && /qa_rejected:proof_gate/u.test(error.message)
      );

      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.equal(run?.status, "failed");
      assert.equal(recordFromUnknown(run?.diagnosticsJson).gateId, "proof_gate");
      const rows = await db.select().from(opportunities).where(eq(opportunities.agentRunId, fixture.runId));
      assert.equal(rows.length, 0);
    });

    void it("supports provider failure followed by BullMQ retry success without duplicates", async () => {
      const fixture = await createScoutFixture(db);
      const repository = createDrizzleOpportunityScoutRepository(db);

      await assert.rejects(
        executeOpportunityScout({
          data: { projectId: fixture.projectId, runId: fixture.runId },
          repository,
          reasoning: new MockReasoningAdapter({
            ok: false,
            provider: "mock",
            model: "mock-opportunity-scout",
            failureCode: "provider_timeout",
            diagnostics: { latencyMs: 120_000, detail: "timeout" }
          }),
          objectStorage: new MemoryObjectStorage()
        }),
        OpportunityScoutProviderError
      );

      const [failedRun] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.equal(failedRun?.status, "failed");
      assert.equal(failedRun?.failureCode, "provider_timeout");
      const failedRows = await db.select().from(opportunities).where(eq(opportunities.agentRunId, fixture.runId));
      assert.equal(failedRows.length, 0);

      const retryResult = await executeOpportunityScout({
        data: { projectId: fixture.projectId, runId: fixture.runId },
        repository,
        reasoning: new MockReasoningAdapter({
          ok: true,
          provider: "mock",
          model: "mock-opportunity-scout",
          outputJson: validOpportunityScoutOutput(fixture),
          diagnostics: { latencyMs: 10 }
        }),
        objectStorage: new MemoryObjectStorage()
      });

      assert.equal(retryResult.status, "succeeded");
      const rows = await db.select().from(opportunities).where(eq(opportunities.agentRunId, fixture.runId));
      assert.equal(rows.length, 1);
      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.equal(run?.status, "succeeded");
      assert.equal(run?.failureCode, null);

      const duplicateResult = await executeOpportunityScout({
        data: { projectId: fixture.projectId, runId: fixture.runId },
        repository,
        reasoning: new MockReasoningAdapter({
          ok: true,
          provider: "mock",
          model: "mock-opportunity-scout",
          outputJson: validOpportunityScoutOutput(fixture),
          diagnostics: { latencyMs: 10 }
        }),
        objectStorage: new MemoryObjectStorage()
      });
      assert.equal(duplicateResult.status, "already_succeeded");
      const rowsAfterDuplicate = await db
        .select()
        .from(opportunities)
        .where(eq(opportunities.agentRunId, fixture.runId));
      assert.equal(rowsAfterDuplicate.length, 1);
    });

    void it("stops cleanly when a failed run retry collides with another active run", async () => {
      const fixture = await createScoutFixture(db);
      await db
        .update(agentRuns)
        .set({ status: "failed", failureCode: "provider_timeout" })
        .where(eq(agentRuns.id, fixture.runId));
      await db.insert(agentRuns).values({
        projectId: fixture.projectId,
        task: "opportunity_scout",
        status: "running"
      });

      const reasoning = new MockReasoningAdapter({
        ok: true,
        provider: "mock",
        model: "mock-opportunity-scout",
        outputJson: validOpportunityScoutOutput(fixture),
        diagnostics: { latencyMs: 10 }
      });

      await assert.rejects(
        executeOpportunityScout({
          data: { projectId: fixture.projectId, runId: fixture.runId },
          repository: createDrizzleOpportunityScoutRepository(db),
          reasoning,
          objectStorage: new MemoryObjectStorage()
        }),
        (error) => error instanceof OpportunityScoutEvidenceError && /could not be marked running/u.test(error.message)
      );

      assert.equal(reasoning.calls.length, 0);
      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.equal(run?.status, "failed");
    });

    void it("clears stale model output when retrying a failed run", async () => {
      const fixture = await createScoutFixture(db);
      const repository = createDrizzleOpportunityScoutRepository(db);

      await assert.rejects(
        executeOpportunityScout({
          data: { projectId: fixture.projectId, runId: fixture.runId },
          repository,
          reasoning: new MockReasoningAdapter({
            ok: true,
            provider: "mock",
            model: "mock-opportunity-scout",
            outputJson: validOpportunityScoutOutput(fixture, {
              classification: "proven_win",
              recommendedAction: "monitor"
            }),
            diagnostics: { latencyMs: 10 }
          }),
          objectStorage: new MemoryObjectStorage()
        }),
        OpportunityScoutWorkflowError
      );

      const [qaFailedRun] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.equal(qaFailedRun?.status, "failed");
      assert.equal(qaFailedRun?.failureCode, "qa_rejected");
      assert.ok(recordFromUnknown(qaFailedRun?.outputJson).raw);

      await assert.rejects(
        executeOpportunityScout({
          data: { projectId: fixture.projectId, runId: fixture.runId },
          repository,
          reasoning: new MockReasoningAdapter({
            ok: false,
            provider: "mock",
            failureCode: "provider_timeout",
            diagnostics: { latencyMs: 120_000, detail: "timeout" }
          }),
          objectStorage: new MemoryObjectStorage()
        }),
        OpportunityScoutProviderError
      );

      const [providerFailedRun] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.equal(providerFailedRun?.status, "failed");
      assert.equal(providerFailedRun?.failureCode, "provider_timeout");
      assert.equal(providerFailedRun?.outputJson, null);
    });

    void it("rejects cross-project evidence before persisting opportunities", async () => {
      const fixture = await createScoutFixture(db);
      const otherFixture = await createScoutFixture(db, { name: "Other Scout Project" });

      await assert.rejects(
        executeOpportunityScout({
          data: { projectId: fixture.projectId, runId: fixture.runId },
          repository: createDrizzleOpportunityScoutRepository(db),
          reasoning: new MockReasoningAdapter({
            ok: true,
            provider: "mock",
            model: "mock-opportunity-scout",
            outputJson: validOpportunityScoutOutput({
              ...fixture,
              rowId: otherFixture.rowId,
              signalId: otherFixture.signalId
            }),
            diagnostics: { latencyMs: 10 }
          }),
          objectStorage: new MemoryObjectStorage()
        }),
        (error) =>
          error instanceof OpportunityScoutWorkflowError && /qa_rejected:evidence_resolution/u.test(error.message)
      );

      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.equal(run?.status, "failed");
      assert.equal(run?.failureCode, "qa_rejected");
      assert.equal(recordFromUnknown(run?.diagnosticsJson).gateId, "evidence_resolution");
      const rows = await db.select().from(opportunities).where(eq(opportunities.agentRunId, fixture.runId));
      assert.equal(rows.length, 0);
    });
  }
);

async function createScoutFixture(db: DatabaseClient, input: { name?: string } = {}): Promise<ScoutFixture> {
  const [customer] = await db
    .insert(customers)
    .values({ name: `${input.name ?? "Scout"} Customer` })
    .returning();
  assert.ok(customer);

  const [project] = await db
    .insert(projects)
    .values({
      customerId: customer.id,
      name: input.name ?? "Scout Project"
    })
    .returning();
  assert.ok(project);

  const [run] = await db
    .insert(agentRuns)
    .values({
      projectId: project.id,
      task: "opportunity_scout",
      status: "queued"
    })
    .returning();
  assert.ok(run);

  await db.insert(websiteImportRuns).values({
    projectId: project.id,
    sourceUrl: "https://customer.example/",
    status: "completed",
    artifactKey: `website-imports/${project.id}/latest.json`,
    summaryJson: {
      discoveredRoutes: ["/", "/entruempelung/"],
      facts: {
        brand: { name: "Martines", confidence: "high", sourceRoutes: ["/"] },
        services: [{ value: "Entruempelung", confidence: "medium", sourceRoutes: ["/entruempelung/"] }],
        areas: [{ value: "Dachau", confidence: "medium", sourceRoutes: ["/entruempelung/"] }]
      }
    },
    startedAt: new Date(),
    completedAt: new Date()
  });

  const [syncRun] = await db
    .insert(gscSyncRuns)
    .values({
      projectId: project.id,
      propertyUrl: "https://customer.example/",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      dimensions: ["query", "page"],
      status: "completed",
      rowCount: 1,
      completedAt: new Date()
    })
    .returning();
  assert.ok(syncRun);

  const [row] = await db
    .insert(gscSearchAnalyticsRows)
    .values({
      projectId: project.id,
      syncRunId: syncRun.id,
      propertyUrl: "https://customer.example/",
      query: "entruempelung dachau",
      pageUrl: "https://customer.example/entruempelung/",
      clicks: 0,
      impressions: 28,
      ctr: 0,
      position: 17
    })
    .returning();
  assert.ok(row);

  const [signal] = await db
    .insert(gscOpportunitySignals)
    .values({
      projectId: project.id,
      syncRunId: syncRun.id,
      rowId: row.id,
      signalType: "service_location_query",
      status: "near_term_target",
      query: row.query,
      pageUrl: row.pageUrl,
      evidenceJson: { reason: "Dachau intent appears on generic service page." }
    })
    .returning();
  assert.ok(signal);

  await db.insert(trackingEvents).values({
    projectId: project.id,
    eventName: "page_view",
    route: "/entruempelung/",
    occurredAt: new Date()
  });

  const [proof] = await db
    .insert(rankingProofs)
    .values({
      projectId: project.id,
      query: "entruempelung dachau",
      pageUrl: "https://customer.example/entruempelung-dachau/",
      rank: 4,
      capturedAt: new Date("2026-07-03T10:00:00.000Z"),
      searchEngine: "google",
      device: "desktop",
      evidenceJson: { entrySource: "manual_operator_entry" }
    })
    .returning();
  assert.ok(proof);

  return {
    projectId: project.id,
    runId: run.id,
    rowId: row.id,
    signalId: signal.id,
    proofId: proof.id
  };
}

function validOpportunityScoutOutput(
  fixture: Pick<ScoutFixture, "projectId" | "rowId" | "signalId">,
  overrides: Partial<OpportunityScoutOutput["briefs"][number]> = {}
): OpportunityScoutOutput {
  return {
    briefs: [
      {
        projectId: fixture.projectId,
        classification: "near_term_target",
        service: "Entruempelung",
        location: {
          name: "Dachau",
          kind: "city",
          adjacencyReason: "gsc_testing_signal",
          existingClusterStrength: "medium",
          mapGroupKey: "dachau-south",
          evidence: []
        },
        primaryKeyword: "entruempelung dachau",
        secondaryKeywords: ["wohnungsaufloesung dachau"],
        suggestedRoute: "/entruempelung-dachau/",
        suggestedPageType: "normal_page",
        evidence: [
          {
            sourceType: "gsc_row",
            sourceId: fixture.rowId,
            summary: "GSC shows Dachau intent on the generic clear-out page.",
            observedMetric: { name: "impressions", value: 28 },
            strength: "medium",
            proofTier: "internal_signal"
          },
          {
            sourceType: "gsc_signal",
            sourceId: fixture.signalId,
            summary: "The service-location query is already classified as a near-term target.",
            strength: "medium",
            proofTier: "internal_signal"
          }
        ],
        competitorObservations: [
          {
            url: "https://competitor.example/entruempelung-dachau/",
            observation: "Competitor page is thin and lacks Dachau-specific disposal context.",
            gap: "Add local logistics and service proof."
          }
        ],
        corridorCluster: {
          name: "Dachau south",
          hubPlace: "Dachau",
          places: ["Dachau", "Karlsfeld", "Hebertshausen"],
          rationale: "Adjacent high-intent places near the existing service area.",
          clusterStrength: "medium",
          recommendedSequence: ["Dachau", "Karlsfeld", "Hebertshausen"]
        },
        groupHints: [],
        hubSpokeRole: "spoke",
        uniquenessRationale: "Dedicated Dachau page separates local clear-out intent from the generic service hub.",
        cannibalizationRisk: { level: "low", conflictingRoutes: ["/entruempelung/"] },
        missingEvidence: ["Manual SERP check", "Customer project proof"],
        confidence: 0.67,
        recommendedAction: "create_brief",
        ...overrides
      }
    ],
    groups: []
  };
}

function rankingProofEvidence(
  fixture: Pick<ScoutFixture, "proofId">,
  overrides: Partial<OpportunityScoutOutput["briefs"][number]["evidence"][number]> = {}
): OpportunityScoutOutput["briefs"][number]["evidence"][number] {
  return {
    sourceType: "ranking_proof",
    sourceId: fixture.proofId,
    locator: {
      query: "entruempelung dachau",
      pageUrl: "https://customer.example/entruempelung-dachau/"
    },
    summary: "Manual SERP proof shows the Dachau page in the Top 10.",
    observedMetric: { name: "rank", value: 4 },
    strength: "strong",
    proofTier: "customer_safe_proof",
    ...overrides
  };
}

class MemoryObjectStorage implements ObjectStoragePort {
  readonly writes: Array<{ key: string; value: unknown }> = [];

  putJson(input: { key: string; value: unknown }): Promise<{ key: string }> {
    this.writes.push(input);
    return Promise.resolve({ key: input.key });
  }

  getJson(input: { key: string }): Promise<unknown> {
    return Promise.resolve(this.writes.find((write) => write.key === input.key)?.value);
  }
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function arrayFromUnknown(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
