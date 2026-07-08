import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { OpportunityBriefSchema, type PageJson, type PageProposalJson } from "@localseo/contracts";
import {
  agentRuns,
  approvals,
  customers,
  jobRuns,
  opportunities,
  pageProposals,
  pageVersions,
  projects,
  users,
  type DatabaseClient
} from "@localseo/db";
import { eq } from "drizzle-orm";
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
        /Approval blocker notes can only be open on reviewable page versions/u
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

async function createOpportunityFixture(db: DatabaseClient, input: { name: string }): Promise<OpportunityFixture> {
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

  const userId = "22222222-2222-4222-8222-222222222222";
  const opportunityId = await createOpportunityForProject(db, project.id, {
    service: "Dachreinigung",
    primaryKeyword: "dachreinigung muenchen",
    suggestedRoute: "/dachreinigung-muenchen/"
  });

  return {
    projectId: project.id,
    userId,
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
        evidence: [],
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
