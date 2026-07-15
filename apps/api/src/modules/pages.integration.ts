import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import type { MediaAssetStoragePort } from "@localseo/adapters";
import { OpportunityBriefSchema, type PageJson, type PageProposalJson } from "@localseo/contracts";
import {
  agentRuns,
  approvals,
  customers,
  jobRuns,
  mediaAssets,
  mediaAssetVariants,
  opportunities,
  pageProposals,
  pageSectionCopySuggestions,
  pageVersionMediaAssets,
  pageVersions,
  projects,
  users,
  type DatabaseClient
} from "@localseo/db";
import { and, eq } from "drizzle-orm";
import { DatabaseService } from "../database/database.service.js";
import { QueueProducerService } from "../queue-producer.js";
import { PagesService } from "./pages.module.js";
import {
  createIntegrationDatabaseClient,
  createIntegrationTestDatabase,
  truncateIntegrationTables
} from "../../../../packages/db/test-support/integration-database.js";

type IntegrationDatabase = Awaited<ReturnType<typeof createIntegrationTestDatabase>>;
type DatabaseHandle = ReturnType<typeof createIntegrationDatabaseClient>;
type SqlClient = DatabaseHandle["sql"];

type PageVersionFixture = {
  projectId: string;
  userId: string;
  pageProposalId: string;
  pageVersionId: string;
  route: string;
};

type OpportunityFixture = {
  projectId: string;
  userId: string;
  opportunityId: string;
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
      service = new PagesService(testDatabaseService(db), new QueueProducerService(testDatabaseService(db)));
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

    void it("creates a queued page proposal run and enqueues page-generation with jobId equal to runId", async () => {
      const fixture = await createOpportunityFixture(db, { name: "Proposal queue" });
      const queueService = new QueueProducerService(testDatabaseService(db));
      const queue = new FakeQueue();
      setPageGenerationQueue(queueService, queue);
      service = new PagesService(testDatabaseService(db), queueService);

      const result = await service.queuePageProposal(
        fixture.projectId,
        { opportunityId: fixture.opportunityId },
        fixture.userId
      );

      assert.equal(result.status, "queued");
      assert.equal(result.type, "page_generation");
      assert.equal(result.projectId, fixture.projectId);
      assert.equal(result.opportunityId, fixture.opportunityId);
      assert.equal(result.runId, result.jobId);
      assert.equal(queue.addCalls.length, 1);
      assert.equal(queue.addCalls[0]?.name, "page_generation");
      assert.equal(queue.addCalls[0]?.options.jobId, result.runId);
      assert.equal(queue.addCalls[0]?.data.projectId, fixture.projectId);
      assert.equal(queue.addCalls[0]?.data.runId, result.runId);
      assert.equal(queue.addCalls[0]?.data.opportunityId, fixture.opportunityId);
      assert.equal(typeof queue.addCalls[0]?.data.jobRunId, "string");

      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, result.runId));
      assert.equal(run?.projectId, fixture.projectId);
      assert.equal(run?.subjectId, fixture.opportunityId);
      assert.equal(run?.task, "page_brief_draft");
      assert.equal(run?.status, "queued");
      assert.deepEqual(run?.diagnosticsJson, { opportunityId: fixture.opportunityId });

      const [jobRun] = await db.select().from(jobRuns).where(eq(jobRuns.externalJobId, result.runId));
      assert.equal(jobRun?.queueName, "page-generation");
      assert.equal(jobRun?.type, "page_generation");
      assert.equal(jobRun?.status, "queued");
    });

    void it("returns explicit page proposal dry-run without agent_runs when the queue is unavailable", async () => {
      const fixture = await createOpportunityFixture(db, { name: "Proposal dry run" });

      const result = await service.queuePageProposal(fixture.projectId, { opportunityId: fixture.opportunityId });

      assert.equal(result.status, "dry_run");
      assert.equal(result.type, "page_generation");
      assert.equal(result.runId, undefined);
      assert.equal(result.opportunityId, fixture.opportunityId);
      assert.match(result.message ?? "", /queue is not configured/u);

      const runRows = await db.select().from(agentRuns);
      assert.equal(runRows.length, 0);

      const jobRunRows = await db.select().from(jobRuns).where(eq(jobRuns.externalJobId, result.jobId));
      assert.equal(jobRunRows.length, 1);
      assert.equal(jobRunRows[0]?.status, "dry_run");
      assert.equal(jobRunRows[0]?.queueName, "page-generation");
    });

    void it("returns the active page proposal run instead of enqueueing a duplicate", async () => {
      const fixture = await createOpportunityFixture(db, { name: "Proposal active" });
      const queueService = new QueueProducerService(testDatabaseService(db));
      const queue = new FakeQueue();
      setPageGenerationQueue(queueService, queue);
      service = new PagesService(testDatabaseService(db), queueService);

      await db.insert(agentRuns).values({
        id: "44444444-4444-4444-8444-444444444444",
        projectId: fixture.projectId,
        subjectId: fixture.opportunityId,
        task: "page_brief_draft",
        status: "running",
        inputRef: "agent-runs/page-proposal-input.json",
        diagnosticsJson: { opportunityId: fixture.opportunityId }
      });

      const result = await service.queuePageProposal(fixture.projectId, { opportunityId: fixture.opportunityId });

      assert.equal(result.status, "already_active");
      assert.equal(result.runId, "44444444-4444-4444-8444-444444444444");
      assert.equal(result.opportunityId, fixture.opportunityId);
      assert.equal(result.inputRef, "agent-runs/page-proposal-input.json");
      assert.equal(queue.addCalls.length, 0);
    });

    void it("allows a separate active page proposal run for a different opportunity in the same project", async () => {
      const fixture = await createOpportunityFixture(db, { name: "Proposal active separate" });
      const otherOpportunityId = await createOpportunityForProject(db, fixture.projectId, {
        service: "Fensterreinigung",
        primaryKeyword: "fensterreinigung muenchen",
        suggestedRoute: "/fensterreinigung-muenchen/"
      });
      const queueService = new QueueProducerService(testDatabaseService(db));
      const queue = new FakeQueue();
      setPageGenerationQueue(queueService, queue);
      service = new PagesService(testDatabaseService(db), queueService);

      await db.insert(agentRuns).values({
        id: "55555555-5555-4555-8555-555555555555",
        projectId: fixture.projectId,
        subjectId: fixture.opportunityId,
        task: "page_brief_draft",
        status: "running",
        diagnosticsJson: { opportunityId: fixture.opportunityId }
      });

      const result = await service.queuePageProposal(fixture.projectId, { opportunityId: otherOpportunityId });

      assert.equal(result.status, "queued");
      assert.equal(result.opportunityId, otherOpportunityId);
      assert.ok(result.runId);
      assert.notEqual(result.runId, "55555555-5555-4555-8555-555555555555");
      assert.equal(queue.addCalls.length, 1);

      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, result.runId));
      assert.equal(run?.subjectId, otherOpportunityId);
    });

    void it("queues one durable section copy suggestion per page version and section", async () => {
      const fixture = await createPageVersionFixture(db, { name: "Copy queue", route: "/copy-queue/" });
      const queueService = new QueueProducerService(testDatabaseService(db));
      const queue = new FakeQueue();
      setPageGenerationQueue(queueService, queue);
      service = new PagesService(testDatabaseService(db), queueService);

      const queued = await service.queueSectionCopySuggestion(
        fixture.projectId,
        fixture.pageVersionId,
        { sectionId: "hero-1", instruction: "Make the local intent clearer." },
        fixture.userId
      );
      const duplicate = await service.queueSectionCopySuggestion(
        fixture.projectId,
        fixture.pageVersionId,
        { sectionId: "hero-1" },
        fixture.userId
      );

      assert.equal(queued.status, "queued");
      assert.equal(queued.sectionId, "hero-1");
      assert.ok(queued.suggestionId);
      assert.equal(duplicate.status, "already_active");
      assert.equal(duplicate.suggestionId, queued.suggestionId);
      assert.equal(queue.addCalls.length, 1);
      assert.equal(queue.addCalls[0]?.name, "section_text_generation");
      assert.equal(queue.addCalls[0]?.options.jobId, queued.runId);
      assert.equal(queue.addCalls[0]?.data.suggestionId, queued.suggestionId);
      assert.equal(queue.addCalls[0]?.data.pageVersionId, fixture.pageVersionId);

      const [suggestion] = await db
        .select()
        .from(pageSectionCopySuggestions)
        .where(eq(pageSectionCopySuggestions.id, queued.suggestionId));
      assert.equal(suggestion?.status, "queued");
      assert.equal(suggestion?.requestedByUserId, fixture.userId);
      assert.equal(suggestion?.instruction, "Make the local intent clearer.");

      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, queued.runId!));
      assert.equal(run?.task, "section_text_generation");
      assert.equal(run?.subjectId, queued.suggestionId);

      const list = await service.listSectionCopySuggestions(fixture.projectId, fixture.pageVersionId);
      assert.equal(list.suggestions.length, 1);
      assert.equal(list.suggestions[0]?.id, queued.suggestionId);
      assert.equal(list.suggestions[0]?.suggestedProps, undefined);
    });

    void it("returns an explicit section copy dry-run without phantom product rows", async () => {
      const fixture = await createPageVersionFixture(db, { name: "Copy dry run", route: "/copy-dry-run/" });
      const queueService = new QueueProducerService(testDatabaseService(db));
      service = new PagesService(testDatabaseService(db), queueService);

      const result = await service.queueSectionCopySuggestion(
        fixture.projectId,
        fixture.pageVersionId,
        { sectionId: "hero-1" },
        fixture.userId
      );

      assert.equal(result.status, "dry_run");
      assert.equal(result.suggestionId, undefined);
      const suggestions = await db
        .select()
        .from(pageSectionCopySuggestions)
        .where(eq(pageSectionCopySuggestions.pageVersionId, fixture.pageVersionId));
      assert.equal(suggestions.length, 0);
      const runs = await db
        .select()
        .from(agentRuns)
        .where(and(eq(agentRuns.projectId, fixture.projectId), eq(agentRuns.task, "section_text_generation")));
      assert.equal(runs.length, 0);
    });

    void it("rejects section copy generation for protected sections and missing actor evidence", async () => {
      const fixture = await createPageVersionFixture(db, { name: "Copy boundary", route: "/copy-boundary/" });
      const queueService = new QueueProducerService(testDatabaseService(db));
      setPageGenerationQueue(queueService, new FakeQueue());
      service = new PagesService(testDatabaseService(db), queueService);

      await assert.rejects(
        () =>
          service.queueSectionCopySuggestion(
            fixture.projectId,
            fixture.pageVersionId,
            { sectionId: "header-1" },
            fixture.userId
          ),
        matchesErrorMessage(/no registry-approved AI copy fields/u)
      );
      await assert.rejects(
        () => service.queueSectionCopySuggestion(fixture.projectId, fixture.pageVersionId, { sectionId: "hero-1" }),
        matchesErrorMessage(/authenticated persisted user id/u)
      );
    });

    void it("applies an unchanged AI suggestion as agent provenance in the existing N+1 transaction", async () => {
      const fixture = await createPageVersionFixture(db, { name: "Copy apply agent", route: "/copy-agent/" });
      const suggestedProps = {
        h1: "Dachreinigung fuer Muenchen",
        lead: "Lokale Dachreinigung mit klarer Planung.",
        primaryCtaLabel: "Anfragen",
        primaryCtaHref: "/kontakt/"
      };
      const suggestion = await createReadyCopySuggestion(db, fixture, suggestedProps);

      const edited = await service.editPageVersion(
        fixture.projectId,
        fixture.pageVersionId,
        {
          suggestionId: suggestion.id,
          command: { type: "update_section_props", sectionId: "hero-1", props: suggestedProps }
        },
        fixture.userId
      );

      assert.equal(edited.pageVersion.versionNumber, 2);
      assert.deepEqual(edited.pageVersion.pageJson.generation, {
        source: "agent",
        agentRunId: suggestion.agentRunId,
        reason: "page_studio:section_text_generation"
      });
      assert.deepEqual(
        edited.pageVersion.pageJson.sections.find((section) => section.id === "hero-1")?.generation,
        edited.pageVersion.pageJson.generation
      );

      const [applied] = await db
        .select()
        .from(pageSectionCopySuggestions)
        .where(eq(pageSectionCopySuggestions.id, suggestion.id));
      assert.equal(applied?.status, "applied");
      assert.equal(applied?.appliedPageVersionId, edited.pageVersion.id);
      assert.equal(applied?.appliedByUserId, fixture.userId);
      assert.ok(applied?.appliedAt);
    });

    void it("records human provenance when the operator modifies a suggestion before applying", async () => {
      const fixture = await createPageVersionFixture(db, { name: "Copy apply human", route: "/copy-human/" });
      const suggestedProps = {
        h1: "Dachreinigung fuer Muenchen",
        lead: "Lokale Dachreinigung mit klarer Planung.",
        primaryCtaLabel: "Anfragen",
        primaryCtaHref: "/kontakt/"
      };
      const suggestion = await createReadyCopySuggestion(db, fixture, suggestedProps);

      const edited = await service.editPageVersion(
        fixture.projectId,
        fixture.pageVersionId,
        {
          suggestionId: suggestion.id,
          command: {
            type: "update_section_props",
            sectionId: "hero-1",
            props: { ...suggestedProps, lead: "Vom Operator angepasste lokale Einleitung." }
          }
        },
        fixture.userId
      );

      assert.deepEqual(edited.pageVersion.pageJson.generation, {
        source: "human",
        reason: "page_studio:section_text_generation_modified"
      });
    });

    void it("dismisses a ready suggestion and allows a replacement request", async () => {
      const fixture = await createPageVersionFixture(db, { name: "Copy dismiss", route: "/copy-dismiss/" });
      const suggestion = await createReadyCopySuggestion(db, fixture, {
        h1: "Dachreinigung fuer Muenchen",
        lead: "Lokale Dachreinigung mit klarer Planung.",
        primaryCtaLabel: "Anfragen",
        primaryCtaHref: "/kontakt/"
      });

      const dismissed = await service.dismissSectionCopySuggestion(
        fixture.projectId,
        fixture.pageVersionId,
        suggestion.id,
        fixture.userId
      );

      assert.equal(dismissed.status, "dismissed");
      assert.equal(dismissed.dismissedByUserId, fixture.userId);
      assert.ok(dismissed.dismissedAt);

      const queueService = new QueueProducerService(testDatabaseService(db));
      setPageGenerationQueue(queueService, new FakeQueue());
      service = new PagesService(testDatabaseService(db), queueService);
      const replacement = await service.queueSectionCopySuggestion(
        fixture.projectId,
        fixture.pageVersionId,
        { sectionId: "hero-1" },
        fixture.userId
      );
      assert.equal(replacement.status, "queued");
      assert.notEqual(replacement.suggestionId, suggestion.id);
    });

    void it("cancels generating section copy work and terminalizes its run", async () => {
      const fixture = await createPageVersionFixture(db, { name: "Copy cancel", route: "/copy-cancel/" });
      const queueService = new QueueProducerService(testDatabaseService(db));
      setPageGenerationQueue(queueService, new FakeQueue());
      service = new PagesService(testDatabaseService(db), queueService);
      const queued = await service.queueSectionCopySuggestion(
        fixture.projectId,
        fixture.pageVersionId,
        { sectionId: "hero-1" },
        fixture.userId
      );
      assert.ok(queued.runId);
      assert.ok(queued.suggestionId);

      await db.update(agentRuns).set({ status: "running" }).where(eq(agentRuns.id, queued.runId));
      await db
        .update(pageSectionCopySuggestions)
        .set({ status: "generating" })
        .where(eq(pageSectionCopySuggestions.id, queued.suggestionId));

      const cancelled = await service.dismissSectionCopySuggestion(
        fixture.projectId,
        fixture.pageVersionId,
        queued.suggestionId,
        fixture.userId
      );
      assert.equal(cancelled.status, "dismissed");
      assert.equal(cancelled.dismissedByUserId, fixture.userId);

      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, queued.runId));
      assert.equal(run?.status, "failed");
      assert.equal(run?.failureCode, "operator_cancelled");

      const replacement = await service.queueSectionCopySuggestion(
        fixture.projectId,
        fixture.pageVersionId,
        { sectionId: "hero-1" },
        fixture.userId
      );
      assert.equal(replacement.status, "queued");
      assert.notEqual(replacement.suggestionId, queued.suggestionId);
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

    void it("serves editor preview through metadata and signed document capabilities", async () => {
      const fixture = await createPageVersionFixture(db, { name: "Preview", route: "/dachreinigung/" });

      const prepared = await service.preparePageVersionPreview(fixture.projectId, fixture.pageVersionId);
      const preview = prepared.response;
      const document = await service.previewPageVersionDocument(
        fixture.projectId,
        fixture.pageVersionId,
        prepared.documentToken
      );

      assert.equal(preview.projectId, fixture.projectId);
      assert.equal(preview.pageVersionId, fixture.pageVersionId);
      assert.equal(preview.route, fixture.route);
      assert.equal(preview.mode, "editor");
      assert.match(preview.documentPath, /\/preview\/document$/u);
      assert.equal(preview.file.contentType, "text/html; charset=utf-8");
      assert.equal(preview.file.encoding, "utf8");
      assert.ok(preview.file.decodedBytes > 0);
      assert.match(preview.file.path, /\/dachreinigung\/index\.html$/u);
      assert.match(document.file.body, /<meta name="robots" content="noindex">/u);
      assert.match(document.file.body, /Dachreinigung in Muenchen/u);
      assert.ok(document.assetToken.length > 0);
      await assert.rejects(
        service.previewPageVersionDocument(
          fixture.projectId,
          fixture.pageVersionId,
          `${prepared.documentToken}tampered`
        ),
        /invalid or expired/u
      );
    });

    void it("creates a new preview version for a structured props edit without mutating its base", async () => {
      const fixture = await createPageVersionFixture(db, { name: "Props edit", route: "/props-edit/" });

      const edited = await service.editPageVersion(
        fixture.projectId,
        fixture.pageVersionId,
        {
          command: {
            type: "update_section_props",
            sectionId: "hero-1",
            props: {
              h1: "Dachreinigung in Muenchen neu gedacht",
              lead: "Aktualisierte lokale Einleitung.",
              primaryCtaLabel: "Beratung anfragen",
              primaryCtaHref: "/kontakt/"
            }
          }
        },
        fixture.userId
      );

      assert.equal(edited.basePageVersionId, fixture.pageVersionId);
      assert.equal(edited.pageVersion.versionNumber, 2);
      assert.equal(edited.pageVersion.status, "preview");
      assert.equal(edited.pageVersion.basedOnVersionId, fixture.pageVersionId);
      assert.equal(edited.pageVersion.createdByUserId, fixture.userId);
      assert.deepEqual(edited.pageVersion.pageJson.generation, {
        source: "human",
        reason: "page_studio:update_section_props"
      });
      assert.equal(
        edited.pageVersion.pageJson.sections.find((section) => section.id === "hero-1")?.props.h1,
        "Dachreinigung in Muenchen neu gedacht"
      );

      const [base] = await db.select().from(pageVersions).where(eq(pageVersions.id, fixture.pageVersionId));
      const basePageJson = base?.pageJson;
      assert.equal(base?.status, "preview");
      assert.equal(base?.basedOnVersionId, null);
      assert.equal(
        basePageJson?.sections.find((section) => section.id === "hero-1")?.props.h1,
        "Dachreinigung in Muenchen"
      );

      await assert.rejects(
        () =>
          db
            .update(pageVersions)
            .set({ pageJson: edited.pageVersion.pageJson })
            .where(eq(pageVersions.id, fixture.pageVersionId)),
        matchesErrorMessage(/append-only|create a new page version/u)
      );

      await assert.rejects(
        () =>
          service.reviewPageVersion(fixture.projectId, fixture.pageVersionId, { decision: "approve" }, fixture.userId),
        matchesErrorMessage(/Only the latest page version can be reviewed/u)
      );
    });

    void it("projects selected media exactly and retains archived assets only through version lineage", async () => {
      const fixture = await createPageVersionFixture(db, { name: "Media edit", route: "/media-edit/" });
      const firstBody = new TextEncoder().encode("first immutable media variant");
      const secondBody = new TextEncoder().encode("second immutable media variant");
      const firstAsset = await createReadyMediaAsset(db, fixture, firstBody, "first-proof.webp");
      const secondAsset = await createReadyMediaAsset(db, fixture, secondBody, "second-proof.webp");
      const bodyByStorageKey = new Map([
        [firstAsset.storageKey, firstBody],
        [secondAsset.storageKey, secondBody]
      ]);
      const mediaReader: Pick<MediaAssetStoragePort, "readPrivateObject"> = {
        readPrivateObject: ({ key }) => {
          const body = bodyByStorageKey.get(key);
          return body ? Promise.resolve(body) : Promise.reject(new Error(`Missing media bytes for ${key}.`));
        }
      };
      service = new PagesService(
        testDatabaseService(db),
        new QueueProducerService(testDatabaseService(db)),
        mediaReader
      );

      const mediaVersion = await service.editPageVersion(
        fixture.projectId,
        fixture.pageVersionId,
        {
          command: {
            type: "replace_section",
            sectionId: "benefits-1",
            registryKey: "ImageText.default",
            variant: "media_left",
            props: {
              heading: "Recent local work",
              body: "A completed Dachau project with immutable media evidence.",
              media: {
                assetId: firstAsset.assetId,
                purpose: "content",
                alt: "Completed roof cleaning in Dachau",
                focalPoint: { x: 0.4, y: 0.6 }
              }
            }
          }
        },
        fixture.userId
      );
      const projected = await db
        .select()
        .from(pageVersionMediaAssets)
        .where(eq(pageVersionMediaAssets.pageVersionId, mediaVersion.pageVersion.id));

      assert.deepEqual(
        projected.map((row) => row.mediaAssetId),
        [firstAsset.assetId]
      );
      assert.equal(
        mediaVersion.pageVersion.pageJson.sections.find((section) => section.id === "benefits-1")?.registryKey,
        "ImageText.default"
      );

      const approved = await service.reviewPageVersion(
        fixture.projectId,
        mediaVersion.pageVersion.id,
        { decision: "approve" },
        fixture.userId
      );
      assert.equal(approved.pageVersion.status, "approved");

      const archivedAt = new Date("2026-07-15T12:00:00.000Z");
      await db
        .update(mediaAssets)
        .set({ status: "archived", archivedAt, archivedByUserId: fixture.userId })
        .where(eq(mediaAssets.id, firstAsset.assetId));
      await db
        .update(mediaAssets)
        .set({ status: "archived", archivedAt, archivedByUserId: fixture.userId })
        .where(eq(mediaAssets.id, secondAsset.assetId));

      const inherited = await service.editPageVersion(
        fixture.projectId,
        mediaVersion.pageVersion.id,
        {
          command: {
            type: "update_section_props",
            sectionId: "hero-1",
            props: {
              h1: "Dachreinigung with retained media",
              lead: "The approved media remains resolvable through immutable lineage.",
              primaryCtaLabel: "Anfragen",
              primaryCtaHref: "/kontakt/"
            }
          }
        },
        fixture.userId
      );
      const inheritedProjection = await db
        .select()
        .from(pageVersionMediaAssets)
        .where(eq(pageVersionMediaAssets.pageVersionId, inherited.pageVersion.id));
      assert.deepEqual(
        inheritedProjection.map((row) => row.mediaAssetId),
        [firstAsset.assetId]
      );

      await assert.rejects(
        () =>
          service.editPageVersion(
            fixture.projectId,
            inherited.pageVersion.id,
            {
              command: {
                type: "update_section_props",
                sectionId: "benefits-1",
                props: {
                  heading: "Recent local work",
                  body: "This tries to select a newly archived asset.",
                  media: {
                    assetId: secondAsset.assetId,
                    purpose: "content",
                    alt: "A different archived project image"
                  }
                }
              }
            },
            fixture.userId
          ),
        matchesErrorMessage(/archived assets may only be retained from the base version/u)
      );

      const allVersions = await db
        .select()
        .from(pageVersions)
        .where(eq(pageVersions.pageProposalId, fixture.pageProposalId));
      assert.equal(allVersions.length, 3);
    });

    void it("chains legal movement and variant commands from the latest version", async () => {
      const fixture = await createPageVersionFixture(db, { name: "Command chain", route: "/command-chain/" });
      const moved = await service.editPageVersion(
        fixture.projectId,
        fixture.pageVersionId,
        { command: { type: "move_section", sectionId: "benefits-1", direction: "up" } },
        fixture.userId
      );

      assert.deepEqual(
        moved.pageVersion.pageJson.sections.map((section) => section.id),
        ["header-1", "hero-1", "service-1", "benefits-1", "description-1", "faq-1", "areas-1", "cta-1", "footer-1"]
      );

      const variant = await service.editPageVersion(
        fixture.projectId,
        moved.pageVersion.id,
        { command: { type: "switch_section_variant", sectionId: "hero-1", variant: "split" } },
        fixture.userId
      );

      assert.equal(variant.pageVersion.versionNumber, 3);
      assert.equal(variant.pageVersion.basedOnVersionId, moved.pageVersion.id);
      assert.equal(variant.pageVersion.pageJson.sections.find((section) => section.id === "hero-1")?.variant, "split");
      assert.deepEqual(
        variant.pageVersion.pageJson.sections.find((section) => section.id === "benefits-1")?.generation,
        moved.pageVersion.pageJson.sections.find((section) => section.id === "benefits-1")?.generation
      );
    });

    void it("replaces a flexible section through registry-derived structure without mutating its base", async () => {
      const fixture = await createPageVersionFixture(db, {
        name: "Section replacement",
        route: "/section-replacement/"
      });
      const edited = await service.editPageVersion(
        fixture.projectId,
        fixture.pageVersionId,
        {
          command: {
            type: "replace_section",
            sectionId: "benefits-1",
            registryKey: "ServiceDescription.default",
            variant: "detailed",
            props: {
              heading: "Dachpflege im Detail",
              paragraphs: ["Wir pruefen das Dach und stimmen die Reinigung auf den Zustand ab."]
            }
          }
        },
        fixture.userId
      );

      const replacement = edited.pageVersion.pageJson.sections.find((section) => section.id === "benefits-1");
      assert.equal(edited.pageVersion.versionNumber, 2);
      assert.equal(edited.pageVersion.basedOnVersionId, fixture.pageVersionId);
      assert.deepEqual(replacement, {
        id: "benefits-1",
        type: "ServiceDescription",
        registryKey: "ServiceDescription.default",
        schemaVersion: 1,
        zone: "body_main",
        order: 4,
        variant: "detailed",
        props: {
          heading: "Dachpflege im Detail",
          paragraphs: ["Wir pruefen das Dach und stimmen die Reinigung auf den Zustand ab."]
        },
        evidenceRefs: [],
        generation: { source: "human", reason: "page_studio:replace_section" }
      });

      const [base] = await db.select().from(pageVersions).where(eq(pageVersions.id, fixture.pageVersionId));
      assert.equal(base?.pageJson.sections.find((section) => section.id === "benefits-1")?.type, "BenefitsGrid");
    });

    void it("rejects invalid props, illegal movement, and illegal replacement without creating a version", async () => {
      const fixture = await createPageVersionFixture(db, { name: "Invalid edits", route: "/invalid-edits/" });

      await assert.rejects(
        () =>
          service.editPageVersion(
            fixture.projectId,
            fixture.pageVersionId,
            {
              command: {
                type: "update_section_props",
                sectionId: "hero-1",
                props: {
                  h1: "Dachreinigung",
                  lead: "Lokale Einleitung",
                  primaryCtaLabel: "Anfragen",
                  primaryCtaHref: "/kontakt/",
                  unknownRegistryProp: true
                }
              }
            },
            fixture.userId
          ),
        matchesErrorMessage(/registry validation/u)
      );

      await assert.rejects(
        () =>
          service.editPageVersion(
            fixture.projectId,
            fixture.pageVersionId,
            { command: { type: "move_section", sectionId: "service-1", direction: "up" } },
            fixture.userId
          ),
        matchesErrorMessage(/would_break_composition/u)
      );

      await assert.rejects(
        () =>
          service.editPageVersion(
            fixture.projectId,
            fixture.pageVersionId,
            {
              command: {
                type: "replace_section",
                sectionId: "benefits-1",
                registryKey: "ServiceDescription.default",
                variant: "detailed",
                props: { heading: "Missing paragraphs", paragraphs: [] }
              }
            },
            fixture.userId
          ),
        matchesErrorMessage(/registry validation/u)
      );

      await assert.rejects(
        () =>
          service.editPageVersion(
            fixture.projectId,
            fixture.pageVersionId,
            {
              command: {
                type: "replace_section",
                sectionId: "hero-1",
                registryKey: "ServiceDescription.default",
                variant: "detailed",
                props: { heading: "Locked", paragraphs: ["Locked section replacement."] }
              }
            },
            fixture.userId
          ),
        matchesErrorMessage(/section_locked/u)
      );

      const versions = await db
        .select()
        .from(pageVersions)
        .where(eq(pageVersions.pageProposalId, fixture.pageProposalId));
      assert.equal(versions.length, 1);
    });

    void it("branches from an approved immutable version while preserving the approved artifact", async () => {
      const fixture = await createPageVersionFixture(db, { name: "Approved branch", route: "/approved-branch/" });
      await service.reviewPageVersion(
        fixture.projectId,
        fixture.pageVersionId,
        { decision: "approve", decisionNote: "Freeze version one." },
        fixture.userId
      );
      const [approvedBase] = await db.select().from(pageVersions).where(eq(pageVersions.id, fixture.pageVersionId));
      const approvedPageJson = approvedBase?.pageJson;

      const edited = await service.editPageVersion(
        fixture.projectId,
        fixture.pageVersionId,
        {
          command: {
            type: "update_section_props",
            sectionId: "faq-1",
            props: {
              heading: "Neue Fragen",
              items: [{ question: "Was ist neu?", answer: "Diese Antwort gehoert nur zu Version zwei." }]
            }
          }
        },
        fixture.userId
      );

      assert.equal(edited.pageVersion.status, "preview");
      assert.equal(edited.pageVersion.basedOnVersionId, fixture.pageVersionId);

      const [base] = await db.select().from(pageVersions).where(eq(pageVersions.id, fixture.pageVersionId));
      assert.equal(base?.status, "approved");
      assert.ok(base?.approvedAt);
      assert.deepEqual(base?.pageJson, approvedPageJson);
    });

    void it("keeps Page Studio edits tenant-scoped and requires persisted actor evidence", async () => {
      const first = await createPageVersionFixture(db, { name: "First edit tenant", route: "/first-edit-tenant/" });
      const second = await createPageVersionFixture(db, { name: "Second edit tenant", route: "/second-edit-tenant/" });

      await assert.rejects(
        () =>
          service.editPageVersion(
            first.projectId,
            second.pageVersionId,
            { command: { type: "switch_section_variant", sectionId: "hero-1", variant: "split" } },
            first.userId
          ),
        matchesErrorMessage(/not found for this project/u)
      );
      await assert.rejects(
        () =>
          service.editPageVersion(first.projectId, first.pageVersionId, {
            command: { type: "switch_section_variant", sectionId: "hero-1", variant: "split" }
          }),
        matchesErrorMessage(/authenticated persisted user id/u)
      );
    });

    void it("allows only one concurrent edit to derive from the same latest base", async () => {
      const fixture = await createPageVersionFixture(db, { name: "Concurrent edit", route: "/concurrent-edit/" });

      const outcomes = await Promise.allSettled([
        service.editPageVersion(
          fixture.projectId,
          fixture.pageVersionId,
          { command: { type: "switch_section_variant", sectionId: "hero-1", variant: "split" } },
          fixture.userId
        ),
        service.editPageVersion(
          fixture.projectId,
          fixture.pageVersionId,
          { command: { type: "switch_section_variant", sectionId: "footer-1", variant: "compact" } },
          fixture.userId
        )
      ]);

      assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
      const rejected = outcomes.find((outcome) => outcome.status === "rejected");
      assert.ok(rejected && rejected.status === "rejected");
      assert.match(errorMessage(rejected.reason), /latest page version/u);

      const versions = await db
        .select()
        .from(pageVersions)
        .where(eq(pageVersions.pageProposalId, fixture.pageProposalId));
      assert.equal(versions.length, 2);
      assert.deepEqual(versions.map((version) => version.versionNumber).sort(), [1, 2]);
    });

    void it("makes a concurrently waiting review stale when the edit holds the proposal lock first", async () => {
      assert.ok(testDatabaseUrl);
      const fixture = await createPageVersionFixture(db, { name: "Edit before review", route: "/edit-before-review/" });
      const blockerHandle = createIntegrationDatabaseClient(testDatabaseUrl);
      const editHandle = createIntegrationDatabaseClient(testDatabaseUrl);
      const reviewHandle = createIntegrationDatabaseClient(testDatabaseUrl);
      const editService = new PagesService(
        testDatabaseService(editHandle.db),
        new QueueProducerService(testDatabaseService(editHandle.db))
      );
      const reviewService = new PagesService(
        testDatabaseService(reviewHandle.db),
        new QueueProducerService(testDatabaseService(reviewHandle.db))
      );
      let heldLock: HeldPageVersionLock | undefined;
      let editSettled = false;
      let reviewSettled = false;

      try {
        heldLock = await startHeldPageVersionLock(blockerHandle.sql, fixture.pageVersionId);
        const editPid = await backendPid(editHandle.sql);
        const editOutcome = editService
          .editPageVersion(
            fixture.projectId,
            fixture.pageVersionId,
            { command: { type: "switch_section_variant", sectionId: "hero-1", variant: "split" } },
            fixture.userId
          )
          .then(
            (value) => ({ ok: true as const, value }),
            (error: unknown) => ({ ok: false as const, error })
          )
          .finally(() => {
            editSettled = true;
          });

        await waitForBlockingPid(handle.sql, {
          blockedPid: editPid,
          blockingPid: heldLock.pid,
          isSettled: () => editSettled
        });

        const reviewPid = await backendPid(reviewHandle.sql);
        const reviewOutcome = reviewService
          .reviewPageVersion(fixture.projectId, fixture.pageVersionId, { decision: "approve" }, fixture.userId)
          .then(
            (value) => ({ ok: true as const, value }),
            (error: unknown) => ({ ok: false as const, error })
          )
          .finally(() => {
            reviewSettled = true;
          });

        await waitForBlockingPid(handle.sql, {
          blockedPid: reviewPid,
          blockingPid: editPid,
          isSettled: () => reviewSettled
        });
        heldLock.release();
        await heldLock.done;

        const edited = await editOutcome;
        const reviewed = await reviewOutcome;
        assert.equal(edited.ok, true);
        assert.equal(reviewed.ok, false);
        if (!reviewed.ok) {
          assert.match(errorMessage(reviewed.error), /Only the latest page version can be reviewed/u);
        }

        const versions = await db
          .select()
          .from(pageVersions)
          .where(eq(pageVersions.pageProposalId, fixture.pageProposalId));
        assert.equal(versions.length, 2);
        assert.equal(versions.find((version) => version.id === fixture.pageVersionId)?.status, "preview");
      } finally {
        heldLock?.rollback();
        await heldLock?.done.catch(() => undefined);
        await blockerHandle.close();
        await editHandle.close();
        await reviewHandle.close();
      }
    });

    void it("branches from the newly approved base when review holds the proposal lock first", async () => {
      assert.ok(testDatabaseUrl);
      const fixture = await createPageVersionFixture(db, {
        name: "Review before edit",
        route: "/review-before-edit/"
      });
      const blockerHandle = createIntegrationDatabaseClient(testDatabaseUrl);
      const reviewHandle = createIntegrationDatabaseClient(testDatabaseUrl);
      const editHandle = createIntegrationDatabaseClient(testDatabaseUrl);
      const reviewService = new PagesService(
        testDatabaseService(reviewHandle.db),
        new QueueProducerService(testDatabaseService(reviewHandle.db))
      );
      const editService = new PagesService(
        testDatabaseService(editHandle.db),
        new QueueProducerService(testDatabaseService(editHandle.db))
      );
      let heldLock: HeldPageVersionLock | undefined;
      let reviewSettled = false;
      let editSettled = false;

      try {
        heldLock = await startHeldPageVersionLock(blockerHandle.sql, fixture.pageVersionId);
        const reviewPid = await backendPid(reviewHandle.sql);
        const reviewOutcome = reviewService
          .reviewPageVersion(fixture.projectId, fixture.pageVersionId, { decision: "approve" }, fixture.userId)
          .then(
            (value) => ({ ok: true as const, value }),
            (error: unknown) => ({ ok: false as const, error })
          )
          .finally(() => {
            reviewSettled = true;
          });

        await waitForBlockingPid(handle.sql, {
          blockedPid: reviewPid,
          blockingPid: heldLock.pid,
          isSettled: () => reviewSettled
        });

        const editPid = await backendPid(editHandle.sql);
        const editOutcome = editService
          .editPageVersion(
            fixture.projectId,
            fixture.pageVersionId,
            { command: { type: "switch_section_variant", sectionId: "hero-1", variant: "split" } },
            fixture.userId
          )
          .then(
            (value) => ({ ok: true as const, value }),
            (error: unknown) => ({ ok: false as const, error })
          )
          .finally(() => {
            editSettled = true;
          });

        await waitForBlockingPid(handle.sql, {
          blockedPid: editPid,
          blockingPid: reviewPid,
          isSettled: () => editSettled
        });
        heldLock.release();
        await heldLock.done;

        const reviewed = await reviewOutcome;
        const edited = await editOutcome;
        assert.equal(reviewed.ok, true);
        if (!edited.ok) {
          throw edited.error;
        }

        const [base] = await db.select().from(pageVersions).where(eq(pageVersions.id, fixture.pageVersionId));
        assert.equal(base?.status, "approved");
        assert.equal(edited.value.pageVersion.status, "preview");
        assert.equal(edited.value.pageVersion.basedOnVersionId, fixture.pageVersionId);
      } finally {
        heldLock?.rollback();
        await heldLock?.done.catch(() => undefined);
        await blockerHandle.close();
        await reviewHandle.close();
        await editHandle.close();
      }
    });

    void it("enforces page-version lineage and freezes lineage evidence after approval", async () => {
      const first = await createPageVersionFixture(db, { name: "Lineage first", route: "/lineage-first/" });
      const second = await createPageVersionFixture(db, { name: "Lineage second", route: "/lineage-second/" });

      await assert.rejects(
        () =>
          db.insert(pageVersions).values({
            pageProposalId: first.pageProposalId,
            versionNumber: 2,
            status: "preview",
            pageJson: pageJson(first.route)
          }),
        matchesErrorMessage(/require based_on_version_id/u)
      );
      await assert.rejects(
        () =>
          db.insert(pageVersions).values({
            pageProposalId: second.pageProposalId,
            versionNumber: 2,
            status: "preview",
            pageJson: pageJson(second.route),
            basedOnVersionId: first.pageVersionId,
            createdByUserId: second.userId
          }),
        matchesErrorMessage(/lineage must stay within one page proposal/u)
      );

      const derived = await service.editPageVersion(
        first.projectId,
        first.pageVersionId,
        { command: { type: "switch_section_variant", sectionId: "hero-1", variant: "split" } },
        first.userId
      );
      await assert.rejects(
        () =>
          db.insert(pageVersions).values({
            pageProposalId: first.pageProposalId,
            versionNumber: 3,
            status: "preview",
            pageJson: pageJson(first.route),
            basedOnVersionId: first.pageVersionId,
            createdByUserId: first.userId
          }),
        matchesErrorMessage(/immediately previous version/u)
      );

      await approvePageVersion(db, derived.pageVersion.id);
      await assert.rejects(
        () =>
          db
            .update(pageVersions)
            .set({ createdByUserId: second.userId })
            .where(eq(pageVersions.id, derived.pageVersion.id)),
        matchesErrorMessage(/immutable|create a new page version/u)
      );
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

    void it("allows general notes but rejects open approval blockers on approved page versions", async () => {
      const fixture = await createPageVersionFixture(db, { name: "Approved note", route: "/approved-note/" });
      await approvePageVersion(db, fixture.pageVersionId);

      const note = await service.createPageSectionNote(fixture.projectId, fixture.pageVersionId, {
        sectionId: "hero-1",
        note: "Review this approved version before release."
      });

      assert.equal(note.status, "open");
      assert.equal(note.sectionId, "hero-1");
      assert.equal(note.instructionType, "general");

      await assert.rejects(
        () =>
          service.createPageSectionNote(fixture.projectId, fixture.pageVersionId, {
            sectionId: "hero-1",
            instructionType: "approval_blocker",
            note: "This blocker is too late."
          }),
        matchesErrorMessage(/Approval blocker notes can only be open on reviewable page versions/u)
      );
    });

    void it("approves preview page versions and records durable approval audit", async () => {
      const fixture = await createPageVersionFixture(db, { name: "Approve version", route: "/approve-version/" });

      const reviewed = await service.reviewPageVersion(
        fixture.projectId,
        fixture.pageVersionId,
        {
          decision: "approve",
          decisionNote: "Ready for release planning."
        },
        fixture.userId
      );

      assert.equal(reviewed.projectId, fixture.projectId);
      assert.equal(reviewed.pageVersion.id, fixture.pageVersionId);
      assert.equal(reviewed.pageVersion.status, "approved");
      assert.ok(reviewed.pageVersion.approvedAt);
      assert.equal(reviewed.approval.pageVersionId, fixture.pageVersionId);
      assert.equal(reviewed.approval.status, "approved");
      assert.equal(reviewed.approval.decisionNote, "Ready for release planning.");
      assert.equal(reviewed.approval.decidedByUserId, fixture.userId);

      const [version] = await db.select().from(pageVersions).where(eq(pageVersions.id, fixture.pageVersionId));
      assert.equal(version?.status, "approved");
      assert.ok(version?.approvedAt);

      const [proposal] = await db.select().from(pageProposals).where(eq(pageProposals.id, fixture.pageProposalId));
      assert.equal(proposal?.status, "approved");

      const [approval] = await db.select().from(approvals).where(eq(approvals.pageVersionId, fixture.pageVersionId));
      assert.equal(approval?.status, "approved");
      assert.equal(approval?.userId, fixture.userId);
      assert.equal(approval?.decisionNote, "Ready for release planning.");
      assert.ok(approval?.decidedAt);
    });

    void it("blocks approval while approval blocker notes are open", async () => {
      const fixture = await createPageVersionFixture(db, { name: "Approval blockers", route: "/approval-blockers/" });
      const note = await service.createPageSectionNote(fixture.projectId, fixture.pageVersionId, {
        sectionId: "hero-1",
        instructionType: "approval_blocker",
        note: "Resolve this before approval."
      });

      await assert.rejects(
        () =>
          service.reviewPageVersion(fixture.projectId, fixture.pageVersionId, { decision: "approve" }, fixture.userId),
        /unresolved approval blocker/u
      );

      await service.resolvePageSectionNote(fixture.projectId, fixture.pageVersionId, note.id, fixture.userId);
      const reviewed = await service.reviewPageVersion(
        fixture.projectId,
        fixture.pageVersionId,
        { decision: "approve" },
        fixture.userId
      );

      assert.equal(reviewed.pageVersion.status, "approved");
    });

    void it("does not approve when an approval_blocker insert is concurrently open", async () => {
      assert.ok(testDatabaseUrl);
      const fixture = await createPageVersionFixture(db, {
        name: "Approval blocker race",
        route: "/approval-blocker-race/"
      });
      const blockerHandle = createIntegrationDatabaseClient(testDatabaseUrl);
      const approvalHandle = createIntegrationDatabaseClient(testDatabaseUrl);
      const approvalService = new PagesService(
        testDatabaseService(approvalHandle.db),
        new QueueProducerService(testDatabaseService(approvalHandle.db))
      );
      let heldInsert: HeldApprovalBlockerInsert | undefined;
      let approvalSettled = false;

      try {
        heldInsert = await startHeldApprovalBlockerInsert(blockerHandle.sql, fixture);
        const approvalPid = await backendPid(approvalHandle.sql);
        const approvalOutcome = approvalService
          .reviewPageVersion(fixture.projectId, fixture.pageVersionId, { decision: "approve" }, fixture.userId)
          .then(
            () => ({ ok: true as const }),
            (error: unknown) => ({ ok: false as const, error })
          )
          .finally(() => {
            approvalSettled = true;
          });

        await waitForBlockingPid(handle.sql, {
          blockedPid: approvalPid,
          blockingPid: heldInsert.pid,
          isSettled: () => approvalSettled
        });
        heldInsert.commit();
        await heldInsert.done;

        const outcome = await approvalOutcome;
        assert.equal(outcome.ok, false);
        if (!outcome.ok) {
          assert.match(errorMessage(outcome.error), /unresolved approval blocker/u);
        }

        const [version] = await handle.sql<{ status: string; approved_at: Date | null }[]>`
          SELECT "status"::text, "approved_at"
          FROM "page_versions"
          WHERE "id" = ${fixture.pageVersionId}
        `;
        assert.equal(version?.status, "preview");
        assert.equal(version?.approved_at, null);

        const [approvalCount] = await handle.sql<{ count: number }[]>`
          SELECT count(*)::int AS "count"
          FROM "approvals"
          WHERE "page_version_id" = ${fixture.pageVersionId}
        `;
        assert.equal(approvalCount?.count, 0);

        const [blockerCount] = await handle.sql<{ count: number }[]>`
          SELECT count(*)::int AS "count"
          FROM "page_section_notes"
          WHERE "page_version_id" = ${fixture.pageVersionId}
            AND "instruction_type" = 'approval_blocker'
            AND "resolved_at" IS NULL
        `;
        assert.equal(blockerCount?.count, 1);

        const [invalidStateCount] = await handle.sql<{ count: number }[]>`
          SELECT count(*)::int AS "count"
          FROM "page_versions"
          INNER JOIN "page_section_notes"
            ON "page_section_notes"."page_version_id" = "page_versions"."id"
          WHERE "page_versions"."id" = ${fixture.pageVersionId}
            AND "page_versions"."status" = 'approved'
            AND "page_section_notes"."instruction_type" = 'approval_blocker'
            AND "page_section_notes"."resolved_at" IS NULL
        `;
        assert.equal(invalidStateCount?.count, 0);
      } finally {
        heldInsert?.rollback();
        await heldInsert?.done.catch(() => undefined);
        await blockerHandle.close();
        await approvalHandle.close();
      }
    });

    void it("requests changes without approving the page version", async () => {
      const fixture = await createPageVersionFixture(db, { name: "Request changes", route: "/request-changes/" });

      const reviewed = await service.reviewPageVersion(
        fixture.projectId,
        fixture.pageVersionId,
        {
          decision: "request_changes",
          decisionNote: "Tighten the service proof before approval."
        },
        fixture.userId
      );

      assert.equal(reviewed.pageVersion.status, "changes_requested");
      assert.equal(reviewed.pageVersion.approvedAt, undefined);
      assert.equal(reviewed.approval.status, "rejected");
      assert.equal(reviewed.approval.decisionNote, "Tighten the service proof before approval.");

      const [version] = await db.select().from(pageVersions).where(eq(pageVersions.id, fixture.pageVersionId));
      assert.equal(version?.status, "changes_requested");
      assert.equal(version?.approvedAt, null);

      const [proposal] = await db.select().from(pageProposals).where(eq(pageProposals.id, fixture.pageProposalId));
      assert.equal(proposal?.status, "changes_requested");
    });

    void it("requires a decision note when requesting changes", async () => {
      const fixture = await createPageVersionFixture(db, { name: "Request changes note", route: "/request-note/" });

      await assert.rejects(
        () =>
          service.reviewPageVersion(
            fixture.projectId,
            fixture.pageVersionId,
            {
              decision: "request_changes"
            },
            fixture.userId
          ),
        /Requesting changes requires a decision note/u
      );
    });

    void it("does not review already approved page versions again", async () => {
      const fixture = await createPageVersionFixture(db, { name: "Already approved", route: "/already-approved/" });
      await service.reviewPageVersion(
        fixture.projectId,
        fixture.pageVersionId,
        { decision: "approve" },
        fixture.userId
      );

      await assert.rejects(
        () =>
          service.reviewPageVersion(fixture.projectId, fixture.pageVersionId, { decision: "approve" }, fixture.userId),
        /Only preview or changes-requested page versions/u
      );
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
        matchesErrorMessage(/append-only|create a new page version/u)
      );
    });

    void it("blocks approved page versions from returning to editable statuses", async () => {
      const fixture = await createPageVersionFixture(db, { name: "No downgrade", route: "/no-downgrade/" });
      await approvePageVersion(db, fixture.pageVersionId);

      await assert.rejects(
        () => db.update(pageVersions).set({ status: "preview" }).where(eq(pageVersions.id, fixture.pageVersionId)),
        matchesErrorMessage(/editable statuses|page versions/u)
      );
    });

    void it("requires approval evidence before a page version becomes immutable", async () => {
      const fixture = await createPageVersionFixture(db, { name: "Approval evidence", route: "/approval-evidence/" });

      await assert.rejects(
        () => db.update(pageVersions).set({ status: "approved" }).where(eq(pageVersions.id, fixture.pageVersionId)),
        matchesErrorMessage(/approved_at|approval evidence|check constraint/u)
      );
      await assert.rejects(
        () =>
          db.insert(pageVersions).values({
            pageProposalId: fixture.pageProposalId,
            versionNumber: 2,
            status: "approved",
            pageJson: pageJson(fixture.route),
            basedOnVersionId: fixture.pageVersionId
          }),
        matchesErrorMessage(/approved_at|approval evidence|check constraint/u)
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
        matchesErrorMessage(/cannot be deleted|page versions/u)
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
  const [user] = await db
    .insert(users)
    .values({
      email: `${input.name.toLowerCase().replaceAll(" ", "-")}@example.com`,
      name: `${input.name} Operator`
    })
    .returning();
  assert.ok(user);

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
    userId: user.id,
    pageProposalId: proposal.id,
    pageVersionId: pageVersion.id,
    route: input.route
  };
}

async function createReadyCopySuggestion(
  db: DatabaseClient,
  fixture: PageVersionFixture,
  suggestedProps: Record<string, unknown>,
  sectionId = "hero-1"
) {
  const suggestionId = randomUUID();
  const agentRunId = randomUUID();
  const now = new Date("2026-07-12T12:00:00.000Z");

  await db.insert(agentRuns).values({
    id: agentRunId,
    projectId: fixture.projectId,
    subjectId: suggestionId,
    task: "section_text_generation",
    status: "succeeded",
    provider: "mock",
    model: "mock-section-copy",
    completedAt: now
  });
  const [suggestion] = await db
    .insert(pageSectionCopySuggestions)
    .values({
      id: suggestionId,
      projectId: fixture.projectId,
      pageVersionId: fixture.pageVersionId,
      sectionId,
      agentRunId,
      requestedByUserId: fixture.userId,
      status: "ready",
      suggestedProps,
      readyAt: now
    })
    .returning();
  assert.ok(suggestion);
  return suggestion;
}

async function createReadyMediaAsset(
  db: DatabaseClient,
  fixture: Pick<PageVersionFixture, "projectId" | "userId">,
  body: Uint8Array,
  displayName: string
): Promise<{ assetId: string; storageKey: string }> {
  const checksumSha256 = createHash("sha256").update(body).digest("hex");
  const [asset] = await db
    .insert(mediaAssets)
    .values({
      projectId: fixture.projectId,
      status: "pending_upload",
      displayName,
      claimedContentType: "image/webp",
      expectedBytes: body.byteLength,
      expectedSha256: checksumSha256,
      sourceStorageKey: `media/quarantine/${fixture.projectId}/${randomUUID()}`,
      createdByUserId: fixture.userId
    })
    .returning();
  assert.ok(asset);
  await db.update(mediaAssets).set({ status: "processing" }).where(eq(mediaAssets.id, asset.id));

  const storageKey = `media/ready/${asset.id}/w640.webp`;
  await db.insert(mediaAssetVariants).values({
    mediaAssetId: asset.id,
    variantKey: "w640_webp",
    storageKey,
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
      processorVersion: "integration-v1",
      requiredVariantKeys: ["w640_webp"],
      processedAt: new Date("2026-07-15T10:00:00.000Z")
    })
    .where(eq(mediaAssets.id, asset.id));

  return { assetId: asset.id, storageKey };
}

async function createOpportunityFixture(db: DatabaseClient, input: { name: string }): Promise<OpportunityFixture> {
  const [user] = await db
    .insert(users)
    .values({
      email: `${input.name.toLowerCase().replaceAll(" ", "-")}@example.com`,
      name: `${input.name} Operator`
    })
    .returning();
  assert.ok(user);

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

  const opportunityId = await createOpportunityForProject(db, project.id, {
    service: "Dachreinigung",
    primaryKeyword: "dachreinigung muenchen",
    suggestedRoute: "/dachreinigung-muenchen/"
  });

  return {
    projectId: project.id,
    userId: user.id,
    opportunityId
  };
}

async function createOpportunityForProject(
  db: DatabaseClient,
  projectId: string,
  input: { service: string; primaryKeyword: string; suggestedRoute: string }
): Promise<string> {
  const [opportunity] = await db
    .insert(opportunities)
    .values({
      projectId,
      classification: "near_term_target",
      primaryKeyword: input.primaryKeyword,
      score: 72,
      status: "new",
      evidenceJson: OpportunityBriefSchema.parse({
        projectId,
        classification: "near_term_target",
        service: input.service,
        location: {
          name: "Muenchen",
          kind: "city",
          adjacencyReason: "manual_seed",
          existingClusterStrength: "weak"
        },
        primaryKeyword: input.primaryKeyword,
        secondaryKeywords: [],
        suggestedRoute: input.suggestedRoute,
        suggestedPageType: "normal_page",
        evidence: [
          {
            sourceType: "gsc_signal",
            sourceId: "pages-integration-gsc-signal",
            locator: { query: input.primaryKeyword, route: input.suggestedRoute },
            summary: `Integration fixture signal for ${input.primaryKeyword}.`,
            strength: "medium",
            proofTier: "internal_signal"
          }
        ],
        competitorObservations: [],
        groupHints: [],
        hubSpokeRole: "standalone",
        uniquenessRationale: `A dedicated Muenchen page can address local ${input.service} intent.`,
        cannibalizationRisk: { level: "low", conflictingRoutes: [] },
        missingEvidence: [],
        confidence: 0.72,
        recommendedAction: "create_page_proposal"
      })
    })
    .returning();
  assert.ok(opportunity);
  return opportunity.id;
}

async function approvePageVersion(db: DatabaseClient, pageVersionId: string): Promise<Date> {
  const approvedAt = new Date("2026-07-07T10:00:00.000Z");
  await db.update(pageVersions).set({ status: "approved", approvedAt }).where(eq(pageVersions.id, pageVersionId));
  return approvedAt;
}

type HeldApprovalBlockerInsert = {
  pid: number;
  done: Promise<void>;
  commit: () => void;
  rollback: () => void;
};

type HeldPageVersionLock = {
  pid: number;
  done: Promise<void>;
  release: () => void;
  rollback: () => void;
};

async function startHeldPageVersionLock(sql: SqlClient, pageVersionId: string): Promise<HeldPageVersionLock> {
  const locked = deferred<{ pid: number }>();
  const finish = deferred<"release" | "rollback">();
  const done = sql.begin(async (tx) => {
    await tx`SET TRANSACTION ISOLATION LEVEL READ COMMITTED`;
    const pid = await backendPid(tx);
    await tx`SELECT "id" FROM "page_versions" WHERE "id" = ${pageVersionId} FOR UPDATE`;
    locked.resolve({ pid });

    if ((await finish.promise) === "rollback") {
      throw new Error("Rollback held page version lock.");
    }
  });

  void done.catch((error: unknown) => {
    locked.reject(error);
  });

  const { pid } = await locked.promise;
  return {
    pid,
    done,
    release: () => finish.resolve("release"),
    rollback: () => finish.resolve("rollback")
  };
}

async function startHeldApprovalBlockerInsert(
  sql: SqlClient,
  fixture: PageVersionFixture
): Promise<HeldApprovalBlockerInsert> {
  const inserted = deferred<{ pid: number }>();
  const finish = deferred<"commit" | "rollback">();
  const done = sql.begin(async (tx) => {
    await tx`SET TRANSACTION ISOLATION LEVEL READ COMMITTED`;
    const pid = await backendPid(tx);

    await tx`
      INSERT INTO "page_section_notes" ("page_version_id", "section_id", "instruction_type", "note")
      VALUES (${fixture.pageVersionId}, 'hero-1', 'approval_blocker', 'Concurrent blocker before approval.')
    `;

    inserted.resolve({ pid });

    if ((await finish.promise) === "rollback") {
      throw new Error("Rollback held approval blocker insert.");
    }
  });

  void done.catch((error: unknown) => {
    inserted.reject(error);
  });

  const { pid } = await inserted.promise;

  return {
    pid,
    done,
    commit: () => finish.resolve("commit"),
    rollback: () => finish.resolve("rollback")
  };
}

async function backendPid(sql: SqlClient): Promise<number> {
  const [row] = await sql<{ pid: number }[]>`SELECT pg_backend_pid()::int AS "pid"`;
  assert.ok(row);
  return row.pid;
}

async function waitForBlockingPid(
  sql: SqlClient,
  input: { blockedPid: number; blockingPid: number; isSettled: () => boolean }
): Promise<void> {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    if (input.isSettled()) {
      throw new Error("Approval review settled before the lock wait was observed.");
    }

    const [row] = await sql<{ blocking_pids: number[] }[]>`
      SELECT pg_blocking_pids(${input.blockedPid}) AS "blocking_pids"
    `;

    if (row?.blocking_pids.includes(input.blockingPid)) {
      return;
    }

    await delay(25);
  }

  throw new Error(`Timed out waiting for backend ${input.blockedPid} to be blocked by ${input.blockingPid}.`);
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function matchesErrorMessage(pattern: RegExp): (error: unknown) => boolean {
  return (error: unknown) => errorMessageChain(error).some((message) => pattern.test(message));
}

function errorMessageChain(error: unknown): string[] {
  const message = errorMessage(error);
  if (!error || typeof error !== "object" || !("cause" in error)) {
    return [message];
  }

  return [message, ...errorMessageChain((error as { cause?: unknown }).cause)];
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
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
        id: "header-1",
        type: "Header",
        registryKey: "Header.default",
        schemaVersion: 1,
        zone: "frame_top",
        order: 0,
        variant: "default",
        props: {
          brandName: "Muster Dachservice",
          navItems: [{ label: "Kontakt", href: "/kontakt/" }]
        },
        evidenceRefs: []
      },
      {
        id: "hero-1",
        type: "Hero",
        registryKey: "Hero.default",
        schemaVersion: 1,
        zone: "hero",
        order: 1,
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
        order: 2,
        variant: "default",
        props: {
          heading: "Dachreinigung fuer Muenchen",
          body: "Wir reinigen Daecher mit lokal abgestimmter Planung."
        },
        evidenceRefs: []
      },
      {
        id: "description-1",
        type: "ServiceDescription",
        registryKey: "ServiceDescription.default",
        schemaVersion: 1,
        zone: "body_main",
        order: 3,
        variant: "default",
        props: {
          heading: "Was die Dachreinigung umfasst",
          paragraphs: ["Moos, Schmutz und Ablagerungen werden schonend entfernt."]
        },
        evidenceRefs: []
      },
      {
        id: "benefits-1",
        type: "BenefitsGrid",
        registryKey: "BenefitsGrid.default",
        schemaVersion: 1,
        zone: "body_main",
        order: 4,
        variant: "default",
        props: {
          heading: "Vorteile",
          benefits: [
            { title: "Lokale Anfahrt", body: "Termine in Muenchen und Umgebung." },
            { title: "Klare Beratung", body: "Der Zustand wird vor der Reinigung nachvollziehbar besprochen." }
          ]
        },
        evidenceRefs: []
      },
      {
        id: "faq-1",
        type: "FAQ",
        registryKey: "FAQ.default",
        schemaVersion: 1,
        zone: "body_late",
        order: 5,
        variant: "default",
        props: {
          heading: "Haeufige Fragen",
          items: [{ question: "Wie schnell?", answer: "Nach Absprache." }]
        },
        evidenceRefs: []
      },
      {
        id: "areas-1",
        type: "ServiceAreaList",
        registryKey: "ServiceAreaList.default",
        schemaVersion: 1,
        zone: "body_late",
        order: 6,
        variant: "default",
        props: {
          heading: "Einsatzgebiet",
          areas: [{ name: "Muenchen", route }]
        },
        evidenceRefs: []
      },
      {
        id: "cta-1",
        type: "FinalCTA",
        registryKey: "FinalCTA.default",
        schemaVersion: 1,
        zone: "cta_late",
        order: 7,
        variant: "default",
        props: {
          heading: "Dachreinigung anfragen",
          body: "Wir pruefen die passende Ausfuehrung fuer Ihr Objekt.",
          ctaLabel: "Anfragen",
          ctaHref: "/kontakt/"
        },
        evidenceRefs: []
      },
      {
        id: "footer-1",
        type: "Footer",
        registryKey: "Footer.default",
        schemaVersion: 1,
        zone: "frame_bottom",
        order: 8,
        variant: "default",
        props: {
          businessName: "Muster Dachservice",
          legalLinks: [{ label: "Impressum", href: "/impressum/" }]
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

function setPageGenerationQueue(service: QueueProducerService, queue: FakeQueue): void {
  (service as unknown as { queues: { "page-generation"?: unknown } }).queues["page-generation"] = queue;
}

type QueueAddCall = {
  name: string;
  data: Record<string, unknown>;
  options: Record<string, unknown>;
};

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
