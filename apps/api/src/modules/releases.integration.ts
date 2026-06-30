import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { VerificationPort } from "@localseo/adapters";
import {
  ReleaseCheckSchema,
  ReleaseVerificationSchema,
  type DeploymentStatus,
  type ReleaseCheck,
  type ReleasePlanStatus,
  type ReleaseVerification,
  type ReleaseVerificationStatus
} from "@localseo/contracts";
import {
  customers,
  deployments,
  jobRuns,
  pageProposals,
  pageVersions,
  projects,
  projectTrackingKeys,
  releasePlanItems,
  releasePlans,
  releaseVerificationChecks,
  releaseVerifications,
  rollbackPoints,
  type DatabaseClient
} from "@localseo/db";
import { and, eq } from "drizzle-orm";
import { QueueProducerService } from "../queue-producer.js";
import { DatabaseService } from "../database/database.service.js";
import { ReleasesService } from "./releases.module.js";
import {
  createIntegrationTestDatabase,
  truncateIntegrationTables
} from "../../../../packages/db/test-support/integration-database.js";

type IntegrationDatabase = Awaited<ReturnType<typeof createIntegrationTestDatabase>>;

type ReleaseFixture = {
  projectId: string;
  releasePlanId: string;
  deploymentId: string;
};

type PreflightRollbackFixture = {
  projectId: string;
  releasePlanId: string;
  previousDeploymentId: string;
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
    let verifier: FakeVerificationPort;
    let service: ReleasesService;

    before(async () => {
      assert.ok(testDatabaseUrl);
      handle = await createIntegrationTestDatabase(testDatabaseUrl);
      db = handle.db;
    });

    beforeEach(async () => {
      await truncateIntegrationTables(handle.sql);
      verifier = new FakeVerificationPort();
      service = new ReleasesService({} as QueueProducerService, testDatabaseService(db), verifier);
    });

    after(async () => {
      await handle?.close();
    });

    void it("persists healthy verification evidence and projects the release plan as live", async () => {
      const fixture = await createReleaseFixture(db);
      verifier.mode = "healthy";

      const result = await service.verify(fixture.projectId, fixture.releasePlanId, {});

      assert.equal(result.verificationStatus, "live_healthy");
      assert.deepEqual(verifier.requests[0]?.liveUrls, ["https://customer.example/dachreinigung/"]);

      const [verification] = await db
        .select()
        .from(releaseVerifications)
        .where(eq(releaseVerifications.deploymentId, fixture.deploymentId));
      assert.equal(verification?.status, "live_healthy");

      const checks = await db
        .select()
        .from(releaseVerificationChecks)
        .where(eq(releaseVerificationChecks.verificationId, verification?.id ?? ""));
      assert.equal(checks.length, 1);
      assert.equal(checks[0]?.checkKey, "http_status_check");
      assert.equal(checks[0]?.result, "passed");

      const [deployment] = await db.select().from(deployments).where(eq(deployments.id, fixture.deploymentId));
      assert.equal(deployment?.status, "live_healthy");
      assert.equal(deployment?.verificationStatus, "live_healthy");

      const [releasePlan] = await db.select().from(releasePlans).where(eq(releasePlans.id, fixture.releasePlanId));
      assert.equal(releasePlan?.status, "live");
    });

    void it("persists rollback recommendation details while projecting the release plan as failed", async () => {
      const fixture = await createReleaseFixture(db);
      verifier.mode = "rollback";

      const result = await service.verify(fixture.projectId, fixture.releasePlanId, {});

      assert.equal(result.verificationStatus, "rollback_recommended");

      const [deployment] = await db.select().from(deployments).where(eq(deployments.id, fixture.deploymentId));
      assert.equal(deployment?.status, "rollback_recommended");
      assert.equal(deployment?.verificationStatus, "rollback_recommended");

      const [releasePlan] = await db.select().from(releasePlans).where(eq(releasePlans.id, fixture.releasePlanId));
      assert.equal(releasePlan?.status, "failed");

      const [verification] = await db
        .select()
        .from(releaseVerifications)
        .where(eq(releaseVerifications.deploymentId, fixture.deploymentId));
      const checks = await db
        .select()
        .from(releaseVerificationChecks)
        .where(eq(releaseVerificationChecks.verificationId, verification?.id ?? ""));

      assert.equal(verification?.status, "rollback_recommended");
      assert.equal(checks[0]?.checkKey, "canonical_trailing_slash_check");
      assert.equal(checks[0]?.severity, "blocker");
      assert.equal(checks[0]?.result, "failed");
      assert.equal(checks[0]?.targetUrl, "https://customer.example/dachreinigung/");
    });

    void it("persists failed verification evidence when the verifier throws", async () => {
      const fixture = await createReleaseFixture(db);
      verifier.mode = "throw";

      const result = await service.verify(fixture.projectId, fixture.releasePlanId, {});

      assert.equal(result.verificationStatus, "failed");

      const [deployment] = await db.select().from(deployments).where(eq(deployments.id, fixture.deploymentId));
      assert.equal(deployment?.status, "failed");
      assert.equal(deployment?.verificationStatus, "failed");

      const [verification] = await db
        .select()
        .from(releaseVerifications)
        .where(eq(releaseVerifications.deploymentId, fixture.deploymentId));
      const checks = await db
        .select()
        .from(releaseVerificationChecks)
        .where(eq(releaseVerificationChecks.verificationId, verification?.id ?? ""));

      assert.equal(verification?.status, "failed");
      assert.equal(checks[0]?.checkKey, "verification_execution_check");
      assert.equal(checks[0]?.result, "failed");
      assert.notEqual(deployment?.status, "verifying");
      assert.notEqual(deployment?.verificationStatus, "running");
    });

    void it("rejects verification for a release plan outside the project scope", async () => {
      const projectA = await createReleaseFixture(db, { projectName: "Project A" });
      const projectB = await createReleaseFixture(db, { projectName: "Project B" });

      await assert.rejects(
        () => service.verify(projectA.projectId, projectB.releasePlanId, {}),
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

    void it("persists the scoped release plan id instead of adapter-returned identity", async () => {
      const scoped = await createReleaseFixture(db, { projectName: "Scoped Project" });
      const other = await createReleaseFixture(db, { projectName: "Other Project" });
      verifier.releasePlanIdOverride = other.releasePlanId;

      const result = await service.verify(scoped.projectId, scoped.releasePlanId, {});

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
        () => service.verify(projectA.projectId, projectA.releasePlanId, { deploymentId: projectB.deploymentId }),
        /No provider-succeeded deployment is available for verification/u
      );

      const rows = await db
        .select()
        .from(releaseVerifications)
        .where(eq(releaseVerifications.deploymentId, projectB.deploymentId));

      assert.equal(rows.length, 0);
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
      service = new ReleasesService(queueService, testDatabaseService(db), verifier);

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
      service = new ReleasesService(queueService, testDatabaseService(db), verifier);

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
      service = new ReleasesService(queueService, testDatabaseService(db), verifier);

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
      service = new ReleasesService(queueService, testDatabaseService(db), verifier);

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
      service = new ReleasesService(queueService, testDatabaseService(db), verifier);

      await assert.rejects(
        () => service.executeRollback(fixture.projectId, fixture.releasePlanId, undefined, { rollbackPointId }),
        /Rollback point is missing provider deploy evidence/u
      );

      assert.equal(queue.addCalls.length, 0);
    });

    void it("preflight prepares a provider-backed rollback point from the latest restorable deployment", async () => {
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
  }
);

class FakeVerificationPort implements VerificationPort {
  mode: "healthy" | "rollback" | "throw" = "healthy";
  releasePlanIdOverride: string | undefined;
  readonly requests: Array<{
    releasePlanId: string;
    deploymentId?: string;
    liveUrls: string[];
    trackingExpected?: boolean;
  }> = [];

  verifyRelease(input: {
    releasePlanId: string;
    deploymentId?: string;
    liveUrls: string[];
    trackingExpected?: boolean;
  }): Promise<ReleaseVerification> {
    this.requests.push(input);

    if (this.mode === "throw") {
      return Promise.reject(new Error("verifier network failure"));
    }

    const check =
      this.mode === "rollback"
        ? releaseCheck({
            checkKey: "canonical_trailing_slash_check",
            scope: "page",
            severity: "blocker",
            result: "failed",
            message: "Canonical URL does not match the intended live route.",
            evidence: {
              targetUrl: input.liveUrls[0],
              expected: { canonicalUrl: input.liveUrls[0] },
              observed: { canonicalUrl: "https://customer.example/" }
            }
          })
        : releaseCheck({
            checkKey: "http_status_check",
            scope: "domain",
            severity: "blocker",
            result: "passed",
            message: "Live route returned a successful HTTP response.",
            evidence: {
              targetUrl: input.liveUrls[0],
              observed: { statusCode: 200 }
            }
          });

    return Promise.resolve(
      ReleaseVerificationSchema.parse({
        releasePlanId: this.releasePlanIdOverride ?? input.releasePlanId,
        deploymentId: input.deploymentId,
        verificationStatus: this.mode === "rollback" ? "rollback_recommended" : "live_healthy",
        summary:
          this.mode === "rollback" ? "Post-deploy verification found blockers." : "Post-deploy verification passed.",
        checkedAt: "2026-06-30T12:00:00.000Z",
        checks: [check]
      })
    );
  }
}

async function createReleaseFixture(
  db: DatabaseClient,
  input: {
    projectName?: string;
    releasePlanStatus?: ReleasePlanStatus;
    deploymentStatus?: DeploymentStatus;
    verificationStatus?: ReleaseVerificationStatus;
    providerDeployId?: string | null;
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
    targetUrl: "/dachreinigung/",
    action: "publish",
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

async function createPreflightRollbackFixture(
  db: DatabaseClient,
  input: { previousProviderDeployId?: string | null } = {}
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
      status: "live_healthy",
      verificationStatus: "live_healthy",
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
      pageJson: {
        title: "Dachreinigung Muenchen",
        metaDescription: "Lokale Dachreinigung in Muenchen.",
        h1: "Dachreinigung in Muenchen",
        canonical: "https://customer.example/dachreinigung/",
        jsonLd: { "@type": "LocalBusiness" },
        areaServed: ["Muenchen"],
        internalLinks: ["/dachreinigung/"],
        localFaq: [{ question: "Wie schnell?", answer: "Nach Absprache." }],
        cta: { label: "Anfragen" },
        robots: "noindex,nofollow",
        sitemapReady: true
      }
    })
    .returning();
  assert.ok(pageVersion);

  await db.insert(releasePlanItems).values({
    releasePlanId: releasePlan.id,
    pageVersionId: pageVersion.id,
    targetUrl: "/dachreinigung/",
    action: "publish",
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
    previousDeploymentId: previousDeployment.id
  };
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

function releaseCheck(input: ReleaseCheck): ReleaseCheck {
  return ReleaseCheckSchema.parse(input);
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

class FakeQueue {
  readonly addCalls: QueueAddCall[] = [];
  private existingJob: FakeJob | undefined;

  getJob(): Promise<FakeJob | undefined> {
    return Promise.resolve(this.existingJob);
  }

  add(
    name: string,
    data: Record<string, unknown>,
    options: Record<string, unknown>
  ): Promise<{ id: string | undefined }> {
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
