import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { SearchConsolePort, TokenCipher } from "@localseo/adapters";
import type { GscSearchAnalyticsRow } from "@localseo/contracts";
import {
  customers,
  gscConnections,
  gscOpportunitySignals,
  gscSearchAnalyticsRows,
  gscSyncRuns,
  projects,
  type DatabaseClient
} from "@localseo/db";
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import {
  createIntegrationTestDatabase,
  truncateIntegrationTables
} from "../../../../packages/db/test-support/integration-database.js";
import { handleGscSyncJob, type GscSyncDependencies } from "./gsc-sync.js";

type IntegrationDatabase = Awaited<ReturnType<typeof createIntegrationTestDatabase>>;

type GscSyncFixture = {
  projectId: string;
  connectionId: string;
  syncRunId: string;
  propertyUrl: string;
};

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = Boolean(testDatabaseUrl);
const testEnv = {} as Parameters<typeof handleGscSyncJob>[2];

void describe(
  "GSC sync worker database integration",
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

    void it("persists search analytics rows, opportunity signals, and sync completion truth", async () => {
      const fixture = await createGscSyncFixture(db);
      await insertStaleSyncData(db, fixture);
      const searchConsole = new FakeSearchConsole([
        analyticsRow(fixture, {
          query: "dachreinigung dachau",
          pageUrl: "https://customer.example/dachreinigung-dachau/",
          clicks: 0,
          impressions: 24,
          ctr: 0,
          position: 17
        }),
        analyticsRow(fixture, {
          query: "brand",
          pageUrl: "https://customer.example/",
          clicks: 5,
          impressions: 100,
          ctr: 0.05,
          position: 2
        })
      ]);

      const result = await handleGscSyncJob(jobFor(fixture), handle, testEnv, dependenciesFor(searchConsole));

      assert.equal(result.status, "completed");
      assert.equal(result.rowCount, 2);
      assert.equal(result.opportunitySignals, 3);
      assert.deepEqual(searchConsole.refreshCalls, [{ refreshToken: "refresh-token" }]);
      assert.deepEqual(searchConsole.queryCalls, [
        {
          accessToken: "access-token",
          projectId: fixture.projectId,
          propertyUrl: fixture.propertyUrl,
          dateRange: { from: "2026-06-01", to: "2026-06-30" },
          dimensions: ["query", "page"],
          rowLimit: 25000
        }
      ]);

      const [syncRun] = await db.select().from(gscSyncRuns).where(eq(gscSyncRuns.id, fixture.syncRunId));
      assert.equal(syncRun?.status, "completed");
      assert.equal(syncRun?.rowCount, 2);
      assert.equal(syncRun?.failureJson, null);
      assert.ok(syncRun?.startedAt instanceof Date);
      assert.ok(syncRun?.completedAt instanceof Date);

      const [connection] = await db.select().from(gscConnections).where(eq(gscConnections.id, fixture.connectionId));
      assert.ok(connection?.lastSyncedAt instanceof Date);
      assert.equal(connection?.failureJson, null);

      const rows = await db
        .select()
        .from(gscSearchAnalyticsRows)
        .where(eq(gscSearchAnalyticsRows.syncRunId, fixture.syncRunId));
      assert.equal(rows.length, 2);
      assert.deepEqual(rows.map((row) => row.query).sort(), ["brand", "dachreinigung dachau"]);

      const signals = await db
        .select()
        .from(gscOpportunitySignals)
        .where(eq(gscOpportunitySignals.syncRunId, fixture.syncRunId));
      assert.deepEqual(signals.map((signal) => signal.signalType).sort(), [
        "impressions_no_clicks",
        "positions_11_100",
        "service_location_query"
      ]);
    });

    void it("completes empty syncs and clears stale rows without creating signals", async () => {
      const fixture = await createGscSyncFixture(db);
      await insertStaleSyncData(db, fixture);

      const result = await handleGscSyncJob(
        jobFor(fixture),
        handle,
        testEnv,
        dependenciesFor(new FakeSearchConsole([]))
      );

      assert.equal(result.status, "completed");
      assert.equal(result.rowCount, 0);
      assert.equal(result.opportunitySignals, 0);

      const [syncRun] = await db.select().from(gscSyncRuns).where(eq(gscSyncRuns.id, fixture.syncRunId));
      assert.equal(syncRun?.status, "completed");
      assert.equal(syncRun?.rowCount, 0);

      const rows = await db
        .select()
        .from(gscSearchAnalyticsRows)
        .where(eq(gscSearchAnalyticsRows.syncRunId, fixture.syncRunId));
      const signals = await db
        .select()
        .from(gscOpportunitySignals)
        .where(eq(gscOpportunitySignals.syncRunId, fixture.syncRunId));
      assert.equal(rows.length, 0);
      assert.equal(signals.length, 0);
    });

    void it("marks sync runs failed when Search Console querying fails", async () => {
      const fixture = await createGscSyncFixture(db);
      const searchConsole = new FakeSearchConsole([], new Error("Search Console API request failed: quota exhausted"));

      await assert.rejects(
        handleGscSyncJob(jobFor(fixture), handle, testEnv, dependenciesFor(searchConsole)),
        /Search Console API request failed/u
      );

      const [syncRun] = await db.select().from(gscSyncRuns).where(eq(gscSyncRuns.id, fixture.syncRunId));
      assert.equal(syncRun?.status, "failed");
      assert.ok(syncRun?.completedAt instanceof Date);
      assert.deepEqual(syncRun?.failureJson, { message: "search_console_api_request_failed" });

      const [connection] = await db.select().from(gscConnections).where(eq(gscConnections.id, fixture.connectionId));
      assert.equal(connection?.lastSyncedAt, null);

      const rows = await db
        .select()
        .from(gscSearchAnalyticsRows)
        .where(eq(gscSearchAnalyticsRows.syncRunId, fixture.syncRunId));
      const signals = await db
        .select()
        .from(gscOpportunitySignals)
        .where(eq(gscOpportunitySignals.syncRunId, fixture.syncRunId));
      assert.equal(rows.length, 0);
      assert.equal(signals.length, 0);
    });
  }
);

async function createGscSyncFixture(db: DatabaseClient): Promise<GscSyncFixture> {
  const [customer] = await db.insert(customers).values({ name: "GSC Customer" }).returning();
  assert.ok(customer);

  const [project] = await db
    .insert(projects)
    .values({
      customerId: customer.id,
      name: "GSC Project"
    })
    .returning();
  assert.ok(project);

  const propertyUrl = "https://customer.example/";
  const [connection] = await db
    .insert(gscConnections)
    .values({
      projectId: project.id,
      propertyUrl,
      status: "connected",
      encryptedRefreshToken: "encrypted-refresh-token",
      connectedAt: new Date(),
      failureJson: { message: "previous_failure" }
    })
    .returning();
  assert.ok(connection);

  const [syncRun] = await db
    .insert(gscSyncRuns)
    .values({
      projectId: project.id,
      connectionId: connection.id,
      propertyUrl,
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      dimensions: ["query", "page"],
      status: "queued"
    })
    .returning();
  assert.ok(syncRun);

  return {
    projectId: project.id,
    connectionId: connection.id,
    syncRunId: syncRun.id,
    propertyUrl
  };
}

async function insertStaleSyncData(db: DatabaseClient, fixture: GscSyncFixture): Promise<void> {
  const staleRowId = randomUUID();
  await db.insert(gscSearchAnalyticsRows).values({
    id: staleRowId,
    projectId: fixture.projectId,
    syncRunId: fixture.syncRunId,
    propertyUrl: fixture.propertyUrl,
    query: "old query",
    pageUrl: "https://customer.example/old/",
    clicks: 1,
    impressions: 1,
    ctr: 1,
    position: 1
  });
  await db.insert(gscOpportunitySignals).values({
    projectId: fixture.projectId,
    syncRunId: fixture.syncRunId,
    rowId: staleRowId,
    signalType: "impressions_no_clicks",
    status: "internal_radar",
    query: "old query",
    pageUrl: "https://customer.example/old/",
    evidenceJson: { source: "stale_fixture" }
  });
}

function analyticsRow(fixture: GscSyncFixture, input: Partial<GscSearchAnalyticsRow>): GscSearchAnalyticsRow {
  return {
    projectId: fixture.projectId,
    propertyUrl: fixture.propertyUrl,
    query: "dachreinigung dachau",
    pageUrl: "https://customer.example/dachreinigung-dachau/",
    clicks: 0,
    impressions: 0,
    ctr: 0,
    position: 1,
    ...input
  };
}

function jobFor(fixture: GscSyncFixture): Job {
  return {
    id: `gsc:${fixture.syncRunId}`,
    queueName: "gsc-sync",
    data: {
      projectId: fixture.projectId,
      syncRunId: fixture.syncRunId
    }
  } as Job;
}

function dependenciesFor(searchConsole: FakeSearchConsole): GscSyncDependencies {
  return {
    searchConsole,
    tokenCipher: new FakeTokenCipher()
  };
}

class FakeSearchConsole implements Pick<SearchConsolePort, "refreshAccessToken" | "querySearchAnalytics"> {
  readonly refreshCalls: Array<Parameters<SearchConsolePort["refreshAccessToken"]>[0]> = [];
  readonly queryCalls: Array<Parameters<SearchConsolePort["querySearchAnalytics"]>[0]> = [];

  constructor(
    private readonly rows: GscSearchAnalyticsRow[],
    private readonly queryError?: Error
  ) {}

  refreshAccessToken(input: Parameters<SearchConsolePort["refreshAccessToken"]>[0]) {
    this.refreshCalls.push(input);
    return Promise.resolve({ accessToken: "access-token", expiresIn: 3600 });
  }

  querySearchAnalytics(input: Parameters<SearchConsolePort["querySearchAnalytics"]>[0]) {
    this.queryCalls.push(input);

    if (this.queryError) {
      return Promise.reject(this.queryError);
    }

    return Promise.resolve(this.rows);
  }
}

class FakeTokenCipher implements Pick<TokenCipher, "decrypt"> {
  decrypt(value: string): string {
    assert.equal(value, "encrypted-refresh-token");
    return "refresh-token";
  }
}
