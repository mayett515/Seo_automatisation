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

    void it("creates and lists section notes anchored to stable PageJson section ids", async () => {
      const fixture = await createPageVersionFixture(db, { name: "Notes", route: "/notes/" });

      const note = await service.createPageSectionNote(fixture.projectId, fixture.pageVersionId, {
        sectionId: "hero-1",
        fieldPath: ["props", "h1"],
        instructionType: "copy_change",
        note: "Make the H1 more specific to the roof-cleaning service."
      });

      assert.equal(note.projectId, fixture.projectId);
      assert.equal(note.pageVersionId, fixture.pageVersionId);
      assert.equal(note.sectionId, "hero-1");
      assert.deepEqual(note.fieldPath, ["props", "h1"]);
      assert.equal(note.instructionType, "copy_change");
      assert.equal(note.status, "open");

      const list = await service.listPageSectionNotes(fixture.projectId, fixture.pageVersionId);

      assert.equal(list.projectId, fixture.projectId);
      assert.equal(list.pageVersionId, fixture.pageVersionId);
      assert.equal(list.notes.length, 1);
      assert.equal(list.notes[0]?.id, note.id);
      assert.equal(list.notes[0]?.sectionId, "hero-1");
    });

    void it("rejects section notes for unknown PageJson section ids", async () => {
      const fixture = await createPageVersionFixture(db, { name: "Unknown section", route: "/unknown-section/" });

      await assert.rejects(
        () =>
          service.createPageSectionNote(fixture.projectId, fixture.pageVersionId, {
            sectionId: "missing-section",
            note: "This should not attach to a missing section."
          }),
        /must target an existing PageJson section id/u
      );
    });

    void it("resolves notes only for the owning page version", async () => {
      const first = await createPageVersionFixture(db, { name: "First note", route: "/first-note/" });
      const second = await createPageVersionFixture(db, { name: "Second note", route: "/second-note/" });
      const firstNote = await service.createPageSectionNote(first.projectId, first.pageVersionId, {
        sectionId: "hero-1",
        note: "Resolve this one."
      });
      const secondNote = await service.createPageSectionNote(second.projectId, second.pageVersionId, {
        sectionId: "hero-1",
        note: "This belongs to another project."
      });

      await assert.rejects(
        () => service.resolvePageSectionNote(first.projectId, first.pageVersionId, secondNote.id),
        /not found for this page version/u
      );

      const resolved = await service.resolvePageSectionNote(first.projectId, first.pageVersionId, firstNote.id);
      const resolvedAgain = await service.resolvePageSectionNote(first.projectId, first.pageVersionId, firstNote.id);

      assert.equal(resolved.status, "resolved");
      assert.ok(resolved.resolvedAt);
      assert.equal(resolvedAgain.status, "resolved");
      assert.equal(resolvedAgain.resolvedAt, resolved.resolvedAt);
    });

    void it("allows notes on approved page versions without mutating the frozen artifact", async () => {
      const fixture = await createPageVersionFixture(db, { name: "Approved note", route: "/approved-note/" });
      await approvePageVersion(db, fixture.pageVersionId);

      const note = await service.createPageSectionNote(fixture.projectId, fixture.pageVersionId, {
        sectionId: "hero-1",
        instructionType: "approval_blocker",
        note: "Review this approved version before release."
      });

      assert.equal(note.status, "open");
      assert.equal(note.sectionId, "hero-1");
      assert.equal(note.instructionType, "approval_blocker");
    });

    void it("blocks structural updates to approved page versions", async () => {
      const fixture = await createPageVersionFixture(db, { name: "Frozen", route: "/frozen/" });
      await approvePageVersion(db, fixture.pageVersionId);

      await assert.rejects(
        () =>
          db
            .update(pageVersions)
            .set({
              pageJson: pageJson(fixture.route, {
                mutate: (value) => {
                  const firstSection = value.sections[0];
                  assert.ok(firstSection);
                  value.sections[0] = {
                    ...firstSection,
                    props: {
                      ...firstSection.props,
                      h1: "Changed after approval"
                    }
                  };
                }
              })
            })
            .where(eq(pageVersions.id, fixture.pageVersionId)),
        /immutable|PageJson|page versions/u
      );
    });

    void it("blocks approved page versions from returning to editable statuses", async () => {
      const fixture = await createPageVersionFixture(db, { name: "No downgrade", route: "/no-downgrade/" });
      await approvePageVersion(db, fixture.pageVersionId);

      await assert.rejects(
        () => db.update(pageVersions).set({ status: "preview" }).where(eq(pageVersions.id, fixture.pageVersionId)),
        /editable statuses|page versions/u
      );
    });

    void it("requires approval evidence before a page version becomes immutable", async () => {
      const fixture = await createPageVersionFixture(db, { name: "Approval evidence", route: "/approval-evidence/" });

      await assert.rejects(
        () => db.update(pageVersions).set({ status: "approved" }).where(eq(pageVersions.id, fixture.pageVersionId)),
        /approved_at|approval evidence|check constraint/u
      );
      await assert.rejects(
        () =>
          db.insert(pageVersions).values({
            pageProposalId: fixture.pageProposalId,
            versionNumber: 2,
            status: "approved",
            pageJson: pageJson(fixture.route)
          }),
        /approved_at|approval evidence|check constraint/u
      );
    });

    void it("allows immutable lifecycle progression while blocking approved version deletes", async () => {
      const fixture = await createPageVersionFixture(db, { name: "Lifecycle", route: "/lifecycle/" });
      await approvePageVersion(db, fixture.pageVersionId);

      await db.update(pageVersions).set({ status: "released" }).where(eq(pageVersions.id, fixture.pageVersionId));

      const [released] = await db.select().from(pageVersions).where(eq(pageVersions.id, fixture.pageVersionId));
      assert.equal(released?.status, "released");

      await assert.rejects(
        () => db.delete(pageVersions).where(eq(pageVersions.id, fixture.pageVersionId)),
        /cannot be deleted|page versions/u
      );
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

    void it("fails closed when stored PageJson primary keyword differs from the proposal row", async () => {
      const fixture = await createPageVersionFixture(db, {
        name: "Keyword mismatch",
        route: "/keyword-mismatch/",
        storedPageJson: pageJson("/keyword-mismatch/", { primaryKeyword: "Fensterreinigung Muenchen" })
      });

      await assert.rejects(
        () => service.getPageVersion(fixture.projectId, fixture.pageVersionId),
        /PageJson primary keyword does not match/u
      );
    });

    void it("fails closed when stored PageJson canonical path differs from the proposal route", async () => {
      const fixture = await createPageVersionFixture(db, {
        name: "Canonical mismatch",
        route: "/canonical-mismatch/",
        storedPageJson: pageJson("/canonical-mismatch/", { canonicalPath: "/other-canonical/" })
      });

      await assert.rejects(
        () => service.getPageVersion(fixture.projectId, fixture.pageVersionId),
        /PageJson canonical path does not match/u
      );
    });

    void it("fails closed when stored PageJson passes contracts but fails registry validation", async () => {
      const fixture = await createPageVersionFixture(db, {
        name: "Registry invalid",
        route: "/registry-invalid/",
        storedPageJson: pageJson("/registry-invalid/", {
          mutate: (value) => {
            const firstSection = value.sections[0];
            assert.ok(firstSection);
            value.sections[0] = {
              ...firstSection,
              variant: "unknown"
            };
          }
        })
      });

      await assert.rejects(
        () => service.getPageVersion(fixture.projectId, fixture.pageVersionId),
        /PageJson failed registry validation/u
      );
    });

    void it("fails closed when stored PageProposalJson no longer matches the contract", async () => {
      const fixture = await createPageVersionFixture(db, {
        name: "Invalid proposal",
        route: "/invalid-proposal/",
        storedProposalJson: { kind: "value", value: { schemaVersion: 1, route: "/invalid-proposal/", invalid: true } }
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
        storedProposalJson: { kind: "factory", create: (projectId) => pageProposalJson(projectId, "/other-proposal/") }
      });

      await assert.rejects(
        () => service.getPageProposal(fixture.projectId, fixture.pageProposalId),
        /PageProposalJson route does not match/u
      );
    });
  }
);

type StoredProposalJsonFixture =
  | { kind: "value"; value: unknown }
  | { kind: "factory"; create: (projectId: string) => unknown };

async function createPageVersionFixture(
  db: DatabaseClient,
  input: {
    name: string;
    route: string;
    storedPageJson?: unknown;
    storedProposalJson?: StoredProposalJsonFixture;
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

async function approvePageVersion(db: DatabaseClient, pageVersionId: string): Promise<Date> {
  const approvedAt = new Date("2026-07-07T10:00:00.000Z");
  await db.update(pageVersions).set({ status: "approved", approvedAt }).where(eq(pageVersions.id, pageVersionId));
  return approvedAt;
}

function resolveStoredProposalJson(
  projectId: string,
  input: { route: string; storedProposalJson?: StoredProposalJsonFixture }
): unknown {
  if (input.storedProposalJson?.kind === "factory") {
    return input.storedProposalJson.create(projectId);
  }

  if (input.storedProposalJson?.kind === "value") {
    return input.storedProposalJson.value;
  }

  return pageProposalJson(projectId, input.route);
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

function pageJson(
  route: string,
  overrides: { primaryKeyword?: string; canonicalPath?: string; mutate?: (value: PageJson) => void } = {}
): PageJson {
  const value: PageJson = {
    schemaVersion: 1,
    route,
    pageType: "service_area_page",
    target: {
      service: "Dachreinigung",
      location: "Muenchen",
      primaryKeyword: overrides.primaryKeyword ?? "Dachreinigung Muenchen",
      secondaryKeywords: []
    },
    seo: {
      title: "Dachreinigung Muenchen",
      metaDescription: "Lokale Dachreinigung in Muenchen.",
      canonicalPath: overrides.canonicalPath ?? route,
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

  overrides.mutate?.(value);

  return value;
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
