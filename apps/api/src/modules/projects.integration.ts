import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { agentRuns, customers, jobRuns, projects, users, type DatabaseClient } from "@localseo/db";
import { eq } from "drizzle-orm";
import { QueueProducerService } from "../queue-producer.js";
import { DatabaseService } from "../database/database.service.js";
import { ProjectsService } from "./projects.module.js";
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
  "ProjectsService opportunity scout integration",
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

    void it("creates a queued agent run and enqueues BullMQ with jobId equal to runId", async () => {
      const fixture = await createProjectFixture(db);
      const queueService = new QueueProducerService(testDatabaseService(db));
      const queue = new FakeQueue();
      setOpportunityScoutQueue(queueService, queue);
      const service = new ProjectsService(queueService, testDatabaseService(db));

      const result = await service.queueOpportunityScout(fixture.projectId, { maxBriefs: 5 }, fixture.userId);

      assert.equal(result.status, "queued");
      assert.equal(result.type, "opportunity_scout");
      assert.equal(result.projectId, fixture.projectId);
      assert.equal(result.runId, result.jobId);
      assert.equal(result.inputRef, result.runId);
      assert.equal(result.createdBy, fixture.userId);
      assert.equal(queue.addCalls.length, 1);
      assert.equal(queue.addCalls[0]?.name, "opportunity_scout");
      assert.equal(queue.addCalls[0]?.options.jobId, result.runId);
      assert.equal(queue.addCalls[0]?.data.projectId, fixture.projectId);
      assert.equal(queue.addCalls[0]?.data.runId, result.runId);
      assert.equal(queue.addCalls[0]?.data.maxBriefs, 5);
      assert.equal(queue.addCalls[0]?.data.triggeredByUserId, fixture.userId);
      assert.equal(queue.addCalls[0]?.data.triggerSource, "user_action");
      assert.equal(typeof queue.addCalls[0]?.data.jobRunId, "string");

      const [agentRun] = await db.select().from(agentRuns).where(eq(agentRuns.id, result.runId));
      assert.equal(agentRun?.projectId, fixture.projectId);
      assert.equal(agentRun?.task, "opportunity_scout");
      assert.equal(agentRun?.status, "queued");

      const [jobRun] = await db.select().from(jobRuns).where(eq(jobRuns.externalJobId, result.runId));
      assert.equal(jobRun?.queueName, "opportunity-scout");
      assert.equal(jobRun?.type, "opportunity_scout");
      assert.equal(jobRun?.status, "queued");
      assert.equal(jobRun?.inputRef, result.runId);
      assert.equal(jobRun?.actorType, "user");
      assert.equal(jobRun?.actorUserId, fixture.userId);
    });

    void it("returns an explicit dry-run response without agent_runs when the queue is unavailable", async () => {
      const fixture = await createProjectFixture(db);
      const queueService = new QueueProducerService(testDatabaseService(db));
      const service = new ProjectsService(queueService, testDatabaseService(db));

      const result = await service.queueOpportunityScout(fixture.projectId, { maxBriefs: 4 }, fixture.userId);

      assert.equal(result.status, "dry_run");
      assert.equal(result.type, "opportunity_scout");
      assert.equal(result.runId, undefined);
      assert.match(result.message ?? "", /queue is not configured/u);

      const agentRunRows = await db.select().from(agentRuns);
      assert.equal(agentRunRows.length, 0);

      const jobRunRows = await db.select().from(jobRuns).where(eq(jobRuns.externalJobId, result.jobId));
      assert.equal(jobRunRows.length, 1);
      assert.equal(jobRunRows[0]?.status, "dry_run");
      assert.equal(jobRunRows[0]?.queueName, "opportunity-scout");
    });

    void it("marks the queued agent run failed when queue.add throws", async () => {
      const fixture = await createProjectFixture(db);
      const queueService = new QueueProducerService(testDatabaseService(db));
      const queue = new FakeQueue(new Error("redis write failed"));
      setOpportunityScoutQueue(queueService, queue);
      const service = new ProjectsService(queueService, testDatabaseService(db));

      await assert.rejects(
        () => service.queueOpportunityScout(fixture.projectId, { maxBriefs: 3 }, fixture.userId),
        /redis write failed/u
      );

      const rows = await db.select().from(agentRuns).where(eq(agentRuns.projectId, fixture.projectId));
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.status, "failed");
      assert.equal(rows[0]?.failureCode, "queue_enqueue_failed");
      assert.deepEqual(rows[0]?.diagnosticsJson, { message: "redis write failed" });

      const jobRows = await db.select().from(jobRuns).where(eq(jobRuns.queueName, "opportunity-scout"));
      assert.equal(jobRows.length, 1);
      assert.equal(jobRows[0]?.status, "failed");
    });
  }
);

async function createProjectFixture(db: DatabaseClient): Promise<{ projectId: string; userId: string }> {
  const userId = "22222222-2222-4222-8222-222222222222";
  await db.insert(users).values({
    id: userId,
    email: "opportunity-scout@example.com",
    name: "Opportunity Scout Operator"
  });

  const [customer] = await db.insert(customers).values({ name: "Opportunity Scout Customer" }).returning();
  assert.ok(customer);
  const [project] = await db
    .insert(projects)
    .values({
      customerId: customer.id,
      name: "Opportunity Scout Project"
    })
    .returning();
  assert.ok(project);

  return {
    projectId: project.id,
    userId
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

function setOpportunityScoutQueue(service: QueueProducerService, queue: FakeQueue): void {
  (service as unknown as { queues: { "opportunity-scout"?: unknown } }).queues["opportunity-scout"] = queue;
}

class FakeQueue {
  readonly addCalls: QueueAddCall[] = [];
  private existingJob: FakeJob | undefined;

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
    this.existingJob = new FakeJob();
    return Promise.resolve({ id: typeof options.jobId === "string" ? options.jobId : undefined });
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
