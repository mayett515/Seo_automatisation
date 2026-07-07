import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UnprocessableEntityException,
  UseGuards
} from "@nestjs/common";
import {
  CreatePageSectionNoteRequestSchema,
  PageJsonSchema,
  PageProposalDetailSchema,
  PageProposalJsonSchema,
  PageProposalListResponseSchema,
  PageProposalSummarySchema,
  PageSectionNoteFieldPathSchema,
  PageSectionNoteListResponseSchema,
  PageSectionNoteSchema,
  PageVersionDetailSchema,
  PageVersionListResponseSchema,
  PageVersionPreviewResponseSchema,
  PageVersionSummarySchema,
  type CreatePageSectionNoteRequest,
  type PageJson,
  type PageProposalDetail,
  type PageProposalListResponse,
  type PageProposalSummary,
  type PageSectionNote,
  type PageSectionNoteListResponse,
  type PageVersionDetail,
  type PageVersionListResponse,
  type PageVersionPreviewResponse,
  type PageVersionSummary
} from "@localseo/contracts";
import { pageProposals, pageSectionNotes, pageVersions, type DatabaseClient } from "@localseo/db";
import { renderPagePreviewFile, validatePageJsonAgainstRegistry } from "@localseo/page-registry";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { BetterAuthGuard } from "../auth/guards/better-auth.guard.js";
import { PermissionGuard } from "../auth/permissions/permission.guard.js";
import { RequireProjectPermission } from "../auth/permissions/require-permission.decorator.js";
import { ProjectAccessGuard } from "../auth/project-access.guard.js";
import type { RequestWithAuth } from "../auth/types/authenticated-request.js";
import { DatabaseService } from "../database/database.service.js";
import { CsrfGuard } from "../security/csrf/csrf.guard.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/iu;

type Db = DatabaseClient;
type PageProposalRow = Awaited<ReturnType<typeof selectPageProposalRows>>[number];
type PageSectionNoteRow = Awaited<ReturnType<typeof selectPageSectionNoteRows>>[number];
type PageVersionRow = Awaited<ReturnType<typeof selectPageVersionRows>>[number];

@Injectable()
export class PagesService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listPageVersions(projectId: string): Promise<PageVersionListResponse> {
    const db = this.database.requireDb();
    const rows = await selectPageVersionRows(db, projectId);

    return PageVersionListResponseSchema.parse({
      projectId,
      pageVersions: rows.map((row) => pageVersionSummaryToResponse(row))
    });
  }

  async listPageProposals(projectId: string): Promise<PageProposalListResponse> {
    const db = this.database.requireDb();
    const proposalRows = await selectPageProposalRows(db, projectId);
    const versionCounts = await selectPageVersionCountsByProposal(db, projectId);

    return PageProposalListResponseSchema.parse({
      projectId,
      pageProposals: proposalRows.map((row) => pageProposalSummaryToResponse(row, versionCounts.get(row.id) ?? 0))
    });
  }

  async getPageProposal(projectId: string, pageProposalId: string): Promise<PageProposalDetail> {
    const proposal = await this.loadPageProposal(projectId, pageProposalId);
    const versions = await selectPageVersionRows(this.database.requireDb(), projectId, { pageProposalId });
    const proposalJson = parseStoredProposalJson(proposal);

    return PageProposalDetailSchema.parse({
      ...pageProposalSummaryToResponse(proposal, versions.length),
      proposalJson,
      versions: versions.map((row) => pageVersionSummaryToResponse(row))
    });
  }

  async getPageVersion(projectId: string, pageVersionId: string): Promise<PageVersionDetail> {
    const row = await this.loadPageVersion(projectId, pageVersionId);
    const pageJson = parseStoredPageJson(row);

    return PageVersionDetailSchema.parse({
      ...pageVersionSummaryToResponse(row),
      pageJson
    });
  }

  async previewPageVersion(projectId: string, pageVersionId: string): Promise<PageVersionPreviewResponse> {
    const row = await this.loadPageVersion(projectId, pageVersionId);
    const pageJson = parseStoredPageJson(row);

    try {
      return PageVersionPreviewResponseSchema.parse({
        projectId,
        pageVersionId: row.id,
        route: row.route,
        mode: "editor",
        file: renderPagePreviewFile({
          pageJson,
          pageVersionId: row.id,
          previewId: row.id,
          targetUrl: row.route,
          mode: "editor"
        })
      });
    } catch {
      throw new UnprocessableEntityException("Page version cannot be rendered as a preview.");
    }
  }

  async listPageSectionNotes(projectId: string, pageVersionId: string): Promise<PageSectionNoteListResponse> {
    const row = await this.loadPageVersion(projectId, pageVersionId);
    const notes = await selectPageSectionNoteRows(this.database.requireDb(), row.id);

    return PageSectionNoteListResponseSchema.parse({
      projectId,
      pageVersionId: row.id,
      notes: notes.map((note) => pageSectionNoteToResponse(projectId, note))
    });
  }

  async createPageSectionNote(
    projectId: string,
    pageVersionId: string,
    body: unknown,
    createdByUserId?: string
  ): Promise<PageSectionNote> {
    const input = CreatePageSectionNoteRequestSchema.parse(body ?? {});
    const row = await this.loadPageVersion(projectId, pageVersionId);
    const pageJson = parseStoredPageJson(row);

    assertPageJsonSectionExists(pageJson, input.sectionId);

    const [note] = await this.database
      .requireDb()
      .insert(pageSectionNotes)
      .values({
        pageVersionId: row.id,
        sectionId: input.sectionId,
        fieldPath: input.fieldPath,
        instructionType: input.instructionType,
        note: input.note,
        createdByUserId
      })
      .returning();

    if (!note) {
      throw new Error("Failed to create page section note.");
    }

    return pageSectionNoteToResponse(projectId, note);
  }

  async resolvePageSectionNote(
    projectId: string,
    pageVersionId: string,
    noteId: string,
    resolvedByUserId?: string
  ): Promise<PageSectionNote> {
    if (!isPersistedId(noteId)) {
      throw new BadRequestException("Page section note id must be a UUID.");
    }

    const pageVersion = await this.loadPageVersion(projectId, pageVersionId);
    const db = this.database.requireDb();
    const [existing] = await selectPageSectionNoteRows(db, pageVersion.id, noteId);

    if (!existing) {
      throw new NotFoundException("Page section note was not found for this page version.");
    }

    if (existing.resolvedAt) {
      return pageSectionNoteToResponse(projectId, existing);
    }

    const [resolved] = await db
      .update(pageSectionNotes)
      .set({
        resolvedAt: new Date(),
        resolvedByUserId,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(pageSectionNotes.id, noteId),
          eq(pageSectionNotes.pageVersionId, pageVersion.id),
          isNull(pageSectionNotes.resolvedAt)
        )
      )
      .returning();

    if (resolved) {
      return pageSectionNoteToResponse(projectId, resolved);
    }

    const [latest] = await selectPageSectionNoteRows(db, pageVersion.id, noteId);

    return pageSectionNoteToResponse(projectId, latest ?? existing);
  }

  private async loadPageVersion(projectId: string, pageVersionId: string): Promise<PageVersionRow> {
    if (!isPersistedId(pageVersionId)) {
      throw new BadRequestException("Page version id must be a UUID.");
    }

    const [row] = await selectPageVersionRows(this.database.requireDb(), projectId, { pageVersionId });

    if (!row) {
      throw new NotFoundException("Page version was not found for this project.");
    }

    return row;
  }

  private async loadPageProposal(projectId: string, pageProposalId: string): Promise<PageProposalRow> {
    if (!isPersistedId(pageProposalId)) {
      throw new BadRequestException("Page proposal id must be a UUID.");
    }

    const [row] = await selectPageProposalRows(this.database.requireDb(), projectId, pageProposalId);

    if (!row) {
      throw new NotFoundException("Page proposal was not found for this project.");
    }

    return row;
  }
}

@Controller("projects/:projectId/pages")
@UseGuards(BetterAuthGuard, CsrfGuard, ProjectAccessGuard, PermissionGuard)
@RequireProjectPermission("project:read")
class PagesController {
  constructor(@Inject(PagesService) private readonly pages: PagesService) {}

  @Get()
  list(@Param("projectId") projectId: string) {
    return this.pages.listPageVersions(projectId);
  }

  @Get("proposals")
  listProposals(@Param("projectId") projectId: string) {
    return this.pages.listPageProposals(projectId);
  }

  @Get("proposals/:pageProposalId")
  getProposal(@Param("projectId") projectId: string, @Param("pageProposalId") pageProposalId: string) {
    return this.pages.getPageProposal(projectId, pageProposalId);
  }

  @Get(":pageVersionId")
  get(@Param("projectId") projectId: string, @Param("pageVersionId") pageVersionId: string) {
    return this.pages.getPageVersion(projectId, pageVersionId);
  }

  @Get(":pageVersionId/preview")
  preview(@Param("projectId") projectId: string, @Param("pageVersionId") pageVersionId: string) {
    return this.pages.previewPageVersion(projectId, pageVersionId);
  }

  @Get(":pageVersionId/notes")
  listNotes(@Param("projectId") projectId: string, @Param("pageVersionId") pageVersionId: string) {
    return this.pages.listPageSectionNotes(projectId, pageVersionId);
  }

  @Post(":pageVersionId/notes")
  @RequireProjectPermission("page:comment")
  createNote(
    @Param("projectId") projectId: string,
    @Param("pageVersionId") pageVersionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth
  ) {
    return this.pages.createPageSectionNote(projectId, pageVersionId, body, persistedActorUserId(request));
  }

  @Patch(":pageVersionId/notes/:noteId/resolve")
  @RequireProjectPermission("page:comment")
  resolveNote(
    @Param("projectId") projectId: string,
    @Param("pageVersionId") pageVersionId: string,
    @Param("noteId") noteId: string,
    @Req() request: RequestWithAuth
  ) {
    return this.pages.resolvePageSectionNote(projectId, pageVersionId, noteId, persistedActorUserId(request));
  }
}

@Module({
  controllers: [PagesController],
  providers: [PagesService]
})
export class PagesModule {}

async function selectPageProposalRows(db: Db, projectId: string, pageProposalId?: string) {
  return db
    .select({
      id: pageProposals.id,
      projectId: pageProposals.projectId,
      opportunityId: pageProposals.opportunityId,
      route: pageProposals.route,
      primaryKeyword: pageProposals.primaryKeyword,
      uniquenessRationale: pageProposals.uniquenessRationale,
      status: pageProposals.status,
      sitemapReady: pageProposals.sitemapReady,
      proposalJson: pageProposals.proposalJson,
      createdAt: pageProposals.createdAt,
      updatedAt: pageProposals.updatedAt
    })
    .from(pageProposals)
    .where(
      pageProposalId
        ? and(eq(pageProposals.projectId, projectId), eq(pageProposals.id, pageProposalId))
        : eq(pageProposals.projectId, projectId)
    )
    .orderBy(desc(pageProposals.updatedAt), desc(pageProposals.createdAt))
    .limit(pageProposalId ? 1 : 100);
}

async function selectPageVersionCountsByProposal(db: Db, projectId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({
      pageProposalId: pageVersions.pageProposalId,
      versionCount: sql<number>`count(*)::int`
    })
    .from(pageVersions)
    .innerJoin(pageProposals, eq(pageVersions.pageProposalId, pageProposals.id))
    .where(eq(pageProposals.projectId, projectId))
    .groupBy(pageVersions.pageProposalId);

  return new Map(rows.map((row) => [row.pageProposalId, row.versionCount]));
}

async function selectPageSectionNoteRows(db: Db, pageVersionId: string, noteId?: string) {
  return db
    .select()
    .from(pageSectionNotes)
    .where(
      noteId
        ? and(eq(pageSectionNotes.pageVersionId, pageVersionId), eq(pageSectionNotes.id, noteId))
        : eq(pageSectionNotes.pageVersionId, pageVersionId)
    )
    .orderBy(desc(pageSectionNotes.createdAt))
    .limit(noteId ? 1 : 500);
}

async function selectPageVersionRows(
  db: Db,
  projectId: string,
  filter: { pageVersionId?: string; pageProposalId?: string } = {}
) {
  return db
    .select({
      id: pageVersions.id,
      projectId: pageProposals.projectId,
      pageProposalId: pageVersions.pageProposalId,
      opportunityId: pageProposals.opportunityId,
      route: pageProposals.route,
      primaryKeyword: pageProposals.primaryKeyword,
      uniquenessRationale: pageProposals.uniquenessRationale,
      proposalStatus: pageProposals.status,
      sitemapReady: pageProposals.sitemapReady,
      versionNumber: pageVersions.versionNumber,
      status: pageVersions.status,
      pageJson: pageVersions.pageJson,
      approvedAt: pageVersions.approvedAt,
      createdAt: pageVersions.createdAt,
      updatedAt: pageVersions.updatedAt
    })
    .from(pageVersions)
    .innerJoin(pageProposals, eq(pageVersions.pageProposalId, pageProposals.id))
    .where(
      filter.pageVersionId
        ? and(eq(pageProposals.projectId, projectId), eq(pageVersions.id, filter.pageVersionId))
        : filter.pageProposalId
          ? and(eq(pageProposals.projectId, projectId), eq(pageVersions.pageProposalId, filter.pageProposalId))
          : eq(pageProposals.projectId, projectId)
    )
    .orderBy(desc(pageVersions.updatedAt), desc(pageVersions.versionNumber))
    .limit(filter.pageVersionId ? 1 : 100);
}

function pageProposalSummaryToResponse(row: PageProposalRow, versionCount: number): PageProposalSummary {
  return PageProposalSummarySchema.parse({
    id: row.id,
    projectId: row.projectId,
    opportunityId: row.opportunityId ?? undefined,
    route: row.route,
    primaryKeyword: row.primaryKeyword,
    uniquenessRationale: row.uniquenessRationale,
    status: row.status,
    sitemapReady: row.sitemapReady,
    versionCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  });
}

function pageVersionSummaryToResponse(row: PageVersionRow): PageVersionSummary {
  return PageVersionSummarySchema.parse({
    id: row.id,
    projectId: row.projectId,
    pageProposalId: row.pageProposalId,
    opportunityId: row.opportunityId ?? undefined,
    route: row.route,
    primaryKeyword: row.primaryKeyword,
    uniquenessRationale: row.uniquenessRationale,
    proposalStatus: row.proposalStatus,
    sitemapReady: row.sitemapReady,
    versionNumber: row.versionNumber,
    status: row.status,
    approvedAt: row.approvedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  });
}

function pageSectionNoteToResponse(projectId: string, row: PageSectionNoteRow): PageSectionNote {
  const fieldPath = PageSectionNoteFieldPathSchema.parse(row.fieldPath);

  return PageSectionNoteSchema.parse({
    id: row.id,
    projectId,
    pageVersionId: row.pageVersionId,
    sectionId: row.sectionId,
    fieldPath,
    instructionType: row.instructionType,
    note: row.note,
    status: row.resolvedAt ? "resolved" : "open",
    createdByUserId: row.createdByUserId ?? undefined,
    resolvedByUserId: row.resolvedByUserId ?? undefined,
    resolvedAt: row.resolvedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  });
}

function parseStoredPageJson(row: PageVersionRow): PageJson {
  const parsed = PageJsonSchema.safeParse(row.pageJson);

  if (!parsed.success) {
    throw new UnprocessableEntityException("Stored PageJson failed contract validation.");
  }

  if (parsed.data.route !== row.route) {
    throw new UnprocessableEntityException("Stored PageJson route does not match the page proposal route.");
  }

  if (parsed.data.target.primaryKeyword !== row.primaryKeyword) {
    throw new UnprocessableEntityException("Stored PageJson primary keyword does not match the page proposal keyword.");
  }

  if (parsed.data.seo.canonicalPath !== row.route) {
    throw new UnprocessableEntityException("Stored PageJson canonical path does not match the page proposal route.");
  }

  const registryValidation = validatePageJsonAgainstRegistry(parsed.data);

  if (!registryValidation.success) {
    throw new UnprocessableEntityException("Stored PageJson failed registry validation.");
  }

  return parsed.data;
}

function assertPageJsonSectionExists(pageJson: PageJson, sectionId: CreatePageSectionNoteRequest["sectionId"]): void {
  const section = pageJson.sections.find((candidate) => candidate.id === sectionId);

  if (!section) {
    throw new UnprocessableEntityException("Page section note must target an existing PageJson section id.");
  }
}

function parseStoredProposalJson(row: PageProposalRow): ReturnType<typeof PageProposalJsonSchema.parse> | undefined {
  if (!row.proposalJson) {
    return undefined;
  }

  const parsed = PageProposalJsonSchema.safeParse(row.proposalJson);

  if (!parsed.success) {
    throw new UnprocessableEntityException("Stored PageProposalJson failed contract validation.");
  }

  if (parsed.data.projectId !== row.projectId) {
    throw new UnprocessableEntityException("Stored PageProposalJson project does not match the page proposal project.");
  }

  if (parsed.data.route !== row.route) {
    throw new UnprocessableEntityException("Stored PageProposalJson route does not match the page proposal route.");
  }

  if (parsed.data.primaryKeyword !== row.primaryKeyword) {
    throw new UnprocessableEntityException(
      "Stored PageProposalJson primary keyword does not match the page proposal keyword."
    );
  }

  return parsed.data;
}

function isPersistedId(value: string): boolean {
  return uuidPattern.test(value);
}

function persistedActorUserId(request: RequestWithAuth): string | undefined {
  const userId = request.auth?.user.id;
  return userId && isPersistedId(userId) ? userId : undefined;
}
