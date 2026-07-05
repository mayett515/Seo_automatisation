import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CrawledWebsiteSnapshot, CrawlerPort } from "@localseo/adapters";
import { customers, projects, technicalAuditFindings, technicalAuditRuns, type DatabaseClient } from "@localseo/db";
import { eq } from "drizzle-orm";
import {
  createIntegrationTestDatabase,
  truncateIntegrationTables
} from "../../../../packages/db/test-support/integration-database.js";
import { createDrizzleTechnicalAuditRepository, executeTechnicalAudit } from "./technical-audit.js";

type IntegrationDatabase = Awaited<ReturnType<typeof createIntegrationTestDatabase>>;

type TechnicalAuditFixture = {
  projectId: string;
  auditRunId: string;
  sourceUrl: string;
};

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = Boolean(testDatabaseUrl);

void describe(
  "technical audit worker database integration",
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

    void it("persists completed audit truth and derived findings", async () => {
      const fixture = await createTechnicalAuditFixture(db);
      const result = await executeTechnicalAudit({
        data: fixture,
        repository: createDrizzleTechnicalAuditRepository(db),
        crawler: fakeCrawler({
          pages: [
            page({
              url: `${fixture.sourceUrl}broken/`,
              route: "/broken/",
              status: 404,
              title: "",
              metaDescription: "",
              h1: "",
              internalLinks: []
            })
          ],
          skippedUrls: [{ url: `${fixture.sourceUrl}private/`, reason: "robots_disallow" }]
        })
      });

      assert.equal(result.status, "completed");
      assert.equal(result.auditRunId, fixture.auditRunId);
      assert.equal(result.pageCount, 1);
      assert.ok((result.findingCount as number) > 0);

      const [run] = await db.select().from(technicalAuditRuns).where(eq(technicalAuditRuns.id, fixture.auditRunId));
      assert.equal(run?.status, "completed");
      assert.equal(run?.artifactKey, `website-imports/${fixture.projectId}/${fixture.auditRunId}.json`);
      assert.equal(run?.failureJson, null);
      assert.ok(run?.startedAt instanceof Date);
      assert.ok(run?.completedAt instanceof Date);
      assert.equal(recordFromUnknown(run?.summaryJson).sourceUrl, fixture.sourceUrl);

      const findings = await db
        .select()
        .from(technicalAuditFindings)
        .where(eq(technicalAuditFindings.auditRunId, fixture.auditRunId));
      assert.equal(
        findings.every((finding) => finding.projectId === fixture.projectId),
        true
      );
      assert.equal(
        findings.some((finding) => finding.checkKey === "http_status.client_error"),
        true
      );
      assert.equal(
        findings.some((finding) => finding.checkKey === "crawl.skipped_url"),
        true
      );
    });

    void it("delete-and-replaces findings for the same audit run inside the repository transaction", async () => {
      const fixture = await createTechnicalAuditFixture(db);
      const repository = createDrizzleTechnicalAuditRepository(db);
      const firstSnapshot = snapshotFor(fixture, {
        pages: [page({ title: "", metaDescription: "", h1: "", schemaTypes: [] })]
      });
      const secondSnapshot = snapshotFor(fixture, {
        pages: [
          page({ title: "Healthy", metaDescription: "Healthy page", h1: "Healthy", schemaTypes: ["LocalBusiness"] })
        ]
      });

      await repository.markCompleted({
        data: fixture,
        snapshot: firstSnapshot,
        findings: [
          {
            checkKey: "metadata.missing_title",
            category: "metadata",
            severity: "warning",
            route: "/",
            pageUrl: fixture.sourceUrl,
            message: "First stale finding.",
            evidence: { route: "/" }
          }
        ]
      });
      await repository.markCompleted({
        data: fixture,
        snapshot: secondSnapshot,
        findings: [
          {
            checkKey: "schema.missing",
            category: "schema",
            severity: "warning",
            route: "/",
            pageUrl: fixture.sourceUrl,
            message: "Replacement finding.",
            evidence: { route: "/" }
          }
        ]
      });

      const findings = await db
        .select()
        .from(technicalAuditFindings)
        .where(eq(technicalAuditFindings.auditRunId, fixture.auditRunId));
      assert.deepEqual(
        findings.map((finding) => finding.checkKey),
        ["schema.missing"]
      );
      const [run] = await db.select().from(technicalAuditRuns).where(eq(technicalAuditRuns.id, fixture.auditRunId));
      assert.equal(recordFromUnknown(run?.summaryJson).findingCount, 1);
    });

    void it("stores bounded failure diagnostics when the crawl fails", async () => {
      const fixture = await createTechnicalAuditFixture(db);
      const longMessage = `crawl failed: ${"x".repeat(800)}`;

      await assert.rejects(
        executeTechnicalAudit({
          data: fixture,
          repository: createDrizzleTechnicalAuditRepository(db),
          crawler: failingCrawler(new Error(longMessage))
        }),
        /crawl failed/u
      );

      const [run] = await db.select().from(technicalAuditRuns).where(eq(technicalAuditRuns.id, fixture.auditRunId));
      assert.equal(run?.status, "failed");
      assert.ok(run?.completedAt instanceof Date);
      const failure = recordFromUnknown(run?.failureJson);
      assert.equal(typeof failure.message, "string");
      assert.equal((failure.message as string).length, 500);
      const findings = await db
        .select()
        .from(technicalAuditFindings)
        .where(eq(technicalAuditFindings.auditRunId, fixture.auditRunId));
      assert.equal(findings.length, 0);
    });

    void it("cascades findings when deleting the owning audit run", async () => {
      const fixture = await createTechnicalAuditFixture(db);
      await db.insert(technicalAuditFindings).values({
        projectId: fixture.projectId,
        auditRunId: fixture.auditRunId,
        checkKey: "metadata.missing_title",
        category: "metadata",
        severity: "warning",
        route: "/",
        pageUrl: fixture.sourceUrl,
        message: "Owned by the audit run.",
        evidenceJson: { route: "/" }
      });

      await db.delete(technicalAuditRuns).where(eq(technicalAuditRuns.id, fixture.auditRunId));

      const findings = await db
        .select()
        .from(technicalAuditFindings)
        .where(eq(technicalAuditFindings.auditRunId, fixture.auditRunId));
      assert.equal(findings.length, 0);
    });
  }
);

async function createTechnicalAuditFixture(db: DatabaseClient): Promise<TechnicalAuditFixture> {
  const [customer] = await db.insert(customers).values({ name: "Technical Audit Customer" }).returning();
  assert.ok(customer);

  const [project] = await db
    .insert(projects)
    .values({
      customerId: customer.id,
      name: "Technical Audit Project"
    })
    .returning();
  assert.ok(project);

  const sourceUrl = "https://customer.example/";
  const [run] = await db
    .insert(technicalAuditRuns)
    .values({
      projectId: project.id,
      sourceUrl,
      status: "queued"
    })
    .returning();
  assert.ok(run);

  return {
    projectId: project.id,
    auditRunId: run.id,
    sourceUrl
  };
}

function fakeCrawler(snapshot: Partial<CrawledWebsiteSnapshot> = {}): CrawlerPort {
  return {
    crawlWebsite(input) {
      return Promise.resolve(
        snapshotFor(
          {
            projectId: input.projectId,
            auditRunId: input.importRunId ?? "technical-audit",
            sourceUrl: input.sourceUrl
          },
          snapshot
        )
      );
    }
  };
}

function failingCrawler(error: Error): CrawlerPort {
  return {
    crawlWebsite() {
      return Promise.reject(error);
    }
  };
}

function snapshotFor(
  fixture: TechnicalAuditFixture,
  overrides: Partial<CrawledWebsiteSnapshot> = {}
): CrawledWebsiteSnapshot {
  return {
    projectId: fixture.projectId,
    sourceUrl: fixture.sourceUrl,
    artifactKey: `website-imports/${fixture.projectId}/${fixture.auditRunId}.json`,
    crawledAt: "2026-07-05T00:00:00.000Z",
    discoveredRoutes: ["/"],
    pages: [page({ url: fixture.sourceUrl, route: "/" })],
    skippedUrls: [],
    ...overrides
  };
}

function page(input: Partial<CrawledWebsiteSnapshot["pages"][number]> = {}): CrawledWebsiteSnapshot["pages"][number] {
  return {
    url: "https://customer.example/",
    route: "/",
    status: 200,
    title: "Customer Home",
    metaDescription: "Customer homepage",
    h1: "Customer Home",
    canonical: "https://customer.example/",
    internalLinks: ["/entruempelung/"],
    images: [],
    schemaTypes: ["LocalBusiness"],
    ...input
  };
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
