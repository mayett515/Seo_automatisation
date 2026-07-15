import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { MockReasoningAdapter, type ObjectStoragePort } from "@localseo/adapters";
import { buildCanonicalPageProposalOutputExample } from "@localseo/ai";
import { PageJsonSchema } from "@localseo/contracts";
import {
  agentRuns,
  customers,
  mediaAssets,
  mediaAssetVariants,
  pageProposals,
  pageSectionCopySuggestions,
  pageVersionMediaAssets,
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

    void it("validates copy on a media-backed page without changing media truth", async () => {
      const fixture = await createSectionCopyFixture(db, { withMedia: true });
      const reasoning = new MockReasoningAdapter({
        ok: true,
        provider: "mock",
        model: "mock-section-copy",
        outputJson: {
          schemaVersion: 1,
          sectionId: fixture.sectionId,
          suggestedFields: {
            h1: "Dachreinigung mit lokaler Medienreferenz",
            lead: "Der Textvorschlag bleibt von der unveraenderten Bildauswahl getrennt."
          }
        },
        diagnostics: { latencyMs: 4, finishReason: "stop" }
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
        objectStorage: new MemoryObjectStorage()
      });

      assert.equal(result.status, "succeeded");
      const versions = await db.select().from(pageVersions).where(eq(pageVersions.id, fixture.pageVersionId));
      assert.equal(versions.length, 1);
      const projection = await db
        .select()
        .from(pageVersionMediaAssets)
        .where(eq(pageVersionMediaAssets.pageVersionId, fixture.pageVersionId));
      assert.equal(projection.length, 1);
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

async function createSectionCopyFixture(
  db: DatabaseClient,
  input: { withMedia?: boolean } = {}
): Promise<SectionCopyFixture> {
  const [user] = await db
    .insert(users)
    .values({ email: `${randomUUID()}@example.com`, name: "Copy Operator" })
    .returning();
  assert.ok(user);
  const [customer] = await db.insert(customers).values({ name: "Copy Customer" }).returning();
  assert.ok(customer);
  const [project] = await db.insert(projects).values({ customerId: customer.id, name: "Copy Project" }).returning();
  assert.ok(project);

  let page = buildCanonicalPageProposalOutputExample({
    projectId: project.id,
    opportunityId: randomUUID(),
    agentRunId: randomUUID()
  }).page;
  let mediaAssetId: string | undefined;
  if (input.withMedia) {
    mediaAssetId = await createReadyMediaAsset(db, project.id, user.id);
    page = PageJsonSchema.parse({
      ...page,
      sections: page.sections.map((section) =>
        section.id === "benefits-1"
          ? {
              ...section,
              type: "ImageText",
              registryKey: "ImageText.default",
              variant: "media_left",
              props: {
                heading: "Lokales Projekt",
                body: "Eine unveraenderliche Medienplatzierung bleibt waehrend der Textrevision erhalten.",
                media: {
                  assetId: mediaAssetId,
                  purpose: "content",
                  alt: "Lokales Referenzprojekt"
                }
              }
            }
          : section
      )
    });
  }
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
  if (mediaAssetId) {
    await db.insert(pageVersionMediaAssets).values({ pageVersionId: pageVersion.id, mediaAssetId });
  }

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

async function createReadyMediaAsset(db: DatabaseClient, projectId: string, userId: string): Promise<string> {
  const body = new TextEncoder().encode("section copy immutable media variant");
  const checksumSha256 = createHash("sha256").update(body).digest("hex");
  const [asset] = await db
    .insert(mediaAssets)
    .values({
      projectId,
      status: "pending_upload",
      displayName: "Section copy media",
      claimedContentType: "image/webp",
      expectedBytes: body.byteLength,
      expectedSha256: checksumSha256,
      sourceStorageKey: `media/quarantine/${projectId}/${randomUUID()}`,
      createdByUserId: userId
    })
    .returning();
  assert.ok(asset);
  await db.update(mediaAssets).set({ status: "processing" }).where(eq(mediaAssets.id, asset.id));
  await db.insert(mediaAssetVariants).values({
    mediaAssetId: asset.id,
    variantKey: "w640_webp",
    storageKey: `media/ready/${asset.id}/w640.webp`,
    contentType: "image/webp",
    width: 640,
    height: 480,
    bytes: body.byteLength,
    checksumSha256
  });
  await db
    .update(mediaAssets)
    .set({
      status: "ready",
      detectedContentType: "image/webp",
      sourceBytes: body.byteLength,
      width: 640,
      height: 480,
      checksumSha256,
      processorVersion: "section-copy-integration-v1",
      requiredVariantKeys: ["w640_webp"],
      processedAt: new Date("2026-07-15T12:00:00.000Z")
    })
    .where(eq(mediaAssets.id, asset.id));
  return asset.id;
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
