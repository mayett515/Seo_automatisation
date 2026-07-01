import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type {
  BeginDeployResult,
  DeployReleaseResult,
  ProviderDeploySnapshot,
  RollbackDeployInput,
  RollbackDeployResult,
  SiteHostingPort,
  UploadDeployFilesResult
} from "@localseo/adapters";
import type { RollbackJobData } from "@localseo/contracts";
import {
  customers,
  deployments,
  mainWebsites,
  projects,
  releasePlans,
  rollbackPoints,
  type DatabaseClient
} from "@localseo/db";
import { eq } from "drizzle-orm";
import {
  createIntegrationTestDatabase,
  truncateIntegrationTables
} from "../../../../packages/db/test-support/integration-database.js";
import {
  RollbackConfigurationError,
  RollbackEvidenceError,
  RollbackProviderFailedError,
  RollbackProviderPendingError,
  createDrizzleRollbackRepository,
  executeRollback,
  reconcilePendingRollbacks,
  rollbackJobId
} from "./rollback.js";

type IntegrationDatabase = Awaited<ReturnType<typeof createIntegrationTestDatabase>>;

type RollbackFixture = {
  projectId: string;
  releasePlanId: string;
  deploymentId: string;
  rollbackPointId: string;
  data: RollbackJobData;
};

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = Boolean(testDatabaseUrl);

void describe(
  "rollback worker database integration",
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

    void it("marks deployment and release plan rolled back only after provider rollback completes", async () => {
      const fixture = await createRollbackFixture(db);
      const hosting = new FakeRollbackHosting({
        status: "completed",
        providerDeployId: "previous-provider-deploy",
        liveUrl: "https://customer.example/"
      });

      const result = await executeRollback({
        data: fixture.data,
        jobId: rollbackJobId(fixture.data),
        repository: createDrizzleRollbackRepository(db),
        siteHosting: hosting
      });

      assert.equal(result.status, "rolled_back");
      assert.equal(hosting.rollbackCalls.length, 1);
      assert.equal(hosting.rollbackCalls[0]?.hostingSiteId, "hosting-site-1");
      assert.equal(hosting.rollbackCalls[0]?.providerDeployId, "previous-provider-deploy");

      const [deployment] = await db.select().from(deployments).where(eq(deployments.id, fixture.deploymentId));
      assert.equal(deployment?.status, "rolled_back");
      assert.equal(deployment?.providerDeployId, "previous-provider-deploy");
      assert.equal(deployment?.liveUrl, "https://customer.example/");
      const rollbackEvidence = recordFromUnknown(recordFromUnknown(deployment?.evidenceJson).rollback);
      assert.equal(rollbackEvidence.status, "completed");
      assert.equal(rollbackEvidence.providerResultStatus, "completed");
      assert.equal(rollbackEvidence.providerDeployId, "previous-provider-deploy");
      assert.equal(rollbackEvidence.rollbackPointId, fixture.rollbackPointId);
      assert.equal(rollbackEvidence.rolledBackFromProviderDeployId, "bad-provider-deploy");
      assert.equal(typeof rollbackEvidence.executedAt, "string");
      assert.equal(rollbackEvidence.restoredProviderDeployId, "previous-provider-deploy");
      assert.equal(rollbackEvidence.liveUrl, "https://customer.example/");
      assert.deepEqual(rollbackEvidence.evidence, { adapter: "fake", restored: true });

      const [releasePlan] = await db.select().from(releasePlans).where(eq(releasePlans.id, fixture.releasePlanId));
      assert.equal(releasePlan?.status, "rolled_back");

      const [rollbackPoint] = await db
        .select()
        .from(rollbackPoints)
        .where(eq(rollbackPoints.id, fixture.rollbackPointId));
      assert.equal(
        (recordFromUnknown(rollbackPoint?.evidenceJson).rollbackExecution as { status?: string } | undefined)?.status,
        "completed"
      );
      const rollbackPointEvidence = recordFromUnknown(recordFromUnknown(rollbackPoint?.evidenceJson).rollbackExecution);
      assert.equal(rollbackPointEvidence.providerResultStatus, "completed");
      assert.equal(rollbackPointEvidence.providerDeployId, "previous-provider-deploy");
      assert.equal(rollbackPointEvidence.rolledBackFromProviderDeployId, "bad-provider-deploy");
    });

    void it("does not mark rolled back when provider rollback fails", async () => {
      const fixture = await createRollbackFixture(db);
      const hosting = new FakeRollbackHosting({
        status: "failed",
        providerDeployId: "previous-provider-deploy",
        evidence: { adapter: "fake", restored: false }
      });

      await assert.rejects(
        executeRollback({
          data: fixture.data,
          jobId: rollbackJobId(fixture.data),
          repository: createDrizzleRollbackRepository(db),
          siteHosting: hosting
        }),
        RollbackProviderFailedError
      );

      const [deployment] = await db.select().from(deployments).where(eq(deployments.id, fixture.deploymentId));
      assert.equal(deployment?.status, "rollback_recommended");

      const [releasePlan] = await db.select().from(releasePlans).where(eq(releasePlans.id, fixture.releasePlanId));
      assert.equal(releasePlan?.status, "failed");

      const [rollbackPoint] = await db
        .select()
        .from(rollbackPoints)
        .where(eq(rollbackPoints.id, fixture.rollbackPointId));
      assert.equal(
        (recordFromUnknown(rollbackPoint?.evidenceJson).rollbackExecution as { status?: string } | undefined)?.status,
        "provider_failed"
      );
      const rollbackExecution = recordFromUnknown(recordFromUnknown(rollbackPoint?.evidenceJson).rollbackExecution);
      assert.equal(rollbackExecution.providerResultStatus, "failed");
      assert.equal(rollbackExecution.providerDeployId, "previous-provider-deploy");
      assert.equal(rollbackExecution.liveUrl, null);
      assert.deepEqual(rollbackExecution.evidence, { adapter: "fake", restored: false });
    });

    void it("records queued provider rollback as queryable rollback_pending state", async () => {
      const fixture = await createRollbackFixture(db);
      const hosting = new FakeRollbackHosting({
        status: "queued",
        providerDeployId: "restored-pending-deploy",
        evidence: { adapter: "fake", accepted: true }
      });

      const result = await executeRollback({
        data: fixture.data,
        jobId: rollbackJobId(fixture.data),
        repository: createDrizzleRollbackRepository(db),
        siteHosting: hosting
      });

      assert.equal(result.status, "rollback_pending");
      assert.equal(hosting.rollbackCalls.length, 1);

      const [deployment] = await db.select().from(deployments).where(eq(deployments.id, fixture.deploymentId));
      assert.equal(deployment?.status, "rollback_pending");
      assert.equal(deployment?.providerDeployId, "bad-provider-deploy");
      const rollbackEvidence = recordFromUnknown(recordFromUnknown(deployment?.evidenceJson).rollback);
      assert.equal(rollbackEvidence.status, "rollback_pending");
      assert.equal(rollbackEvidence.rollbackPointId, fixture.rollbackPointId);
      assert.equal(rollbackEvidence.sourceProviderDeployId, "previous-provider-deploy");
      assert.equal(rollbackEvidence.targetProviderDeployId, "bad-provider-deploy");
      assert.equal(rollbackEvidence.restoredProviderDeployId, "restored-pending-deploy");
      assert.equal(typeof rollbackEvidence.operationAttemptId, "string");

      const [rollbackPoint] = await db
        .select()
        .from(rollbackPoints)
        .where(eq(rollbackPoints.id, fixture.rollbackPointId));
      assert.equal(
        (recordFromUnknown(rollbackPoint?.evidenceJson).rollbackExecution as { status?: string } | undefined)?.status,
        "rollback_pending"
      );
      const rollbackExecution = recordFromUnknown(recordFromUnknown(rollbackPoint?.evidenceJson).rollbackExecution);
      assert.equal(rollbackExecution.providerResultStatus, "queued");
      assert.equal(rollbackExecution.providerDeployId, "restored-pending-deploy");
      assert.equal(rollbackExecution.rollbackPointId, fixture.rollbackPointId);
      assert.equal(rollbackExecution.sourceProviderDeployId, "previous-provider-deploy");
      assert.equal(rollbackExecution.targetProviderDeployId, "bad-provider-deploy");
      assert.equal(rollbackExecution.restoredProviderDeployId, "restored-pending-deploy");
      assert.equal(typeof rollbackExecution.operationAttemptId, "string");
      assert.equal(rollbackExecution.liveUrl, null);
      assert.deepEqual(rollbackExecution.evidence, { adapter: "fake", accepted: true });
    });

    void it("reconciles pending rollback when the intended deploy is published", async () => {
      const fixture = await createRollbackFixture(db);
      await executeRollback({
        data: fixture.data,
        jobId: rollbackJobId(fixture.data),
        repository: createDrizzleRollbackRepository(db),
        siteHosting: new FakeRollbackHosting({
          status: "queued",
          providerDeployId: "restored-pending-deploy"
        })
      });
      const hosting = new FakeRollbackHosting(
        { status: "failed" },
        providerSnapshot("restored-pending-deploy", "ready")
      );

      const result = await reconcilePendingRollbacks({
        db,
        siteHosting: hosting
      });

      assert.deepEqual(result, {
        checked: 1,
        succeeded: 1,
        pending: 0,
        manualRequired: 0,
        staleNoop: 0
      });
      assert.equal(hosting.rollbackCalls.length, 0);
      assert.deepEqual(hosting.publishedDeployCalls, ["hosting-site-1"]);

      const [deployment] = await db.select().from(deployments).where(eq(deployments.id, fixture.deploymentId));
      assert.equal(deployment?.status, "rolled_back");
      assert.equal(deployment?.providerDeployId, "restored-pending-deploy");

      const [releasePlan] = await db.select().from(releasePlans).where(eq(releasePlans.id, fixture.releasePlanId));
      assert.equal(releasePlan?.status, "rolled_back");
    });

    void it("treats duplicate pending rollback completion as a stale no-op", async () => {
      const fixture = await createRollbackFixture(db);
      await executeRollback({
        data: fixture.data,
        jobId: rollbackJobId(fixture.data),
        repository: createDrizzleRollbackRepository(db),
        siteHosting: new FakeRollbackHosting({
          status: "queued",
          providerDeployId: "restored-pending-deploy"
        })
      });

      const [pendingDeployment] = await db.select().from(deployments).where(eq(deployments.id, fixture.deploymentId));
      assert.ok(pendingDeployment);
      const pendingEvidence = recordFromUnknown(recordFromUnknown(pendingDeployment.evidenceJson).rollback);
      const operationAttemptId = pendingEvidence.operationAttemptId;
      assert.equal(typeof operationAttemptId, "string");

      const result = await reconcilePendingRollbacks({
        db,
        siteHosting: new FakeRollbackHosting({ status: "failed" }, async () => {
          const completedAt = new Date();
          const [currentDeployment] = await db
            .select()
            .from(deployments)
            .where(eq(deployments.id, fixture.deploymentId));
          assert.ok(currentDeployment);
          const currentDeploymentEvidence = recordFromUnknown(currentDeployment.evidenceJson);
          const currentRollbackEvidence = recordFromUnknown(currentDeploymentEvidence.rollback);

          await db
            .update(deployments)
            .set({
              status: "rolled_back",
              providerDeployId: "restored-pending-deploy",
              evidenceJson: {
                ...currentDeploymentEvidence,
                rollback: {
                  ...currentRollbackEvidence,
                  status: "completed",
                  operationAttemptId,
                  providerResultStatus: "completed",
                  providerDeployId: "restored-pending-deploy",
                  rollbackPointId: fixture.rollbackPointId,
                  sourceProviderDeployId: "previous-provider-deploy",
                  targetProviderDeployId: "bad-provider-deploy",
                  restoredProviderDeployId: "restored-pending-deploy",
                  executedAt: completedAt.toISOString()
                }
              },
              updatedAt: completedAt
            })
            .where(eq(deployments.id, fixture.deploymentId));

          const [currentRollbackPoint] = await db
            .select()
            .from(rollbackPoints)
            .where(eq(rollbackPoints.id, fixture.rollbackPointId));
          assert.ok(currentRollbackPoint);
          const currentRollbackPointEvidence = recordFromUnknown(currentRollbackPoint.evidenceJson);
          const currentRollbackExecution = recordFromUnknown(currentRollbackPointEvidence.rollbackExecution);

          await db
            .update(rollbackPoints)
            .set({
              evidenceJson: {
                ...currentRollbackPointEvidence,
                rollbackExecution: {
                  ...currentRollbackExecution,
                  status: "completed",
                  operationAttemptId,
                  providerResultStatus: "completed",
                  providerDeployId: "restored-pending-deploy",
                  sourceProviderDeployId: "previous-provider-deploy",
                  targetProviderDeployId: "bad-provider-deploy",
                  restoredProviderDeployId: "restored-pending-deploy",
                  executedAt: completedAt.toISOString()
                }
              },
              updatedAt: completedAt
            })
            .where(eq(rollbackPoints.id, fixture.rollbackPointId));

          await db
            .update(releasePlans)
            .set({
              status: "rolled_back",
              updatedAt: completedAt
            })
            .where(eq(releasePlans.id, fixture.releasePlanId));

          return providerSnapshot("restored-pending-deploy", "ready");
        })
      });

      assert.deepEqual(result, {
        checked: 1,
        succeeded: 0,
        pending: 0,
        manualRequired: 0,
        staleNoop: 1
      });

      const [deployment] = await db.select().from(deployments).where(eq(deployments.id, fixture.deploymentId));
      assert.equal(deployment?.status, "rolled_back");
      assert.equal(deployment?.providerOperationStatus, "recorded");
      const rollbackEvidence = recordFromUnknown(recordFromUnknown(deployment?.evidenceJson).rollback);
      assert.equal(rollbackEvidence.status, "completed");
      assert.equal(rollbackEvidence.manualReason, undefined);

      const [rollbackPoint] = await db
        .select()
        .from(rollbackPoints)
        .where(eq(rollbackPoints.id, fixture.rollbackPointId));
      const rollbackExecution = recordFromUnknown(recordFromUnknown(rollbackPoint?.evidenceJson).rollbackExecution);
      assert.equal(rollbackExecution.status, "completed");
      assert.equal(rollbackExecution.manualReason, undefined);
    });

    void it("leaves pending rollback queryable when provider published-deploy read is unavailable", async () => {
      const fixture = await createRollbackFixture(db);
      await executeRollback({
        data: fixture.data,
        jobId: rollbackJobId(fixture.data),
        repository: createDrizzleRollbackRepository(db),
        siteHosting: new FakeRollbackHosting({
          status: "queued",
          providerDeployId: "restored-pending-deploy"
        })
      });

      const result = await reconcilePendingRollbacks({
        db,
        siteHosting: new FakeRollbackHosting({ status: "failed" }, new Error("provider unavailable"))
      });

      assert.deepEqual(result, {
        checked: 1,
        succeeded: 0,
        pending: 1,
        manualRequired: 0,
        staleNoop: 0
      });

      const [deployment] = await db.select().from(deployments).where(eq(deployments.id, fixture.deploymentId));
      assert.equal(deployment?.status, "rollback_pending");
      assert.equal(deployment?.providerOperationStatus, "recorded");
    });

    void it("keeps rollback pending when the original target deploy is still published", async () => {
      const fixture = await createRollbackFixture(db);
      await executeRollback({
        data: fixture.data,
        jobId: rollbackJobId(fixture.data),
        repository: createDrizzleRollbackRepository(db),
        siteHosting: new FakeRollbackHosting({
          status: "queued",
          providerDeployId: "restored-pending-deploy"
        })
      });

      const result = await reconcilePendingRollbacks({
        db,
        siteHosting: new FakeRollbackHosting({ status: "failed" }, providerSnapshot("bad-provider-deploy", "ready"))
      });

      assert.deepEqual(result, {
        checked: 1,
        succeeded: 0,
        pending: 1,
        manualRequired: 0,
        staleNoop: 0
      });

      const [deployment] = await db.select().from(deployments).where(eq(deployments.id, fixture.deploymentId));
      assert.equal(deployment?.status, "rollback_pending");
      assert.equal(deployment?.providerOperationStatus, "recorded");
      const rollbackEvidence = recordFromUnknown(recordFromUnknown(deployment?.evidenceJson).rollback);
      assert.equal(rollbackEvidence.status, "rollback_pending");
      assert.equal(rollbackEvidence.targetProviderDeployId, "bad-provider-deploy");
    });

    void it("marks pending rollback manual when a different deploy is published", async () => {
      const fixture = await createRollbackFixture(db);
      await executeRollback({
        data: fixture.data,
        jobId: rollbackJobId(fixture.data),
        repository: createDrizzleRollbackRepository(db),
        siteHosting: new FakeRollbackHosting({
          status: "queued",
          providerDeployId: "restored-pending-deploy"
        })
      });

      const result = await reconcilePendingRollbacks({
        db,
        siteHosting: new FakeRollbackHosting({ status: "failed" }, providerSnapshot("unexpected-deploy", "ready"))
      });

      assert.deepEqual(result, {
        checked: 1,
        succeeded: 0,
        pending: 0,
        manualRequired: 1,
        staleNoop: 0
      });

      const [deployment] = await db.select().from(deployments).where(eq(deployments.id, fixture.deploymentId));
      assert.equal(deployment?.status, "rollback_pending");
      assert.equal(deployment?.providerOperationStatus, "manual_reconciliation_required");
      const rollbackEvidence = recordFromUnknown(recordFromUnknown(deployment?.evidenceJson).rollback);
      assert.equal(rollbackEvidence.status, "manual_reconciliation_required");
      assert.equal(rollbackEvidence.manualReason, "published_identity_mismatch");
      assert.equal(rollbackEvidence.publishedProviderDeployId, "unexpected-deploy");
    });

    void it("does not re-post restore when a rollback job retries after pending state was recorded", async () => {
      const fixture = await createRollbackFixture(db);
      await executeRollback({
        data: fixture.data,
        jobId: rollbackJobId(fixture.data),
        repository: createDrizzleRollbackRepository(db),
        siteHosting: new FakeRollbackHosting({
          status: "queued",
          providerDeployId: "restored-pending-deploy"
        })
      });
      const retryHosting = new FakeRollbackHosting({ status: "completed", providerDeployId: "should-not-post" });

      const result = await executeRollback({
        data: fixture.data,
        jobId: rollbackJobId(fixture.data),
        repository: createDrizzleRollbackRepository(db),
        siteHosting: retryHosting
      });

      assert.equal(result.status, "rollback_pending");
      assert.equal(retryHosting.rollbackCalls.length, 0);
      assert.deepEqual(retryHosting.publishedDeployCalls, ["hosting-site-1"]);
    });

    void it("does not re-post restore when retry sees restore_in_flight evidence", async () => {
      const fixture = await createRollbackFixture(db);
      await db
        .update(rollbackPoints)
        .set({
          evidenceJson: {
            rollbackExecution: {
              status: "restore_in_flight",
              operationAttemptId: "attempt-restore-in-flight",
              rollbackPointId: fixture.rollbackPointId,
              sourceProviderDeployId: "previous-provider-deploy",
              targetProviderDeployId: "bad-provider-deploy",
              attemptedAt: new Date().toISOString()
            }
          }
        })
        .where(eq(rollbackPoints.id, fixture.rollbackPointId));
      const retryHosting = new FakeRollbackHosting({ status: "completed", providerDeployId: "should-not-post" });

      await assert.rejects(
        executeRollback({
          data: fixture.data,
          jobId: rollbackJobId(fixture.data),
          repository: createDrizzleRollbackRepository(db),
          siteHosting: retryHosting
        }),
        RollbackProviderPendingError
      );

      assert.equal(retryHosting.rollbackCalls.length, 0);
      assert.deepEqual(retryHosting.publishedDeployCalls, ["hosting-site-1"]);
    });

    void it("does not call the provider when the release plan is no longer rollback-eligible", async () => {
      const fixture = await createRollbackFixture(db);
      const hosting = new FakeRollbackHosting({
        status: "completed",
        providerDeployId: "previous-provider-deploy",
        liveUrl: "https://customer.example/"
      });
      await db
        .update(releasePlans)
        .set({
          status: "live",
          updatedAt: new Date()
        })
        .where(eq(releasePlans.id, fixture.releasePlanId));

      await assert.rejects(
        executeRollback({
          data: fixture.data,
          jobId: rollbackJobId(fixture.data),
          repository: createDrizzleRollbackRepository(db),
          siteHosting: hosting
        }),
        RollbackEvidenceError
      );

      assert.equal(hosting.rollbackCalls.length, 0);
    });

    void it("does not persist rolled_back when the target deployment changed after provider restore", async () => {
      const fixture = await createRollbackFixture(db);
      const repository = createDrizzleRollbackRepository(db);
      const racingRepository = {
        ...repository,
        async markRollbackSucceeded(input: Parameters<typeof repository.markRollbackSucceeded>[0]) {
          await db
            .update(deployments)
            .set({
              status: "deploying",
              updatedAt: new Date()
            })
            .where(eq(deployments.id, fixture.deploymentId));

          return repository.markRollbackSucceeded(input);
        }
      };

      await assert.rejects(
        executeRollback({
          data: fixture.data,
          jobId: rollbackJobId(fixture.data),
          repository: racingRepository,
          siteHosting: new FakeRollbackHosting({
            status: "completed",
            providerDeployId: "previous-provider-deploy",
            liveUrl: "https://customer.example/"
          })
        }),
        RollbackEvidenceError
      );

      const [deployment] = await db.select().from(deployments).where(eq(deployments.id, fixture.deploymentId));
      assert.equal(deployment?.status, "deploying");

      const [releasePlan] = await db.select().from(releasePlans).where(eq(releasePlans.id, fixture.releasePlanId));
      assert.equal(releasePlan?.status, "failed");

      const [rollbackPoint] = await db
        .select()
        .from(rollbackPoints)
        .where(eq(rollbackPoints.id, fixture.rollbackPointId));
      assert.equal(
        (recordFromUnknown(rollbackPoint?.evidenceJson).rollbackExecution as { status?: string } | undefined)?.status,
        "manual_reconciliation_required"
      );
      const rollbackExecution = recordFromUnknown(recordFromUnknown(rollbackPoint?.evidenceJson).rollbackExecution);
      assert.equal(rollbackExecution.manualReason, "completed_rollback_persistence_failed");
      assert.match(String(rollbackExecution.message), /Rollback target changed/u);
    });

    void it("updates only the deployment pinned in the rollback job", async () => {
      const fixture = await createRollbackFixture(db);
      const [newerDeployment] = await db
        .insert(deployments)
        .values({
          projectId: fixture.projectId,
          releasePlanId: fixture.releasePlanId,
          deploymentKey: `release_plan:${fixture.releasePlanId}:newer`,
          provider: "netlify",
          providerDeployId: "newer-bad-provider-deploy",
          providerOperationStatus: "recorded",
          liveUrl: "https://newer-bad.example/",
          status: "rollback_recommended",
          verificationStatus: "rollback_recommended"
        })
        .returning();
      assert.ok(newerDeployment);

      await executeRollback({
        data: fixture.data,
        jobId: rollbackJobId(fixture.data),
        repository: createDrizzleRollbackRepository(db),
        siteHosting: new FakeRollbackHosting({
          status: "completed",
          providerDeployId: "previous-provider-deploy",
          liveUrl: "https://customer.example/"
        })
      });

      const [targetDeployment] = await db.select().from(deployments).where(eq(deployments.id, fixture.deploymentId));
      const [untouchedDeployment] = await db.select().from(deployments).where(eq(deployments.id, newerDeployment.id));
      assert.equal(targetDeployment?.status, "rolled_back");
      assert.equal(untouchedDeployment?.status, "rollback_recommended");
    });

    void it("treats not-configured rollback results as terminal configuration errors", async () => {
      const fixture = await createRollbackFixture(db);

      await assert.rejects(
        executeRollback({
          data: fixture.data,
          jobId: rollbackJobId(fixture.data),
          repository: createDrizzleRollbackRepository(db),
          siteHosting: new FakeRollbackHosting({
            status: "failed",
            evidence: { adapter: "not_configured", status: "rollback_not_configured" }
          })
        }),
        RollbackConfigurationError
      );
    });

    void it("fails before provider rollback when rollback point lacks provider deploy evidence", async () => {
      const fixture = await createRollbackFixture(db, { providerDeployId: null });
      const hosting = new FakeRollbackHosting({
        status: "completed"
      });

      await assert.rejects(
        executeRollback({
          data: fixture.data,
          jobId: rollbackJobId(fixture.data),
          repository: createDrizzleRollbackRepository(db),
          siteHosting: hosting
        }),
        RollbackEvidenceError
      );

      assert.equal(hosting.rollbackCalls.length, 0);
    });
  }
);

async function createRollbackFixture(
  db: DatabaseClient,
  input: { providerDeployId?: string | null } = {}
): Promise<RollbackFixture> {
  const [customer] = await db.insert(customers).values({ name: "Rollback Customer" }).returning();
  assert.ok(customer);

  const [project] = await db
    .insert(projects)
    .values({
      customerId: customer.id,
      name: "Rollback Project"
    })
    .returning();
  assert.ok(project);

  await db.insert(mainWebsites).values({
    projectId: project.id,
    sourceUrl: "https://customer.example/",
    hostingSiteId: "hosting-site-1"
  });

  const [releasePlan] = await db
    .insert(releasePlans)
    .values({
      projectId: project.id,
      status: "failed",
      summary: "Release needs rollback.",
      riskLevel: "high",
      blockerCount: 1,
      warningCount: 0
    })
    .returning();
  assert.ok(releasePlan);

  const [deployment] = await db
    .insert(deployments)
    .values({
      projectId: project.id,
      releasePlanId: releasePlan.id,
      deploymentKey: `release_plan:${releasePlan.id}`,
      provider: "netlify",
      providerDeployId: "bad-provider-deploy",
      providerOperationStatus: "recorded",
      liveUrl: "https://bad.example/",
      status: "rollback_recommended",
      verificationStatus: "rollback_recommended",
      evidenceJson: {
        provider: { providerDeployId: "bad-provider-deploy" }
      }
    })
    .returning();
  assert.ok(deployment);

  const [sourceDeployment] = await db
    .insert(deployments)
    .values({
      projectId: project.id,
      releasePlanId: null,
      deploymentKey: `rollback_source:${releasePlan.id}`,
      provider: "netlify",
      providerDeployId: "previous-provider-deploy",
      providerOperationStatus: "recorded",
      liveUrl: "https://customer.example/",
      status: "live_healthy",
      verificationStatus: "live_healthy",
      evidenceJson: {
        provider: { providerDeployId: "previous-provider-deploy" }
      }
    })
    .returning();
  assert.ok(sourceDeployment);

  const [rollbackPoint] = await db
    .insert(rollbackPoints)
    .values({
      projectId: project.id,
      releasePlanId: releasePlan.id,
      deploymentId: sourceDeployment.id,
      artifactKey: `rollback/${releasePlan.id}/previous-stable.json`,
      providerDeployId: input.providerDeployId === undefined ? "previous-provider-deploy" : input.providerDeployId,
      liveUrl: "https://customer.example/",
      evidenceJson: {
        source: "integration_fixture"
      }
    })
    .returning();
  assert.ok(rollbackPoint);

  return {
    projectId: project.id,
    releasePlanId: releasePlan.id,
    deploymentId: deployment.id,
    rollbackPointId: rollbackPoint.id,
    data: {
      projectId: project.id,
      releasePlanId: releasePlan.id,
      deploymentId: deployment.id,
      rollbackPointId: rollbackPoint.id
    }
  };
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function providerSnapshot(providerDeployId: string, status: ProviderDeploySnapshot["status"]): ProviderDeploySnapshot {
  return {
    providerDeployId,
    status,
    liveUrls: ["https://customer.example/"],
    evidence: {
      adapter: "fake",
      source: "published_deploy"
    }
  };
}

class FakeRollbackHosting implements SiteHostingPort {
  readonly rollbackCalls: RollbackDeployInput[] = [];
  readonly publishedDeployCalls: string[] = [];

  constructor(
    private readonly result: RollbackDeployResult,
    private readonly publishedDeploy?:
      | ProviderDeploySnapshot
      | Error
      | (() => Promise<ProviderDeploySnapshot | undefined>)
  ) {}

  beginDeploy(): Promise<BeginDeployResult> {
    return Promise.reject(new Error("beginDeploy should not be called by rollback integration tests"));
  }

  uploadDeployFiles(): Promise<UploadDeployFilesResult> {
    return Promise.reject(new Error("uploadDeployFiles should not be called by rollback integration tests"));
  }

  createDeploy(): Promise<DeployReleaseResult> {
    return Promise.reject(new Error("createDeploy should not be called by rollback integration tests"));
  }

  getDeploy(input: { providerDeployId: string }): Promise<ProviderDeploySnapshot> {
    return Promise.resolve({
      providerDeployId: input.providerDeployId,
      status: "ready",
      liveUrls: ["https://customer.example/"]
    });
  }

  getPublishedDeploy(input: { hostingSiteId: string }): Promise<ProviderDeploySnapshot | undefined> {
    this.publishedDeployCalls.push(input.hostingSiteId);

    if (typeof this.publishedDeploy === "function") {
      return this.publishedDeploy();
    }

    if (this.publishedDeploy instanceof Error) {
      return Promise.reject(this.publishedDeploy);
    }

    return Promise.resolve(this.publishedDeploy);
  }

  restoreDeploy(): Promise<{ artifactKey: string }> {
    return Promise.resolve({ artifactKey: "unused" });
  }

  rollbackDeploy(input: RollbackDeployInput): Promise<RollbackDeployResult> {
    this.rollbackCalls.push(input);
    return Promise.resolve({
      evidence: { adapter: "fake", restored: this.result.status === "completed" },
      ...this.result
    });
  }
}
