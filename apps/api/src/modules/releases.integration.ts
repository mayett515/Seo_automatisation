import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { VerificationPort } from "@localseo/adapters";
import {
  ReleaseCheckSchema,
  ReleaseVerificationSchema,
  type ReleaseCheck,
  type ReleaseVerification
} from "@localseo/contracts";
import {
  customers,
  deployments,
  projects,
  releasePlanItems,
  releasePlans,
  releaseVerificationChecks,
  releaseVerifications,
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
  }
);

class FakeVerificationPort implements VerificationPort {
  mode: "healthy" | "rollback" | "throw" = "healthy";
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
        releasePlanId: input.releasePlanId,
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

async function createReleaseFixture(db: DatabaseClient, input: { projectName?: string } = {}): Promise<ReleaseFixture> {
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
      status: "live",
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
      providerDeployId: `deploy-${releasePlan.id}`,
      providerOperationStatus: "recorded",
      liveUrl: "https://deploy-1--customer.netlify.app/",
      status: "provider_succeeded",
      verificationStatus: "not_started",
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
