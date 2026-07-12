import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { MockReasoningAdapter, type ObjectStoragePort } from "@localseo/adapters";
import { buildCanonicalPageProposalOutputExample } from "@localseo/ai";
import {
  agentRuns,
  customers,
  pageProposals,
  pageSectionCopySuggestions,
  pageVersions,
  projects,
  users,
  type DatabaseClient
} from "@localseo/db";
import { eq } from "drizzle-orm";
import {
  createIntegrationTestDatabase,
  truncateIntegrationTables
} from "../../../../packages/db/test-support/integration-database.js";
import {
  createDrizzleSectionCopySuggestionRepository,
  executeSectionCopySuggestion,
  SectionCopySuggestionEvidenceError,
  SectionCopySuggestionProviderError,
  SectionCopySuggestionWorkflowError
} from "./section-copy-suggestion.js";

type IntegrationDatabase = Awaited<ReturnType<typeof createIntegrationTestDatabase>>;

type SectionCopyFixture = {
  projectId: string;
  pageVersionId: string;
  sectionId: string;
  suggestionId: string;
  runId: string;
};

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = Boolean(testDatabaseUrl);

void describe(
  "section copy suggestion worker database integration",
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

    void it("persists a validated suggestion without creating a page version", async () => {
      const fixture = await createSectionCopyFixture(db);
      const storage = new MemoryObjectStorage();
      const reasoning = new MockReasoningAdapter({
        ok: true,
        provider: "mock",
        model: "mock-section-copy",
        outputJson: {
          schemaVersion: 1,
          sectionId: fixture.sectionId,
          suggestedFields: {
            h1: "Dachreinigung fuer Muenchen",
            lead: "Lokale Dachreinigung mit klarer Planung und direkter Anfrage."
          }
        },
        usage: { inputTokens: 20, outputTokens: 30, costCents: 1 },
        diagnostics: { latencyMs: 9, finishReason: "stop" }
      });

      const result = await executeSectionCopySuggestion({
        data: {
          projectId: fixture.projectId,
          runId: fixture.runId,
          suggestionId: fixture.suggestionId,
          pageVersionId: fixture.pageVersionId,
          sectionId: fixture.sectionId
        },
        repository: createDrizzleSectionCopySuggestionRepository(db),
        reasoning,
        objectStorage: storage
      });

      assert.equal(result.status, "succeeded");
      assert.equal(reasoning.calls[0]?.task, "section_text_generation");
      assert.equal(reasoning.calls[0]?.outputSchemaName, "SectionCopyRevisionOutput");
      assert.deepEqual(reasoning.calls[0]?.policy, {
        canMutateProduction: false,
        allowedToolCategories: ["read_evidence", "draft_content"]
      });
      assert.match(storage.writes[0]?.key ?? "", /section-copy-input\.json$/u);

      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.equal(run?.status, "succeeded");
      assert.equal(run?.provider, "mock");
      assert.equal(run?.inputRef, storage.writes[0]?.key);

      const [suggestion] = await db
        .select()
        .from(pageSectionCopySuggestions)
        .where(eq(pageSectionCopySuggestions.id, fixture.suggestionId));
      assert.equal(suggestion?.status, "ready");
      assert.equal(suggestion?.suggestedProps?.h1, "Dachreinigung fuer Muenchen");
      assert.equal(suggestion?.suggestedProps?.primaryCtaHref, "/kontakt/");
      assert.ok(suggestion?.readyAt);

      const versions = await db.select().from(pageVersions).where(eq(pageVersions.id, fixture.pageVersionId));
      assert.equal(versions.length, 1);
      assert.equal(versions[0]?.status, "preview");
    });

    void it("fails a suggestion that attempts to revise a protected path", async () => {
      const fixture = await createSectionCopyFixture(db);
      const reasoning = new MockReasoningAdapter({
        ok: true,
        provider: "mock",
        model: "mock-section-copy",
        outputJson: {
          schemaVersion: 1,
          sectionId: fixture.sectionId,
          suggestedFields: { primaryCtaHref: "/other/" }
        },
        diagnostics: { latencyMs: 2, finishReason: "stop" }
      });

      await assert.rejects(
        () =>
          executeSectionCopySuggestion({
            data: {
              projectId: fixture.projectId,
              runId: fixture.runId,
              suggestionId: fixture.suggestionId,
              pageVersionId: fixture.pageVersionId,
              sectionId: fixture.sectionId
            },
            repository: createDrizzleSectionCopySuggestionRepository(db),
            reasoning,
            objectStorage: new MemoryObjectStorage()
          }),
        SectionCopySuggestionWorkflowError
      );

      const [suggestion] = await db
        .select()
        .from(pageSectionCopySuggestions)
        .where(eq(pageSectionCopySuggestions.id, fixture.suggestionId));
      assert.equal(suggestion?.status, "failed");
      assert.equal(suggestion?.failureCode, "qa_rejected");
      assert.match(suggestion?.failureMessage ?? "", /protected field/u);

      const versions = await db.select().from(pageVersions).where(eq(pageVersions.id, fixture.pageVersionId));
      assert.equal(versions.length, 1);
    });

    void it("does not resurrect an operator-cancelled suggestion", async () => {
      const fixture = await createSectionCopyFixture(db);
      const now = new Date("2026-07-12T14:00:00.000Z");
      await db
        .update(agentRuns)
        .set({ status: "failed", failureCode: "operator_cancelled", completedAt: now })
        .where(eq(agentRuns.id, fixture.runId));
      await db
        .update(pageSectionCopySuggestions)
        .set({ status: "dismissed", dismissedAt: now })
        .where(eq(pageSectionCopySuggestions.id, fixture.suggestionId));

      await assert.rejects(
        () =>
          executeSectionCopySuggestion({
            data: {
              projectId: fixture.projectId,
              runId: fixture.runId,
              suggestionId: fixture.suggestionId,
              pageVersionId: fixture.pageVersionId,
              sectionId: fixture.sectionId
            },
            repository: createDrizzleSectionCopySuggestionRepository(db),
            reasoning: new MockReasoningAdapter(),
            objectStorage: new MemoryObjectStorage()
          }),
        SectionCopySuggestionEvidenceError
      );

      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.equal(run?.status, "failed");
      assert.equal(run?.failureCode, "operator_cancelled");
      const [suggestion] = await db
        .select()
        .from(pageSectionCopySuggestions)
        .where(eq(pageSectionCopySuggestions.id, fixture.suggestionId));
      assert.equal(suggestion?.status, "dismissed");
    });

    void it("preserves operator cancellation when an in-flight provider fails late", async () => {
      const fixture = await createSectionCopyFixture(db);
      const reasoning = new MockReasoningAdapter(async () => {
        const now = new Date("2026-07-12T14:30:00.000Z");
        await db
          .update(agentRuns)
          .set({ status: "failed", failureCode: "operator_cancelled", completedAt: now })
          .where(eq(agentRuns.id, fixture.runId));
        await db
          .update(pageSectionCopySuggestions)
          .set({ status: "dismissed", dismissedAt: now })
          .where(eq(pageSectionCopySuggestions.id, fixture.suggestionId));
        return {
          ok: false as const,
          failureCode: "provider_error" as const,
          provider: "mock",
          diagnostics: { latencyMs: 3 }
        };
      });

      await assert.rejects(
        () =>
          executeSectionCopySuggestion({
            data: {
              projectId: fixture.projectId,
              runId: fixture.runId,
              suggestionId: fixture.suggestionId,
              pageVersionId: fixture.pageVersionId,
              sectionId: fixture.sectionId
            },
            repository: createDrizzleSectionCopySuggestionRepository(db),
            reasoning,
            objectStorage: new MemoryObjectStorage()
          }),
        SectionCopySuggestionProviderError
      );

      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, fixture.runId));
      assert.equal(run?.status, "failed");
      assert.equal(run?.failureCode, "operator_cancelled");
      const [suggestion] = await db
        .select()
        .from(pageSectionCopySuggestions)
        .where(eq(pageSectionCopySuggestions.id, fixture.suggestionId));
      assert.equal(suggestion?.status, "dismissed");
    });
  }
);

async function createSectionCopyFixture(db: DatabaseClient): Promise<SectionCopyFixture> {
  const [user] = await db
    .insert(users)
    .values({ email: `${randomUUID()}@example.com`, name: "Copy Operator" })
    .returning();
  assert.ok(user);
  const [customer] = await db.insert(customers).values({ name: "Copy Customer" }).returning();
  assert.ok(customer);
  const [project] = await db.insert(projects).values({ customerId: customer.id, name: "Copy Project" }).returning();
  assert.ok(project);

  const page = buildCanonicalPageProposalOutputExample({
    projectId: project.id,
    opportunityId: randomUUID(),
    agentRunId: randomUUID()
  }).page;
  const [proposal] = await db
    .insert(pageProposals)
    .values({
      projectId: project.id,
      route: page.route,
      primaryKeyword: page.target.primaryKeyword,
      uniquenessRationale: page.uniquenessRationale ?? "Dedicated local page.",
      status: "draft",
      sitemapReady: page.seo.sitemapReady
    })
    .returning();
  assert.ok(proposal);
  const [pageVersion] = await db
    .insert(pageVersions)
    .values({ pageProposalId: proposal.id, versionNumber: 1, status: "preview", pageJson: page })
    .returning();
  assert.ok(pageVersion);

  const suggestionId = randomUUID();
  const [run] = await db
    .insert(agentRuns)
    .values({
      projectId: project.id,
      subjectId: suggestionId,
      task: "section_text_generation",
      status: "queued"
    })
    .returning();
  assert.ok(run);
  await db.insert(pageSectionCopySuggestions).values({
    id: suggestionId,
    projectId: project.id,
    pageVersionId: pageVersion.id,
    sectionId: "hero-1",
    agentRunId: run.id,
    requestedByUserId: user.id,
    status: "queued",
    instruction: "Make the local intent clearer."
  });

  return {
    projectId: project.id,
    pageVersionId: pageVersion.id,
    sectionId: "hero-1",
    suggestionId,
    runId: run.id
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
