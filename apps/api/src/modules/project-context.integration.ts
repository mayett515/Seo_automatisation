import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  customers,
  loadOpportunityResearchMaterial,
  projectBusinessProfileRevisions,
  projectBusinessProfiles,
  projectKnowledgeDocuments,
  projectKnowledgeLinks,
  projectKnowledgeVersions,
  projectOpportunityResearchStates,
  projects,
  services,
  users,
  websiteImportRuns,
  type DatabaseClient
} from "@localseo/db";
import { eq } from "@localseo/db/query";
import { canonicalizeProjectBusinessProfileContent } from "@localseo/domain";
import {
  createIntegrationTestDatabase,
  truncateIntegrationTables
} from "../../../../packages/db/test-support/integration-database.js";
import { DatabaseService } from "../database/database.service.js";
import { ProjectContextService } from "./project-context.module.js";

type IntegrationDatabase = Awaited<ReturnType<typeof createIntegrationTestDatabase>>;

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = Boolean(testDatabaseUrl);

void describe(
  "project context and knowledge integration",
  { skip: runIntegration ? false : "TEST_DATABASE_URL is not configured" },
  () => {
    let handle: IntegrationDatabase;
    let db: DatabaseClient;
    let service: ProjectContextService;

    before(async () => {
      assert.ok(testDatabaseUrl);
      handle = await createIntegrationTestDatabase(testDatabaseUrl);
      db = handle.db;
      service = new ProjectContextService(testDatabaseService(db));
    });

    beforeEach(async () => {
      await truncateIntegrationTables(handle.sql);
    });

    after(async () => {
      await handle?.close();
    });

    void it("confirms an imported profile and canonical entities with durable provenance", async () => {
      const fixture = await createFixture(db);
      const [importRun] = await db
        .insert(websiteImportRuns)
        .values({
          projectId: fixture.projectId,
          sourceUrl: "https://example.test/",
          status: "completed",
          artifactKey: `website-imports/${fixture.projectId}/snapshot.json`,
          completedAt: new Date()
        })
        .returning();
      assert.ok(importRun);

      const response = await service.confirmWebsiteImport(
        fixture.projectId,
        {
          importRunId: importRun.id,
          expectedProfileRowVersion: 0,
          profile: profile(),
          services: ["Gebaeudereinigung", "Fensterreinigung"],
          areas: ["Dachau", "Karlsfeld"]
        },
        fixture.userId
      );

      assert.equal(response.status, "confirmed");
      assert.equal(response.currentRevision?.sourceImportRunId, importRun.id);
      assert.deepEqual(
        response.services.map((item) => item.status),
        ["confirmed", "confirmed"]
      );
      assert.deepEqual(
        response.areas.map((item) => item.status),
        ["confirmed", "confirmed"]
      );
      assert.ok(response.services.every((item) => item.sourceId === importRun.id));
      const [state] = await db
        .select()
        .from(projectOpportunityResearchStates)
        .where(eq(projectOpportunityResearchStates.projectId, fixture.projectId));
      assert.equal(state?.status, "needs_research");
    });

    void it("rejects a stale profile revision without leaving a phantom revision", async () => {
      const fixture = await createFixture(db);
      const first = await service.updateBusinessProfile(
        fixture.projectId,
        { expectedRowVersion: 0, profile: profile(), services: ["Gebaeudereinigung"], areas: ["Dachau"] },
        fixture.userId
      );
      assert.equal(first.rowVersion, 0);
      await assert.rejects(
        () =>
          service.updateBusinessProfile(
            fixture.projectId,
            { expectedRowVersion: 1, profile: { ...profile(), description: "Stale edit" }, services: [], areas: [] },
            fixture.userId
          ),
        /changed/iu
      );
      const current = await service.getBusinessProfile(fixture.projectId);
      assert.equal(current.currentRevision?.revision, 1);
    });

    void it("marks research material dirty when an operator withdraws a confirmed profile into draft", async () => {
      const fixture = await createFixture(db);
      const draft = await service.updateBusinessProfile(
        fixture.projectId,
        { expectedRowVersion: 0, profile: profile(), services: ["Gebaeudereinigung"], areas: ["Dachau"] },
        fixture.userId
      );
      assert.ok(draft.currentRevision && draft.services[0] && draft.areas[0]);
      const confirmed = await service.confirmBusinessProfile(
        fixture.projectId,
        {
          expectedRowVersion: draft.rowVersion,
          expectedRevisionId: draft.currentRevision.id,
          serviceIds: [draft.services[0].id],
          areaIds: [draft.areas[0].id]
        },
        fixture.userId
      );
      await db
        .update(projectOpportunityResearchStates)
        .set({ materialDirty: false, nextScheduledAt: null, updatedAt: new Date() })
        .where(eq(projectOpportunityResearchStates.projectId, fixture.projectId));

      await service.updateBusinessProfile(
        fixture.projectId,
        {
          expectedRowVersion: confirmed.rowVersion,
          profile: { ...profile(), description: "Profile facts are under review." },
          services: ["Gebaeudereinigung"],
          areas: ["Dachau"]
        },
        fixture.userId
      );

      const [state] = await db
        .select()
        .from(projectOpportunityResearchStates)
        .where(eq(projectOpportunityResearchStates.projectId, fixture.projectId));
      assert.equal(state?.status, "needs_research");
      assert.equal(state?.materialDirty, true);
      assert.ok(state?.nextScheduledAt);
    });

    void it("stores approved Markdown as immutable searchable project knowledge", async () => {
      const fixture = await createFixture(db);
      const knowledge = await service.createKnowledgeVersion(
        fixture.projectId,
        {
          documentKey: "business.service-areas",
          title: "Service areas",
          bodyMarkdown: "# Service areas\n\nDachau and Karlsfeld are confirmed operating areas.",
          taskScopes: ["opportunity_research"],
          sourceKind: "human",
          modelUsePolicy: "model_allowed",
          approveImmediately: true
        },
        { userId: fixture.userId, canApprove: true }
      );
      assert.equal(knowledge.status, "approved");
      assert.equal(knowledge.reviewedByUserId, fixture.userId);

      const linked = await service.createKnowledgeVersion(
        fixture.projectId,
        {
          documentKey: "business.service-area-notes",
          title: "Service area notes",
          bodyMarkdown: "# Notes\n\nThis record derives from the confirmed service-area record.",
          taskScopes: ["opportunity_research"],
          sourceKind: "human",
          modelUsePolicy: "operator_only",
          links: [{ toVersionId: knowledge.id, kind: "derived_from" }],
          approveImmediately: false
        },
        { userId: fixture.userId, canApprove: true }
      );
      assert.deepEqual(linked.links, [{ toVersionId: knowledge.id, kind: "derived_from" }]);
      const persistedLinks = await db
        .select()
        .from(projectKnowledgeLinks)
        .where(eq(projectKnowledgeLinks.fromVersionId, linked.id));
      assert.equal(persistedLinks.length, 1);

      const search = await service.searchKnowledge(fixture.projectId, {
        query: "Karlsfeld",
        taskScope: "opportunity_research",
        status: "approved",
        limit: 20
      });
      assert.deepEqual(
        search.records.map((record) => record.id),
        [knowledge.id]
      );
      await assert.rejects(
        () =>
          db
            .update(projectKnowledgeVersions)
            .set({ bodyMarkdown: "# Rewritten" })
            .where(eq(projectKnowledgeVersions.id, knowledge.id)),
        /immutable/iu
      );
    });

    void it("rejects knowledge creation and review actors without project authority at the database boundary", async () => {
      const fixture = await createFixture(db);
      const [outsider] = await db
        .insert(users)
        .values({ email: `${randomUUID()}@example.test`, name: "Knowledge Outsider" })
        .returning();
      assert.ok(outsider);
      const [document] = await db
        .insert(projectKnowledgeDocuments)
        .values({ projectId: fixture.projectId, documentKey: "business.unauthorized" })
        .returning();
      assert.ok(document);
      const bodyMarkdown = "# Unauthorized\n\nThis row must not become project knowledge.";
      await assert.rejects(
        () =>
          db.insert(projectKnowledgeVersions).values({
            documentId: document.id,
            projectId: fixture.projectId,
            version: 1,
            title: "Unauthorized",
            bodyMarkdown,
            sourceKind: "human",
            modelUsePolicy: "operator_only",
            contentSha256: createHash("sha256").update(bodyMarkdown, "utf8").digest("hex"),
            createdByUserId: outsider.id
          }),
        /creation actor must have write authority/iu
      );

      const proposed = await service.createKnowledgeVersion(
        fixture.projectId,
        {
          documentKey: "business.review-authority",
          title: "Review authority",
          bodyMarkdown: "# Review\n\nOnly an authorized reviewer can approve this record.",
          taskScopes: ["opportunity_research"],
          sourceKind: "human",
          modelUsePolicy: "operator_only",
          approveImmediately: false
        },
        { userId: fixture.userId, canApprove: true }
      );
      await assert.rejects(
        () =>
          db
            .update(projectKnowledgeVersions)
            .set({ status: "approved", reviewedAt: new Date(), reviewedByUserId: outsider.id })
            .where(eq(projectKnowledgeVersions.id, proposed.id)),
        /review actor must have approval authority/iu
      );
    });

    void it("rejects business-profile and canonical-entity actors without project authority at the database boundary", async () => {
      const fixture = await createFixture(db);
      const draft = await service.updateBusinessProfile(
        fixture.projectId,
        {
          expectedRowVersion: 0,
          profile: profile(),
          services: ["Gebaeudereinigung"],
          areas: ["Dachau"]
        },
        fixture.userId
      );
      assert.ok(draft.currentRevision && draft.services[0] && draft.areas[0]);
      const [outsider] = await db
        .insert(users)
        .values({ email: `${randomUUID()}@example.test`, name: "Context Outsider" })
        .returning();
      assert.ok(outsider);

      await assert.rejects(
        () =>
          db.insert(projectBusinessProfileRevisions).values({
            projectId: fixture.projectId,
            revision: 2,
            profileJson: profile(),
            profileSha256: "0".repeat(64),
            createdByUserId: outsider.id
          }),
        /revision actor must have configuration authority/iu
      );
      const [draftService] = draft.services;
      assert.ok(draftService);
      await assert.rejects(
        () =>
          db
            .update(services)
            .set({ status: "confirmed", confirmedAt: new Date(), confirmedByUserId: outsider.id })
            .where(eq(services.id, draftService.id)),
        /lifecycle actor must have configuration authority/iu
      );
      await assert.rejects(
        () => db.update(services).set({ status: "rejected" }).where(eq(services.id, draftService.id)),
        /illegal canonical business entity status transition/iu
      );
      await assert.rejects(
        () =>
          db
            .update(projectBusinessProfiles)
            .set({ status: "confirmed", confirmedAt: new Date(), confirmedByUserId: outsider.id })
            .where(eq(projectBusinessProfiles.projectId, fixture.projectId)),
        /confirmation actor must have configuration authority/iu
      );

      const confirmed = await service.confirmBusinessProfile(
        fixture.projectId,
        {
          expectedRowVersion: draft.rowVersion,
          expectedRevisionId: draft.currentRevision.id,
          serviceIds: [draft.services[0].id],
          areaIds: [draft.areas[0].id]
        },
        fixture.userId
      );
      const replacementProfile = { ...profile(), description: "A replacement revision requiring review." };
      const [replacementRevision] = await db
        .insert(projectBusinessProfileRevisions)
        .values({
          projectId: fixture.projectId,
          revision: 2,
          profileJson: replacementProfile,
          profileSha256: createHash("sha256")
            .update(canonicalizeProjectBusinessProfileContent(replacementProfile), "utf8")
            .digest("hex"),
          createdByUserId: fixture.userId
        })
        .returning();
      assert.ok(replacementRevision);
      await assert.rejects(
        () =>
          db
            .update(projectBusinessProfiles)
            .set({ currentRevisionId: replacementRevision.id, updatedAt: new Date() })
            .where(eq(projectBusinessProfiles.projectId, fixture.projectId)),
        /changed business profile revision must return to draft review/iu
      );
      await assert.rejects(
        () =>
          db
            .update(projectBusinessProfiles)
            .set({
              confirmedAt: new Date(new Date(confirmed.confirmedAt ?? 0).getTime() + 1_000),
              updatedAt: new Date()
            })
            .where(eq(projectBusinessProfiles.projectId, fixture.projectId)),
        /confirmation evidence changes only with lifecycle status/iu
      );
    });

    void it("admits only explicitly model-allowed knowledge and retires it without deleting history", async () => {
      const fixture = await createFixture(db);
      const operatorOnly = await service.createKnowledgeVersion(
        fixture.projectId,
        {
          documentKey: "business.operator-notes",
          title: "Operator notes",
          bodyMarkdown: "# Internal\n\nKeep this note outside model context.",
          taskScopes: ["opportunity_research"],
          sourceKind: "human",
          modelUsePolicy: "operator_only",
          approveImmediately: true
        },
        { userId: fixture.userId, canApprove: true }
      );
      const modelAllowed = await service.createKnowledgeVersion(
        fixture.projectId,
        {
          documentKey: "business.model-context",
          title: "Model context",
          bodyMarkdown: "# Confirmed context\n\nWinterdienst is available in Dachau.",
          taskScopes: ["opportunity_research"],
          sourceKind: "human",
          modelUsePolicy: "model_allowed",
          approveImmediately: true
        },
        { userId: fixture.userId, canApprove: true }
      );

      const beforeRetirement = await loadOpportunityResearchMaterial(db, fixture.projectId);
      const knowledgeBefore = beforeRetirement.evidencePacket.knowledge as Array<{ id: string }>;
      assert.deepEqual(
        knowledgeBefore.map((row) => row.id),
        [modelAllowed.id]
      );
      assert.equal(
        knowledgeBefore.some((row) => row.id === operatorOnly.id),
        false
      );

      const retired = await service.retireKnowledgeDocument(
        fixture.projectId,
        modelAllowed.documentId,
        {
          expectedCurrentApprovedVersionId: modelAllowed.id,
          reason: "Service availability changed."
        },
        fixture.userId
      );
      assert.equal(retired.retiredVersionId, modelAllowed.id);
      const afterRetirement = await loadOpportunityResearchMaterial(db, fixture.projectId);
      assert.deepEqual(afterRetirement.evidencePacket.knowledge, []);

      const history = await service.searchKnowledge(fixture.projectId, {
        query: "Winterdienst",
        taskScope: "opportunity_research",
        status: "approved",
        limit: 20
      });
      assert.equal(history.records[0]?.id, modelAllowed.id);
      assert.equal(history.records[0]?.isCurrent, false);
      assert.ok(history.records[0]?.documentRetiredAt);

      await assert.rejects(
        () =>
          db
            .update(projectKnowledgeDocuments)
            .set({ retiredAt: null, retiredByUserId: null, retirementReason: null })
            .where(eq(projectKnowledgeDocuments.id, modelAllowed.documentId)),
        /retired knowledge evidence is immutable/iu
      );
    });

    void it("retires omitted canonical entities and can explicitly reactivate them", async () => {
      const fixture = await createFixture(db);
      const draft = await service.updateBusinessProfile(
        fixture.projectId,
        {
          expectedRowVersion: 0,
          profile: profile(),
          services: ["Gebaeudereinigung", "Fensterreinigung"],
          areas: ["Dachau"]
        },
        fixture.userId
      );
      const firstService = draft.services.find((item) => item.name === "Gebaeudereinigung");
      const secondService = draft.services.find((item) => item.name === "Fensterreinigung");
      const area = draft.areas[0];
      assert.ok(draft.currentRevision && firstService && secondService && area);
      const confirmed = await service.confirmBusinessProfile(
        fixture.projectId,
        {
          expectedRowVersion: draft.rowVersion,
          expectedRevisionId: draft.currentRevision.id,
          serviceIds: [firstService.id, secondService.id],
          areaIds: [area.id]
        },
        fixture.userId
      );
      const replacedDraft = await service.updateBusinessProfile(
        fixture.projectId,
        {
          expectedRowVersion: confirmed.rowVersion,
          profile: profile(),
          services: ["Unterhaltsreinigung"],
          areas: ["Dachau"]
        },
        fixture.userId
      );
      const replacement = replacedDraft.services.find((item) => item.name === "Unterhaltsreinigung");
      assert.ok(replacedDraft.currentRevision && replacement);
      const replaced = await service.confirmBusinessProfile(
        fixture.projectId,
        {
          expectedRowVersion: replacedDraft.rowVersion,
          expectedRevisionId: replacedDraft.currentRevision.id,
          serviceIds: [replacement.id],
          areaIds: [area.id]
        },
        fixture.userId
      );
      assert.equal(replaced.services.find((item) => item.id === firstService.id)?.status, "retired");
      assert.equal(replaced.services.find((item) => item.id === secondService.id)?.status, "retired");
      assert.equal(replaced.services.find((item) => item.id === replacement.id)?.status, "confirmed");

      const reactivated = await service.confirmBusinessProfile(
        fixture.projectId,
        {
          expectedRowVersion: replaced.rowVersion,
          expectedRevisionId: replaced.currentRevision?.id ?? "",
          serviceIds: [firstService.id],
          areaIds: [area.id]
        },
        fixture.userId
      );
      assert.equal(reactivated.services.find((item) => item.id === firstService.id)?.status, "confirmed");
      assert.equal(reactivated.services.find((item) => item.id === replacement.id)?.status, "retired");
    });
  }
);

async function createFixture(db: DatabaseClient) {
  const [user] = await db
    .insert(users)
    .values({ email: `${randomUUID()}@example.test`, name: "Context Operator" })
    .returning();
  assert.ok(user);
  const [customer] = await db
    .insert(customers)
    .values({ name: `Context ${randomUUID()}`, ownerUserId: user.id })
    .returning();
  assert.ok(customer);
  const [project] = await db
    .insert(projects)
    .values({ customerId: customer.id, name: `Context ${randomUUID()}` })
    .returning();
  assert.ok(project);
  return { projectId: project.id, userId: user.id };
}

function profile() {
  return {
    businessName: "Beispiel Gebaeudeservice",
    websiteUrl: "https://example.test/",
    description: "Regionaler Gebaeudeservice.",
    differentiators: ["Lokales Team"],
    targetCustomers: ["Hausverwaltungen"],
    operatingNotes: ["Keine Notdienste"]
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
