import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { MockSerpScoutAdapter, type SerpScoutResult } from "@localseo/adapters";
import { buildSerpSnapshotCacheKey, type SerpScoutJobData } from "@localseo/contracts";
import { customers, projects, serpSnapshots, type DatabaseClient } from "@localseo/db";
import { eq } from "drizzle-orm";
import {
  createIntegrationTestDatabase,
  truncateIntegrationTables
} from "../../../../packages/db/test-support/integration-database.js";
import {
  SerpScoutProviderError,
  SerpScoutTerminalError,
  createDrizzleSerpScoutRepository,
  executeSerpScout
} from "./serp-scout.js";

type IntegrationDatabase = Awaited<ReturnType<typeof createIntegrationTestDatabase>>;

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = Boolean(testDatabaseUrl);

void describe(
  "SERP scout worker database integration",
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

    void it("persists captured snapshots with normalized JSONB result data", async () => {
      const data = await createSerpScoutFixture(db);
      const adapter = new MockSerpScoutAdapter();

      const result = await executeSerpScout({
        data,
        repository: createDrizzleSerpScoutRepository(db),
        serpScout: adapter,
        timeoutMs: 15_000
      });

      assert.equal(result.status, "captured");
      assert.equal(result.snapshotId, data.snapshotId);
      assert.equal(adapter.calls.length, 1);
      assert.equal(adapter.calls[0]?.snapshotId, data.snapshotId);

      const [snapshot] = await db.select().from(serpSnapshots).where(eq(serpSnapshots.id, data.snapshotId));
      assert.equal(snapshot?.projectId, data.projectId);
      assert.equal(snapshot?.status, "captured");
      assert.equal(snapshot?.query, data.query);
      assert.equal(snapshot?.cacheKey, buildSerpSnapshotCacheKey(data));
      assert.equal(snapshot?.provider, "mock");
      assert.equal(snapshot?.engineErrorsJson.length, 0);
      assert.equal(snapshot?.resultsJson.length, 1);
      assert.equal(snapshot?.resultsJson[0]?.rank, 1);
      assert.equal(snapshot?.resultsJson[0]?.type, "organic");
    });

    void it("no-ops on replay when the snapshot was already captured", async () => {
      const data = await createSerpScoutFixture(db);
      await executeSerpScout({
        data,
        repository: createDrizzleSerpScoutRepository(db),
        serpScout: new MockSerpScoutAdapter(),
        timeoutMs: 15_000
      });
      const replayAdapter = new MockSerpScoutAdapter({
        ok: false,
        failureCode: "provider_error",
        diagnostics: { latencyMs: 1, detail: "should_not_run" }
      });

      const replay = await executeSerpScout({
        data,
        repository: createDrizzleSerpScoutRepository(db),
        serpScout: replayAdapter,
        timeoutMs: 15_000
      });

      assert.equal(replay.status, "already_captured");
      assert.equal(replayAdapter.calls.length, 0);
      const rows = await db.select().from(serpSnapshots).where(eq(serpSnapshots.id, data.snapshotId));
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.status, "captured");
    });

    void it("persists retryable provider failures as failed snapshots", async () => {
      const data = await createSerpScoutFixture(db);

      await assert.rejects(
        executeSerpScout({
          data,
          repository: createDrizzleSerpScoutRepository(db),
          serpScout: new MockSerpScoutAdapter({
            ok: false,
            failureCode: "provider_timeout",
            diagnostics: { latencyMs: 15_000, detail: "timeout waiting for provider" }
          }),
          timeoutMs: 15_000
        }),
        SerpScoutProviderError
      );

      const [snapshot] = await db.select().from(serpSnapshots).where(eq(serpSnapshots.id, data.snapshotId));
      assert.equal(snapshot?.status, "failed");
      assert.equal(snapshot?.provider, "unavailable");
      assert.equal(snapshot?.resultsJson.length, 0);
      assert.deepEqual(snapshot?.engineErrorsJson, [
        {
          code: "provider_timeout",
          message: "timeout waiting for provider"
        }
      ]);
    });

    void it("records invalid adapter snapshots as terminal failed snapshots", async () => {
      const data = await createSerpScoutFixture(db);
      const invalidResult = {
        ok: true,
        snapshot: {
          id: data.snapshotId,
          projectId: data.projectId,
          status: "captured"
        },
        diagnostics: { latencyMs: 2 }
      } as unknown as SerpScoutResult;

      await assert.rejects(
        executeSerpScout({
          data,
          repository: createDrizzleSerpScoutRepository(db),
          serpScout: new MockSerpScoutAdapter(invalidResult),
          timeoutMs: 15_000
        }),
        SerpScoutTerminalError
      );

      const [snapshot] = await db.select().from(serpSnapshots).where(eq(serpSnapshots.id, data.snapshotId));
      assert.equal(snapshot?.status, "failed");
      assert.equal(snapshot?.engineErrorsJson[0]?.code, "adapter_invalid_snapshot");
      assert.match(snapshot?.engineErrorsJson[0]?.message ?? "", /SerpSnapshotSchema/u);
    });

    void it("records wrong-project adapter snapshots as terminal failed snapshots", async () => {
      const data = await createSerpScoutFixture(db);

      await assert.rejects(
        executeSerpScout({
          data,
          repository: createDrizzleSerpScoutRepository(db),
          serpScout: new MockSerpScoutAdapter((input) => ({
            ok: true,
            snapshot: {
              id: input.snapshotId ?? "wrong",
              projectId: "11111111-1111-4111-8111-111111111111",
              status: "captured",
              query: input.query,
              searchEngine: input.searchEngine,
              device: input.device,
              cacheKey: buildSerpSnapshotCacheKey(input),
              capturedAt: "2026-07-05T00:00:00.000Z",
              provider: "mock",
              results: [],
              serpFeatures: [],
              engineErrors: [],
              artifactRefs: []
            },
            diagnostics: { latencyMs: 2 }
          })),
          timeoutMs: 15_000
        }),
        SerpScoutTerminalError
      );

      const [snapshot] = await db.select().from(serpSnapshots).where(eq(serpSnapshots.id, data.snapshotId));
      assert.equal(snapshot?.status, "failed");
      assert.equal(snapshot?.projectId, data.projectId);
      assert.equal(snapshot?.engineErrorsJson[0]?.code, "adapter_invalid_snapshot");
      assert.match(snapshot?.engineErrorsJson[0]?.message ?? "", /wrong project or snapshot id/u);
    });
  }
);

async function createSerpScoutFixture(db: DatabaseClient): Promise<SerpScoutJobData> {
  const [customer] = await db.insert(customers).values({ name: "SERP Scout Customer" }).returning();
  assert.ok(customer);

  const [project] = await db
    .insert(projects)
    .values({
      customerId: customer.id,
      name: "SERP Scout Project"
    })
    .returning();
  assert.ok(project);

  return {
    projectId: project.id,
    snapshotId: "33333333-3333-4333-8333-333333333333",
    query: "dachdecker dachau",
    searchEngine: "google",
    device: "desktop",
    locale: "de-DE",
    region: "BY",
    maxResults: 10
  };
}
