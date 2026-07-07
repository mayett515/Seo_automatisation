import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SearchConsolePort, TokenCipher, VerificationPort } from "@localseo/adapters";
import {
  ReleaseCheckSchema,
  ReleaseVerificationSchema,
  type PageJson,
  type ReleaseVerificationJobData,
  type DeploymentStatus,
  type GscOAuthIntent,
  type GscPropertyList,
  type GscSearchAnalyticsRow,
  type GscSitemapSubmission,
  type GscUrlInspectionResult,
  type ReleaseCheck,
  type ReleasePlanStatus,
  type ReleaseVerification,
  type ReleaseVerificationStatus
} from "@localseo/contracts";
import {
  customers,
  deployments,
  gscConnections,
  pageVersions,
  pageProposals,
  projects,
  releasePlanItems,
  releasePlans,
  releaseVerificationChecks,
  releaseVerifications,
  type DatabaseClient
} from "@localseo/db";
import { eq } from "drizzle-orm";
import { executeReleaseVerification, ReleaseVerificationEvidenceError } from "./release-verification.js";
import {
  createIntegrationTestDatabase,
  truncateIntegrationTables
} from "../../../../packages/db/test-support/integration-database.js";

type IntegrationDatabase = Awaited<ReturnType<typeof createIntegrationTestDatabase>>;

type VerificationFixture = {
  projectId: string;
  releasePlanId: string;
  deploymentId: string;
  verificationId: string;
  data: ReleaseVerificationJobData;
};

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = Boolean(testDatabaseUrl);

void describe(
  "release verification worker integration",
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

    void it("persists healthy verification checks and projects live truth", async () => {
      const fixture = await createVerificationFixture(db, { releasePlanStatus: "deploying" });
      const verifier = new FakeVerificationPort();

      const result = await executeReleaseVerification({
        data: fixture.data,
        db,
        dependencies: { verification: verifier },
        isFinalAttempt: true
      });

      assert.equal(result.status, "completed");
      assert.equal(result.verificationStatus, "live_healthy");
      assert.deepEqual(verifier.requests[0]?.liveUrls, ["https://customer.example/dachreinigung/"]);

      const [verification] = await db
        .select()
        .from(releaseVerifications)
        .where(eq(releaseVerifications.id, fixture.verificationId));
      assert.equal(verification?.status, "live_healthy");
      assert.deepEqual(verification?.evidenceJson, { source: "release_verify_worker", checkCount: 2 });

      const checks = await db
        .select()
        .from(releaseVerificationChecks)
        .where(eq(releaseVerificationChecks.verificationId, fixture.verificationId));
      assert.equal(checks.length, 2);
      assert.equal(checks.find((check) => check.checkKey === "http_status_check")?.result, "passed");
      assert.equal(checks.find((check) => check.checkKey === "gsc_connection_check")?.result, "skipped");

      const [deployment] = await db.select().from(deployments).where(eq(deployments.id, fixture.deploymentId));
      assert.equal(deployment?.status, "live_healthy");
      assert.equal(deployment?.verificationStatus, "live_healthy");
      assert.equal(deployment?.verifiedAt?.toISOString(), "2026-06-30T12:00:00.000Z");

      const [releasePlan] = await db.select().from(releasePlans).where(eq(releasePlans.id, fixture.releasePlanId));
      assert.equal(releasePlan?.status, "live");
      assert.equal(releasePlan?.deployedAt?.toISOString(), "2026-06-30T12:00:00.000Z");
    });

    void it("keeps GSC handoff failures warning-level and projects live_with_warnings", async () => {
      const fixture = await createVerificationFixture(db, { releasePlanStatus: "deploying" });
      await db.insert(gscConnections).values({
        projectId: fixture.projectId,
        propertyUrl: "https://customer.example/",
        status: "connected",
        encryptedRefreshToken: "encrypted-refresh",
        connectedAt: new Date("2026-06-30T10:00:00.000Z")
      });
      const searchConsole = new FakeSearchConsole();
      searchConsole.submitError = new Error("gsc unavailable");

      const result = await executeReleaseVerification({
        data: fixture.data,
        db,
        dependencies: {
          verification: new FakeVerificationPort(),
          searchConsole,
          tokenCipher: new FakeTokenCipher()
        },
        isFinalAttempt: true
      });

      assert.equal(result.verificationStatus, "live_with_warnings");

      const checks = await db
        .select()
        .from(releaseVerificationChecks)
        .where(eq(releaseVerificationChecks.verificationId, fixture.verificationId));
      const gscSitemapCheck = checks.find((check) => check.checkKey === "gsc_sitemap_submission_check");
      assert.equal(gscSitemapCheck?.severity, "warning");
      assert.equal(gscSitemapCheck?.result, "failed");

      const [deployment] = await db.select().from(deployments).where(eq(deployments.id, fixture.deploymentId));
      assert.equal(deployment?.status, "live_with_warnings");
      assert.equal(deployment?.verificationStatus, "live_with_warnings");

      const [releasePlan] = await db.select().from(releasePlans).where(eq(releasePlans.id, fixture.releasePlanId));
      assert.equal(releasePlan?.status, "live");
    });

    void it("retries verifier infrastructure errors before terminal projection", async () => {
      const fixture = await createVerificationFixture(db, { releasePlanStatus: "deploying" });
      const verifier = new FakeVerificationPort();
      verifier.mode = "throw";

      await assert.rejects(
        () =>
          executeReleaseVerification({
            data: fixture.data,
            db,
            dependencies: { verification: verifier },
            isFinalAttempt: false
          }),
        /verifier network failure/u
      );

      const [verification] = await db
        .select()
        .from(releaseVerifications)
        .where(eq(releaseVerifications.id, fixture.verificationId));
      assert.equal(verification?.status, "running");
    });

    void it("persists execution_failed on the final verifier infrastructure attempt", async () => {
      const fixture = await createVerificationFixture(db, { releasePlanStatus: "deploying" });
      const verifier = new FakeVerificationPort();
      verifier.mode = "throw";

      const result = await executeReleaseVerification({
        data: fixture.data,
        db,
        dependencies: { verification: verifier },
        isFinalAttempt: true
      });

      assert.equal(result.verificationStatus, "execution_failed");

      const [deployment] = await db.select().from(deployments).where(eq(deployments.id, fixture.deploymentId));
      assert.equal(deployment?.status, "provider_succeeded");
      assert.equal(deployment?.verificationStatus, "execution_failed");

      const [releasePlan] = await db.select().from(releasePlans).where(eq(releasePlans.id, fixture.releasePlanId));
      assert.equal(releasePlan?.status, "deploying");
      assert.equal(releasePlan?.deployedAt, null);

      const checks = await db
        .select()
        .from(releaseVerificationChecks)
        .where(eq(releaseVerificationChecks.verificationId, fixture.verificationId));
      assert.equal(checks[0]?.checkKey, "verification_execution_error");
      assert.equal(checks[0]?.severity, "warning");
      assert.equal(checks[0]?.result, "skipped");
      assert.deepEqual(checks[0]?.evidenceJson?.executionFailure, { message: "verifier network failure" });
    });

    void it("does not rerun provider calls for already completed verification jobs", async () => {
      const fixture = await createVerificationFixture(db, { releasePlanStatus: "deploying" });
      await db
        .update(releaseVerifications)
        .set({
          status: "live_healthy",
          summary: "Post-deploy verification already passed.",
          checkedAt: new Date("2026-06-30T12:00:00.000Z")
        })
        .where(eq(releaseVerifications.id, fixture.verificationId));
      const verifier = new FakeVerificationPort();

      const result = await executeReleaseVerification({
        data: fixture.data,
        db,
        dependencies: { verification: verifier },
        isFinalAttempt: true
      });

      assert.equal(result.status, "already_completed");
      assert.equal(result.verificationId, fixture.verificationId);
      assert.equal(result.verificationStatus, "live_healthy");
      assert.equal(verifier.requests.length, 0);
    });

    void it("no-ops when another worker completes the verification before persistence", async () => {
      const fixture = await createVerificationFixture(db, { releasePlanStatus: "deploying" });
      await db.insert(releaseVerificationChecks).values({
        verificationId: fixture.verificationId,
        checkKey: "http_status_check",
        scope: "domain",
        severity: "blocker",
        result: "passed",
        message: "Existing verification check."
      });
      const verifier = new FakeVerificationPort();
      verifier.beforeResolve = async () => {
        await db
          .update(releaseVerifications)
          .set({
            status: "live_healthy",
            summary: "Another worker completed first.",
            checkedAt: new Date("2026-06-30T12:00:00.000Z")
          })
          .where(eq(releaseVerifications.id, fixture.verificationId));
      };

      const result = await executeReleaseVerification({
        data: fixture.data,
        db,
        dependencies: { verification: verifier },
        isFinalAttempt: true
      });

      assert.equal(result.status, "stale_noop");
      assert.equal(verifier.requests.length, 1);

      const checks = await db
        .select()
        .from(releaseVerificationChecks)
        .where(eq(releaseVerificationChecks.verificationId, fixture.verificationId));
      assert.equal(checks.length, 1);
      assert.equal(checks[0]?.message, "Existing verification check.");

      const [deployment] = await db.select().from(deployments).where(eq(deployments.id, fixture.deploymentId));
      assert.equal(deployment?.status, "provider_succeeded");

      const [releasePlan] = await db.select().from(releasePlans).where(eq(releasePlans.id, fixture.releasePlanId));
      assert.equal(releasePlan?.status, "deploying");
    });

    void it("projects failed blocker checks to rollback_recommended and failed release state", async () => {
      const fixture = await createVerificationFixture(db, { releasePlanStatus: "deploying" });
      const verifier = new FakeVerificationPort();
      verifier.mode = "blocker";

      const result = await executeReleaseVerification({
        data: fixture.data,
        db,
        dependencies: { verification: verifier },
        isFinalAttempt: true
      });

      assert.equal(result.status, "completed");
      assert.equal(result.verificationStatus, "rollback_recommended");

      const [verification] = await db
        .select()
        .from(releaseVerifications)
        .where(eq(releaseVerifications.id, fixture.verificationId));
      assert.equal(verification?.status, "rollback_recommended");

      const [deployment] = await db.select().from(deployments).where(eq(deployments.id, fixture.deploymentId));
      assert.equal(deployment?.status, "rollback_recommended");
      assert.equal(deployment?.verificationStatus, "rollback_recommended");

      const [releasePlan] = await db.select().from(releasePlans).where(eq(releasePlans.id, fixture.releasePlanId));
      assert.equal(releasePlan?.status, "failed");
      assert.equal(releasePlan?.deployedAt, null);
    });

    void it("rejects unsafe verification target routes in the worker path", async () => {
      const fixture = await createVerificationFixture(db, {
        targetUrl: "https://attacker.example/dachreinigung/"
      });

      await assert.rejects(
        () =>
          executeReleaseVerification({
            data: fixture.data,
            db,
            dependencies: { verification: new FakeVerificationPort() },
            isFinalAttempt: true
          }),
        ReleaseVerificationEvidenceError
      );
    });
  }
);

async function createVerificationFixture(
  db: DatabaseClient,
  input: {
    releasePlanStatus?: ReleasePlanStatus;
    deploymentStatus?: DeploymentStatus;
    verificationStatus?: ReleaseVerificationStatus;
    targetUrl?: string;
  } = {}
): Promise<VerificationFixture> {
  const [customer] = await db.insert(customers).values({ name: "Verification Customer" }).returning();
  assert.ok(customer);

  const [project] = await db
    .insert(projects)
    .values({
      customerId: customer.id,
      name: "Verification Project"
    })
    .returning();
  assert.ok(project);

  const [releasePlan] = await db
    .insert(releasePlans)
    .values({
      projectId: project.id,
      status: input.releasePlanStatus ?? "deploying",
      summary: "Release ready for verification.",
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
      pageJson: pageJson()
    })
    .returning();
  assert.ok(pageVersion);

  await db.insert(releasePlanItems).values({
    releasePlanId: releasePlan.id,
    pageVersionId: pageVersion.id,
    targetUrl: input.targetUrl ?? "/dachreinigung/",
    action: "create",
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

  const [verification] = await db
    .insert(releaseVerifications)
    .values({
      releasePlanId: releasePlan.id,
      deploymentId: deployment.id,
      status: "running",
      summary: "Post-deploy verification is running."
    })
    .returning();
  assert.ok(verification);

  const data = {
    projectId: project.id,
    releasePlanId: releasePlan.id,
    deploymentId: deployment.id,
    verificationId: verification.id
  } satisfies ReleaseVerificationJobData;

  return {
    projectId: project.id,
    releasePlanId: releasePlan.id,
    deploymentId: deployment.id,
    verificationId: verification.id,
    data
  };
}

function pageJson(input: Partial<PageJson> = {}): PageJson {
  return {
    schemaVersion: 1,
    route: "/dachreinigung/",
    pageType: "service_area_page",
    target: {
      service: "Dachreinigung",
      primaryKeyword: "Dachreinigung",
      secondaryKeywords: []
    },
    seo: {
      title: "Dachreinigung",
      metaDescription: "Lokale Dachreinigung.",
      canonicalPath: "/dachreinigung/",
      robots: "noindex",
      jsonLd: [],
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
          h1: "Dachreinigung",
          body: "Lokale Dachreinigung."
        },
        evidenceRefs: []
      }
    ],
    internalLinks: [],
    evidenceRefs: [],
    uniquenessRationale: "Dedicated local proof.",
    ...input
  };
}

class FakeVerificationPort implements VerificationPort {
  mode: "healthy" | "throw" | "blocker" = "healthy";
  beforeResolve: (() => Promise<void> | void) | undefined;
  readonly requests: Array<{
    releasePlanId: string;
    deploymentId?: string;
    liveUrls: string[];
    trackingExpected?: boolean;
  }> = [];

  async verifyRelease(input: {
    releasePlanId: string;
    deploymentId?: string;
    liveUrls: string[];
    trackingExpected?: boolean;
  }): Promise<ReleaseVerification> {
    this.requests.push(input);

    if (this.mode === "throw") {
      return Promise.reject(new Error("verifier network failure"));
    }

    await this.beforeResolve?.();

    return ReleaseVerificationSchema.parse({
      releasePlanId: input.releasePlanId,
      deploymentId: input.deploymentId,
      verificationStatus: "live_healthy",
      summary:
        this.mode === "blocker" ? "Post-deploy verification found blockers." : "Post-deploy verification passed.",
      checkedAt: "2026-06-30T12:00:00.000Z",
      checks: [
        releaseCheck(
          this.mode === "blocker"
            ? {
                checkKey: "http_status_check",
                scope: "domain",
                severity: "blocker",
                result: "failed",
                message: "Live route returned a failing HTTP response.",
                evidence: {
                  targetUrl: input.liveUrls[0],
                  observed: { statusCode: 500 }
                }
              }
            : {
                checkKey: "http_status_check",
                scope: "domain",
                severity: "blocker",
                result: "passed",
                message: "Live route returned a successful HTTP response.",
                evidence: {
                  targetUrl: input.liveUrls[0],
                  observed: { statusCode: 200 }
                }
              }
        )
      ]
    });
  }
}

class FakeSearchConsole implements SearchConsolePort {
  submitError: Error | undefined;

  createAuthorizationRequest(): never {
    throw new Error("not implemented");
  }

  createAuthorizationUrl(): GscOAuthIntent {
    throw new Error("not implemented");
  }

  verifyState(): never {
    throw new Error("not implemented");
  }

  exchangeCode(): never {
    throw new Error("not implemented");
  }

  refreshAccessToken(): Promise<{ accessToken: string }> {
    return Promise.resolve({ accessToken: "access-token" });
  }

  listSites(): Promise<GscPropertyList> {
    return Promise.resolve({ projectId: "project", properties: [] });
  }

  querySearchAnalytics(): Promise<GscSearchAnalyticsRow[]> {
    return Promise.resolve([]);
  }

  submitSitemap(): Promise<GscSitemapSubmission> {
    if (this.submitError) {
      return Promise.reject(this.submitError);
    }

    return Promise.resolve({
      projectId: "project",
      propertyUrl: "https://customer.example/",
      sitemapUrl: "https://customer.example/sitemap.xml",
      submittedAt: "2026-06-30T12:00:00.000Z"
    });
  }

  inspectUrl(input: { accessToken: string; siteUrl: string; inspectionUrl: string }): Promise<GscUrlInspectionResult> {
    return Promise.resolve({
      siteUrl: input.siteUrl,
      inspectionUrl: input.inspectionUrl,
      verdict: "PASS",
      coverageState: "Submitted and indexed",
      checkedAt: "2026-06-30T12:00:00.000Z"
    });
  }
}

class FakeTokenCipher implements TokenCipher {
  encrypt(value: string): string {
    return value;
  }

  decrypt(): string {
    return "refresh-token";
  }
}

function releaseCheck(input: ReleaseCheck): ReleaseCheck {
  return ReleaseCheckSchema.parse(input);
}
