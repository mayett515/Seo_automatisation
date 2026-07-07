import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { MockReasoningAdapter, type ObjectStoragePort } from "@localseo/adapters";
import {
  OpportunityBriefSchema,
  PageProposalJsonSchema,
  type PageJson,
  type PageProposalJson
} from "@localseo/contracts";
import {
  agentRuns,
  customers,
  opportunities,
  pageProposals,
  pageVersions,
  projects,
  type DatabaseClient
} from "@localseo/db";
import { eq } from "drizzle-orm";
import {
  createIntegrationTestDatabase,
  truncateIntegrationTables
} from "../../../../packages/db/test-support/integration-database.js";
import { createDrizzlePageProposalRepository, executePageProposal } from "./page-proposal.js";

type IntegrationDatabase = Awaited<ReturnType<typeof createIntegrationTestDatabase>>;

type PageProposalFixture = {
  projectId: string;
  runId: string;
  opportunityId: string;
};

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = Boolean(testDatabaseUrl);

void describe(
  "page proposal worker database integration",
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

    void it("persists a draft proposal and preview page version only after QA succeeds", async () => {
      const fixture = await createPageProposalFixture(db);
      const storage = new MemoryObjectStorage();
      const reasoning = new MockReasoningAdapter({
        ok: true,
        provider: "mock",
        model: "mock-page-proposal",
        outputJson: validPageProposalJson(fixture),
        usage: { inputTokens: 10, outputTokens: 30, costCents: 4 },
        diagnostics: { latencyMs: 17, finishReason: "stop" }
      });

      const result = await executePageProposal({
        data: { projectId: fixture.projectId, runId: fixture.runId, opportunityId: fixture.opportunityId },
        repository: createDrizzlePageProposalRepository(db),
        reasoning,
        objectStorage: storage
      });

      assert.equal(result.status, "succeeded");
      assert.equal(result.route, "/dachreinigung-muenchen/");
      assert.equal(reasoning.calls.length, 1);
      assert.deepEqual(reasoning.calls[0]?.policy.allowedToolCategories, [
        "read_evidence",
        "read_registry",
        "analyze",
        "draft_content",
        "draft_page_json",
        "render_preview"
      ]);
      assert.equal(storage.writes.length, 1);
      assert.match(storage.writes[0]?.key ?? "", /page-proposal-input\.json$/u);

      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.equal(run?.status, "succeeded");
      assert.equal(run?.provider, "mock");
      assert.equal(run?.model, "mock-page-proposal");
      assert.equal(run?.inputRef, storage.writes[0]?.key);
      assert.deepEqual(run?.usageJson, { inputTokens: 10, outputTokens: 30, costCents: 4 });
      assert.equal(run?.latencyMs, 17);

      const proposals = await db.select().from(pageProposals).where(eq(pageProposals.projectId, fixture.projectId));
      assert.equal(proposals.length, 1);
      assert.equal(proposals[0]?.opportunityId, fixture.opportunityId);
      assert.equal(proposals[0]?.route, "/dachreinigung-muenchen/");
      assert.equal(proposals[0]?.status, "draft");
      assert.equal(proposals[0]?.sitemapReady, true);
      assert.equal(PageProposalJsonSchema.safeParse(proposals[0]?.proposalJson).success, true);

      const versions = await db.select().from(pageVersions).where(eq(pageVersions.pageProposalId, proposals[0]?.id));
      assert.equal(versions.length, 1);
      assert.equal(versions[0]?.versionNumber, 1);
      assert.equal(versions[0]?.status, "preview");
      assert.equal((versions[0]?.pageJson as PageJson | undefined)?.route, "/dachreinigung-muenchen/");
      assert.equal(versions[0]?.approvedAt, null);

      const [opportunity] = await db.select().from(opportunities).where(eq(opportunities.id, fixture.opportunityId));
      assert.equal(opportunity?.status, "brief_created");
    });
  }
);

async function createPageProposalFixture(db: DatabaseClient): Promise<PageProposalFixture> {
  const [customer] = await db.insert(customers).values({ name: "Page Proposal Customer" }).returning();
  assert.ok(customer);

  const [project] = await db
    .insert(projects)
    .values({ customerId: customer.id, name: "Page Proposal Project" })
    .returning();
  assert.ok(project);

  const [opportunity] = await db
    .insert(opportunities)
    .values({
      projectId: project.id,
      classification: "near_term_target",
      primaryKeyword: "dachreinigung muenchen",
      score: 72,
      status: "new",
      evidenceJson: OpportunityBriefSchema.parse({
        projectId: project.id,
        classification: "near_term_target",
        service: "Dachreinigung",
        location: {
          name: "Muenchen",
          kind: "city",
          adjacencyReason: "manual_seed",
          existingClusterStrength: "weak"
        },
        primaryKeyword: "dachreinigung muenchen",
        secondaryKeywords: ["dach reinigen muenchen"],
        suggestedRoute: "/dachreinigung-muenchen/",
        suggestedPageType: "normal_page",
        evidence: [],
        competitorObservations: [],
        groupHints: [],
        hubSpokeRole: "standalone",
        uniquenessRationale: "A dedicated Muenchen page can address local Dachreinigung intent.",
        cannibalizationRisk: { level: "low", conflictingRoutes: [] },
        missingEvidence: [],
        confidence: 0.72,
        recommendedAction: "create_page_proposal"
      })
    })
    .returning();
  assert.ok(opportunity);

  const [run] = await db
    .insert(agentRuns)
    .values({
      projectId: project.id,
      task: "page_brief_draft",
      status: "queued",
      diagnosticsJson: { opportunityId: opportunity.id }
    })
    .returning();
  assert.ok(run);

  return {
    projectId: project.id,
    runId: run.id,
    opportunityId: opportunity.id
  };
}

class MemoryObjectStorage implements ObjectStoragePort {
  readonly writes: Array<{ key: string; value: unknown }> = [];

  putJson(input: { key: string; value: unknown }): Promise<{ key: string }> {
    this.writes.push(input);
    return Promise.resolve({ key: input.key });
  }

  getJson(input: { key: string }): Promise<unknown> {
    return Promise.resolve(this.writes.find((write) => write.key === input.key)?.value);
  }
}

function validPageProposalJson(fixture: PageProposalFixture): PageProposalJson {
  return PageProposalJsonSchema.parse({
    schemaVersion: 1,
    projectId: fixture.projectId,
    opportunityId: fixture.opportunityId,
    route: "/dachreinigung-muenchen/",
    primaryKeyword: "dachreinigung muenchen",
    evidenceRefs: [],
    proposalRationale: "A dedicated Muenchen page addresses local Dachreinigung intent.",
    generation: { source: "agent", agentRunId: fixture.runId },
    page: validPageJson(fixture)
  });
}

function validPageJson(fixture: PageProposalFixture): PageJson {
  return {
    schemaVersion: 1,
    route: "/dachreinigung-muenchen/",
    pageType: "service_area_page",
    target: {
      service: "Dachreinigung",
      location: "Muenchen",
      primaryKeyword: "dachreinigung muenchen",
      secondaryKeywords: ["dach reinigen muenchen"]
    },
    seo: {
      title: "Dachreinigung Muenchen",
      metaDescription: "Lokale Dachreinigung in Muenchen mit klarer Beratung und schneller Anfrage.",
      canonicalPath: "/dachreinigung-muenchen/",
      robots: "noindex",
      jsonLd: [],
      sitemapReady: true
    },
    sections: [
      section("header-1", "Header", "Header.default", "frame_top", 0, {
        brandName: "Muster Dachservice",
        navItems: [{ label: "Kontakt", href: "/kontakt/" }]
      }),
      section("hero-1", "Hero", "Hero.default", "hero", 1, {
        h1: "Dachreinigung in Muenchen",
        lead: "Gruendliche Dachreinigung fuer Immobilien in Muenchen.",
        primaryCtaLabel: "Anfragen",
        primaryCtaHref: "/kontakt/"
      }),
      section("intro-1", "ServiceIntro", "ServiceIntro.default", "body_intro", 2, {
        heading: "Lokale Dachpflege mit sauberem Ablauf",
        body: "Die Seite beantwortet Muenchner Suchintention mit Service, Ablauf und Kontaktmoeglichkeit."
      }),
      section("description-1", "ServiceDescription", "ServiceDescription.default", "body_main", 3, {
        heading: "Was die Dachreinigung umfasst",
        paragraphs: ["Moos, Schmutz und Ablagerungen werden geprueft und schonend entfernt."]
      }),
      section("benefits-1", "BenefitsGrid", "BenefitsGrid.default", "body_main", 4, {
        heading: "Vorteile",
        benefits: [
          { title: "Lokale Anfahrt", body: "Termine in Muenchen und Umgebung." },
          { title: "Klare Beratung", body: "Vor der Reinigung wird der Zustand nachvollziehbar besprochen." }
        ]
      }),
      section("faq-1", "FAQ", "FAQ.default", "body_late", 5, {
        heading: "Haeufige Fragen",
        items: [{ question: "Wann lohnt sich eine Dachreinigung?", answer: "Wenn Moos oder Schmutz sichtbar sind." }]
      }),
      section("areas-1", "ServiceAreaList", "ServiceAreaList.default", "body_late", 6, {
        heading: "Einsatzgebiet",
        areas: [{ name: "Muenchen", route: "/dachreinigung-muenchen/" }]
      }),
      section("cta-1", "FinalCTA", "FinalCTA.default", "cta_late", 7, {
        heading: "Dachreinigung anfragen",
        body: "Beschreiben Sie kurz das Objekt und wir melden uns.",
        ctaLabel: "Kontakt aufnehmen",
        ctaHref: "/kontakt/"
      }),
      section("footer-1", "Footer", "Footer.default", "frame_bottom", 8, {
        businessName: "Muster Dachservice",
        legalLinks: [{ label: "Impressum", href: "/impressum/" }]
      })
    ],
    internalLinks: ["/kontakt/", "/impressum/"],
    evidenceRefs: [],
    uniquenessRationale: "Muenchen bekommt eine eigenstaendige Dachreinigung-Seite mit lokalem Anfragefokus.",
    generation: { source: "agent", agentRunId: fixture.runId }
  };
}

function section(
  id: string,
  type: PageJson["sections"][number]["type"],
  registryKey: string,
  zone: PageJson["sections"][number]["zone"],
  order: number,
  props: Record<string, unknown>
): PageJson["sections"][number] {
  return {
    id,
    type,
    registryKey,
    schemaVersion: 1,
    zone,
    order,
    variant: "default",
    props,
    evidenceRefs: []
  };
}
