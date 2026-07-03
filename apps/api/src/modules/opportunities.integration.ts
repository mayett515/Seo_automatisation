import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { customers, projects, rankingProofs, users, type DatabaseClient } from "@localseo/db";
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
