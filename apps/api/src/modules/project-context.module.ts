import { createHash } from "node:crypto";
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import {
  ConfirmProjectBusinessProfileRequestSchema,
  ConfirmWebsiteImportKnowledgeRequestSchema,
  CreateProjectKnowledgeVersionRequestSchema,
  ProjectBusinessProfileResponseSchema,
  ProjectKnowledgeSearchRequestSchema,
  ProjectKnowledgeSearchResponseSchema,
  ProjectKnowledgeVersionSchema,
  RetireProjectKnowledgeDocumentRequestSchema,
  RetireProjectKnowledgeDocumentResponseSchema,
  ReviewProjectKnowledgeVersionRequestSchema,
  UpdateProjectBusinessProfileRequestSchema,
  type ConfirmProjectBusinessProfileRequest,
  type ConfirmWebsiteImportKnowledgeRequest,
  type CreateProjectKnowledgeVersionRequest,
  type ProjectBusinessProfileResponse,
  type ProjectKnowledgeSearchRequest,
  type ProjectKnowledgeSearchResponse,
  type ProjectKnowledgeVersion,
  type RetireProjectKnowledgeDocumentRequest,
  type RetireProjectKnowledgeDocumentResponse,
  type ReviewProjectKnowledgeVersionRequest,
  type UpdateProjectBusinessProfileRequest
} from "@localseo/contracts";
import {
  agentRuns,
  areas,
  projectBusinessProfileRevisions,
  projectBusinessProfiles,
  projectKnowledgeDocuments,
  projectKnowledgeLinks,
  projectKnowledgeTaskScopes,
  projectKnowledgeVersions,
  services,
  websiteImportRuns
} from "@localseo/db";
import {
  canonicalizeProjectBusinessProfileContent,
  decideKnowledgeRetirement,
  decideKnowledgeReview
} from "@localseo/domain";
import { and, asc, desc, eq, inArray, sql } from "@localseo/db/query";
import { BetterAuthGuard } from "../auth/guards/better-auth.guard.js";
import { PermissionGuard } from "../auth/permissions/permission.guard.js";
import { roleHasProjectPermission } from "../auth/permissions/project-permissions.js";
import { RequireProjectPermission } from "../auth/permissions/require-permission.decorator.js";
import { ProjectAccessGuard } from "../auth/project-access.guard.js";
import type { RequestWithAuth } from "../auth/types/authenticated-request.js";
import { DatabaseService } from "../database/database.service.js";
import { CsrfGuard } from "../security/csrf/csrf.guard.js";

type DatabaseClient = ReturnType<DatabaseService["requireDb"]>;
type TransactionClient = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];

@Injectable()
export class ProjectContextService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async getBusinessProfile(projectId: string): Promise<ProjectBusinessProfileResponse> {
    return loadBusinessProfileResponse(this.database.requireDb(), projectId);
  }

  async updateBusinessProfile(
    projectId: string,
    input: UpdateProjectBusinessProfileRequest,
    userId?: string
  ): Promise<ProjectBusinessProfileResponse> {
    const actorUserId = requirePersistedActor(userId);
    const db = this.database.requireDb();
    await db.transaction(async (tx) => {
      await lockProject(tx, projectId);
      const current = await loadProfileState(tx, projectId);
      assertExpectedProfileRevision(current?.rowVersion ?? 0, input.expectedRowVersion);
      if (input.sourceImportRunId) await assertCompletedImport(tx, projectId, input.sourceImportRunId);

      const revision = await insertProfileRevision(tx, {
        projectId,
        profile: input.profile,
        sourceImportRunId: input.sourceImportRunId,
        actorUserId
      });
      if (current) {
        const [updated] = await tx
          .update(projectBusinessProfiles)
          .set({
            currentRevisionId: revision.id,
            status: "draft",
            confirmedAt: null,
            confirmedByUserId: null,
            updatedAt: new Date()
          })
          .where(
            and(
              eq(projectBusinessProfiles.projectId, projectId),
              eq(projectBusinessProfiles.rowVersion, input.expectedRowVersion)
            )
          )
          .returning({ projectId: projectBusinessProfiles.projectId });
        if (!updated) throw new ConflictException("Business profile changed before this update was applied.");
      } else {
        await tx.insert(projectBusinessProfiles).values({ projectId, currentRevisionId: revision.id, status: "draft" });
      }

      await insertCanonicalEntities(tx, {
        projectId,
        names: input.services,
        kind: "service",
        sourceKind: input.sourceImportRunId ? "website_import" : "manual",
        sourceId: input.sourceImportRunId
      });
      await insertCanonicalEntities(tx, {
        projectId,
        names: input.areas,
        kind: "area",
        sourceKind: input.sourceImportRunId ? "website_import" : "manual",
        sourceId: input.sourceImportRunId
      });
    });
    return loadBusinessProfileResponse(db, projectId);
  }

  async confirmBusinessProfile(
    projectId: string,
    input: ConfirmProjectBusinessProfileRequest,
    userId?: string
  ): Promise<ProjectBusinessProfileResponse> {
    const actorUserId = requirePersistedActor(userId);
    const db = this.database.requireDb();
    await db.transaction(async (tx) => {
      await lockProject(tx, projectId);
      const current = await loadProfileState(tx, projectId);
      if (!current) throw new ConflictException("Create a business profile before confirming it.");
      assertExpectedProfileRevision(current.rowVersion, input.expectedRowVersion);
      if (current.currentRevisionId !== input.expectedRevisionId) {
        throw new ConflictException("Business profile revision changed before confirmation.");
      }

      await confirmCanonicalEntities(tx, {
        projectId,
        ids: input.serviceIds,
        kind: "service",
        actorUserId
      });
      await confirmCanonicalEntities(tx, {
        projectId,
        ids: input.areaIds,
        kind: "area",
        actorUserId
      });

      if (current.status !== "confirmed") {
        const now = new Date();
        const [updated] = await tx
          .update(projectBusinessProfiles)
          .set({ status: "confirmed", confirmedAt: now, confirmedByUserId: actorUserId, updatedAt: now })
          .where(
            and(
              eq(projectBusinessProfiles.projectId, projectId),
              eq(projectBusinessProfiles.rowVersion, input.expectedRowVersion)
            )
          )
          .returning({ projectId: projectBusinessProfiles.projectId });
        if (!updated) throw new ConflictException("Business profile changed before confirmation.");
      }
    });
    return loadBusinessProfileResponse(db, projectId);
  }

  async confirmWebsiteImport(
    projectId: string,
    input: ConfirmWebsiteImportKnowledgeRequest,
    userId?: string
  ): Promise<ProjectBusinessProfileResponse> {
    const actorUserId = requirePersistedActor(userId);
    const db = this.database.requireDb();
    await db.transaction(async (tx) => {
      await lockProject(tx, projectId);
      await assertCompletedImport(tx, projectId, input.importRunId);
      const current = await loadProfileState(tx, projectId);
      assertExpectedProfileRevision(current?.rowVersion ?? 0, input.expectedProfileRowVersion);
      const revision = await insertProfileRevision(tx, {
        projectId,
        profile: input.profile,
        sourceImportRunId: input.importRunId,
        actorUserId
      });
      const serviceIds = await insertCanonicalEntities(tx, {
        projectId,
        names: input.services,
        kind: "service",
        sourceKind: "website_import",
        sourceId: input.importRunId
      });
      const areaIds = await insertCanonicalEntities(tx, {
        projectId,
        names: input.areas,
        kind: "area",
        sourceKind: "website_import",
        sourceId: input.importRunId
      });
      await confirmCanonicalEntities(tx, { projectId, ids: serviceIds, kind: "service", actorUserId });
      await confirmCanonicalEntities(tx, { projectId, ids: areaIds, kind: "area", actorUserId });

      const now = new Date();
      if (current) {
        const [updated] = await tx
          .update(projectBusinessProfiles)
          .set({
            currentRevisionId: revision.id,
            status: "confirmed",
            confirmedAt: now,
            confirmedByUserId: actorUserId,
            updatedAt: now
          })
          .where(
            and(
              eq(projectBusinessProfiles.projectId, projectId),
              eq(projectBusinessProfiles.rowVersion, input.expectedProfileRowVersion)
            )
          )
          .returning({ projectId: projectBusinessProfiles.projectId });
        if (!updated) throw new ConflictException("Business profile changed before import confirmation.");
      } else {
        await tx.insert(projectBusinessProfiles).values({
          projectId,
          currentRevisionId: revision.id,
          status: "confirmed",
          confirmedAt: now,
          confirmedByUserId: actorUserId
        });
      }
    });
    return loadBusinessProfileResponse(db, projectId);
  }

  async createKnowledgeVersion(
    projectId: string,
    input: CreateProjectKnowledgeVersionRequest,
    options: { userId?: string; canApprove: boolean }
  ): Promise<ProjectKnowledgeVersion> {
    const actorUserId = requirePersistedActor(options.userId);
    if (input.sourceKind === "agent")
      throw new BadRequestException("Agent knowledge is admitted only by a worker run.");
    if (input.approveImmediately && !options.canApprove) {
      throw new ForbiddenException("Approving project knowledge requires knowledge:approve.");
    }
    const db = this.database.requireDb();
    const links = input.links ?? [];
    let versionId: string | undefined;
    await db.transaction(async (tx) => {
      await lockProject(tx, projectId);
      await assertKnowledgeSource(tx, projectId, input.sourceKind, input.sourceId);
      await tx
        .insert(projectKnowledgeDocuments)
        .values({ projectId, documentKey: input.documentKey })
        .onConflictDoNothing();
      const [document] = await tx
        .select()
        .from(projectKnowledgeDocuments)
        .where(
          and(
            eq(projectKnowledgeDocuments.projectId, projectId),
            eq(projectKnowledgeDocuments.documentKey, input.documentKey)
          )
        )
        .limit(1);
      if (!document) throw new Error("Failed to create or load project knowledge document.");
      await tx.execute(sql`SELECT "id" FROM "project_knowledge_documents" WHERE "id" = ${document.id} FOR UPDATE`);
      const [lockedDocument] = await tx
        .select()
        .from(projectKnowledgeDocuments)
        .where(eq(projectKnowledgeDocuments.id, document.id))
        .limit(1);
      if (!lockedDocument) throw new Error("Knowledge document disappeared after locking.");
      if (lockedDocument.retiredAt) {
        throw new ConflictException("Retired knowledge documents cannot accept new versions.");
      }
      const [versionCounter] = await tx
        .select({ nextVersion: sql<number>`coalesce(max(${projectKnowledgeVersions.version}), 0) + 1` })
        .from(projectKnowledgeVersions)
        .where(eq(projectKnowledgeVersions.documentId, lockedDocument.id));
      if (!versionCounter) throw new Error("Failed to calculate the next knowledge version.");
      const [version] = await tx
        .insert(projectKnowledgeVersions)
        .values({
          documentId: lockedDocument.id,
          projectId,
          version: Number(versionCounter.nextVersion),
          title: input.title,
          bodyMarkdown: input.bodyMarkdown,
          status: "proposed",
          sourceKind: input.sourceKind,
          sourceId: input.sourceId,
          modelUsePolicy: input.modelUsePolicy,
          contentSha256: sha256(input.bodyMarkdown),
          createdByUserId: actorUserId
        })
        .returning();
      if (!version) throw new Error("Failed to create project knowledge version.");
      versionId = version.id;
      await tx
        .insert(projectKnowledgeTaskScopes)
        .values([...new Set(input.taskScopes)].map((taskScope) => ({ projectId, versionId: version.id, taskScope })));
      if (links.length > 0) {
        const targetIds = [...new Set(links.map((link) => link.toVersionId))].sort();
        const targets = await tx
          .select({ id: projectKnowledgeVersions.id })
          .from(projectKnowledgeVersions)
          .where(
            and(eq(projectKnowledgeVersions.projectId, projectId), inArray(projectKnowledgeVersions.id, targetIds))
          );
        if (targets.length !== targetIds.length) {
          throw new BadRequestException("Knowledge links must target existing versions in the same project.");
        }
        await tx.insert(projectKnowledgeLinks).values(
          links.map((link) => ({
            projectId,
            fromVersionId: version.id,
            toVersionId: link.toVersionId,
            kind: link.kind
          }))
        );
      }
      if (input.approveImmediately) {
        const now = new Date();
        await tx
          .update(projectKnowledgeVersions)
          .set({ status: "approved", reviewedAt: now, reviewedByUserId: actorUserId })
          .where(eq(projectKnowledgeVersions.id, version.id));
        await tx
          .update(projectKnowledgeDocuments)
          .set({ currentApprovedVersionId: version.id, updatedAt: now })
          .where(eq(projectKnowledgeDocuments.id, lockedDocument.id));
      }
    });
    if (!versionId) throw new Error("Knowledge version transaction produced no identity.");
    return loadKnowledgeVersion(db, projectId, versionId);
  }

  async reviewKnowledgeVersion(
    projectId: string,
    versionId: string,
    input: ReviewProjectKnowledgeVersionRequest,
    userId?: string
  ): Promise<ProjectKnowledgeVersion> {
    const actorUserId = requirePersistedActor(userId);
    const db = this.database.requireDb();
    await db.transaction(async (tx) => {
      await lockProject(tx, projectId);
      const [target] = await tx
        .select({ documentId: projectKnowledgeVersions.documentId })
        .from(projectKnowledgeVersions)
        .where(and(eq(projectKnowledgeVersions.id, versionId), eq(projectKnowledgeVersions.projectId, projectId)))
        .limit(1);
      if (!target) throw new NotFoundException("Knowledge version was not found for this project.");
      await tx.execute(
        sql`SELECT "id" FROM "project_knowledge_documents" WHERE "id" = ${target.documentId} AND "project_id" = ${projectId} FOR UPDATE`
      );
      await tx.execute(
        sql`SELECT "id" FROM "project_knowledge_versions" WHERE "id" = ${versionId} AND "project_id" = ${projectId} FOR UPDATE`
      );
      const [current] = await tx
        .select()
        .from(projectKnowledgeVersions)
        .where(and(eq(projectKnowledgeVersions.id, versionId), eq(projectKnowledgeVersions.projectId, projectId)))
        .limit(1);
      if (!current) throw new NotFoundException("Knowledge version was not found for this project.");
      const [document] = await tx
        .select({ retiredAt: projectKnowledgeDocuments.retiredAt })
        .from(projectKnowledgeDocuments)
        .where(
          and(eq(projectKnowledgeDocuments.id, current.documentId), eq(projectKnowledgeDocuments.projectId, projectId))
        )
        .limit(1);
      if (!document || document.retiredAt) {
        throw new ConflictException("Retired knowledge documents cannot be reviewed.");
      }
      const decision = decideKnowledgeReview({
        currentStatus: current.status,
        expectedStatus: input.expectedStatus,
        currentModelUsePolicy: current.modelUsePolicy,
        expectedModelUsePolicy: input.expectedModelUsePolicy,
        decision: input.decision,
        sourceKind: current.sourceKind,
        actorUserId,
        rejectionReason: input.reason
      });
      if (decision.kind === "deny") throw new ConflictException(`Knowledge review was rejected: ${decision.reason}.`);
      const now = new Date();
      const [updated] = await tx
        .update(projectKnowledgeVersions)
        .set({
          status: decision.nextStatus,
          reviewedByUserId: actorUserId,
          reviewedAt: now,
          rejectionReason: decision.nextStatus === "rejected" ? input.reason : null
        })
        .where(
          and(
            eq(projectKnowledgeVersions.id, versionId),
            eq(projectKnowledgeVersions.projectId, projectId),
            eq(projectKnowledgeVersions.status, input.expectedStatus),
            eq(projectKnowledgeVersions.modelUsePolicy, input.expectedModelUsePolicy)
          )
        )
        .returning();
      if (!updated) throw new ConflictException("Knowledge version changed before review.");
      if (decision.nextStatus === "approved") {
        await tx
          .update(projectKnowledgeDocuments)
          .set({ currentApprovedVersionId: versionId, updatedAt: now })
          .where(eq(projectKnowledgeDocuments.id, current.documentId));
      }
    });
    return loadKnowledgeVersion(db, projectId, versionId);
  }

  async retireKnowledgeDocument(
    projectId: string,
    documentId: string,
    input: RetireProjectKnowledgeDocumentRequest,
    userId?: string
  ): Promise<RetireProjectKnowledgeDocumentResponse> {
    const actorUserId = requirePersistedActor(userId);
    const db = this.database.requireDb();
    const result = await db.transaction(async (tx) => {
      await lockProject(tx, projectId);
      await tx.execute(
        sql`SELECT "id" FROM "project_knowledge_documents" WHERE "id" = ${documentId} AND "project_id" = ${projectId} FOR UPDATE`
      );
      const [document] = await tx
        .select()
        .from(projectKnowledgeDocuments)
        .where(and(eq(projectKnowledgeDocuments.id, documentId), eq(projectKnowledgeDocuments.projectId, projectId)))
        .limit(1);
      if (!document) throw new NotFoundException("Knowledge document was not found for this project.");
      const decision = decideKnowledgeRetirement({
        currentApprovedVersionId: document.currentApprovedVersionId,
        expectedCurrentApprovedVersionId: input.expectedCurrentApprovedVersionId,
        retiredAt: document.retiredAt
      });
      if (decision.kind === "deny") {
        throw new ConflictException(`Knowledge retirement was rejected: ${decision.reason}.`);
      }
      const now = new Date();
      const [updated] = await tx
        .update(projectKnowledgeDocuments)
        .set({
          currentApprovedVersionId: null,
          retiredAt: now,
          retiredByUserId: actorUserId,
          retirementReason: input.reason,
          updatedAt: now
        })
        .where(
          and(
            eq(projectKnowledgeDocuments.id, documentId),
            eq(projectKnowledgeDocuments.projectId, projectId),
            eq(projectKnowledgeDocuments.currentApprovedVersionId, input.expectedCurrentApprovedVersionId),
            sql`${projectKnowledgeDocuments.retiredAt} is null`
          )
        )
        .returning({ id: projectKnowledgeDocuments.id });
      if (!updated) throw new ConflictException("Knowledge document changed before retirement.");
      return RetireProjectKnowledgeDocumentResponseSchema.parse({
        documentId,
        projectId,
        retiredVersionId: input.expectedCurrentApprovedVersionId,
        retiredByUserId: actorUserId,
        retiredAt: now.toISOString(),
        reason: input.reason
      });
    });
    return result;
  }

  async searchKnowledge(
    projectId: string,
    input: ProjectKnowledgeSearchRequest
  ): Promise<ProjectKnowledgeSearchResponse> {
    const db = this.database.requireDb();
    const conditions = [eq(projectKnowledgeVersions.projectId, projectId)];
    if (input.status) conditions.push(eq(projectKnowledgeVersions.status, input.status));
    if (input.query) {
      conditions.push(
        sql`to_tsvector('simple', ${projectKnowledgeVersions.title} || ' ' || ${projectKnowledgeVersions.bodyMarkdown}) @@ websearch_to_tsquery('simple', ${input.query})`
      );
    }
    if (input.taskScope) {
      conditions.push(eq(projectKnowledgeTaskScopes.taskScope, input.taskScope));
    }
    const rows = await db
      .select({ id: projectKnowledgeVersions.id })
      .from(projectKnowledgeVersions)
      .innerJoin(projectKnowledgeDocuments, eq(projectKnowledgeDocuments.id, projectKnowledgeVersions.documentId))
      .leftJoin(projectKnowledgeTaskScopes, eq(projectKnowledgeTaskScopes.versionId, projectKnowledgeVersions.id))
      .where(and(...conditions))
      .groupBy(projectKnowledgeVersions.id, projectKnowledgeVersions.createdAt)
      .orderBy(desc(projectKnowledgeVersions.createdAt))
      .limit(input.limit);
    const records = await loadKnowledgeVersions(
      db,
      projectId,
      rows.map((row) => row.id)
    );
    return ProjectKnowledgeSearchResponseSchema.parse({ projectId, records });
  }
}

@Controller("projects/:projectId/business-profile")
@UseGuards(BetterAuthGuard, CsrfGuard, ProjectAccessGuard, PermissionGuard)
@RequireProjectPermission("project:read")
class ProjectBusinessProfileController {
  constructor(@Inject(ProjectContextService) private readonly context: ProjectContextService) {}

  @Get()
  get(@Param("projectId") projectId: string) {
    return this.context.getBusinessProfile(projectId);
  }

  @Put()
  @RequireProjectPermission("project:configure")
  update(@Param("projectId") projectId: string, @Body() body: unknown, @Req() request: RequestWithAuth) {
    const parsed = UpdateProjectBusinessProfileRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException("Business profile update is invalid.");
    return this.context.updateBusinessProfile(projectId, parsed.data, request.auth?.user.id);
  }

  @Post("confirm")
  @RequireProjectPermission("project:configure")
  confirm(@Param("projectId") projectId: string, @Body() body: unknown, @Req() request: RequestWithAuth) {
    const parsed = ConfirmProjectBusinessProfileRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException("Business profile confirmation is invalid.");
    return this.context.confirmBusinessProfile(projectId, parsed.data, request.auth?.user.id);
  }

  @Post("confirm-import")
  @RequireProjectPermission("project:configure")
  confirmImport(@Param("projectId") projectId: string, @Body() body: unknown, @Req() request: RequestWithAuth) {
    const parsed = ConfirmWebsiteImportKnowledgeRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException("Website import confirmation is invalid.");
    return this.context.confirmWebsiteImport(projectId, parsed.data, request.auth?.user.id);
  }
}

@Controller("projects/:projectId/knowledge")
@UseGuards(BetterAuthGuard, CsrfGuard, ProjectAccessGuard, PermissionGuard)
@RequireProjectPermission("project:read")
class ProjectKnowledgeController {
  constructor(@Inject(ProjectContextService) private readonly context: ProjectContextService) {}

  @Get()
  search(@Param("projectId") projectId: string, @Query() query: unknown) {
    const parsed = ProjectKnowledgeSearchRequestSchema.safeParse(query ?? {});
    if (!parsed.success) throw new BadRequestException("Knowledge search query is invalid.");
    return this.context.searchKnowledge(projectId, parsed.data);
  }

  @Post()
  @RequireProjectPermission("knowledge:write")
  create(@Param("projectId") projectId: string, @Body() body: unknown, @Req() request: RequestWithAuth) {
    const parsed = CreateProjectKnowledgeVersionRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException("Knowledge version is invalid.");
    const role = request.projectAccess?.role;
    return this.context.createKnowledgeVersion(projectId, parsed.data, {
      userId: request.auth?.user.id,
      canApprove: role ? roleHasProjectPermission(role, "knowledge:approve") : false
    });
  }

  @Patch(":versionId/review")
  @RequireProjectPermission("knowledge:approve")
  review(
    @Param("projectId") projectId: string,
    @Param("versionId") versionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth
  ) {
    const parsed = ReviewProjectKnowledgeVersionRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException("Knowledge review decision is invalid.");
    return this.context.reviewKnowledgeVersion(projectId, versionId, parsed.data, request.auth?.user.id);
  }

  @Patch("documents/:documentId/retire")
  @RequireProjectPermission("knowledge:approve")
  retire(
    @Param("projectId") projectId: string,
    @Param("documentId") documentId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth
  ) {
    const parsed = RetireProjectKnowledgeDocumentRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException("Knowledge retirement request is invalid.");
    return this.context.retireKnowledgeDocument(projectId, documentId, parsed.data, request.auth?.user.id);
  }
}

@Module({
  controllers: [ProjectBusinessProfileController, ProjectKnowledgeController],
  providers: [ProjectContextService],
  exports: [ProjectContextService]
})
export class ProjectContextModule {}

async function lockProject(tx: TransactionClient, projectId: string): Promise<void> {
  const rows = await tx.execute(sql`SELECT "id" FROM "projects" WHERE "id" = ${projectId} FOR UPDATE`);
  if (rows.length === 0) throw new NotFoundException("Project was not found.");
}

async function loadProfileState(db: Pick<DatabaseClient, "select">, projectId: string) {
  const [row] = await db
    .select()
    .from(projectBusinessProfiles)
    .where(eq(projectBusinessProfiles.projectId, projectId))
    .limit(1);
  return row;
}

function assertExpectedProfileRevision(actual: number, expected: number): void {
  if (actual !== expected) throw new ConflictException("Business profile changed; refresh before retrying.");
}

async function insertProfileRevision(
  tx: TransactionClient,
  input: {
    projectId: string;
    profile: UpdateProjectBusinessProfileRequest["profile"];
    sourceImportRunId?: string;
    actorUserId: string;
  }
) {
  const [revisionCounter] = await tx
    .select({ nextRevision: sql<number>`coalesce(max(${projectBusinessProfileRevisions.revision}), 0) + 1` })
    .from(projectBusinessProfileRevisions)
    .where(eq(projectBusinessProfileRevisions.projectId, input.projectId));
  if (!revisionCounter) throw new Error("Failed to calculate the next business profile revision.");
  const canonical = canonicalizeProjectBusinessProfileContent(input.profile);
  const [revision] = await tx
    .insert(projectBusinessProfileRevisions)
    .values({
      projectId: input.projectId,
      revision: Number(revisionCounter.nextRevision),
      profileJson: input.profile,
      profileSha256: sha256(canonical),
      sourceImportRunId: input.sourceImportRunId,
      createdByUserId: input.actorUserId
    })
    .returning();
  if (!revision) throw new Error("Failed to create business profile revision.");
  return revision;
}

async function assertCompletedImport(tx: TransactionClient, projectId: string, importRunId: string): Promise<void> {
  const [row] = await tx
    .select({ id: websiteImportRuns.id })
    .from(websiteImportRuns)
    .where(
      and(
        eq(websiteImportRuns.id, importRunId),
        eq(websiteImportRuns.projectId, projectId),
        eq(websiteImportRuns.status, "completed")
      )
    )
    .limit(1);
  if (!row) throw new BadRequestException("Website import must be completed and belong to this project.");
}

async function insertCanonicalEntities(
  tx: TransactionClient,
  input: {
    projectId: string;
    names: readonly string[];
    kind: "service" | "area";
    sourceKind: "manual" | "website_import";
    sourceId?: string;
  }
): Promise<string[]> {
  const table = input.kind === "service" ? services : areas;
  const normalized = [...new Map(input.names.map((name) => [name.trim().toLowerCase(), name.trim()])).values()];
  for (const name of normalized) {
    await tx
      .insert(table)
      .values({ projectId: input.projectId, name, sourceKind: input.sourceKind, sourceId: input.sourceId })
      .onConflictDoNothing();
  }
  if (normalized.length === 0) return [];
  const rows = await tx
    .select({ id: table.id, status: table.status })
    .from(table)
    .where(
      and(
        eq(table.projectId, input.projectId),
        inArray(
          sql`lower(${table.name})`,
          normalized.map((name) => name.toLowerCase())
        )
      )
    )
    .orderBy(asc(table.id));
  if (rows.length !== normalized.length || rows.some((row) => row.status === "rejected")) {
    throw new ConflictException(`One or more ${input.kind} records are rejected or ambiguous.`);
  }
  return rows.map((row) => row.id);
}

async function confirmCanonicalEntities(
  tx: TransactionClient,
  input: { projectId: string; ids: readonly string[]; kind: "service" | "area"; actorUserId: string }
): Promise<void> {
  const table = input.kind === "service" ? services : areas;
  const ids = [...new Set(input.ids)].sort();
  if (ids.length === 0) throw new BadRequestException(`At least one ${input.kind} is required.`);
  await tx.execute(sql`SELECT "id" FROM ${table} WHERE "project_id" = ${input.projectId} ORDER BY "id" FOR UPDATE`);
  const rows = await tx
    .select({ id: table.id, status: table.status })
    .from(table)
    .where(eq(table.projectId, input.projectId))
    .orderBy(asc(table.id));
  const selectedRows = rows.filter((row) => ids.includes(row.id));
  if (selectedRows.length !== ids.length || selectedRows.some((row) => row.status === "rejected")) {
    throw new BadRequestException(`Every selected ${input.kind} must belong to this project and remain reviewable.`);
  }
  const now = new Date();
  const confirmIds = selectedRows
    .filter((row) => row.status === "proposed" || row.status === "retired")
    .map((row) => row.id);
  if (confirmIds.length > 0) {
    await tx
      .update(table)
      .set({
        status: "confirmed",
        confirmedAt: now,
        confirmedByUserId: input.actorUserId,
        retiredAt: null,
        retiredByUserId: null,
        updatedAt: now
      })
      .where(
        and(
          eq(table.projectId, input.projectId),
          inArray(table.id, confirmIds),
          inArray(table.status, ["proposed", "retired"])
        )
      );
  }
  const retireIds = rows.filter((row) => row.status === "confirmed" && !ids.includes(row.id)).map((row) => row.id);
  if (retireIds.length > 0) {
    await tx
      .update(table)
      .set({ status: "retired", retiredAt: now, retiredByUserId: input.actorUserId, updatedAt: now })
      .where(and(eq(table.projectId, input.projectId), inArray(table.id, retireIds), eq(table.status, "confirmed")));
  }
}

async function assertKnowledgeSource(
  tx: TransactionClient,
  projectId: string,
  sourceKind: CreateProjectKnowledgeVersionRequest["sourceKind"],
  sourceId?: string
): Promise<void> {
  if (sourceKind === "human") {
    if (sourceId) throw new BadRequestException("Human knowledge cannot claim an external source id.");
    return;
  }
  if (!sourceId) throw new BadRequestException(`${sourceKind} knowledge requires a source id.`);
  if (sourceKind === "website_import") {
    await assertCompletedImport(tx, projectId, sourceId);
    return;
  }
  if (sourceKind === "research") {
    const [run] = await tx
      .select({ id: agentRuns.id })
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.id, sourceId),
          eq(agentRuns.projectId, projectId),
          eq(agentRuns.status, "succeeded"),
          eq(agentRuns.workflowName, "opportunity_research")
        )
      )
      .limit(1);
    if (!run) {
      throw new BadRequestException(
        "Research knowledge source must be a succeeded Opportunity Research run in this project."
      );
    }
    return;
  }
  throw new BadRequestException(`${sourceKind} knowledge is not admitted through this API yet.`);
}

async function loadBusinessProfileResponse(
  db: DatabaseClient,
  projectId: string
): Promise<ProjectBusinessProfileResponse> {
  const [state] = await db
    .select({ profile: projectBusinessProfiles, revision: projectBusinessProfileRevisions })
    .from(projectBusinessProfiles)
    .leftJoin(
      projectBusinessProfileRevisions,
      eq(projectBusinessProfileRevisions.id, projectBusinessProfiles.currentRevisionId)
    )
    .where(eq(projectBusinessProfiles.projectId, projectId))
    .limit(1);
  const serviceRows = await db
    .select()
    .from(services)
    .where(eq(services.projectId, projectId))
    .orderBy(asc(services.name));
  const areaRows = await db.select().from(areas).where(eq(areas.projectId, projectId)).orderBy(asc(areas.name));
  return ProjectBusinessProfileResponseSchema.parse({
    projectId,
    status: state?.profile.status ?? "draft",
    rowVersion: state?.profile.rowVersion ?? 0,
    currentRevision: state?.revision
      ? {
          id: state.revision.id,
          projectId: state.revision.projectId,
          revision: state.revision.revision,
          profile: state.revision.profileJson,
          sourceImportRunId: state.revision.sourceImportRunId ?? undefined,
          createdByUserId: state.revision.createdByUserId ?? undefined,
          createdAt: state.revision.createdAt.toISOString()
        }
      : undefined,
    services: serviceRows.map(canonicalEntityResponse),
    areas: areaRows.map(canonicalEntityResponse),
    confirmedAt: state?.profile.confirmedAt?.toISOString(),
    confirmedByUserId: state?.profile.confirmedByUserId ?? undefined
  });
}

function canonicalEntityResponse(row: typeof services.$inferSelect | typeof areas.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    sourceKind: row.sourceKind,
    sourceId: row.sourceId ?? undefined,
    rowVersion: row.rowVersion,
    confirmedAt: row.confirmedAt?.toISOString(),
    confirmedByUserId: row.confirmedByUserId ?? undefined,
    retiredAt: row.retiredAt?.toISOString(),
    retiredByUserId: row.retiredByUserId ?? undefined
  };
}

async function loadKnowledgeVersion(
  db: DatabaseClient,
  projectId: string,
  versionId: string
): Promise<ProjectKnowledgeVersion> {
  const [record] = await loadKnowledgeVersions(db, projectId, [versionId]);
  if (!record) throw new NotFoundException("Knowledge version was not found for this project.");
  return record;
}

async function loadKnowledgeVersions(
  db: DatabaseClient,
  projectId: string,
  versionIds: string[]
): Promise<ProjectKnowledgeVersion[]> {
  if (versionIds.length === 0) return [];
  const versionRows = await db
    .select({
      version: projectKnowledgeVersions,
      documentKey: projectKnowledgeDocuments.documentKey,
      currentApprovedVersionId: projectKnowledgeDocuments.currentApprovedVersionId,
      documentRetiredAt: projectKnowledgeDocuments.retiredAt
    })
    .from(projectKnowledgeVersions)
    .innerJoin(projectKnowledgeDocuments, eq(projectKnowledgeDocuments.id, projectKnowledgeVersions.documentId))
    .where(and(inArray(projectKnowledgeVersions.id, versionIds), eq(projectKnowledgeVersions.projectId, projectId)));
  if (versionRows.length !== versionIds.length) {
    throw new NotFoundException("Knowledge version was not found for this project.");
  }
  const versionById = new Map(versionRows.map((row) => [row.version.id, row]));
  const scopeRows = await db
    .select({ versionId: projectKnowledgeTaskScopes.versionId, taskScope: projectKnowledgeTaskScopes.taskScope })
    .from(projectKnowledgeTaskScopes)
    .where(inArray(projectKnowledgeTaskScopes.versionId, versionIds))
    .orderBy(asc(projectKnowledgeTaskScopes.versionId), asc(projectKnowledgeTaskScopes.taskScope));
  const scopesByVersionId = new Map<string, Array<(typeof scopeRows)[number]["taskScope"]>>();
  for (const scope of scopeRows) {
    scopesByVersionId.set(scope.versionId, [...(scopesByVersionId.get(scope.versionId) ?? []), scope.taskScope]);
  }
  const linkRows = await db
    .select({
      fromVersionId: projectKnowledgeLinks.fromVersionId,
      toVersionId: projectKnowledgeLinks.toVersionId,
      kind: projectKnowledgeLinks.kind
    })
    .from(projectKnowledgeLinks)
    .where(inArray(projectKnowledgeLinks.fromVersionId, versionIds))
    .orderBy(
      asc(projectKnowledgeLinks.fromVersionId),
      asc(projectKnowledgeLinks.kind),
      asc(projectKnowledgeLinks.toVersionId)
    );
  const linksByVersionId = new Map<string, Array<{ toVersionId: string; kind: (typeof linkRows)[number]["kind"] }>>();
  for (const link of linkRows) {
    linksByVersionId.set(link.fromVersionId, [
      ...(linksByVersionId.get(link.fromVersionId) ?? []),
      { toVersionId: link.toVersionId, kind: link.kind }
    ]);
  }
  return versionIds.map((versionId) => {
    const row = versionById.get(versionId);
    if (!row) throw new NotFoundException("Knowledge version was not found for this project.");
    return ProjectKnowledgeVersionSchema.parse({
      id: row.version.id,
      documentId: row.version.documentId,
      projectId: row.version.projectId,
      documentKey: row.documentKey,
      version: row.version.version,
      title: row.version.title,
      bodyMarkdown: row.version.bodyMarkdown,
      status: row.version.status,
      sourceKind: row.version.sourceKind,
      sourceId: row.version.sourceId ?? undefined,
      modelUsePolicy: row.version.modelUsePolicy,
      isCurrent: row.currentApprovedVersionId === row.version.id,
      documentRetiredAt: row.documentRetiredAt?.toISOString(),
      contentSha256: row.version.contentSha256,
      taskScopes: scopesByVersionId.get(versionId) ?? [],
      links: linksByVersionId.get(versionId) ?? [],
      createdByUserId: row.version.createdByUserId ?? undefined,
      reviewedByUserId: row.version.reviewedByUserId ?? undefined,
      reviewedAt: row.version.reviewedAt?.toISOString(),
      rejectionReason: row.version.rejectionReason ?? undefined,
      createdAt: row.version.createdAt.toISOString()
    });
  });
}

function requirePersistedActor(userId: string | undefined): string {
  if (!userId) throw new ForbiddenException("A persisted actor is required for this operation.");
  return userId;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
