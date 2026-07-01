import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type {
  BeginDeployResult,
  DeployReleaseResult,
  ObjectStoragePort,
  ProviderDeploySnapshot,
  RollbackDeployInput,
  RollbackDeployResult,
  SiteHostingPort,
  UploadDeployFilesResult
} from "@localseo/adapters";
import { ProviderRequestError } from "@localseo/adapters";
import type { DeploymentStatus, DeployJobData, ReleaseVerificationStatus } from "@localseo/contracts";
import {
  approvals,
  customers,
  deployments,
  mainWebsites,
  pageProposals,
  pageVersions,
  projects,
  releaseChecks,
  releasePlanItems,
  releasePlans,
  type DatabaseClient
} from "@localseo/db";
import { buildReleaseDeploymentKey } from "@localseo/domain";
import { eq } from "drizzle-orm";
import {
  createIntegrationTestDatabase,
  truncateIntegrationTables
} from "../../../../packages/db/test-support/integration-database.js";
import {
  ManualReconciliationRequiredError,
  createDrizzleDeployRepository,
  executeDeploy,
  reconcilePendingDeployments
} from "./deploy.js";

type IntegrationDatabase = Awaited<ReturnType<typeof createIntegrationTestDatabase>>;

type DeployFixture = {
  projectId: string;
  releasePlanId: string;
  deploymentKey: string;
  data: DeployJobData;
};

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = Boolean(testDatabaseUrl);

void describe(
  "deploy worker database integration",
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

    void it("persists provider success and keeps provider success separate from live health", async () => {
      const fixture = await createDeployFixture(db);
      const hosting = new StatefulSiteHosting({
        snapshots: [providerSnapshot("provider-deploy-1", "ready")]
      });

      const result = await executeDeploy({
        data: fixture.data,
        jobId: fixture.deploymentKey,
        objectStorage: new MemoryObjectStorage(),
        repository: createDrizzleDeployRepository(db),
        siteHosting: hosting
      });

      assert.equal(result.status, "provider_succeeded");
      assert.equal(hosting.beginCalls.length, 1);
      assert.equal(hosting.uploadCalls.length, 1);

      const deployment = await selectDeployment(db, fixture.deploymentKey);
      assert.equal(deployment?.status, "provider_succeeded");
      assert.equal(deployment?.verificationStatus, "not_started");
      assert.equal(deployment?.providerOperationStatus, "recorded");
      assert.equal(deployment?.providerDeployId, "provider-deploy-1");

      const [releasePlan] = await db.select().from(releasePlans).where(eq(releasePlans.id, fixture.releasePlanId));
      assert.equal(releasePlan?.status, "live");
    });

    void it("allows deploys without rollback evidence when prior deployments are unsafe rollback sources", async () => {
      const fixture = await createDeployFixture(db);
      await insertPriorDeployment(db, fixture, {
        status: "rollback_recommended",
        verificationStatus: "rollback_recommended",
        providerDeployId: "prior-bad-provider"
      });
      await insertPriorDeployment(db, fixture, {
        status: "verifying",
        verificationStatus: "running",
        providerDeployId: "prior-verifying-provider"
      });
      const hosting = new StatefulSiteHosting({
        snapshots: [providerSnapshot("provider-deploy-1", "ready")]
      });

      const result = await executeDeploy({
        data: fixture.data,
        jobId: fixture.deploymentKey,
        objectStorage: new MemoryObjectStorage(),
        repository: createDrizzleDeployRepository(db),
        siteHosting: hosting
      });

      assert.equal(result.status, "provider_succeeded");
      assert.equal(hosting.beginCalls.length, 1);
      assert.equal(hosting.uploadCalls.length, 1);

      const deployment = await selectDeployment(db, fixture.deploymentKey);
      assert.equal(deployment?.status, "provider_succeeded");
    });

    void it("does not overwrite manual reconciliation rows on retry", async () => {
      const fixture = await createDeployFixture(db);
      await insertDeployment(db, fixture, {
        providerDeployId: null,
        providerOperationStatus: "manual_reconciliation_required",
        status: "deploying"
      });
      const hosting = new StatefulSiteHosting();

      await assert.rejects(
        executeDeploy({
          data: fixture.data,
          jobId: fixture.deploymentKey,
          objectStorage: new MemoryObjectStorage(),
          repository: createDrizzleDeployRepository(db),
          siteHosting: hosting
        }),
        ManualReconciliationRequiredError
      );

      const deployment = await selectDeployment(db, fixture.deploymentKey);
      assert.equal(deployment?.status, "deploying");
      assert.equal(deployment?.providerOperationStatus, "manual_reconciliation_required");
      assert.equal(hosting.beginCalls.length, 0);
    });

    void it("escalates in-flight provider mutations without provider ids to manual reconciliation", async () => {
      const fixture = await createDeployFixture(db);
      await insertDeployment(db, fixture, {
        providerDeployId: null,
        providerOperationStatus: "in_flight",
        status: "deploying"
      });
      const hosting = new StatefulSiteHosting();

      await assert.rejects(
        executeDeploy({
          data: fixture.data,
          jobId: fixture.deploymentKey,
          objectStorage: new MemoryObjectStorage(),
          repository: createDrizzleDeployRepository(db),
          siteHosting: hosting
        }),
        ManualReconciliationRequiredError
      );

      const deployment = await selectDeployment(db, fixture.deploymentKey);
      assert.equal(deployment?.status, "deploying");
      assert.equal(deployment?.providerOperationStatus, "manual_reconciliation_required");
      assert.equal(hosting.beginCalls.length, 0);
    });

    void it("resumes uploads from persisted provider evidence without starting another deploy", async () => {
      const fixture = await createDeployFixture(db);
      await insertDeployment(db, fixture, {
        providerDeployId: "provider-deploy-1",
        providerOperationStatus: "recorded",
        status: "deploying",
        evidenceJson: {
          provider: {
            status: "started",
            providerDeployId: "provider-deploy-1",
            resumeToken: { adapter: "test", required: ["digest-a"] }
          }
        }
      });
      const hosting = new StatefulSiteHosting({
        snapshots: [providerSnapshot("provider-deploy-1", "pending"), providerSnapshot("provider-deploy-1", "ready")]
      });

      const result = await executeDeploy({
        data: fixture.data,
        jobId: fixture.deploymentKey,
        objectStorage: new MemoryObjectStorage(),
        repository: createDrizzleDeployRepository(db),
        siteHosting: hosting
      });

      assert.equal(result.status, "provider_succeeded");
      assert.equal(hosting.beginCalls.length, 0);
      assert.equal(hosting.uploadCalls.length, 1);
      assert.deepEqual(hosting.uploadCalls[0]?.resumeToken, { adapter: "test", required: ["digest-a"] });

      const deployment = await selectDeployment(db, fixture.deploymentKey);
      assert.equal(deployment?.status, "provider_succeeded");
      assert.equal(deployment?.providerDeployId, "provider-deploy-1");
    });

    void it("reconciler skips manual rows that already have provider deploy ids", async () => {
      const autoFixture = await createDeployFixture(db, { projectName: "Auto" });
      const manualFixture = await createDeployFixture(db, { projectName: "Manual" });
      await insertDeployment(db, autoFixture, {
        providerDeployId: "provider-auto",
        providerOperationStatus: "recorded",
        status: "deploying"
      });
      await insertDeployment(db, manualFixture, {
        providerDeployId: "provider-manual",
        providerOperationStatus: "manual_reconciliation_required",
        status: "deploying"
      });
      const hosting = new StatefulSiteHosting({
        snapshots: [providerSnapshot("provider-auto", "ready")]
      });

      const result = await reconcilePendingDeployments({
        db,
        siteHosting: hosting,
        limit: 10
      });

      assert.deepEqual(result, { checked: 1, succeeded: 1, pending: 0, failed: 0 });
      assert.deepEqual(hosting.getDeployCalls, ["provider-auto"]);

      const manualDeployment = await selectDeployment(db, manualFixture.deploymentKey);
      assert.equal(manualDeployment?.status, "deploying");
      assert.equal(manualDeployment?.providerOperationStatus, "manual_reconciliation_required");
    });

    void it("markFailed cannot overwrite manual reconciliation rows", async () => {
      const fixture = await createDeployFixture(db);
      await insertDeployment(db, fixture, {
        providerDeployId: null,
        providerOperationStatus: "manual_reconciliation_required",
        status: "deploying"
      });

      await createDrizzleDeployRepository(db).markFailed(fixture.data, new Error("final attempt failed"));

      const deployment = await selectDeployment(db, fixture.deploymentKey);
      assert.equal(deployment?.status, "deploying");
      assert.equal(deployment?.providerOperationStatus, "manual_reconciliation_required");

      const [releasePlan] = await db.select().from(releasePlans).where(eq(releasePlans.id, fixture.releasePlanId));
      assert.equal(releasePlan?.status, "approved_for_deploy");
    });

    void it("keeps pending provider deploys reconcilable", async () => {
      const fixture = await createDeployFixture(db);
      await insertDeployment(db, fixture, {
        providerDeployId: "provider-pending",
        providerOperationStatus: "recorded",
        status: "deploying"
      });
      const hosting = new StatefulSiteHosting({
        snapshots: [providerSnapshot("provider-pending", "pending")]
      });

      const result = await reconcilePendingDeployments({
        db,
        siteHosting: hosting,
        limit: 10
      });

      assert.deepEqual(result, { checked: 1, succeeded: 0, pending: 1, failed: 0 });
      assert.deepEqual(hosting.getDeployCalls, ["provider-pending"]);

      const deployment = await selectDeployment(db, fixture.deploymentKey);
      assert.equal(deployment?.status, "deploying");
      assert.equal(deployment?.providerOperationStatus, "recorded");
      assert.equal(deployment?.providerDeployId, "provider-pending");
    });

    void it("keeps provider read failures reconcilable during pending deployment reconciliation", async () => {
      const fixture = await createDeployFixture(db);
      await insertDeployment(db, fixture, {
        providerDeployId: "provider-timeout",
        providerOperationStatus: "recorded",
        status: "deploying"
      });
      const hosting = new StatefulSiteHosting({
        getDeployError: new ProviderRequestError({
          provider: "netlify",
          operation: "GET /deploys/provider-timeout",
          reasonCode: "timeout"
        })
      });

      const result = await reconcilePendingDeployments({
        db,
        siteHosting: hosting,
        limit: 10
      });

      assert.deepEqual(result, { checked: 1, succeeded: 0, pending: 1, failed: 0 });
      assert.deepEqual(hosting.getDeployCalls, ["provider-timeout"]);

      const deployment = await selectDeployment(db, fixture.deploymentKey);
      assert.equal(deployment?.status, "deploying");
      assert.equal(deployment?.providerOperationStatus, "recorded");
      assert.equal(deployment?.providerDeployId, "provider-timeout");
    });

    void it("surfaces unexpected pending-deploy reconciliation errors without marking deployments failed", async () => {
      const fixture = await createDeployFixture(db);
      await insertDeployment(db, fixture, {
        providerDeployId: "provider-bug",
        providerOperationStatus: "recorded",
        status: "deploying"
      });
      const hosting = new StatefulSiteHosting({
        getDeployError: new Error("unexpected reconciler bug")
      });

      await assert.rejects(
        reconcilePendingDeployments({
          db,
          siteHosting: hosting,
          limit: 10
        }),
        /unexpected reconciler bug/u
      );

      assert.deepEqual(hosting.getDeployCalls, ["provider-bug"]);

      const deployment = await selectDeployment(db, fixture.deploymentKey);
      assert.equal(deployment?.status, "deploying");
      assert.equal(deployment?.providerOperationStatus, "recorded");
      assert.equal(deployment?.providerDeployId, "provider-bug");
    });
  }
);

async function createDeployFixture(db: DatabaseClient, input: { projectName?: string } = {}): Promise<DeployFixture> {
  const [customer] = await db
    .insert(customers)
    .values({ name: `${input.projectName ?? "Deploy"} Customer` })
    .returning();
  assert.ok(customer);

  const [project] = await db
    .insert(projects)
    .values({
      customerId: customer.id,
      name: input.projectName ?? "Deploy Project"
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
      status: "approved_for_deploy",
      summary: "Approved release plan.",
      riskLevel: "low",
      blockerCount: 0,
      warningCount: 0,
      approvedAt: new Date()
    })
    .returning();
  assert.ok(releasePlan);

  const [proposal] = await db
    .insert(pageProposals)
    .values({
      projectId: project.id,
      route: "/dachreinigung/",
      primaryKeyword: "Dachreinigung",
      uniquenessRationale: "Local service page.",
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
      approvedAt: new Date(),
      pageJson: {
        title: "Dachreinigung",
        description: "Dachreinigung vor Ort.",
        canonical: "https://customer.example/dachreinigung/"
      }
    })
    .returning();
  assert.ok(pageVersion);

  await db.insert(approvals).values({
    pageVersionId: pageVersion.id,
    releasePlanId: releasePlan.id,
    status: "approved",
    decidedAt: new Date()
  });

  await db.insert(releaseChecks).values({
    releasePlanId: releasePlan.id,
    scope: "project",
    checkKey: "preflight_check",
    severity: "blocker",
    result: "passed",
    message: "Release preflight passed."
  });

  await db.insert(releasePlanItems).values({
    releasePlanId: releasePlan.id,
    pageVersionId: pageVersion.id,
    targetUrl: "/dachreinigung/",
    action: "publish",
    status: "approved"
  });

  const deploymentKey = buildReleaseDeploymentKey(releasePlan.id);
  const data: DeployJobData = {
    projectId: project.id,
    releasePlanId: releasePlan.id,
    deploymentKey
  };

  return {
    projectId: project.id,
    releasePlanId: releasePlan.id,
    deploymentKey,
    data
  };
}

async function insertDeployment(
  db: DatabaseClient,
  fixture: DeployFixture,
  input: {
    providerDeployId: string | null;
    providerOperationStatus: "not_started" | "in_flight" | "recorded" | "failed" | "manual_reconciliation_required";
    status: DeploymentStatus;
    verificationStatus?: ReleaseVerificationStatus;
    evidenceJson?: Record<string, unknown>;
  }
): Promise<void> {
  await db.insert(deployments).values({
    projectId: fixture.projectId,
    releasePlanId: fixture.releasePlanId,
    deploymentKey: fixture.deploymentKey,
    provider: "netlify",
    providerDeployId: input.providerDeployId,
    providerOperationStatus: input.providerOperationStatus,
    status: input.status,
    verificationStatus: input.verificationStatus,
    evidenceJson: input.evidenceJson ?? { source: "integration_fixture" }
  });
}

async function insertPriorDeployment(
  db: DatabaseClient,
  fixture: DeployFixture,
  input: {
    providerDeployId: string;
    status: DeploymentStatus;
    verificationStatus: ReleaseVerificationStatus;
  }
): Promise<void> {
  const [priorReleasePlan] = await db
    .insert(releasePlans)
    .values({
      projectId: fixture.projectId,
      status: "failed",
      summary: "Prior release plan.",
      riskLevel: "low",
      blockerCount: 0,
      warningCount: 0
    })
    .returning();
  assert.ok(priorReleasePlan);

  await db.insert(deployments).values({
    projectId: fixture.projectId,
    releasePlanId: priorReleasePlan.id,
    deploymentKey: buildReleaseDeploymentKey(priorReleasePlan.id),
    provider: "netlify",
    providerDeployId: input.providerDeployId,
    providerOperationStatus: "recorded",
    liveUrl: "https://customer.example/",
    status: input.status,
    verificationStatus: input.verificationStatus,
    evidenceJson: { source: "prior_deployment_fixture" }
  });
}

async function selectDeployment(db: DatabaseClient, deploymentKey: string) {
  const [deployment] = await db.select().from(deployments).where(eq(deployments.deploymentKey, deploymentKey));
  return deployment;
}

function providerSnapshot(providerDeployId: string, status: ProviderDeploySnapshot["status"]): ProviderDeploySnapshot {
  return {
    providerDeployId,
    status,
    liveUrls: ["https://customer.example/"],
    evidence: { state: status }
  };
}

class MemoryObjectStorage implements ObjectStoragePort {
  readonly values = new Map<string, unknown>();

  putJson(input: { key: string; value: unknown }): Promise<{ key: string }> {
    this.values.set(input.key, input.value);
    return Promise.resolve({ key: input.key });
  }

  getJson(input: { key: string }): Promise<unknown> {
    return Promise.resolve(this.values.get(input.key));
  }
}

class StatefulSiteHosting implements SiteHostingPort {
  readonly beginCalls: Array<Parameters<SiteHostingPort["beginDeploy"]>[0]> = [];
  readonly uploadCalls: Array<Parameters<SiteHostingPort["uploadDeployFiles"]>[0]> = [];
  readonly getDeployCalls: string[] = [];
  private readonly snapshots: ProviderDeploySnapshot[];
  private readonly getDeployError: Error | undefined;

  constructor(input: { snapshots?: ProviderDeploySnapshot[]; getDeployError?: Error } = {}) {
    this.snapshots = [...(input.snapshots ?? [providerSnapshot("provider-deploy-1", "ready")])];
    this.getDeployError = input.getDeployError;
  }

  beginDeploy(input: Parameters<SiteHostingPort["beginDeploy"]>[0]): Promise<BeginDeployResult> {
    this.beginCalls.push(input);
    return Promise.resolve({
      status: "started",
      providerDeployId: "provider-deploy-1",
      liveUrls: ["https://customer.example/"],
      resumeToken: { adapter: "test", required: ["digest-a"] },
      evidence: { adapter: "stateful-test" }
    });
  }

  uploadDeployFiles(input: Parameters<SiteHostingPort["uploadDeployFiles"]>[0]): Promise<UploadDeployFilesResult> {
    this.uploadCalls.push(input);
    return Promise.resolve({ evidence: { uploaded: true } });
  }

  createDeploy(): Promise<DeployReleaseResult> {
    return Promise.reject(new Error("createDeploy should not be used by phased deploy integration tests"));
  }

  getDeploy(input: { providerDeployId: string }): Promise<ProviderDeploySnapshot> {
    this.getDeployCalls.push(input.providerDeployId);
    if (this.getDeployError) {
      return Promise.reject(this.getDeployError);
    }

    return Promise.resolve(this.snapshots.shift() ?? providerSnapshot(input.providerDeployId, "ready"));
  }

  getPublishedDeploy(): Promise<ProviderDeploySnapshot | undefined> {
    return Promise.resolve(providerSnapshot("provider-deploy-1", "ready"));
  }

  restoreDeploy(): Promise<{ artifactKey: string }> {
    return Promise.resolve({ artifactKey: "unused" });
  }

  rollbackDeploy(input: RollbackDeployInput): Promise<RollbackDeployResult> {
    return Promise.resolve({
      status: "failed",
      providerDeployId: input.providerDeployId,
      evidence: { unused: true }
    });
  }
}
