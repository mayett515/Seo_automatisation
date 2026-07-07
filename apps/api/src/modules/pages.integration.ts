import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { type PageJson, type PageProposalJson } from "@localseo/contracts";
import { customers, pageProposals, pageVersions, projects, type DatabaseClient } from "@localseo/db";
import { eq } from "drizzle-orm";
import { DatabaseService } from "../database/database.service.js";
import { PagesService } from "./pages.module.js";
import {
  createIntegrationTestDatabase,
  truncateIntegrationTables
} from "../../../../packages/db/test-support/integration-database.js";

type IntegrationDatabase = Awaited<ReturnType<typeof createIntegrationTestDatabase>>;

type PageVersionFixture = {
  projectId: string;
  pageProposalId: string;
  pageVersionId: string;
  route: string;
};

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = Boolean(testDatabaseUrl);

void describe(
  "PagesService integration",
  { skip: runIntegration ? false : "TEST_DATABASE_URL is not configured" },
  () => {
    let handle: IntegrationDatabase;
    let db: DatabaseClient;
    let service: PagesService;

    before(async () => {
      assert.ok(testDatabaseUrl);
      handle = await createIntegrationTestDatabase(testDatabaseUrl);
      db = handle.db;
    });

    beforeEach(async () => {
      await truncateIntegrationTables(handle.sql);
      service = new PagesService(testDatabaseService(db));
    });

    after(async () => {
      await handle?.close();
    });

    void it("lists only page versions for the requested project without dumping PageJson", async () => {
      const first = await createPageVersionFixture(db, { name: "First", route: "/dachreinigung/" });
      await createPageVersionFixture(db, { name: "Second", route: "/fensterreinigung/" });

      const list = await service.listPageVersions(first.projectId);

      assert.equal(list.projectId, first.projectId);
      assert.equal(list.pageVersions.length, 1);
      assert.equal(list.pageVersions[0]?.id, first.pageVersionId);
      assert.equal(list.pageVersions[0]?.route, "/dachreinigung/");
      assert.equal("pageJson" in (list.pageVersions[0] as Record<string, unknown>), false);
    });

    void it("lists only page proposals for the requested project without dumping proposalJson", async () => {
      const first = await createPageVersionFixture(db, { name: "First", route: "/dachreinigung/" });
      await createPageVersionFixture(db, { name: "Second", route: "/fensterreinigung/" });

      const list = await service.listPageProposals(first.projectId);

      assert.equal(list.projectId, first.projectId);
      assert.equal(list.pageProposals.length, 1);
      assert.equal(list.pageProposals[0]?.id, first.pageProposalId);
      assert.equal(list.pageProposals[0]?.route, "/dachreinigung/");
      assert.equal(list.pageProposals[0]?.versionCount, 1);
      assert.equal("proposalJson" in (list.pageProposals[0] as Record<string, unknown>), false);
    });

    void it("returns a parsed page proposal only for its owning project", async () => {
      const first = await createPageVersionFixture(db, { name: "First", route: "/dachreinigung/" });
      const second = await createPageVersionFixture(db, { name: "Second", route: "/fensterreinigung/" });

      const detail = await service.getPageProposal(first.projectId, first.pageProposalId);

      assert.equal(detail.id, first.pageProposalId);
      assert.equal(detail.projectId, first.projectId);
      assert.equal(detail.proposalJson?.projectId, first.projectId);
      assert.equal(detail.proposalJson?.page.route, "/dachreinigung/");
      assert.equal(detail.versions.length, 1);
      assert.equal(detail.versions[0]?.id, first.pageVersionId);
      assert.equal("pageJson" in (detail.versions[0] as Record<string, unknown>), false);

      await assert.rejects(
        () => service.getPageProposal(first.projectId, second.pageProposalId),
        /not found for this project/u
      );
    });

    void it("returns a parsed page version only for its owning project", async () => {
      const first = await createPageVersionFixture(db, { name: "First", route: "/dachreinigung/" });
      const second = await createPageVersionFixture(db, { name: "Second", route: "/fensterreinigung/" });

      const detail = await service.getPageVersion(first.projectId, first.pageVersionId);

      assert.equal(detail.id, first.pageVersionId);
      assert.equal(detail.projectId, first.projectId);
      assert.equal(detail.pageJson.route, "/dachreinigung/");
      assert.equal(detail.pageJson.schemaVersion, 1);

      await assert.rejects(
        () => service.getPageVersion(first.projectId, second.pageVersionId),
        /not found for this project/u
      );
    });

    void it("renders editor preview through the page registry renderer", async () => {
      const fixture = await createPageVersionFixture(db, { name: "Preview", route: "/dachreinigung/" });

      const preview = await service.previewPageVersion(fixture.projectId, fixture.pageVersionId);

      assert.equal(preview.projectId, fixture.projectId);
      assert.equal(preview.pageVersionId, fixture.pageVersionId);
      assert.equal(preview.route, fixture.route);
      assert.equal(preview.mode, "editor");
      assert.equal(preview.file.contentType, "text/html; charset=utf-8");
      assert.match(preview.file.path, /\/dachreinigung\/index\.html$/u);
      assert.match(preview.file.body, /<meta name="robots" content="noindex">/u);
      assert.match(preview.file.body, /Dachreinigung in Muenchen/u);
    });

    void it("fails closed when stored PageJson no longer matches the contract", async () => {
      const fixture = await createPageVersionFixture(db, {
        name: "Invalid",
        route: "/invalid/",
        storedPageJson: { schemaVersion: 1, route: "/invalid/", invalid: true }
      });

      await assert.rejects(
        () => service.getPageVersion(fixture.projectId, fixture.pageVersionId),
        /Stored PageJson failed contract validation/u
      );
      await assert.rejects(
        () => service.previewPageVersion(fixture.projectId, fixture.pageVersionId),
        /Stored PageJson failed contract validation/u
      );
    });

    void it("fails closed when stored PageJson route differs from the proposal route", async () => {
      const fixture = await createPageVersionFixture(db, {
        name: "Mismatch",
        route: "/expected/",
        storedPageJson: pageJson("/other/")
      });

      await assert.rejects(
        () => service.previewPageVersion(fixture.projectId, fixture.pageVersionId),
        /route does not match/u
      );

      const [row] = await db.select().from(pageVersions).where(eq(pageVersions.id, fixture.pageVersionId));
      assert.equal(row?.pageProposalId, fixture.pageProposalId);
    });

    void it("fails closed when stored PageProposalJson no longer matches the contract", async () => {
      const fixture = await createPageVersionFixture(db, {
        name: "Invalid proposal",
        route: "/invalid-proposal/",
        storedProposalJson: { schemaVersion: 1, route: "/invalid-proposal/", invalid: true }
      });

      await assert.rejects(
        () => service.getPageProposal(fixture.projectId, fixture.pageProposalId),
        /Stored PageProposalJson failed contract validation/u
      );
    });

    void it("fails closed when stored PageProposalJson route differs from the proposal row", async () => {
      const fixture = await createPageVersionFixture(db, {
        name: "Proposal mismatch",
        route: "/expected-proposal/",
        storedProposalJson: (projectId: string) => pageProposalJson(projectId, "/other-proposal/")
      });

      await assert.rejects(
        () => service.getPageProposal(fixture.projectId, fixture.pageProposalId),
        /PageProposalJson route does not match/u
      );
    });
  }
);

async function createPageVersionFixture(
  db: DatabaseClient,
  input: {
    name: string;
    route: string;
    storedPageJson?: unknown;
    storedProposalJson?: unknown | ((projectId: string) => unknown);
  }
): Promise<PageVersionFixture> {
  const [customer] = await db
    .insert(customers)
    .values({ name: `${input.name} Customer` })
    .returning();
  assert.ok(customer);

  const [project] = await db
    .insert(projects)
    .values({
      customerId: customer.id,
      name: `${input.name} Project`
    })
    .returning();
  assert.ok(project);

  const [proposal] = await db
    .insert(pageProposals)
    .values({
      projectId: project.id,
      route: input.route,
      primaryKeyword: "Dachreinigung Muenchen",
      uniquenessRationale: "Dedicated local proof.",
      status: "draft",
      sitemapReady: true,
      proposalJson: resolveStoredProposalJson(project.id, input) as PageProposalJson
    })
    .returning();
  assert.ok(proposal);

  const [pageVersion] = await db
    .insert(pageVersions)
    .values({
      pageProposalId: proposal.id,
      versionNumber: 1,
      status: "preview",
      pageJson: (input.storedPageJson ?? pageJson(input.route)) as PageJson
    })
    .returning();
  assert.ok(pageVersion);

  return {
    projectId: project.id,
    pageProposalId: proposal.id,
    pageVersionId: pageVersion.id,
    route: input.route
  };
}

function resolveStoredProposalJson(
  projectId: string,
  input: { route: string; storedProposalJson?: unknown | ((projectId: string) => unknown) }
): unknown {
  if (typeof input.storedProposalJson === "function") {
    return input.storedProposalJson(projectId);
  }

  return input.storedProposalJson ?? pageProposalJson(projectId, input.route);
}

function pageProposalJson(projectId: string, route: string): PageProposalJson {
  return {
    schemaVersion: 1,
    projectId,
    route,
    primaryKeyword: "Dachreinigung Muenchen",
    page: pageJson(route),
    evidenceRefs: [],
    proposalRationale: "Dedicated local proof.",
    generation: { source: "template" }
  };
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
          h1: "Dachreinigung in Muenchen",
          lead: "Lokale Dachreinigung in Muenchen.",
          primaryCtaLabel: "Anfragen",
          primaryCtaHref: "/kontakt/"
        },
        evidenceRefs: []
      },
      {
        id: "service-1",
        type: "ServiceIntro",
        registryKey: "ServiceIntro.default",
        schemaVersion: 1,
        zone: "body_intro",
        order: 1,
        variant: "default",
        props: {
          heading: "Dachreinigung fuer Muenchen",
          body: "Wir reinigen Daecher mit lokal abgestimmter Planung."
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
    internalLinks: ["/kontakt/"],
    evidenceRefs: [],
    uniquenessRationale: "Dedicated local proof."
  };
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
