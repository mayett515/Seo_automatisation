import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Injectable,
  Module,
  NotFoundException,
  Param,
  UnprocessableEntityException,
  UseGuards
} from "@nestjs/common";
import {
  PageJsonSchema,
  PageProposalDetailSchema,
  PageProposalJsonSchema,
  PageProposalListResponseSchema,
  PageProposalSummarySchema,
  PageVersionDetailSchema,
  PageVersionListResponseSchema,
  PageVersionPreviewResponseSchema,
  PageVersionSummarySchema,
  type PageJson,
  type PageProposalDetail,
  type PageProposalListResponse,
  type PageProposalSummary,
  type PageVersionDetail,
  type PageVersionListResponse,
  type PageVersionPreviewResponse,
  type PageVersionSummary
} from "@localseo/contracts";
import { pageProposals, pageVersions, type DatabaseClient } from "@localseo/db";
import { renderPagePreviewFile, validatePageJsonAgainstRegistry } from "@localseo/page-registry";
import { and, desc, eq, sql } from "drizzle-orm";
import { BetterAuthGuard } from "../auth/guards/better-auth.guard.js";
import { PermissionGuard } from "../auth/permissions/permission.guard.js";
import { RequireProjectPermission } from "../auth/permissions/require-permission.decorator.js";
import { ProjectAccessGuard } from "../auth/project-access.guard.js";
import { DatabaseService } from "../database/database.service.js";
import { CsrfGuard } from "../security/csrf/csrf.guard.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/iu;

type Db = DatabaseClient;
type PageProposalRow = Awaited<ReturnType<typeof selectPageProposalRows>>[number];
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
