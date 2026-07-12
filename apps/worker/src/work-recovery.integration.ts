import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { buildCanonicalPageProposalOutputExample } from "@localseo/ai";
import {
  agentRuns,
  customers,
  deployments,
  jobRuns,
  mediaAssets,
  opportunities,
  pageProposals,
  pageSectionCopySuggestions,
  pageVersions,
  projects,
  releasePlans,
  releaseVerificationChecks,
  releaseVerifications,
  users,
  type DatabaseClient
} from "@localseo/db";
import type { JobsOptions } from "bullmq";
import { eq } from "drizzle-orm";
import {
  createIntegrationTestDatabase,
  truncateIntegrationTables
} from "../../../packages/db/test-support/integration-database.js";
import {
  scanStaleWork,
  type WorkRecoveryQueue,
  type WorkRecoveryQueues,
  type WorkRecoveryTransportJob
} from "./work-recovery.js";

type IntegrationDatabase = Awaited<ReturnType<typeof createIntegrationTestDatabase>>;

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = Boolean(testDatabaseUrl);
const now = new Date("2026-07-10T12:00:00.000Z");
const staleUpdatedAt = new Date("2026-07-10T11:00:00.000Z");

void describe(
  "bounded stale-work recovery integration",
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

    void it("re-enqueues a stale Page Proposal with the same run id and durable recovery audit", async () => {
      const fixture = await createPageProposalRecoveryFixture(db);
      const queues = fakeQueues();

      const result = await scan(db, queues);

      assert.equal(result.reEnqueued, 1);
      assert.equal(queues["page-generation"].addCalls.length, 1);
      assert.equal(queues["page-generation"].addCalls[0]?.options.jobId, fixture.runId);
      assert.equal(queues["page-generation"].addCalls[0]?.data.runId, fixture.runId);
      assert.equal(queues["page-generation"].addCalls[0]?.data.opportunityId, fixture.opportunityId);
      assert.equal(queues["page-generation"].addCalls[0]?.data.triggerSource, "work_recovery");

      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.equal(run?.status, "queued");
      assert.equal(run?.recoveryCount, 1);
      assert.equal(run?.lastRecoveryAt?.toISOString(), now.toISOString());

      const [audit] = await db.select().from(jobRuns).where(eq(jobRuns.externalJobId, fixture.runId));
      assert.equal(audit?.status, "queued");
      assert.equal(audit?.queueName, "page-generation");
      assert.equal(audit?.triggerSource, "work_recovery");
      assert.equal(queues["page-generation"].addCalls[0]?.data.jobRunId, audit?.id);
    });

    void it("re-enqueues stale release verification without repeating a provider-mutation lane", async () => {
      const fixture = await createReleaseVerificationRecoveryFixture(db);
      const queues = fakeQueues();

      const result = await scan(db, queues);

      assert.equal(result.reEnqueued, 1);
      assert.equal(queues["release-verification"].addCalls.length, 1);
      assert.equal(queues["release-verification"].addCalls[0]?.options.jobId, fixture.verificationId);
      assert.equal(queues["release-verification"].addCalls[0]?.data.releasePlanId, fixture.releasePlanId);
      assert.equal(queues["release-verification"].addCalls[0]?.data.deploymentId, fixture.deploymentId);

      const [verification] = await db
        .select()
        .from(releaseVerifications)
        .where(eq(releaseVerifications.id, fixture.verificationId));
      assert.equal(verification?.status, "running");
      assert.equal(verification?.recoveryCount, 1);
      assert.equal(verification?.lastRecoveryAt?.toISOString(), now.toISOString());
    });

    void it("re-enqueues stale section copy generation with its pinned suggestion payload", async () => {
      const fixture = await createSectionCopyRecoveryFixture(db);
      const queues = fakeQueues();

      const result = await scan(db, queues);

      assert.equal(result.reEnqueued, 1);
      assert.equal(queues["page-generation"].addCalls[0]?.name, "section_text_generation");
      assert.equal(queues["page-generation"].addCalls[0]?.options.jobId, fixture.runId);
      assert.equal(queues["page-generation"].addCalls[0]?.data.suggestionId, fixture.suggestionId);
      assert.equal(queues["page-generation"].addCalls[0]?.data.pageVersionId, fixture.pageVersionId);
      assert.equal(queues["page-generation"].addCalls[0]?.data.sectionId, "hero-1");

      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.equal(run?.recoveryCount, 1);
      const [suggestion] = await db
        .select()
        .from(pageSectionCopySuggestions)
        .where(eq(pageSectionCopySuggestions.id, fixture.suggestionId));
      assert.equal(suggestion?.status, "queued");
    });

    void it("fails both run and suggestion after bounded section copy recovery is exhausted", async () => {
      const fixture = await createSectionCopyRecoveryFixture(db, { recoveryCount: 3 });
      const queues = fakeQueues();

      const result = await scan(db, queues);

      assert.equal(result.markedExecutionFailed, 1);
      assert.equal(queues["page-generation"].addCalls.length, 0);
      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.equal(run?.status, "failed");
      assert.equal(run?.failureCode, "work_recovery_exhausted");
      const [suggestion] = await db
        .select()
        .from(pageSectionCopySuggestions)
        .where(eq(pageSectionCopySuggestions.id, fixture.suggestionId));
      assert.equal(suggestion?.status, "failed");
      assert.equal(suggestion?.failureCode, "work_recovery_exhausted");
    });

    void it("re-enqueues stale media processing with the same asset id", async () => {
      const fixture = await createMediaRecoveryFixture(db);
      const queues = fakeQueues();

      const result = await scan(db, queues);

      assert.equal(result.reEnqueued, 1);
      assert.equal(queues["media-processing"].addCalls.length, 1);
      assert.equal(queues["media-processing"].addCalls[0]?.name, "media_processing");
      assert.equal(queues["media-processing"].addCalls[0]?.options.jobId, fixture.assetId);
      assert.equal(queues["media-processing"].addCalls[0]?.data.assetId, fixture.assetId);
      assert.equal(queues["media-processing"].addCalls[0]?.data.triggerSource, "work_recovery");

      const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, fixture.assetId));
      assert.equal(asset?.status, "processing");
      assert.equal(asset?.recoveryCount, 1);
    });

    void it("marks stale media processing failed after bounded recovery is exhausted", async () => {
      const fixture = await createMediaRecoveryFixture(db, { recoveryCount: 3 });
      const queues = fakeQueues();

      const result = await scan(db, queues);

      assert.equal(result.markedExecutionFailed, 1);
      assert.equal(queues["media-processing"].addCalls.length, 0);
      const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, fixture.assetId));
      assert.equal(asset?.status, "failed");
      assert.equal(asset?.failureCode, "work_recovery_exhausted");
    });

    void it("expires abandoned pending media upload intents after the bounded retention window", async () => {
      const fixture = await createPendingMediaUploadFixture(db);

      const result = await scan(db, fakeQueues());

      assert.equal(result.expiredMediaUploads, 1);
      const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, fixture.assetId));
      assert.equal(asset?.status, "failed");
      assert.equal(asset?.failureCode, "upload_expired");
    });

    void it("records warning evidence and execution_failed after release verification recovery is exhausted", async () => {
      const fixture = await createReleaseVerificationRecoveryFixture(db, { recoveryCount: 3 });
      const queues = fakeQueues();

      const result = await scan(db, queues);

      assert.equal(result.warningEvidenceRecorded, 1);
      assert.equal(queues["release-verification"].addCalls.length, 0);

      const [verification] = await db
        .select()
        .from(releaseVerifications)
        .where(eq(releaseVerifications.id, fixture.verificationId));
      assert.equal(verification?.status, "execution_failed");
      assert.equal(verification?.evidenceJson?.source, "work_recovery");

      const [check] = await db
        .select()
        .from(releaseVerificationChecks)
        .where(eq(releaseVerificationChecks.verificationId, fixture.verificationId));
      assert.equal(check?.checkKey, "verification_recovery_check");
      assert.equal(check?.severity, "warning");
      assert.equal(check?.result, "skipped");

      const [deployment] = await db.select().from(deployments).where(eq(deployments.id, fixture.deploymentId));
      assert.equal(deployment?.verificationStatus, "execution_failed");
    });

    void it("fails a Page Proposal after bounded recovery is exhausted", async () => {
      const fixture = await createPageProposalRecoveryFixture(db, { recoveryCount: 3 });
      const queues = fakeQueues();

      const result = await scan(db, queues);

      assert.equal(result.markedExecutionFailed, 1);
      assert.equal(queues["page-generation"].addCalls.length, 0);

      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.equal(run?.status, "failed");
      assert.equal(run?.failureCode, "work_recovery_exhausted");
      assert.equal(run?.recoveryCount, 3);
    });

    void it("fails Page Proposal product truth when transport completed without terminal persistence", async () => {
      const fixture = await createPageProposalRecoveryFixture(db);
      const queues = fakeQueues();
      queues["page-generation"].jobs.set(fixture.runId, new FakeTransportJob("completed"));

      const result = await scan(db, queues);

      assert.equal(result.markedExecutionFailed, 1);
      assert.equal(queues["page-generation"].addCalls.length, 0);

      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.equal(run?.status, "failed");
      assert.equal(run?.failureCode, "work_transport_inconsistent");
    });

    void it("uses completed job-run audit when BullMQ retention removed the transport job", async () => {
      const fixture = await createReleaseVerificationRecoveryFixture(db);
      await db.insert(jobRuns).values({
        projectId: fixture.projectId,
        externalJobId: fixture.verificationId,
        queueName: "release-verification",
        type: "release_verification",
        status: "completed",
        inputRef: fixture.verificationId,
        actorType: "system",
        completedAt: staleUpdatedAt,
        updatedAt: staleUpdatedAt
      });
      const queues = fakeQueues();

      const result = await scan(db, queues);

      assert.equal(result.markedExecutionFailed, 1);
      assert.equal(queues["release-verification"].addCalls.length, 0);

      const [verification] = await db
        .select()
        .from(releaseVerifications)
        .where(eq(releaseVerifications.id, fixture.verificationId));
      assert.equal(verification?.status, "execution_failed");
      assert.equal(
        verification?.summary,
        "Queue transport completed without terminal release-verification product truth."
      );

      const [check] = await db
        .select()
        .from(releaseVerificationChecks)
        .where(eq(releaseVerificationChecks.verificationId, fixture.verificationId));
      assert.equal(check?.message, "Queue transport completed without terminal release-verification product truth.");
    });

    void it("coalesces when transport becomes active after the recovery claim", async () => {
      const fixture = await createPageProposalRecoveryFixture(db);
      const pageQueue = new LateActiveFakeQueue();
      const queues = fakeQueues({ pageQueue });

      const result = await scan(db, queues);

      assert.equal(result.coalesced, 1);
      assert.equal(pageQueue.addCalls.length, 0);

      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.equal(run?.status, "queued");
      assert.equal(run?.recoveryCount, 1);

      const [audit] = await db.select().from(jobRuns).where(eq(jobRuns.externalJobId, fixture.runId));
      assert.equal(audit?.status, "cancelled");
    });

    void it("keeps the durable row active but records a failed audit when recovery enqueue fails", async () => {
      const fixture = await createPageProposalRecoveryFixture(db);
      const queues = fakeQueues();
      queues["page-generation"].addError = new Error("redis recovery write failed");

      const result = await scan(db, queues);

      assert.equal(result.enqueueFailed, 1);
      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.equal(run?.status, "queued");
      assert.equal(run?.recoveryCount, 1);

      const [audit] = await db.select().from(jobRuns).where(eq(jobRuns.externalJobId, fixture.runId));
      assert.equal(audit?.status, "failed");
      assert.deepEqual(audit?.failureJson, { message: "redis recovery write failed" });
    });

    void it("allows only one of two recovery scanners to claim the same stale run", async () => {
      const fixture = await createPageProposalRecoveryFixture(db);
      const pageQueue = new BarrierFakeQueue(2);
      const queues = fakeQueues({ pageQueue });

      const [first, second] = await Promise.all([scan(db, queues), scan(db, queues)]);

      assert.equal(first.reEnqueued + second.reEnqueued, 1);
      assert.equal(first.staleNoop + second.staleNoop, 1);
      assert.equal(pageQueue.addCalls.length, 1);

      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.equal(run?.recoveryCount, 1);
    });
  }
);

async function scan(db: DatabaseClient, queues: FakeWorkRecoveryQueues) {
  return scanStaleWork({
    db,
    queues,
    now,
    staleAfterMs: 5 * 60_000,
    maxRecoveryCount: 3,
    batchSize: 25
  });
}

async function createProject(db: DatabaseClient): Promise<string> {
  const [customer] = await db.insert(customers).values({ name: "Recovery Customer" }).returning();
  assert.ok(customer);
  const [project] = await db.insert(projects).values({ customerId: customer.id, name: "Recovery Project" }).returning();
  assert.ok(project);
  return project.id;
}

async function createPageProposalRecoveryFixture(
  db: DatabaseClient,
  input: { recoveryCount?: number } = {}
): Promise<{
  projectId: string;
  opportunityId: string;
  runId: string;
}> {
  const projectId = await createProject(db);
  const [opportunity] = await db
    .insert(opportunities)
    .values({
      projectId,
      classification: "near_term_target",
      primaryKeyword: "dachreinigung muenchen",
      score: 75,
      status: "new"
    })
    .returning();
  assert.ok(opportunity);
  const [run] = await db
    .insert(agentRuns)
    .values({
      projectId,
      subjectId: opportunity.id,
      task: "page_brief_draft",
      status: "queued",
      recoveryCount: input.recoveryCount ?? 0,
      updatedAt: staleUpdatedAt
    })
    .returning();
  assert.ok(run);
  return { projectId, opportunityId: opportunity.id, runId: run.id };
}

async function createReleaseVerificationRecoveryFixture(
  db: DatabaseClient,
  input: { recoveryCount?: number } = {}
): Promise<{ projectId: string; releasePlanId: string; deploymentId: string; verificationId: string }> {
  const projectId = await createProject(db);
  const [releasePlan] = await db
    .insert(releasePlans)
    .values({ projectId, status: "deploying", summary: "Recovery release" })
    .returning();
  assert.ok(releasePlan);
  const [deployment] = await db
    .insert(deployments)
    .values({
      projectId,
      releasePlanId: releasePlan.id,
      deploymentKey: `release_plan:${releasePlan.id}`,
      providerDeployId: `deploy-${releasePlan.id}`,
      providerOperationStatus: "recorded",
      status: "provider_succeeded"
    })
    .returning();
  assert.ok(deployment);
  const [verification] = await db
    .insert(releaseVerifications)
    .values({
      releasePlanId: releasePlan.id,
      deploymentId: deployment.id,
      status: "running",
      summary: "Post-deploy verification is queued.",
      recoveryCount: input.recoveryCount ?? 0,
      updatedAt: staleUpdatedAt
    })
    .returning();
  assert.ok(verification);
  return {
    projectId,
    releasePlanId: releasePlan.id,
    deploymentId: deployment.id,
    verificationId: verification.id
  };
}

async function createSectionCopyRecoveryFixture(
  db: DatabaseClient,
  input: { recoveryCount?: number } = {}
): Promise<{ projectId: string; pageVersionId: string; suggestionId: string; runId: string }> {
  const projectId = await createProject(db);
  const [user] = await db
    .insert(users)
    .values({ email: `${randomUUID()}@example.com`, name: "Recovery Copy Operator" })
    .returning();
  assert.ok(user);
  const page = buildCanonicalPageProposalOutputExample({
    projectId,
    opportunityId: randomUUID(),
    agentRunId: randomUUID()
  }).page;
  const [proposal] = await db
    .insert(pageProposals)
    .values({
      projectId,
      route: page.route,
      primaryKeyword: page.target.primaryKeyword,
      uniquenessRationale: page.uniquenessRationale ?? "Recovery page.",
      status: "draft",
      sitemapReady: page.seo.sitemapReady
    })
    .returning();
  assert.ok(proposal);
  const [version] = await db
    .insert(pageVersions)
    .values({ pageProposalId: proposal.id, versionNumber: 1, status: "preview", pageJson: page })
    .returning();
  assert.ok(version);
  const suggestionId = randomUUID();
  const [run] = await db
    .insert(agentRuns)
    .values({
      projectId,
      subjectId: suggestionId,
      task: "section_text_generation",
      status: "queued",
      recoveryCount: input.recoveryCount ?? 0,
      updatedAt: staleUpdatedAt
    })
    .returning();
  assert.ok(run);
  await db.insert(pageSectionCopySuggestions).values({
    id: suggestionId,
    projectId,
    pageVersionId: version.id,
    sectionId: "hero-1",
    agentRunId: run.id,
    requestedByUserId: user.id,
    status: "queued"
  });

  return { projectId, pageVersionId: version.id, suggestionId, runId: run.id };
}

async function createMediaRecoveryFixture(
  db: DatabaseClient,
  input: { recoveryCount?: number } = {}
): Promise<{ projectId: string; assetId: string }> {
  const projectId = await createProject(db);
  const [user] = await db
    .insert(users)
    .values({ email: `${randomUUID()}@example.com`, name: "Recovery Media Operator" })
    .returning();
  assert.ok(user);
  const [asset] = await db
    .insert(mediaAssets)
    .values({
      projectId,
      status: "pending_upload",
      displayName: "recovery.png",
      claimedContentType: "image/png",
      expectedBytes: 4,
      expectedSha256: "a".repeat(64),
      sourceStorageKey: `media/quarantine/${projectId}/${randomUUID()}/source`,
      createdByUserId: user.id,
      recoveryCount: input.recoveryCount ?? 0
    })
    .returning();
  assert.ok(asset);
  await db
    .update(mediaAssets)
    .set({ status: "processing", updatedAt: staleUpdatedAt })
    .where(eq(mediaAssets.id, asset.id));
  return { projectId, assetId: asset.id };
}

async function createPendingMediaUploadFixture(db: DatabaseClient): Promise<{ assetId: string }> {
  const projectId = await createProject(db);
  const [user] = await db
    .insert(users)
    .values({ email: `${randomUUID()}@example.com`, name: "Expired Media Operator" })
    .returning();
  assert.ok(user);
  const [asset] = await db
    .insert(mediaAssets)
    .values({
      projectId,
      status: "pending_upload",
      displayName: "abandoned.png",
      claimedContentType: "image/png",
      expectedBytes: 4,
      expectedSha256: "b".repeat(64),
      sourceStorageKey: `media/quarantine/${projectId}/${randomUUID()}/source`,
      createdByUserId: user.id,
      createdAt: new Date("2026-07-08T10:00:00.000Z"),
      updatedAt: new Date("2026-07-08T10:00:00.000Z")
    })
    .returning();
  assert.ok(asset);
  return { assetId: asset.id };
}

type FakeWorkRecoveryQueues = WorkRecoveryQueues & {
  "page-generation": FakeQueue;
  "media-processing": FakeQueue;
  "release-verification": FakeQueue;
};

function fakeQueues(
  input: { pageQueue?: FakeQueue; releaseVerificationQueue?: FakeQueue } = {}
): FakeWorkRecoveryQueues {
  return {
    "page-generation": input.pageQueue ?? new FakeQueue(),
    "media-processing": new FakeQueue(),
    "release-verification": input.releaseVerificationQueue ?? new FakeQueue()
  };
}

class FakeTransportJob implements WorkRecoveryTransportJob {
  constructor(
    private readonly state: string,
    private readonly removeEffect: () => void = () => undefined
  ) {}

  getState(): Promise<string> {
    return Promise.resolve(this.state);
  }

  remove(): Promise<void> {
    this.removeEffect();
    return Promise.resolve();
  }
}

class FakeQueue implements WorkRecoveryQueue {
  readonly jobs = new Map<string, WorkRecoveryTransportJob>();
  readonly addCalls: Array<{ name: string; data: Record<string, unknown>; options: JobsOptions }> = [];
  addError: Error | undefined;

  getJob(jobId: string): Promise<WorkRecoveryTransportJob | undefined> {
    return Promise.resolve(this.jobs.get(jobId));
  }

  add(name: string, data: Record<string, unknown>, options: JobsOptions): Promise<void> {
    if (this.addError) {
      return Promise.reject(this.addError);
    }

    this.addCalls.push({ name, data, options });
    const jobId = String(options.jobId);
    this.jobs.set(jobId, new FakeTransportJob("waiting", () => this.jobs.delete(jobId)));
    return Promise.resolve();
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

class BarrierFakeQueue extends FakeQueue {
  private calls = 0;
  private readonly barrier: Promise<void>;
  private releaseBarrier!: () => void;

  constructor(private readonly targetCalls: number) {
    super();
    this.barrier = new Promise((resolve) => {
      this.releaseBarrier = resolve;
    });
  }

  override async getJob(jobId: string): Promise<WorkRecoveryTransportJob | undefined> {
    this.calls += 1;
    if (this.calls <= this.targetCalls) {
      if (this.calls === this.targetCalls) {
        this.releaseBarrier();
      }
      await this.barrier;
    }

    return super.getJob(jobId);
  }
}

class LateActiveFakeQueue extends FakeQueue {
  private observationCount = 0;

  override getJob(): Promise<WorkRecoveryTransportJob | undefined> {
    this.observationCount += 1;
    return Promise.resolve(this.observationCount === 1 ? undefined : new FakeTransportJob("active"));
  }
}
