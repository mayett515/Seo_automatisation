import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  type DeploymentStatus,
  type PageJson,
  type PageVersionStatus,
  type ReleasePlanStatus,
  type ReleaseVerificationStatus
} from "@localseo/contracts";
import {
  approvals,
  customers,
  deployments,
  jobRuns,
  mediaAssets,
  mediaAssetVariants,
  pageProposals,
  pageVersionMediaAssets,
  pageVersions,
  projects,
  projectTrackingKeys,
  releaseChecks,
  releasePlanItems,
  releasePlans,
  releaseVerificationChecks,
  releaseVerifications,
  rollbackPoints,
  users,
  type DatabaseClient
} from "@localseo/db";
import { and, eq } from "drizzle-orm";
import { QueueProducerService } from "../queue-producer.js";
import { DatabaseService } from "../database/database.service.js";
import { ReleasesService } from "./releases.module.js";
import {
  createIntegrationDatabaseClient,
  createIntegrationTestDatabase,
  truncateIntegrationTables
} from "../../../../packages/db/test-support/integration-database.js";

type IntegrationDatabase = Awaited<ReturnType<typeof createIntegrationTestDatabase>>;
type DatabaseHandle = ReturnType<typeof createIntegrationDatabaseClient>;
type SqlClient = DatabaseHandle["sql"];

type ReleaseFixture = {
  projectId: string;
  releasePlanId: string;
  deploymentId: string;
};

type PreflightRollbackFixture = {
  projectId: string;
  releasePlanId: string;
  pageVersionId: string;
  previousDeploymentId: string;
};

type PageVersionFixture = {
  projectId: string;
  pageVersionId: string;
  userId: string;
};

type QueueAddCall = {
  name: string;
  data: Record<string, unknown>;
  options: Record<string, unknown>;
};

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = Boolean(testDatabaseUrl);

void describe(
  "ReleasesService.verify integration",
  { skip: runIntegration ? false : "TEST_DATABASE_URL is not configured" },
  () => {
    let handle: IntegrationDatabase;
    let db: DatabaseClient;
    let queueService: QueueProducerService;
    let service: ReleasesService;

    before(async () => {
      assert.ok(testDatabaseUrl);
      handle = await createIntegrationTestDatabase(testDatabaseUrl);
      db = handle.db;
    });

    beforeEach(async () => {
      await truncateIntegrationTables(handle.sql);
      queueService = new QueueProducerService(testDatabaseService(db));
      service = new ReleasesService(queueService, testDatabaseService(db));
    });

    after(async () => {
      await handle?.close();
    });

    void it("creates a running verification row and enqueues the worker job", async () => {
      const fixture = await createReleaseFixture(db, { releasePlanStatus: "deploying" });
      const queue = new FakeQueue();
      setReleaseVerificationQueue(queueService, queue);

      const result = await service.verify(fixture.projectId, fixture.releasePlanId, undefined, {});

      assert.equal(result.status, "queued");
      assert.equal(result.type, "release_verification");
      assert.equal(result.deploymentId, fixture.deploymentId);
      assert.equal(result.jobId, result.verificationId);
      assert.equal(queue.addCalls.length, 1);
      assert.equal(queue.addCalls[0]?.name, "release_verification");
      assert.equal(queue.addCalls[0]?.data.projectId, fixture.projectId);
      assert.equal(queue.addCalls[0]?.data.releasePlanId, fixture.releasePlanId);
      assert.equal(queue.addCalls[0]?.data.deploymentId, fixture.deploymentId);
      assert.equal(queue.addCalls[0]?.data.verificationId, result.verificationId);

      const [verification] = await db
        .select()
        .from(releaseVerifications)
        .where(eq(releaseVerifications.id, result.verificationId ?? ""));
      assert.equal(verification?.status, "running");
      assert.equal(verification?.deploymentId, fixture.deploymentId);

      const jobRows = await db.select().from(jobRuns).where(eq(jobRuns.queueName, "release-verification"));
      assert.equal(jobRows.length, 1);
      assert.equal(jobRows[0]?.status, "queued");
      assert.equal(jobRows[0]?.type, "release_verification");
      assert.equal(jobRows[0]?.inputRef, result.verificationId);
    });

    void it("returns already_active when a verification is already running for the deployment", async () => {
      const fixture = await createReleaseFixture(db, { releasePlanStatus: "deploying" });
      const queue = new FakeQueue();
      setReleaseVerificationQueue(queueService, queue);
      const [active] = await db
        .insert(releaseVerifications)
        .values({
          releasePlanId: fixture.releasePlanId,
          deploymentId: fixture.deploymentId,
          status: "running",
          summary: "Post-deploy verification is already running."
        })
        .returning();
      assert.ok(active);

      const result = await service.verify(fixture.projectId, fixture.releasePlanId, undefined, {});

      assert.equal(result.status, "already_active");
      assert.equal(result.verificationId, active.id);
      assert.equal(queue.addCalls.length, 0);
    });

    void it("marks the verification terminal when queue enqueue fails after row creation", async () => {
      const fixture = await createReleaseFixture(db, { releasePlanStatus: "deploying" });
      const queue = new FakeQueue(new Error("redis write failed"));
      setReleaseVerificationQueue(queueService, queue);

      await assert.rejects(
        () => service.verify(fixture.projectId, fixture.releasePlanId, undefined, {}),
        /redis write failed/u
      );

      const [verification] = await db
        .select()
        .from(releaseVerifications)
        .where(eq(releaseVerifications.deploymentId, fixture.deploymentId));
      const checks = await db
        .select()
        .from(releaseVerificationChecks)
        .where(eq(releaseVerificationChecks.verificationId, verification?.id ?? ""));

      assert.equal(verification?.status, "execution_failed");
      assert.equal(checks.length, 1);
      assert.equal(checks[0]?.checkKey, "verification_queue_check");
      assert.equal(checks[0]?.severity, "warning");
      assert.equal(checks[0]?.result, "failed");
      assert.deepEqual(checks[0]?.evidenceJson?.queueFailure, { message: "redis write failed" });
    });

    void it("rejects verification for a release plan outside the project scope", async () => {
      const projectA = await createReleaseFixture(db, { projectName: "Project A" });
      const projectB = await createReleaseFixture(db, { projectName: "Project B" });

      await assert.rejects(
        () => service.verify(projectA.projectId, projectB.releasePlanId, undefined, {}),
        /not authorized for this project/u
      );

      const rows = await db
        .select()
        .from(releaseVerifications)
        .where(
          and(
            eq(releaseVerifications.releasePlanId, projectB.releasePlanId),
            eq(releaseVerifications.deploymentId, projectB.deploymentId)
          )
        );

      assert.equal(rows.length, 0);
    });

    void it("persists the scoped release plan id in the queued verification row", async () => {
      const scoped = await createReleaseFixture(db, { projectName: "Scoped Project" });
      const other = await createReleaseFixture(db, { projectName: "Other Project" });
      const queue = new FakeQueue();
      setReleaseVerificationQueue(queueService, queue);

      const result = await service.verify(scoped.projectId, scoped.releasePlanId, undefined, {});

      assert.equal(result.releasePlanId, scoped.releasePlanId);

      const [verification] = await db
        .select()
        .from(releaseVerifications)
        .where(eq(releaseVerifications.deploymentId, scoped.deploymentId));

      assert.equal(verification?.releasePlanId, scoped.releasePlanId);
      assert.notEqual(verification?.releasePlanId, other.releasePlanId);
    });

    void it("rejects deployment ids outside the scoped release plan", async () => {
      const projectA = await createReleaseFixture(db, { projectName: "Project A" });
      const projectB = await createReleaseFixture(db, { projectName: "Project B" });

      await assert.rejects(
        () =>
          service.verify(projectA.projectId, projectA.releasePlanId, undefined, {
            deploymentId: projectB.deploymentId
          }),
        /No provider-succeeded deployment is available for verification/u
      );

      const rows = await db
        .select()
        .from(releaseVerifications)
        .where(eq(releaseVerifications.deploymentId, projectB.deploymentId));

      assert.equal(rows.length, 0);
    });

    void it("creates a draft release plan from approved page versions", async () => {
      const fixture = await createPageVersionFixture(db);

      const result = await service.createPlan(
        fixture.projectId,
        createReleasePlanRequest(fixture.pageVersionId),
        fixture.userId
      );

      assert.equal(result.projectId, fixture.projectId);
      assert.equal(result.status, "draft");
      assert.equal(result.blockerCount, 0);
      assert.equal(result.warningCount, 0);

      const [plan] = await db.select().from(releasePlans).where(eq(releasePlans.id, result.releasePlanId));
      assert.equal(plan?.status, "draft");
      assert.equal(plan?.approvedAt, null);
      assert.equal(plan?.createdByUserId, fixture.userId);
      assert.match(plan?.summary ?? "", /approved page version/u);

      const items = await db
        .select()
        .from(releasePlanItems)
        .where(eq(releasePlanItems.releasePlanId, result.releasePlanId));
      assert.equal(items.length, 1);
      assert.equal(items[0]?.pageVersionId, fixture.pageVersionId);
      assert.equal(items[0]?.targetUrl, "/dachreinigung/");
      assert.equal(items[0]?.action, "create");
      assert.equal(items[0]?.status, "pending");

      const deploymentRows = await db
        .select()
        .from(deployments)
        .where(eq(deployments.releasePlanId, result.releasePlanId));
      assert.equal(deploymentRows.length, 0);

      const [target] = await db.select().from(pageVersions).where(eq(pageVersions.id, fixture.pageVersionId));
      assert.equal(target?.status, "approved");
      assert.equal(target?.rowVersion, 0);
    });

    void it("keeps page-version revisions database-managed", async () => {
      const fixture = await createPageVersionFixture(db, { rowVersion: 9 });
      const [inserted] = await db.select().from(pageVersions).where(eq(pageVersions.id, fixture.pageVersionId));

      assert.equal(inserted?.rowVersion, 0);

      await assert.rejects(
        () => db.update(pageVersions).set({ rowVersion: 9 }).where(eq(pageVersions.id, fixture.pageVersionId)),
        /Page version row_version is database-managed/u
      );

      const [unchanged] = await db.select().from(pageVersions).where(eq(pageVersions.id, fixture.pageVersionId));
      assert.equal(unchanged?.rowVersion, 0);
    });

    void it("rejects release planning when a concurrent page-version transition wins the target lock", async () => {
      const fixture = await createPageVersionFixture(db, { projectName: "Release target race" });
      assert.ok(testDatabaseUrl);

      const blockerHandle = createIntegrationDatabaseClient(testDatabaseUrl);
      const planningHandle = createIntegrationDatabaseClient(testDatabaseUrl);
      const planningService = new ReleasesService(
        new QueueProducerService(testDatabaseService(planningHandle.db)),
        testDatabaseService(planningHandle.db)
      );
      let heldTransition: HeldPageVersionTransition | undefined;
      let planningSettled = false;

      try {
        heldTransition = await startHeldPageVersionTransition(blockerHandle.sql, fixture.pageVersionId);
        const planningPid = await backendPid(planningHandle.sql);
        const planningOutcome = planningService
          .createPlan(fixture.projectId, createReleasePlanRequest(fixture.pageVersionId), fixture.userId)
          .then(
            (value) => ({ ok: true as const, value }),
            (error: unknown) => ({ ok: false as const, error })
          )
          .finally(() => {
            planningSettled = true;
          });

        await waitForBlockingPid(handle.sql, {
          blockedPid: planningPid,
          blockingPid: heldTransition.pid,
          isSettled: () => planningSettled
        });
        heldTransition.commit();

        const outcome = await planningOutcome;
        assert.equal(outcome.ok, false);
        if (outcome.ok) {
          assert.fail("Release planning unexpectedly accepted a stale page-version target.");
        }
        assert.match(errorMessage(outcome.error), /changed after the release plan request was prepared/u);
        await heldTransition.done;
      } finally {
        heldTransition?.rollback();
        await heldTransition?.done.catch(() => undefined);
        await planningHandle.close();
        await blockerHandle.close();
      }

      const [pageVersion] = await db.select().from(pageVersions).where(eq(pageVersions.id, fixture.pageVersionId));
      assert.equal(pageVersion?.status, "release_candidate");
      assert.equal(pageVersion?.rowVersion, 1);
      assert.equal((await db.select().from(releasePlans)).length, 0);
      assert.equal((await db.select().from(releasePlanItems)).length, 0);
    });

    void it("rejects release planning when PageJson and the immutable media projection differ", async () => {
      const fixture = await createPageVersionFixture(db, { projectName: "Plan media mismatch" });
      const assetId = await createReadyMediaAsset(db, fixture);
      await db.insert(pageVersionMediaAssets).values({ pageVersionId: fixture.pageVersionId, mediaAssetId: assetId });

      await assert.rejects(
        () => service.createPlan(fixture.projectId, createReleasePlanRequest(fixture.pageVersionId), fixture.userId),
        /media references are unavailable or do not match/u
      );

      assert.equal((await db.select().from(releasePlans)).length, 0);
      assert.equal((await db.select().from(releasePlanItems)).length, 0);
    });

    void it("persists a preflight blocker when media projection evidence drifts after planning", async () => {
      const fixture = await createPageVersionFixture(db, { projectName: "Preflight media mismatch" });
      const plan = await service.createPlan(
        fixture.projectId,
        createReleasePlanRequest(fixture.pageVersionId),
        fixture.userId
      );
      const assetId = await createReadyMediaAsset(db, fixture);
      await db.insert(pageVersionMediaAssets).values({ pageVersionId: fixture.pageVersionId, mediaAssetId: assetId });

      const result = await service.preflight(fixture.projectId, plan.releasePlanId);
      const mediaCheck = result.checks.find((check) => check.checkKey === "media_manifest_check");

      assert.equal(result.readiness, "blocked");
      assert.equal(mediaCheck?.severity, "blocker");
      assert.equal(mediaCheck?.result, "failed");
    });

    void it("rejects release plan creation for page versions already in an active release plan", async () => {
      const fixture = await createPageVersionFixture(db);

      await service.createPlan(fixture.projectId, createReleasePlanRequest(fixture.pageVersionId), fixture.userId);

      await assert.rejects(
        () => service.createPlan(fixture.projectId, createReleasePlanRequest(fixture.pageVersionId), fixture.userId),
        /already in an active release plan/u
      );

      const items = await db
        .select()
        .from(releasePlanItems)
        .where(eq(releasePlanItems.pageVersionId, fixture.pageVersionId));
      assert.equal(items.length, 1);
    });

    void it("rejects release plan creation for preview page versions", async () => {
      const fixture = await createPageVersionFixture(db, { status: "preview", approvedAt: null });

      await assert.rejects(
        () =>
          service.createPlan(
            fixture.projectId,
            createReleasePlanRequest(fixture.pageVersionId, "preview"),
            fixture.userId
          ),
        /only include approved page versions/u
      );

      const rows = await db.select().from(releasePlanItems);
      assert.equal(rows.length, 0);
    });

    void it("rejects release plan creation for non-approved immutable page versions", async () => {
      const fixture = await createPageVersionFixture(db, { status: "release_candidate" });

      await assert.rejects(
        () =>
          service.createPlan(
            fixture.projectId,
            createReleasePlanRequest(fixture.pageVersionId, "release_candidate"),
            fixture.userId
          ),
        /only include approved page versions/u
      );

      const rows = await db.select().from(releasePlanItems);
      assert.equal(rows.length, 0);
    });

    void it("rejects page versions outside the project scope when creating release plans", async () => {
      const projectA = await createPageVersionFixture(db, { projectName: "Project A" });
      const projectB = await createPageVersionFixture(db, { projectName: "Project B" });

      await assert.rejects(
        () => service.createPlan(projectA.projectId, createReleasePlanRequest(projectB.pageVersionId), projectA.userId),
        /Every release page version must belong to this project/u
      );

      const rows = await db.select().from(releasePlanItems);
      assert.equal(rows.length, 0);
    });

    void it("rejects absolute page proposal routes when creating release plans", async () => {
      const fixture = await createPageVersionFixture(db, { route: "https://attacker.example/dachreinigung/" });

      await assert.rejects(
        () => service.createPlan(fixture.projectId, createReleasePlanRequest(fixture.pageVersionId), fixture.userId),
        /Release verification target routes must be relative paths/u
      );

      const rows = await db.select().from(releasePlanItems);
      assert.equal(rows.length, 0);
    });

    void it("rejects release plan creation without persisted actor evidence", async () => {
      const fixture = await createPageVersionFixture(db);

      await assert.rejects(
        () => service.createPlan(fixture.projectId, createReleasePlanRequest(fixture.pageVersionId)),
        /requires an authenticated persisted user id/u
      );

      const plans = await db.select().from(releasePlans);
      const items = await db.select().from(releasePlanItems);
      assert.equal(plans.length, 0);
      assert.equal(items.length, 0);
    });

    void it("queues rollback execution for a scoped rollback point", async () => {
      const fixture = await createReleaseFixture(db, {
        projectName: "Rollback Project",
        releasePlanStatus: "failed",
        deploymentStatus: "rollback_recommended",
        verificationStatus: "rollback_recommended"
      });
      const rollbackPointId = await createRollbackPoint(db, fixture);
      const queueService = new QueueProducerService(testDatabaseService(db));
      const queue = new FakeQueue();
      setRollbackQueue(queueService, queue);
      service = new ReleasesService(queueService, testDatabaseService(db));

      const result = await service.executeRollback(fixture.projectId, fixture.releasePlanId, undefined, {
        rollbackPointId
      });

      assert.equal(result.status, "queued");
      assert.equal(result.type, "rollback");
      assert.equal(result.inputRef, rollbackPointId);
      assert.equal(queue.addCalls.length, 1);
      assert.equal(queue.addCalls[0]?.name, "rollback");
      assert.equal(queue.addCalls[0]?.data.projectId, fixture.projectId);
      assert.equal(queue.addCalls[0]?.data.releasePlanId, fixture.releasePlanId);
      assert.equal(queue.addCalls[0]?.data.deploymentId, fixture.deploymentId);
      assert.equal(queue.addCalls[0]?.data.rollbackPointId, rollbackPointId);

      const rows = await db.select().from(jobRuns).where(eq(jobRuns.queueName, "rollback"));
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.status, "queued");
      assert.equal(rows[0]?.type, "rollback");
      assert.equal(rows[0]?.inputRef, rollbackPointId);
    });

    void it("rejects rollback points outside the scoped release plan", async () => {
      const projectA = await createReleaseFixture(db, {
        projectName: "Project A",
        releasePlanStatus: "failed",
        deploymentStatus: "rollback_recommended",
        verificationStatus: "rollback_recommended"
      });
      const projectB = await createReleaseFixture(db, {
        projectName: "Project B",
        releasePlanStatus: "failed",
        deploymentStatus: "rollback_recommended",
        verificationStatus: "rollback_recommended"
      });
      const projectBRollbackPointId = await createRollbackPoint(db, projectB);
      const queueService = new QueueProducerService(testDatabaseService(db));
      const queue = new FakeQueue();
      setRollbackQueue(queueService, queue);
      service = new ReleasesService(queueService, testDatabaseService(db));

      await assert.rejects(
        () =>
          service.executeRollback(projectA.projectId, projectA.releasePlanId, undefined, {
            rollbackPointId: projectBRollbackPointId
          }),
        /Rollback point is not available for this release plan/u
      );

      assert.equal(queue.addCalls.length, 0);
      const rows = await db.select().from(jobRuns).where(eq(jobRuns.queueName, "rollback"));
      assert.equal(rows.length, 0);
    });

    void it("rejects rollback execution when the release plan is not failed", async () => {
      const fixture = await createReleaseFixture(db, { projectName: "Live Project" });
      const rollbackPointId = await createRollbackPoint(db, fixture);
      const queueService = new QueueProducerService(testDatabaseService(db));
      const queue = new FakeQueue();
      setRollbackQueue(queueService, queue);
      service = new ReleasesService(queueService, testDatabaseService(db));

      await assert.rejects(
        () => service.executeRollback(fixture.projectId, fixture.releasePlanId, undefined, { rollbackPointId }),
        /Release plan is not eligible for rollback execution/u
      );

      assert.equal(queue.addCalls.length, 0);
    });

    void it("rejects rollback execution when the target deployment has no provider evidence", async () => {
      const fixture = await createReleaseFixture(db, {
        projectName: "Missing Provider Project",
        releasePlanStatus: "failed",
        deploymentStatus: "rollback_recommended",
        verificationStatus: "rollback_recommended",
        providerDeployId: null
      });
      const rollbackPointId = await createRollbackPoint(db, fixture);
      const queueService = new QueueProducerService(testDatabaseService(db));
      const queue = new FakeQueue();
      setRollbackQueue(queueService, queue);
      service = new ReleasesService(queueService, testDatabaseService(db));

      await assert.rejects(
        () => service.executeRollback(fixture.projectId, fixture.releasePlanId, undefined, { rollbackPointId }),
        /No rollback-eligible deployment is available for this release plan/u
      );

      assert.equal(queue.addCalls.length, 0);
    });

    void it("rejects rollback execution when the rollback point has no provider evidence", async () => {
      const fixture = await createReleaseFixture(db, {
        projectName: "Missing Rollback Provider Project",
        releasePlanStatus: "failed",
        deploymentStatus: "rollback_recommended",
        verificationStatus: "rollback_recommended"
      });
      const rollbackPointId = await createRollbackPoint(db, fixture, { providerDeployId: null });
      const queueService = new QueueProducerService(testDatabaseService(db));
      const queue = new FakeQueue();
      setRollbackQueue(queueService, queue);
      service = new ReleasesService(queueService, testDatabaseService(db));

      await assert.rejects(
        () => service.executeRollback(fixture.projectId, fixture.releasePlanId, undefined, { rollbackPointId }),
        /Rollback point is missing provider deploy evidence/u
      );

      assert.equal(queue.addCalls.length, 0);
    });

    void it("preflight prepares a provider-backed rollback point from the latest verified-good source", async () => {
      const fixture = await createPreflightRollbackFixture(db);

      const result = await service.preflight(fixture.projectId, fixture.releasePlanId);

      assert.equal(result.readiness, "ready");
      assert.equal(result.checks.find((check) => check.checkKey === "rollback_point_ready")?.result, "passed");

      const rows = await db
        .select()
        .from(rollbackPoints)
        .where(
          and(eq(rollbackPoints.projectId, fixture.projectId), eq(rollbackPoints.releasePlanId, fixture.releasePlanId))
        );

      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.deploymentId, fixture.previousDeploymentId);
      assert.equal(rows[0]?.providerDeployId, "previous-provider-deploy");
      assert.equal(rows[0]?.liveUrl, "https://customer.example/");
      assert.equal(rows[0]?.artifactKey, `rollback/${fixture.releasePlanId}/${fixture.previousDeploymentId}.json`);
      assert.deepEqual(rows[0]?.evidenceJson?.source, "release_preflight_rollback_point_preparation");
      assert.deepEqual(rows[0]?.evidenceJson?.sourceDeploymentStatus, "live_healthy");
      assert.deepEqual(rows[0]?.evidenceJson?.sourceVerificationStatus, "live_healthy");
    });

    void it("preflight rollback source identity is idempotent at the database boundary", async () => {
      const fixture = await createPreflightRollbackFixture(db);

      await service.preflight(fixture.projectId, fixture.releasePlanId);

      const [preparedPoint] = await db
        .select()
        .from(rollbackPoints)
        .where(
          and(eq(rollbackPoints.projectId, fixture.projectId), eq(rollbackPoints.releasePlanId, fixture.releasePlanId))
        )
        .limit(1);
      assert.ok(preparedPoint);
      assert.ok(preparedPoint.deploymentId);
      assert.ok(preparedPoint.providerDeployId);

      const duplicateRows = await db
        .insert(rollbackPoints)
        .values({
          projectId: fixture.projectId,
          releasePlanId: fixture.releasePlanId,
          deploymentId: preparedPoint.deploymentId,
          artifactKey: preparedPoint.artifactKey,
          providerDeployId: preparedPoint.providerDeployId,
          liveUrl: preparedPoint.liveUrl,
          evidenceJson: preparedPoint.evidenceJson
        })
        .onConflictDoNothing({
          target: [rollbackPoints.releasePlanId, rollbackPoints.deploymentId, rollbackPoints.providerDeployId]
        })
        .returning({ id: rollbackPoints.id });

      assert.equal(duplicateRows.length, 0);

      const rows = await db
        .select({ id: rollbackPoints.id })
        .from(rollbackPoints)
        .where(
          and(eq(rollbackPoints.projectId, fixture.projectId), eq(rollbackPoints.releasePlanId, fixture.releasePlanId))
        );

      assert.equal(rows.length, 1);
    });

    void it("preflight does not prepare a rollback point from a rollback-recommended deployment", async () => {
      const fixture = await createPreflightRollbackFixture(db, {
        previousDeploymentStatus: "rollback_recommended",
        previousVerificationStatus: "rollback_recommended"
      });

      await service.preflight(fixture.projectId, fixture.releasePlanId);

      const rows = await db
        .select()
        .from(rollbackPoints)
        .where(
          and(eq(rollbackPoints.projectId, fixture.projectId), eq(rollbackPoints.releasePlanId, fixture.releasePlanId))
        );

      assert.equal(rows.length, 0);
    });

    void it("preflight skips rollback point preparation when all prior deployments are unsafe sources", async () => {
      const fixture = await createPreflightRollbackFixture(db, {
        previousDeploymentStatus: "rollback_recommended",
        previousVerificationStatus: "rollback_recommended"
      });
      await createPriorRollbackSourceCandidate(db, {
        projectId: fixture.projectId,
        status: "failed",
        verificationStatus: "failed",
        providerDeployId: "failed-provider-deploy",
        updatedAt: new Date("2026-06-30T10:00:00.000Z")
      });
      await createPriorRollbackSourceCandidate(db, {
        projectId: fixture.projectId,
        status: "verifying",
        verificationStatus: "running",
        providerDeployId: "verifying-provider-deploy",
        updatedAt: new Date("2026-06-30T11:00:00.000Z")
      });

      await service.preflight(fixture.projectId, fixture.releasePlanId);

      const rows = await db
        .select()
        .from(rollbackPoints)
        .where(
          and(eq(rollbackPoints.projectId, fixture.projectId), eq(rollbackPoints.releasePlanId, fixture.releasePlanId))
        );

      assert.equal(rows.length, 0);
    });

    void it("preflight prefers an older verified-good rollback source over a newer bad deployment", async () => {
      const fixture = await createPreflightRollbackFixture(db, {
        previousDeploymentUpdatedAt: new Date("2026-06-30T09:00:00.000Z")
      });
      const badDeploymentId = await createPriorRollbackSourceCandidate(db, {
        projectId: fixture.projectId,
        status: "rollback_recommended",
        verificationStatus: "rollback_recommended",
        providerDeployId: "newer-bad-provider-deploy",
        updatedAt: new Date("2026-06-30T11:00:00.000Z")
      });

      await service.preflight(fixture.projectId, fixture.releasePlanId);

      const rows = await db
        .select()
        .from(rollbackPoints)
        .where(
          and(eq(rollbackPoints.projectId, fixture.projectId), eq(rollbackPoints.releasePlanId, fixture.releasePlanId))
        );

      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.deploymentId, fixture.previousDeploymentId);
      assert.notEqual(rows[0]?.deploymentId, badDeploymentId);
      assert.equal(rows[0]?.providerDeployId, "previous-provider-deploy");
      assert.deepEqual(rows[0]?.evidenceJson?.sourceDeploymentStatus, "live_healthy");
      assert.deepEqual(rows[0]?.evidenceJson?.sourceVerificationStatus, "live_healthy");
    });

    void it("preflight falls back to provider-succeeded rollback sources when no verified-good source exists", async () => {
      const fixture = await createPreflightRollbackFixture(db, {
        previousDeploymentStatus: "provider_succeeded",
        previousVerificationStatus: "not_started"
      });

      await service.preflight(fixture.projectId, fixture.releasePlanId);

      const rows = await db
        .select()
        .from(rollbackPoints)
        .where(
          and(eq(rollbackPoints.projectId, fixture.projectId), eq(rollbackPoints.releasePlanId, fixture.releasePlanId))
        );

      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.deploymentId, fixture.previousDeploymentId);
      assert.equal(rows[0]?.providerDeployId, "previous-provider-deploy");
      assert.deepEqual(rows[0]?.evidenceJson?.sourceDeploymentStatus, "provider_succeeded");
      assert.deepEqual(rows[0]?.evidenceJson?.sourceVerificationStatus, "not_started");
    });

    void it("preflight does not count rollback points without provider evidence as deploy-ready", async () => {
      const fixture = await createPreflightRollbackFixture(db, { previousProviderDeployId: null });
      await createRollbackPoint(
        db,
        {
          projectId: fixture.projectId,
          releasePlanId: fixture.releasePlanId,
          deploymentId: fixture.previousDeploymentId
        },
        { providerDeployId: null }
      );

      const result = await service.preflight(fixture.projectId, fixture.releasePlanId);

      assert.equal(result.readiness, "blocked");
      assert.equal(result.checks.find((check) => check.checkKey === "rollback_point_ready")?.result, "failed");

      const rows = await db
        .select()
        .from(rollbackPoints)
        .where(
          and(eq(rollbackPoints.projectId, fixture.projectId), eq(rollbackPoints.releasePlanId, fixture.releasePlanId))
        );

      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.providerDeployId, null);
    });

    void it("records actor evidence when approving release deploy", async () => {
      const fixture = await createPreflightRollbackFixture(db);
      const user = await createTestUser(db, "release-approver@example.test");
      const preflight = await service.preflight(fixture.projectId, fixture.releasePlanId);

      assert.equal(preflight.readiness, "ready");

      const result = await service.approveDeploy(fixture.projectId, fixture.releasePlanId, user.id);

      assert.equal(result.status, "approved_for_deploy");

      const [plan] = await db.select().from(releasePlans).where(eq(releasePlans.id, fixture.releasePlanId));
      assert.equal(plan?.status, "approved_for_deploy");

      const [pageVersion] = await db.select().from(pageVersions).where(eq(pageVersions.id, fixture.pageVersionId));
      assert.equal(pageVersion?.status, "release_candidate");

      const approvalRows = await db.select().from(approvals).where(eq(approvals.releasePlanId, fixture.releasePlanId));
      assert.equal(approvalRows.length, 1);
      assert.equal(approvalRows[0]?.userId, user.id);
      assert.equal(approvalRows[0]?.status, "approved");
    });

    void it("cancels pending release plans and restores candidate page versions for replanning", async () => {
      const fixture = await createPreflightRollbackFixture(db);
      const user = await createTestUser(db, "release-cancel@example.test");

      assert.equal((await service.preflight(fixture.projectId, fixture.releasePlanId)).readiness, "ready");
      assert.equal(
        (await service.approveDeploy(fixture.projectId, fixture.releasePlanId, user.id)).status,
        "approved_for_deploy"
      );

      const cancelled = await service.cancelPlan(fixture.projectId, fixture.releasePlanId, user.id);

      assert.equal(cancelled.status, "failed");

      const [pageVersion] = await db.select().from(pageVersions).where(eq(pageVersions.id, fixture.pageVersionId));
      assert.equal(pageVersion?.status, "approved");

      const approvalRows = await db.select().from(approvals).where(eq(approvals.releasePlanId, fixture.releasePlanId));
      const cancellationAudit = approvalRows.find((approval) => approval.decisionNote === "release_plan_cancelled");
      assert.ok(cancellationAudit);
      assert.equal(cancellationAudit.userId, user.id);
      assert.equal(cancellationAudit.status, "rejected");

      const replanned = await service.createPlan(
        fixture.projectId,
        await currentReleasePlanRequest(db, fixture.pageVersionId),
        user.id
      );

      assert.equal(replanned.status, "draft");
      assert.notEqual(replanned.releasePlanId, fixture.releasePlanId);
    });

    void it("rejects deploy approval when a concurrent terminal transition wins the plan lock", async () => {
      const fixture = await createPreflightRollbackFixture(db);
      const user = await createTestUser(db, "release-race-approver@example.test");

      assert.equal((await service.preflight(fixture.projectId, fixture.releasePlanId)).readiness, "ready");
      assert.ok(testDatabaseUrl);

      const blockerHandle = createIntegrationDatabaseClient(testDatabaseUrl);
      const approvalHandle = createIntegrationDatabaseClient(testDatabaseUrl);
      const approvalService = new ReleasesService(
        new QueueProducerService(testDatabaseService(approvalHandle.db)),
        testDatabaseService(approvalHandle.db)
      );
      let heldTransition: HeldReleasePlanTerminalTransition | undefined;
      let approvalSettled = false;

      try {
        heldTransition = await startHeldReleasePlanTerminalTransition(blockerHandle.sql, fixture.releasePlanId);
        const approvalPid = await backendPid(approvalHandle.sql);
        const approvalOutcome = approvalService
          .approveDeploy(fixture.projectId, fixture.releasePlanId, user.id)
          .then(
            (value) => ({ ok: true as const, value }),
            (error: unknown) => ({ ok: false as const, error })
          )
          .finally(() => {
            approvalSettled = true;
          });

        await waitForBlockingPid(handle.sql, {
          blockedPid: approvalPid,
          blockingPid: heldTransition.pid,
          isSettled: () => approvalSettled
        });
        heldTransition.commit();

        const outcome = await approvalOutcome;
        assert.equal(outcome.ok, false);
        if (outcome.ok) {
          assert.fail("Deploy approval unexpectedly succeeded after a terminal release transition.");
        }
        assert.match(errorMessage(outcome.error), /not in an approvable state/u);
        await heldTransition.done;
      } finally {
        heldTransition?.rollback();
        await heldTransition?.done.catch(() => undefined);
        await approvalHandle.close();
        await blockerHandle.close();
      }

      const [plan] = await db.select().from(releasePlans).where(eq(releasePlans.id, fixture.releasePlanId));
      assert.equal(plan?.status, "failed");

      const approvalRows = await db.select().from(approvals).where(eq(approvals.releasePlanId, fixture.releasePlanId));
      assert.equal(approvalRows.length, 0);
    });

    void it("does not let deploy enqueue revive a concurrently terminal release plan", async () => {
      const fixture = await createPreflightRollbackFixture(db);
      const user = await createTestUser(db, "release-race-deployer@example.test");

      assert.equal((await service.preflight(fixture.projectId, fixture.releasePlanId)).readiness, "ready");
      assert.equal(
        (await service.approveDeploy(fixture.projectId, fixture.releasePlanId, user.id)).status,
        "approved_for_deploy"
      );
      assert.ok(testDatabaseUrl);

      const blockerHandle = createIntegrationDatabaseClient(testDatabaseUrl);
      const deployHandle = createIntegrationDatabaseClient(testDatabaseUrl);
      const deployQueueService = new QueueProducerService(testDatabaseService(deployHandle.db));
      const queue = new FakeQueue();
      setDeployQueue(deployQueueService, queue);
      const deployService = new ReleasesService(deployQueueService, testDatabaseService(deployHandle.db));
      let heldTransition: HeldReleasePlanTerminalTransition | undefined;
      let deploySettled = false;

      try {
        heldTransition = await startHeldReleasePlanTerminalTransition(blockerHandle.sql, fixture.releasePlanId);
        const deployPid = await backendPid(deployHandle.sql);
        const deployOutcome = deployService
          .deploy(fixture.projectId, fixture.releasePlanId, user.id)
          .then(
            (value) => ({ ok: true as const, value }),
            (error: unknown) => ({ ok: false as const, error })
          )
          .finally(() => {
            deploySettled = true;
          });

        await waitForBlockingPid(handle.sql, {
          blockedPid: deployPid,
          blockingPid: heldTransition.pid,
          isSettled: () => deploySettled
        });
        heldTransition.commit();

        const outcome = await deployOutcome;
        assert.equal(outcome.ok, false);
        if (outcome.ok) {
          assert.fail("Deploy unexpectedly revived a terminal release plan.");
        }
        assert.match(errorMessage(outcome.error), /changed before deploy could start/u);
        await heldTransition.done;
      } finally {
        heldTransition?.rollback();
        await heldTransition?.done.catch(() => undefined);
        await deployHandle.close();
        await blockerHandle.close();
      }

      assert.equal(queue.addCalls.length, 1);

      const [plan] = await db.select().from(releasePlans).where(eq(releasePlans.id, fixture.releasePlanId));
      assert.equal(plan?.status, "failed");

      const deploymentRows = await db
        .select()
        .from(deployments)
        .where(eq(deployments.releasePlanId, fixture.releasePlanId));
      assert.equal(deploymentRows.length, 0);
    });

    void it("does not let preflight resurrect a terminal release plan", async () => {
      const fixture = await createPreflightRollbackFixture(db);
      await db.update(releasePlans).set({ status: "live" }).where(eq(releasePlans.id, fixture.releasePlanId));

      await assert.rejects(
        () => service.preflight(fixture.projectId, fixture.releasePlanId),
        /Release plan is not in a preflightable state/u
      );

      const [plan] = await db.select().from(releasePlans).where(eq(releasePlans.id, fixture.releasePlanId));
      assert.equal(plan?.status, "live");

      const checkRows = await db
        .select()
        .from(releaseChecks)
        .where(eq(releaseChecks.releasePlanId, fixture.releasePlanId));
      assert.equal(checkRows.length, 0);

      const rollbackRows = await db
        .select()
        .from(rollbackPoints)
        .where(eq(rollbackPoints.releasePlanId, fixture.releasePlanId));
      assert.equal(rollbackRows.length, 0);
    });

    void it("rejects release deploy approval without persisted actor evidence", async () => {
      const fixture = await createPreflightRollbackFixture(db);
      const preflight = await service.preflight(fixture.projectId, fixture.releasePlanId);

      assert.equal(preflight.readiness, "ready");

      await assert.rejects(
        () => service.approveDeploy(fixture.projectId, fixture.releasePlanId),
        /requires an authenticated persisted user id/u
      );

      const [plan] = await db.select().from(releasePlans).where(eq(releasePlans.id, fixture.releasePlanId));
      assert.equal(plan?.status, "ready");

      const [pageVersion] = await db.select().from(pageVersions).where(eq(pageVersions.id, fixture.pageVersionId));
      assert.equal(pageVersion?.status, "approved");

      const approvalRows = await db.select().from(approvals).where(eq(approvals.releasePlanId, fixture.releasePlanId));
      assert.equal(approvalRows.length, 0);
    });

    void it("requires fresh deploy approval after preflight is rerun", async () => {
      const fixture = await createPreflightRollbackFixture(db);
      const user = await createTestUser(db, "release-reapproval@example.test");

      assert.equal((await service.preflight(fixture.projectId, fixture.releasePlanId)).readiness, "ready");
      assert.equal(
        (await service.approveDeploy(fixture.projectId, fixture.releasePlanId, user.id)).status,
        "approved_for_deploy"
      );

      const rerunPreflight = await service.preflight(fixture.projectId, fixture.releasePlanId);

      assert.equal(rerunPreflight.readiness, "ready");

      const [plan] = await db.select().from(releasePlans).where(eq(releasePlans.id, fixture.releasePlanId));
      assert.equal(plan?.status, "ready");

      const [pageVersion] = await db.select().from(pageVersions).where(eq(pageVersions.id, fixture.pageVersionId));
      assert.equal(pageVersion?.status, "approved");

      const approvalRows = await db.select().from(approvals).where(eq(approvals.releasePlanId, fixture.releasePlanId));
      assert.equal(approvalRows.length, 1);

      await assert.rejects(
        () => service.deploy(fixture.projectId, fixture.releasePlanId, user.id),
        /Release must pass preflight and be approved before deploy/u
      );
    });
  }
);

async function createReleaseFixture(
  db: DatabaseClient,
  input: {
    projectName?: string;
    releasePlanStatus?: ReleasePlanStatus;
    deploymentStatus?: DeploymentStatus;
    verificationStatus?: ReleaseVerificationStatus;
    providerDeployId?: string | null;
    targetUrl?: string;
  } = {}
): Promise<ReleaseFixture> {
  const [customer] = await db
    .insert(customers)
    .values({ name: `${input.projectName ?? "Project"} Customer` })
    .returning();
  assert.ok(customer);

  const [project] = await db
    .insert(projects)
    .values({
      customerId: customer.id,
      name: input.projectName ?? "Project"
    })
    .returning();
  assert.ok(project);

  const [releasePlan] = await db
    .insert(releasePlans)
    .values({
      projectId: project.id,
      status: input.releasePlanStatus ?? "live",
      summary: "Release ready for verification.",
      riskLevel: "low",
      blockerCount: 0,
      warningCount: 0
    })
    .returning();
  assert.ok(releasePlan);

  await db.insert(releasePlanItems).values({
    releasePlanId: releasePlan.id,
    targetUrl: input.targetUrl ?? "/dachreinigung/",
    action: "noindex",
    status: "deployed"
  });

  const [deployment] = await db
    .insert(deployments)
    .values({
      projectId: project.id,
      releasePlanId: releasePlan.id,
      deploymentKey: `release_plan:${releasePlan.id}`,
      provider: "netlify",
      providerDeployId: input.providerDeployId === undefined ? `deploy-${releasePlan.id}` : input.providerDeployId,
      providerOperationStatus: "recorded",
      liveUrl: "https://deploy-1--customer.netlify.app/",
      status: input.deploymentStatus ?? "provider_succeeded",
      verificationStatus: input.verificationStatus ?? "not_started",
      evidenceJson: {
        provider: {
          liveUrls: ["https://deploy-1--customer.netlify.app/", "https://customer.example/"]
        }
      }
    })
    .returning();
  assert.ok(deployment);

  return {
    projectId: project.id,
    releasePlanId: releasePlan.id,
    deploymentId: deployment.id
  };
}

async function createPageVersionFixture(
  db: DatabaseClient,
  input: {
    approvedAt?: Date | null;
    projectName?: string;
    route?: string;
    rowVersion?: number;
    status?: PageVersionStatus;
  } = {}
): Promise<PageVersionFixture> {
  const route = input.route ?? "/dachreinigung/";
  const user = await createTestUser(db, `release-plan-${input.projectName ?? "default"}@example.test`);

  const [customer] = await db.insert(customers).values({ name: "Plan Route Customer" }).returning();
  assert.ok(customer);

  const [project] = await db
    .insert(projects)
    .values({
      customerId: customer.id,
      name: input.projectName ?? "Plan Route Project"
    })
    .returning();
  assert.ok(project);

  const [proposal] = await db
    .insert(pageProposals)
    .values({
      projectId: project.id,
      route,
      primaryKeyword: "Dachreinigung",
      uniquenessRationale: "Dedicated local proof.",
      status: input.status === "changes_requested" || input.status === "preview" ? "draft" : "approved",
      sitemapReady: true
    })
    .returning();
  assert.ok(proposal);

  const [pageVersion] = await db
    .insert(pageVersions)
    .values({
      pageProposalId: proposal.id,
      versionNumber: 1,
      rowVersion: input.rowVersion,
      status: input.status ?? "approved",
      approvedAt: input.approvedAt === undefined ? new Date("2026-06-30T10:00:00.000Z") : input.approvedAt,
      pageJson: pageJson(route)
    })
    .returning();
  assert.ok(pageVersion);

  return {
    projectId: project.id,
    pageVersionId: pageVersion.id,
    userId: user.id
  };
}

function createReleasePlanRequest(pageVersionId: string, status: PageVersionStatus = "approved", rowVersion = 0) {
  return {
    pageVersions: [{ pageVersionId, expected: { status, rowVersion } }]
  };
}

async function currentReleasePlanRequest(db: DatabaseClient, pageVersionId: string) {
  const [pageVersion] = await db
    .select({ status: pageVersions.status, rowVersion: pageVersions.rowVersion })
    .from(pageVersions)
    .where(eq(pageVersions.id, pageVersionId));
  assert.ok(pageVersion);
  return createReleasePlanRequest(pageVersionId, pageVersion.status, pageVersion.rowVersion);
}

async function createTestUser(db: DatabaseClient, email: string): Promise<typeof users.$inferSelect> {
  const [user] = await db.insert(users).values({ email }).returning();
  assert.ok(user);
  return user;
}

async function createReadyMediaAsset(db: DatabaseClient, fixture: PageVersionFixture): Promise<string> {
  const body = new TextEncoder().encode(`release-media-${randomUUID()}`);
  const checksumSha256 = createHash("sha256").update(body).digest("hex");
  const [asset] = await db
    .insert(mediaAssets)
    .values({
      projectId: fixture.projectId,
      status: "pending_upload",
      displayName: "release-proof.webp",
      claimedContentType: "image/webp",
      expectedBytes: body.byteLength,
      expectedSha256: checksumSha256,
      sourceStorageKey: `media/quarantine/${fixture.projectId}/${randomUUID()}`,
      createdByUserId: fixture.userId
    })
    .returning();
  assert.ok(asset);
  await db.update(mediaAssets).set({ status: "processing" }).where(eq(mediaAssets.id, asset.id));
  await db.insert(mediaAssetVariants).values({
    mediaAssetId: asset.id,
    variantKey: "w640_webp",
    storageKey: `media/ready/${asset.id}/w640.webp`,
    contentType: "image/webp",
    width: 640,
    height: 480,
    bytes: body.byteLength,
    checksumSha256
  });
  await db
    .update(mediaAssets)
    .set({
      status: "ready",
      detectedContentType: "image/webp",
      sourceBytes: body.byteLength,
      width: 640,
      height: 480,
      checksumSha256,
      processorVersion: "integration-v1",
      requiredVariantKeys: ["w640_webp"],
      processedAt: new Date("2026-07-15T10:00:00.000Z")
    })
    .where(eq(mediaAssets.id, asset.id));
  return asset.id;
}

async function createPreflightRollbackFixture(
  db: DatabaseClient,
  input: {
    previousProviderDeployId?: string | null;
    previousDeploymentStatus?: DeploymentStatus;
    previousVerificationStatus?: ReleaseVerificationStatus;
    previousDeploymentUpdatedAt?: Date;
  } = {}
): Promise<PreflightRollbackFixture> {
  const [customer] = await db.insert(customers).values({ name: "Preflight Customer" }).returning();
  assert.ok(customer);

  const [project] = await db
    .insert(projects)
    .values({
      customerId: customer.id,
      name: "Preflight Project"
    })
    .returning();
  assert.ok(project);

  const [previousReleasePlan] = await db
    .insert(releasePlans)
    .values({
      projectId: project.id,
      status: "live",
      summary: "Previous live release.",
      riskLevel: "low",
      blockerCount: 0,
      warningCount: 0
    })
    .returning();
  assert.ok(previousReleasePlan);

  const [previousDeployment] = await db
    .insert(deployments)
    .values({
      projectId: project.id,
      releasePlanId: previousReleasePlan.id,
      deploymentKey: `release_plan:${previousReleasePlan.id}`,
      provider: "netlify",
      providerDeployId:
        input.previousProviderDeployId === undefined ? "previous-provider-deploy" : input.previousProviderDeployId,
      providerOperationStatus: "recorded",
      liveUrl: "https://customer.example/",
      status: input.previousDeploymentStatus ?? "live_healthy",
      verificationStatus: input.previousVerificationStatus ?? "live_healthy",
      updatedAt: input.previousDeploymentUpdatedAt,
      evidenceJson: {
        provider: {
          status: "ready",
          liveUrls: ["https://customer.example/"]
        }
      }
    })
    .returning();
  assert.ok(previousDeployment);

  const [releasePlan] = await db
    .insert(releasePlans)
    .values({
      projectId: project.id,
      status: "draft",
      summary: "New release needing rollback preparation.",
      riskLevel: "low",
      blockerCount: 0,
      warningCount: 0
    })
    .returning();
  assert.ok(releasePlan);

  const [proposal] = await db
    .insert(pageProposals)
    .values({
      projectId: project.id,
      route: "/dachreinigung/",
      primaryKeyword: "Dachreinigung",
      uniquenessRationale: "Dedicated local proof.",
      status: "approved",
      sitemapReady: true
    })
    .returning();
  assert.ok(proposal);

  const [pageVersion] = await db
    .insert(pageVersions)
    .values({
      pageProposalId: proposal.id,
      versionNumber: 1,
      status: "approved",
      approvedAt: new Date("2026-06-30T10:00:00.000Z"),
      pageJson: pageJson("/dachreinigung/")
    })
    .returning();
  assert.ok(pageVersion);

  await db.insert(releasePlanItems).values({
    releasePlanId: releasePlan.id,
    pageVersionId: pageVersion.id,
    targetUrl: "/dachreinigung/",
    action: "create",
    status: "pending"
  });

  await db.insert(projectTrackingKeys).values({
    projectId: project.id,
    keyHash: `hash-${releasePlan.id}`,
    allowedOrigins: ["https://customer.example/"]
  });

  return {
    projectId: project.id,
    releasePlanId: releasePlan.id,
    pageVersionId: pageVersion.id,
    previousDeploymentId: previousDeployment.id
  };
}

async function createPriorRollbackSourceCandidate(
  db: DatabaseClient,
  input: {
    projectId: string;
    status: DeploymentStatus;
    verificationStatus: ReleaseVerificationStatus;
    providerDeployId: string | null;
    updatedAt: Date;
  }
): Promise<string> {
  const [releasePlan] = await db
    .insert(releasePlans)
    .values({
      projectId: input.projectId,
      status: input.status === "rollback_recommended" || input.status === "failed" ? "failed" : "live",
      summary: "Additional prior release.",
      riskLevel: "low",
      blockerCount: 0,
      warningCount: 0
    })
    .returning();
  assert.ok(releasePlan);

  const [deployment] = await db
    .insert(deployments)
    .values({
      projectId: input.projectId,
      releasePlanId: releasePlan.id,
      deploymentKey: `release_plan:${releasePlan.id}`,
      provider: "netlify",
      providerDeployId: input.providerDeployId,
      providerOperationStatus: "recorded",
      liveUrl: "https://customer.example/",
      status: input.status,
      verificationStatus: input.verificationStatus,
      updatedAt: input.updatedAt,
      evidenceJson: {
        provider: {
          status: "ready",
          liveUrls: ["https://customer.example/"]
        }
      }
    })
    .returning();
  assert.ok(deployment);

  return deployment.id;
}

async function createRollbackPoint(
  db: DatabaseClient,
  fixture: ReleaseFixture,
  input: { providerDeployId?: string | null } = {}
): Promise<string> {
  const [rollbackPoint] = await db
    .insert(rollbackPoints)
    .values({
      projectId: fixture.projectId,
      releasePlanId: fixture.releasePlanId,
      deploymentId: fixture.deploymentId,
      artifactKey: `rollback/${fixture.releasePlanId}/previous-stable.json`,
      providerDeployId: input.providerDeployId === undefined ? "previous-provider-deploy" : input.providerDeployId,
      liveUrl: "https://customer.example/"
    })
    .returning();
  assert.ok(rollbackPoint);
  return rollbackPoint.id;
}

function pageJson(route: string): PageJson {
  return {
    schemaVersion: 1,
    route,
    pageType: "service_area_page",
    target: {
      service: "Dachreinigung",
      location: "Muenchen",
      primaryKeyword: "Dachreinigung Muenchen",
      secondaryKeywords: []
    },
    seo: {
      title: "Dachreinigung Muenchen",
      metaDescription: "Lokale Dachreinigung in Muenchen.",
      canonicalPath: route,
      robots: "noindex",
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          name: "Dachreinigung Muenchen"
        }
      ],
      sitemapReady: true
    },
    sections: [
      {
        id: "hero-1",
        type: "Hero",
        registryKey: "Hero.default",
        schemaVersion: 1,
        zone: "hero",
        order: 0,
        variant: "default",
        props: {
          h1: "Dachreinigung in Muenchen",
          lead: "Lokale Dachreinigung in Muenchen.",
          primaryCtaLabel: "Anfragen",
          primaryCtaHref: "/kontakt/"
        },
        evidenceRefs: []
      },
      {
        id: "areas-1",
        type: "ServiceAreaList",
        registryKey: "ServiceAreaList.default",
        schemaVersion: 1,
        zone: "body_late",
        order: 1,
        variant: "default",
        props: {
          heading: "Einsatzgebiet",
          areas: [{ name: "Muenchen", route: "/dachreinigung/" }]
        },
        evidenceRefs: []
      },
      {
        id: "faq-1",
        type: "FAQ",
        registryKey: "FAQ.default",
        schemaVersion: 1,
        zone: "body_late",
        order: 2,
        variant: "default",
        props: {
          heading: "Haeufige Fragen",
          items: [{ question: "Wie schnell?", answer: "Nach Absprache." }]
        },
        evidenceRefs: []
      },
      {
        id: "cta-1",
        type: "FinalCTA",
        registryKey: "FinalCTA.default",
        schemaVersion: 1,
        zone: "cta_late",
        order: 3,
        variant: "default",
        props: {
          heading: "Dachreinigung anfragen",
          body: "Wir pruefen die passende Ausfuehrung fuer Ihr Objekt.",
          ctaLabel: "Anfragen",
          ctaHref: "/kontakt/"
        },
        evidenceRefs: []
      }
    ],
    internalLinks: ["/dachreinigung/"],
    evidenceRefs: [],
    uniquenessRationale: "Dedicated local proof."
  };
}

type HeldReleasePlanTerminalTransition = {
  pid: number;
  done: Promise<void>;
  commit: () => void;
  rollback: () => void;
};

type HeldPageVersionTransition = {
  pid: number;
  done: Promise<void>;
  commit: () => void;
  rollback: () => void;
};

async function startHeldPageVersionTransition(
  sql: SqlClient,
  pageVersionId: string
): Promise<HeldPageVersionTransition> {
  const transitioned = deferred<{ pid: number }>();
  const finish = deferred<"commit" | "rollback">();
  const done = sql.begin(async (tx) => {
    await tx`SET TRANSACTION ISOLATION LEVEL READ COMMITTED`;
    const pid = await backendPid(tx);
    await tx`
      UPDATE "page_versions"
      SET "status" = 'release_candidate', "updated_at" = NOW()
      WHERE "id" = ${pageVersionId}
    `;
    transitioned.resolve({ pid });

    if ((await finish.promise) === "rollback") {
      throw new Error("Rollback held page-version transition.");
    }
  });

  void done.catch((error: unknown) => {
    transitioned.reject(error);
  });

  const { pid } = await transitioned.promise;
  return {
    pid,
    done,
    commit: () => finish.resolve("commit"),
    rollback: () => finish.resolve("rollback")
  };
}

async function startHeldReleasePlanTerminalTransition(
  sql: SqlClient,
  releasePlanId: string
): Promise<HeldReleasePlanTerminalTransition> {
  const transitioned = deferred<{ pid: number }>();
  const finish = deferred<"commit" | "rollback">();
  const done = sql.begin(async (tx) => {
    await tx`SET TRANSACTION ISOLATION LEVEL READ COMMITTED`;
    const pid = await backendPid(tx);
    await tx`
      UPDATE "release_plans"
      SET "status" = 'failed', "updated_at" = NOW()
      WHERE "id" = ${releasePlanId}
    `;
    transitioned.resolve({ pid });

    if ((await finish.promise) === "rollback") {
      throw new Error("Rollback held release plan transition.");
    }
  });

  void done.catch((error: unknown) => {
    transitioned.reject(error);
  });

  const { pid } = await transitioned.promise;
  return {
    pid,
    done,
    commit: () => finish.resolve("commit"),
    rollback: () => finish.resolve("rollback")
  };
}

async function backendPid(sql: SqlClient): Promise<number> {
  const [row] = await sql<{ pid: number }[]>`SELECT pg_backend_pid()::int AS "pid"`;
  assert.ok(row);
  return row.pid;
}

async function waitForBlockingPid(
  sql: SqlClient,
  input: { blockedPid: number; blockingPid: number; isSettled: () => boolean }
): Promise<void> {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    if (input.isSettled()) {
      throw new Error("Release operation settled before the expected lock wait was observed.");
    }

    const [row] = await sql<{ blocking_pids: number[] }[]>`
      SELECT pg_blocking_pids(${input.blockedPid}) AS "blocking_pids"
    `;

    if (row?.blocking_pids.includes(input.blockingPid)) {
      return;
    }

    await delay(25);
  }

  throw new Error(`Timed out waiting for backend ${input.blockedPid} to be blocked by ${input.blockingPid}.`);
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
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

function setRollbackQueue(service: QueueProducerService, queue: FakeQueue): void {
  (service as unknown as { queues: { rollback?: unknown } }).queues.rollback = queue;
}

function setDeployQueue(service: QueueProducerService, queue: FakeQueue): void {
  (service as unknown as { queues: { deploy?: unknown } }).queues.deploy = queue;
}

function setReleaseVerificationQueue(service: QueueProducerService, queue: FakeQueue): void {
  (service as unknown as { queues: { "release-verification"?: unknown } }).queues["release-verification"] = queue;
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
