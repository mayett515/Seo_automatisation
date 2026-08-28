import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { QueueJob } from "@localseo/contracts";
import {
  customers,
  gscConnections,
  gscSyncRuns,
  jobRuns,
  projects,
  users,
  type DatabaseClient
} from "@localseo/db";
import { eq } from "@localseo/db/query";
import { BetterAuthService } from "../auth/better-auth/better-auth.service.js";
import { ProjectMembershipService } from "../auth/project-membership.service.js";
import { DatabaseService } from "../database/database.service.js";
import { QueueProducerService } from "../queue-producer.js";
import { GscOAuthStateStore } from "./gsc-oauth-state.store.js";
import { GscService } from "./gsc.module.js";
import {
  createIntegrationTestDatabase,
  truncateIntegrationTables
} from "../../../../packages/db/test-support/integration-database.js";

type IntegrationDatabase = Awaited<ReturnType<typeof createIntegrationTestDatabase>>;

type QueueAddCall = {
  name: string;
  data: Record<string, unknown>;
  options: Record<string, unknown>;
};

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = Boolean(testDatabaseUrl);

void describe(
  "GscService queueSync job_runs integration",
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

    void it("records exactly one job_runs row owned by the shared producer for a sync request", async () => {
      const fixture = await createConnectedGscFixture(db);
      const queueService = new QueueProducerService(testDatabaseService(db));
      const queue = new FakeQueue();
      setGscSyncQueue(queueService, queue);
      const service = gscService(db, queueService);

      const result = await service.queueSync(fixture.projectId, {}, fixture.userId);
      const job = requireQueuedGscJob(result);

      const auditRows = await db.select().from(jobRuns).where(eq(jobRuns.queueName, "gsc-sync"));
      assert.equal(auditRows.length, 1);
      assert.equal(auditRows[0]?.externalJobId, job.jobId);
      assert.equal(auditRows[0]?.inputRef, job.inputRef);
      assert.equal(auditRows[0]?.type, "gsc_sync");
      assert.equal(auditRows[0]?.status, "queued");
      assert.equal(auditRows[0]?.actorType, "user");
      assert.equal(auditRows[0]?.actorUserId, fixture.userId);
      assert.equal(auditRows[0]?.triggerSource, "user_action");
      assert.equal(queue.addCalls[0]?.data.jobRunId, auditRows[0]?.id);

      const syncRows = await db.select().from(gscSyncRuns);
      assert.equal(syncRows.length, 1);
      assert.equal(syncRows[0]?.id, job.inputRef);
      assert.equal(syncRows[0]?.status, "queued");
      assert.equal(queue.addCalls.length, 1);
      assert.equal(queue.addCalls[0]?.name, "gsc_sync");
      assert.equal(queue.addCalls[0]?.options.jobId, job.jobId);
    });

    void it("records a second job_runs row for a repeated sync because each request uses a new job id", async () => {
      const fixture = await createConnectedGscFixture(db);
      const queueService = new QueueProducerService(testDatabaseService(db));
      const queue = new FakeQueue();
      setGscSyncQueue(queueService, queue);
      const service = gscService(db, queueService);

      const first = requireQueuedGscJob(await service.queueSync(fixture.projectId, {}, fixture.userId));
      const second = requireQueuedGscJob(await service.queueSync(fixture.projectId, {}, fixture.userId));

      assert.notEqual(first.jobId, second.jobId);
      assert.notEqual(first.inputRef, second.inputRef);

      const auditRows = await db.select().from(jobRuns).where(eq(jobRuns.queueName, "gsc-sync"));
      assert.equal(auditRows.length, 2);
      assert.deepEqual(new Set(auditRows.map((row) => row.externalJobId)), new Set([first.jobId, second.jobId]));
      assert.deepEqual(new Set(auditRows.map((row) => row.inputRef)), new Set([first.inputRef, second.inputRef]));
      assert.ok(auditRows.every((row) => row.actorType === "user" && row.triggerSource === "user_action"));

      const syncRows = await db.select().from(gscSyncRuns);
      assert.equal(syncRows.length, 2);
      assert.equal(queue.addCalls.length, 2);
    });
  }
);

async function createConnectedGscFixture(db: DatabaseClient): Promise<{ projectId: string; userId: string }> {
  const userId = "22222222-2222-4222-8222-222222222222";
  await db.insert(users).values({
    id: userId,
    email: "gsc-sync@example.com",
    name: "GSC Sync Operator"
  });

  const [customer] = await db.insert(customers).values({ name: "GSC Sync Customer" }).returning();
  assert.ok(customer);
  const [project] = await db
    .insert(projects)
    .values({
      customerId: customer.id,
      name: "GSC Sync Project"
    })
    .returning();
  assert.ok(project);

  const [connection] = await db
    .insert(gscConnections)
    .values({
      projectId: project.id,
      propertyUrl: "https://customer.example/",
      status: "connected",
      encryptedRefreshToken: "encrypted-refresh-token",
      connectedAt: new Date()
    })
    .returning();
  assert.ok(connection);

  return { projectId: project.id, userId };
}

function gscService(db: DatabaseClient, queues: QueueProducerService): GscService {
  return new GscService(
    undefined,
    undefined,
    queues,
    testDatabaseService(db),
    {} as GscOAuthStateStore,
    {} as BetterAuthService,
    {} as ProjectMembershipService
  );
}

function requireQueuedGscJob(result: Awaited<ReturnType<GscService["queueSync"]>>): QueueJob {
  assert.equal("jobId" in result, true);
  if (!("jobId" in result)) {
    throw new Error("expected a queued GSC job, not a connection status");
  }

  assert.equal(result.type, "gsc_sync");
  assert.equal(result.status, "queued");
  assert.ok(result.inputRef);
  return result;
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

function setGscSyncQueue(service: QueueProducerService, queue: FakeQueue): void {
  (service as unknown as { queues: { "gsc-sync"?: unknown } }).queues["gsc-sync"] = queue;
}

class FakeQueue {
  readonly addCalls: QueueAddCall[] = [];
  private readonly jobs = new Map<string, FakeJob>();

  getJob(jobId: string): Promise<FakeJob | undefined> {
    return Promise.resolve(this.jobs.get(jobId));
  }

  add(
    name: string,
    data: Record<string, unknown>,
    options: Record<string, unknown>
  ): Promise<{ id: string | undefined }> {
    this.addCalls.push({ name, data, options });
    const jobId = typeof options.jobId === "string" ? options.jobId : undefined;
    if (jobId) {
      this.jobs.set(jobId, new FakeJob());
    }
    return Promise.resolve({ id: jobId });
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeJob {
  getState(): Promise<string> {
    return Promise.resolve("waiting");
  }

  remove(): Promise<void> {
    return Promise.resolve();
  }
}
