import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { MockReasoningAdapter, OpenCodeGoReasoningAdapter, type ObjectStoragePort } from "@localseo/adapters";
import { buildCanonicalPageProposalOutputExample } from "@localseo/ai";
import {
  OpportunityBriefSchema,
  PageJsonSchema,
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

    void it("persists an OpenCode Go Page Proposal response with worker-owned generation provenance", async () => {
      const fixture = await createPageProposalFixture(db);
      const storage = new MemoryObjectStorage();
      const requestBodies: string[] = [];
      const modelOutput = validPageProposalJson(fixture);
      const reasoning = new OpenCodeGoReasoningAdapter({
        apiKey: "test-page-proposal-key",
        model: "glm-5.2",
        endpoint: "https://example.test/v1/chat/completions",
        fetchImpl: (_url, init = {}) => {
          requestBodies.push(requestBodyText(init.body));
          return Promise.resolve(
            jsonResponse({
              model: "glm-5.2",
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: JSON.stringify({
                      ...modelOutput,
                      generation: { source: "human" },
                      page: {
                        ...modelOutput.page,
                        generation: { source: "template", templateId: "model-template" },
                        sections: modelOutput.page.sections.map((section) => ({
                          ...section,
                          generation: { source: "import", reason: "model-provided provenance" }
                        }))
                      }
                    })
                  },
                  finish_reason: "stop"
                }
              ],
              usage: { prompt_tokens: 120, completion_tokens: 480, cost_cents: 7 }
            })
          );
        }
      });

      const result = await executePageProposal({
        data: { projectId: fixture.projectId, runId: fixture.runId, opportunityId: fixture.opportunityId },
        repository: createDrizzlePageProposalRepository(db),
        reasoning,
        objectStorage: storage
      });

      assert.equal(result.status, "succeeded");
      assert.equal(requestBodies.length, 1);
      const providerRequest = JSON.parse(requestBodies[0] ?? "") as {
        messages: Array<{ role: string; content: string }>;
      };
      const userMessage = providerRequest.messages.find((message) => message.role === "user");
      assert.ok(userMessage);
      const envelope = JSON.parse(userMessage.content) as {
        task: string;
        outputSchemaName: string;
        policy: { canMutateProduction: boolean; allowedToolCategories: string[] };
      };
      assert.equal(envelope.task, "page_brief_draft");
      assert.equal(envelope.outputSchemaName, "PageProposalJson");
      assert.equal(envelope.policy.canMutateProduction, false);
      assert.deepEqual(envelope.policy.allowedToolCategories, [
        "read_evidence",
        "read_registry",
        "analyze",
        "draft_content",
        "draft_page_json",
        "render_preview"
      ]);

      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.equal(run?.status, "succeeded");
      assert.equal(run?.provider, "opencode_go");
      assert.equal(run?.model, "glm-5.2");

      const [proposal] = await db
        .select()
        .from(pageProposals)
        .where(eq(pageProposals.opportunityId, fixture.opportunityId));
      assert.ok(proposal);
      const persistedProposal = PageProposalJsonSchema.parse(proposal.proposalJson);
      assert.deepEqual(persistedProposal.generation, { source: "agent", agentRunId: fixture.runId });
      assert.deepEqual(persistedProposal.page.generation, { source: "agent", agentRunId: fixture.runId });
      assert.equal(
        persistedProposal.page.sections.every(
          (section) => section.generation?.source === "agent" && section.generation.agentRunId === fixture.runId
        ),
        true
      );

      const [version] = await db.select().from(pageVersions).where(eq(pageVersions.pageProposalId, proposal.id));
      assert.equal(version?.status, "preview");
      assert.equal(version?.approvedAt, null);
      const persistedPage = PageJsonSchema.parse(version?.pageJson);
      assert.deepEqual(persistedPage.generation, { source: "agent", agentRunId: fixture.runId });
      assert.equal(
        persistedPage.sections.every(
          (section) => section.generation?.source === "agent" && section.generation.agentRunId === fixture.runId
        ),
        true
      );
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
        evidence: [
          {
            sourceType: "gsc_signal",
            sourceId: "page-proposal-integration-gsc-signal",
            locator: { query: "dachreinigung muenchen", route: "/dachreinigung-muenchen/" },
            summary: "GSC shows local Dachreinigung intent for Muenchen.",
            strength: "medium",
            proofTier: "internal_signal"
          }
        ],
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
      subjectId: opportunity.id,
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
  return PageProposalJsonSchema.parse(
    buildCanonicalPageProposalOutputExample({
      projectId: fixture.projectId,
      opportunityId: fixture.opportunityId,
      agentRunId: fixture.runId
    })
  );
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function requestBodyText(body: BodyInit | null | undefined): string {
  if (typeof body !== "string") {
    throw new TypeError("Expected OpenCode Go request body to be a string.");
  }

  return body;
}
