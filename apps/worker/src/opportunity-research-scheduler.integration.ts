import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  agentRunEvents,
  agentRuns,
  areas,
  customers,
  jobRuns,
  projectBusinessProfileRevisions,
  projectBusinessProfiles,
  projectOpportunityResearchStates,
  projects,
  rankingProofs,
  services,
  users,
  type DatabaseClient
} from "@localseo/db";
import { canonicalizeProjectBusinessProfileContent } from "@localseo/domain";
import type { JobsOptions } from "bullmq";
import { eq } from "@localseo/db/query";
import {
  createIntegrationTestDatabase,
  truncateIntegrationTables
} from "../../../packages/db/test-support/integration-database.js";
import { scanDueOpportunityResearch } from "./opportunity-research-scheduler.js";
import type { WorkRecoveryQueue, WorkRecoveryTransportJob } from "./work-recovery.js";

type IntegrationDatabase = Awaited<ReturnType<typeof createIntegrationTestDatabase>>;

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = Boolean(testDatabaseUrl);
const now = new Date("2026-08-09T12:00:00.000Z");

void describe(
  "Opportunity Research scheduler integration",
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

    void it("admits ready dirty material before enqueue and reuses the run id as job id", async () => {
      const fixture = await createReadyProject(db);
      const queue = new SchedulerQueue();

      const result = await scanDueOpportunityResearch({ db, queue, now, batchSize: 10 });

      assert.deepEqual(
        { admitted: result.admitted, enqueued: result.enqueued, errors: result.errors },
        { admitted: 1, enqueued: 1, errors: 0 }
      );
      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.projectId, fixture.projectId));
      assert.ok(run);
      assert.equal(run.workflowName, "opportunity_research");
      assert.equal(run.triggerSource, "material_dirty");
      assert.equal(queue.addCalls[0]?.options.jobId, run.id);
      assert.equal(queue.addCalls[0]?.data.jobRunId !== undefined, true);
      const [state] = await db
        .select()
        .from(projectOpportunityResearchStates)
        .where(eq(projectOpportunityResearchStates.projectId, fixture.projectId));
      assert.equal(state?.status, "queued");
      assert.equal(state?.activeRunId, run.id);
      const [audit] = await db.select().from(jobRuns).where(eq(jobRuns.externalJobId, run.id));
      assert.equal(audit?.status, "queued");
      const events = await db.select().from(agentRunEvents).where(eq(agentRunEvents.agentRunId, run.id));
      assert.deepEqual(
        events.map((event) => event.eventType),
        ["run.queued"]
      );
    });

    void it("serializes competing scanners so only one run and one queue write win", async () => {
      const fixture = await createReadyProject(db);
      const queue = new SchedulerQueue();

      const [first, second] = await Promise.all([
        scanDueOpportunityResearch({ db, queue, now, batchSize: 10 }),
        scanDueOpportunityResearch({ db, queue, now, batchSize: 10 })
      ]);

      assert.equal(first.admitted + second.admitted, 1);
      assert.equal(queue.addCalls.length, 1);
      const runs = await db.select().from(agentRuns).where(eq(agentRuns.projectId, fixture.projectId));
      assert.equal(runs.length, 1);
    });

    void it("keeps incomplete material visible and does not create transport truth", async () => {
      const projectId = await createBareProject(db);
      await db.insert(projectOpportunityResearchStates).values({
        projectId,
        status: "needs_research",
        materialDirty: true,
        nextScheduledAt: now
      });
      const queue = new SchedulerQueue();

      const result = await scanDueOpportunityResearch({ db, queue, now, batchSize: 10 });

      assert.equal(result.notReady, 1);
      assert.equal(queue.addCalls.length, 0);
      assert.equal((await db.select().from(agentRuns)).length, 0);
      assert.equal((await db.select().from(jobRuns)).length, 0);
      const [state] = await db
        .select()
        .from(projectOpportunityResearchStates)
        .where(eq(projectOpportunityResearchStates.projectId, projectId));
      assert.equal(state?.status, "needs_research");
      assert.equal(state?.nextScheduledAt?.toISOString(), new Date(now.getTime() + 24 * 60 * 60 * 1_000).toISOString());

      const immediateRescan = await scanDueOpportunityResearch({
        db,
        queue,
        now: new Date(now.getTime() + 60_000),
        batchSize: 10
      });
      assert.deepEqual(immediateRescan, {
        checked: 0,
        admitted: 0,
        enqueued: 0,
        notReady: 0,
        staleNoop: 0,
        enqueueFailed: 0,
        errors: 0
      });
    });

    void it("defers a due project while a legacy scout run is still active", async () => {
      const fixture = await createReadyProject(db);
      await db
        .update(projectOpportunityResearchStates)
        .set({ status: "needs_research", activeRunId: null, nextScheduledAt: now, updatedAt: now })
        .where(eq(projectOpportunityResearchStates.projectId, fixture.projectId));
      await db.insert(agentRuns).values({
        projectId: fixture.projectId,
        subjectId: fixture.projectId,
        task: "opportunity_scout",
        status: "queued"
      });
      const queue = new SchedulerQueue();

      const result = await scanDueOpportunityResearch({ db, queue, now, batchSize: 10 });

      assert.equal(result.staleNoop, 1);
      assert.equal(result.admitted, 0);
      assert.equal(queue.addCalls.length, 0);
      const [state] = await db
        .select()
        .from(projectOpportunityResearchStates)
        .where(eq(projectOpportunityResearchStates.projectId, fixture.projectId));
      assert.equal(state?.nextScheduledAt?.toISOString(), new Date(now.getTime() + 15 * 60 * 1_000).toISOString());

      const immediateRescan = await scanDueOpportunityResearch({
        db,
        queue,
        now: new Date(now.getTime() + 60_000),
        batchSize: 10
      });
      assert.equal(immediateRescan.checked, 0);
    });
  }
);

async function createReadyProject(db: DatabaseClient): Promise<{ projectId: string }> {
  const [user] = await db
    .insert(users)
    .values({ email: `${randomUUID()}@example.test`, name: "Research Scheduler Operator" })
    .returning();
  assert.ok(user);
  const projectId = await createBareProject(db, user.id);
  const profile = {
    businessName: "Beispiel Gebaeudeservice",
    websiteUrl: "https://example.test/",
    description: "Regionaler Gebaeudeservice.",
    differentiators: ["Lokales Team"],
    targetCustomers: ["Hausverwaltungen"],
    operatingNotes: ["Keine Notdienste"]
  };
  const [profileRow] = await db.insert(projectBusinessProfiles).values({ projectId }).returning();
  assert.ok(profileRow);
  const [revision] = await db
    .insert(projectBusinessProfileRevisions)
    .values({
      projectId,
      revision: 1,
      profileJson: profile,
      profileSha256: sha256(canonicalizeProjectBusinessProfileContent(profile)),
      createdByUserId: user.id
    })
    .returning();
  assert.ok(revision);
  await db
    .update(projectBusinessProfiles)
    .set({
      currentRevisionId: revision.id,
      status: "confirmed",
      confirmedAt: now,
      confirmedByUserId: user.id,
      updatedAt: now
    })
    .where(eq(projectBusinessProfiles.projectId, projectId));
  const [service] = await db.insert(services).values({ projectId, name: "Gebaeudereinigung" }).returning();
  const [area] = await db.insert(areas).values({ projectId, name: "Dachau" }).returning();
  assert.ok(service && area);
  await db
    .update(services)
    .set({ status: "confirmed", confirmedAt: now, confirmedByUserId: user.id, updatedAt: now })
    .where(eq(services.id, service.id));
  await db
    .update(areas)
    .set({ status: "confirmed", confirmedAt: now, confirmedByUserId: user.id, updatedAt: now })
    .where(eq(areas.id, area.id));
  const [proof] = await db
    .insert(rankingProofs)
    .values({
      projectId,
      query: "gebaeudereinigung dachau",
      pageUrl: "https://example.test/gebaeudereinigung-dachau/",
      rank: 8,
      capturedAt: new Date(now.getTime() - 24 * 60 * 60 * 1_000),
      createdByUserId: user.id
    })
    .returning();
  assert.ok(proof);
  await db
    .update(rankingProofs)
    .set({ status: "reviewed", reviewedAt: now, reviewedByUserId: user.id, updatedAt: now })
    .where(eq(rankingProofs.id, proof.id));
  await db
    .update(projectOpportunityResearchStates)
    .set({ status: "needs_research", materialDirty: true, nextScheduledAt: now, updatedAt: now })
    .where(eq(projectOpportunityResearchStates.projectId, projectId));
  return { projectId };
}

async function createBareProject(db: DatabaseClient, ownerUserId?: string): Promise<string> {
  const [customer] = await db
    .insert(customers)
    .values({ name: `Research ${randomUUID()}`, ownerUserId })
    .returning();
  assert.ok(customer);
  const [project] = await db
    .insert(projects)
    .values({ customerId: customer.id, name: `Research ${randomUUID()}` })
    .returning();
  assert.ok(project);
  return project.id;
}

class SchedulerQueue implements WorkRecoveryQueue {
  readonly addCalls: Array<{ name: string; data: Record<string, unknown>; options: JobsOptions }> = [];

  getJob(): Promise<WorkRecoveryTransportJob | undefined> {
    return Promise.resolve(undefined);
  }

  add(name: string, data: Record<string, unknown>, options: JobsOptions): Promise<void> {
    this.addCalls.push({ name, data, options });
    return Promise.resolve();
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
