import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { customers, jobRuns, projects, type DatabaseClient } from "@localseo/db";
import { eq } from "drizzle-orm";
import { QueueProducerService } from "./queue-producer.js";
import { DatabaseService } from "./database/database.service.js";
import {
  createIntegrationTestDatabase,
  truncateIntegrationTables
} from "../../../packages/db/test-support/integration-database.js";

type IntegrationDatabase = Awaited<ReturnType<typeof createIntegrationTestDatabase>>;

type QueueAddCall = {
  name: string;
  data: Record<string, unknown>;
  options: Record<string, unknown>;
};

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = Boolean(testDatabaseUrl);

void describe(
  "QueueProducerService database integration",
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

    void it("records an explicit dry-run audit row when queue infrastructure is unavailable", async () => {
      const fixture = await createQueueFixture(db);
      const service = new QueueProducerService(testDatabaseService(db));

      const result = await service.enqueue(queueInput(fixture));

      assert.equal(result, false);
      const rows = await db.select().from(jobRuns).where(eq(jobRuns.externalJobId, fixture.jobId));
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.status, "dry_run");
      assert.equal(rows[0]?.queueName, "deploy");
    });

    void it("coalesces duplicate active jobs without creating duplicate audit rows", async () => {
      const fixture = await createQueueFixture(db);
      const service = new QueueProducerService(testDatabaseService(db));
      const queue = new FakeQueue();
      setDeployQueue(service, queue);

      assert.equal(await service.enqueue(queueInput(fixture)), true);
      assert.equal(await service.enqueue(queueInput(fixture)), true);

      const rows = await db.select().from(jobRuns).where(eq(jobRuns.queueName, "deploy"));
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.status, "queued");
      assert.equal(queue.addCalls.length, 1);
      assert.equal(queue.addCalls[0]?.data.jobRunId, rows[0]?.id);
    });

    void it("archives terminal job runs before re-enqueueing the same job id", async () => {
      const fixture = await createQueueFixture(db);
      const service = new QueueProducerService(testDatabaseService(db));
      const queue = new FakeQueue();
      setDeployQueue(service, queue);

      assert.equal(await service.enqueue(queueInput(fixture)), true);
      await db
        .update(jobRuns)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(jobRuns.externalJobId, fixture.jobId));
      const completedJob = new FakeJob("completed");
      queue.existingJob = completedJob;

      assert.equal(await service.enqueue(queueInput(fixture)), true);

      const rows = await db.select().from(jobRuns).where(eq(jobRuns.queueName, "deploy"));
      assert.equal(rows.length, 2);
      assert.ok(
        rows.some((row) => row.status === "completed" && row.externalJobId?.startsWith(`${fixture.jobId}:archived:`))
      );
      assert.ok(rows.some((row) => row.status === "queued" && row.externalJobId === fixture.jobId));
      assert.equal(queue.addCalls.length, 2);
      assert.equal(completedJob.removed, true);
    });

    void it("marks queued audit rows failed when queue.add throws", async () => {
      const fixture = await createQueueFixture(db);
      const service = new QueueProducerService(testDatabaseService(db));
      const queue = new FakeQueue(new Error("redis write failed"));
      setDeployQueue(service, queue);

      await assert.rejects(() => service.enqueue(queueInput(fixture)), /redis write failed/u);

      const rows = await db.select().from(jobRuns).where(eq(jobRuns.externalJobId, fixture.jobId));
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.status, "failed");
      assert.deepEqual(rows[0]?.failureJson, { message: "redis write failed" });
    });
  }
);

async function createQueueFixture(
  db: DatabaseClient
): Promise<{ projectId: string; releasePlanId: string; jobId: string }> {
  const [customer] = await db.insert(customers).values({ name: "Queue Customer" }).returning();
  assert.ok(customer);
  const [project] = await db
    .insert(projects)
    .values({
      customerId: customer.id,
      name: "Queue Project"
    })
    .returning();
  assert.ok(project);
  const releasePlanId = randomUUID();

  return {
    projectId: project.id,
    releasePlanId,
    jobId: `release_plan:${releasePlanId}`
  };
}

function queueInput(fixture: { projectId: string; releasePlanId: string; jobId: string }) {
  return {
    queueName: "deploy" as const,
    jobName: "execute_release",
    jobId: fixture.jobId,
    data: {
      projectId: fixture.projectId,
      releasePlanId: fixture.releasePlanId,
      deploymentKey: fixture.jobId
    },
    options: { attempts: 3 },
    audit: {
      projectId: fixture.projectId,
      type: "deploy_release",
      inputRef: fixture.releasePlanId,
      actorType: "system" as const,
      triggerSource: "integration_test"
    }
  };
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

function setDeployQueue(service: QueueProducerService, queue: FakeQueue): void {
  (service as unknown as { queues: { deploy?: unknown } }).queues.deploy = queue;
}

class FakeQueue {
  readonly addCalls: QueueAddCall[] = [];
  existingJob: FakeJob | undefined;

  constructor(private readonly addError?: Error) {}

  getJob(): Promise<FakeJob | undefined> {
    return Promise.resolve(this.existingJob);
  }

  add(
    name: string,
    data: Record<string, unknown>,
    options: Record<string, unknown>
  ): Promise<{ id: string | undefined }> {
    if (this.addError) {
      return Promise.reject(this.addError);
    }

    this.addCalls.push({ name, data, options });
    this.existingJob = new FakeJob("waiting");

    return Promise.resolve({ id: typeof options.jobId === "string" ? options.jobId : undefined });
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeJob {
  removed = false;

  constructor(private readonly state: string) {}

  getState(): Promise<string> {
    return Promise.resolve(this.state);
  }

  remove(): Promise<void> {
    this.removed = true;
    return Promise.resolve();
  }
}
