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
  createDrizzleRollbackRepository,
  executeRollback,
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
        "failed"
      );
      const rollbackExecution = recordFromUnknown(recordFromUnknown(rollbackPoint?.evidenceJson).rollbackExecution);
      assert.equal(rollbackExecution.providerResultStatus, "failed");
      assert.equal(rollbackExecution.providerDeployId, "previous-provider-deploy");
      assert.equal(rollbackExecution.liveUrl, null);
      assert.deepEqual(rollbackExecution.evidence, { adapter: "fake", restored: false });
    });

    void it("records pending provider rollback without retrying the restore mutation", async () => {
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
      assert.equal(deployment?.status, "rollback_recommended");

      const [rollbackPoint] = await db
        .select()
        .from(rollbackPoints)
        .where(eq(rollbackPoints.id, fixture.rollbackPointId));
      assert.equal(
        (recordFromUnknown(rollbackPoint?.evidenceJson).rollbackExecution as { status?: string } | undefined)?.status,
        "pending"
      );
      const rollbackExecution = recordFromUnknown(recordFromUnknown(rollbackPoint?.evidenceJson).rollbackExecution);
      assert.equal(rollbackExecution.providerResultStatus, "queued");
      assert.equal(rollbackExecution.providerDeployId, "restored-pending-deploy");
      assert.equal(rollbackExecution.liveUrl, null);
      assert.deepEqual(rollbackExecution.evidence, { adapter: "fake", accepted: true });
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
        "failed"
      );
      const rollbackExecution = recordFromUnknown(recordFromUnknown(rollbackPoint?.evidenceJson).rollbackExecution);
      assert.equal(rollbackExecution.providerResultStatus, "completed");
      assert.equal(rollbackExecution.providerDeployId, "previous-provider-deploy");
      assert.equal(rollbackExecution.liveUrl, "https://customer.example/");
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

  const [rollbackPoint] = await db
    .insert(rollbackPoints)
    .values({
      projectId: project.id,
      releasePlanId: releasePlan.id,
      deploymentId: deployment.id,
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

class FakeRollbackHosting implements SiteHostingPort {
  readonly rollbackCalls: RollbackDeployInput[] = [];

  constructor(private readonly result: RollbackDeployResult) {}

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
