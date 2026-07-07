import { randomUUID } from "node:crypto";
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
  type AiReasoningEnqueueFailureCode,
  CreatePageProposalRunRequestSchema,
  CreatePageSectionNoteRequestSchema,
  PageJsonSchema,
  PageProposalJobDataSchema,
  PageProposalDetailSchema,
  PageProposalJsonSchema,
  PageProposalListResponseSchema,
  PageProposalQueueResponseSchema,
  PageProposalSummarySchema,
  PageSectionNoteFieldPathSchema,
  PageSectionNoteListResponseSchema,
  PageSectionNoteSchema,
  PageVersionDetailSchema,
  PageVersionListResponseSchema,
  PageVersionPreviewResponseSchema,
  PageVersionReviewResponseSchema,
  PageVersionSummarySchema,
  ReviewPageVersionRequestSchema,
  type CreatePageProposalRunRequest,
  type CreatePageSectionNoteRequest,
  type PageJson,
  type PageProposalDetail,
  type PageProposalListResponse,
  type PageProposalQueueResponse,
  type PageProposalSummary,
  type PageSectionNote,
  type PageSectionNoteListResponse,
  type PageVersionDetail,
  type PageVersionListResponse,
  type PageVersionPreviewResponse,
  type PageVersionReviewResponse,
  type PageVersionSummary
} from "@localseo/contracts";
import {
  agentRuns,
  approvals,
  isDatabaseUniqueViolation,
  opportunities,
  pageProposals,
  pageSectionNotes,
  pageVersions,
  type DatabaseClient
} from "@localseo/db";
import { renderPagePreviewFile, validatePageJsonAgainstRegistry } from "@localseo/page-registry";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { QueueProducerService } from "../queue-producer.js";
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
type PageVersionApprovalRow = typeof approvals.$inferSelect;
type ApprovalBlockerReader = Pick<DatabaseClient, "select">;

@Injectable()
export class PagesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(QueueProducerService) private readonly queues: QueueProducerService
  ) {}

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

  async queuePageProposal(
    projectId: string,
    input: CreatePageProposalRunRequest,
    userId?: string
  ): Promise<PageProposalQueueResponse> {
    if (!this.database.isConfigured()) {
      return PageProposalQueueResponseSchema.parse({
        jobId: randomUUID(),
        projectId,
        type: "page_generation",
        status: "dry_run",
        opportunityId: input.opportunityId,
        createdBy: userId,
        message: "Database is not configured. Page proposal persistence is in explicit dry-run mode.",
        createdAt: new Date().toISOString()
      });
    }

    if (!this.queues.isQueueConfigured("page-generation")) {
      const jobId = randomUUID();
      const jobData = PageProposalJobDataSchema.parse({
        projectId,
        runId: jobId,
        opportunityId: input.opportunityId,
        triggeredByUserId: userId ?? null,
        triggerSource: "user_action"
      });

      await this.queues.enqueue({
        queueName: "page-generation",
        jobName: "page_generation",
        jobId,
        data: jobData,
        audit: {
          projectId,
          type: "page_generation",
          inputRef: jobId,
          actorType: userId ? "user" : "system",
          actorUserId: userId,
          triggerSource: "user_action"
        }
      });

      return PageProposalQueueResponseSchema.parse({
        jobId,
        projectId,
        type: "page_generation",
        status: "dry_run",
        runId: undefined,
        opportunityId: input.opportunityId,
        inputRef: jobId,
        createdBy: userId,
        message: "Page generation queue is not configured. This is an explicit dry-run response.",
        createdAt: new Date().toISOString()
      });
    }

    const db = this.database.requireDb();
    await assertOpportunityForPageProposal(db, projectId, input.opportunityId);

    const activeRun = await findActivePageProposalRun(db, projectId, input.opportunityId);
    if (activeRun) {
      return activePageProposalResponse(activeRun);
    }

    const runId = randomUUID();

    try {
      await db.insert(agentRuns).values({
        id: runId,
        projectId,
        subjectId: input.opportunityId,
        task: "page_brief_draft",
        status: "queued",
        diagnosticsJson: {
          opportunityId: input.opportunityId
        }
      });
    } catch (error) {
      if (isDatabaseUniqueViolation(error)) {
        const conflictingRun = await findActivePageProposalRun(db, projectId, input.opportunityId);
        if (conflictingRun) {
          return activePageProposalResponse(conflictingRun);
        }
      }

      throw error;
    }

    let enqueued: boolean;

    try {
      enqueued = await this.queues.enqueue({
        queueName: "page-generation",
        jobName: "page_generation",
        jobId: runId,
        data: PageProposalJobDataSchema.parse({
          projectId,
          runId,
          opportunityId: input.opportunityId,
          triggeredByUserId: userId ?? null,
          triggerSource: "user_action"
        }),
        options: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000
          }
        },
        audit: {
          projectId,
          type: "page_generation",
          inputRef: runId,
          actorType: userId ? "user" : "system",
          actorUserId: userId,
          triggerSource: "user_action"
        }
      });
    } catch (error) {
      await markPageProposalQueueFailure(db, runId, "queue_enqueue_failed", normalizePageProposalQueueFailure(error));
      throw error;
    }

    if (!enqueued) {
      await markPageProposalQueueFailure(
        db,
        runId,
        "queue_not_configured",
        "Page generation queue was not configured after run creation."
      );
    }

    return PageProposalQueueResponseSchema.parse({
      jobId: runId,
      projectId,
      runId,
      opportunityId: input.opportunityId,
      type: "page_generation",
      status: enqueued ? "queued" : "dry_run",
      inputRef: runId,
      createdBy: userId,
      message: enqueued ? undefined : "Page generation queue is not configured. This is an explicit dry-run response.",
      createdAt: new Date().toISOString()
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

  async reviewPageVersion(
    projectId: string,
    pageVersionId: string,
    body: unknown,
    decidedByUserId?: string
  ): Promise<PageVersionReviewResponse> {
    const input = ReviewPageVersionRequestSchema.parse(body ?? {});

    if (!decidedByUserId) {
      throw new BadRequestException("Page version review requires an authenticated persisted user id.");
    }

    const row = await this.loadPageVersion(projectId, pageVersionId);
    parseStoredPageJson(row);

    if (row.status !== "preview" && row.status !== "changes_requested") {
      throw new BadRequestException("Only preview or changes-requested page versions can be reviewed.");
    }

    const db = this.database.requireDb();
    const decidedAt = new Date();
    const targetPageStatus = input.decision === "approve" ? "approved" : "changes_requested";
    const targetProposalStatus = input.decision === "approve" ? "approved" : "changes_requested";
    const approvalStatus = input.decision === "approve" ? "approved" : "rejected";
    let approval: PageVersionApprovalRow | undefined;

    await db.transaction(async (tx) => {
      if (input.decision === "approve") {
        const openBlockerCount = await countOpenApprovalBlockers(tx, row.id);
        if (openBlockerCount > 0) {
          throw new UnprocessableEntityException(
            `Page version has ${openBlockerCount} unresolved approval blocker note(s).`
          );
        }
      }

      const [updated] = await tx
        .update(pageVersions)
        .set({
          status: targetPageStatus,
          approvedAt: input.decision === "approve" ? decidedAt : null,
          updatedAt: decidedAt
        })
        .where(and(eq(pageVersions.id, row.id), inArray(pageVersions.status, ["preview", "changes_requested"])))
        .returning({ id: pageVersions.id });

      if (!updated) {
        throw new BadRequestException("Page version is no longer in a reviewable state.");
      }

      await tx
        .update(pageProposals)
        .set({
          status: targetProposalStatus,
          updatedAt: decidedAt
        })
        .where(and(eq(pageProposals.id, row.pageProposalId), eq(pageProposals.projectId, projectId)));

      const [inserted] = await tx
        .insert(approvals)
        .values({
          pageVersionId: row.id,
          userId: decidedByUserId,
          status: approvalStatus,
          decisionNote: input.decisionNote,
          decidedAt
        })
        .returning();

      approval = inserted;
    });

    if (!approval) {
      throw new Error("Failed to record page version approval.");
    }

    const [updatedRow] = await selectPageVersionRows(db, projectId, { pageVersionId: row.id });
    if (!updatedRow) {
      throw new NotFoundException("Page version was not found for this project.");
    }

    return PageVersionReviewResponseSchema.parse({
      projectId,
      pageVersion: pageVersionSummaryToResponse(updatedRow),
      approval: pageVersionApprovalToResponse(projectId, approval)
    });
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

  @Post("proposals/runs")
  @RequireProjectPermission("page:propose")
  runPageProposal(@Param("projectId") projectId: string, @Body() body: unknown, @Req() request: RequestWithAuth) {
    const parsed = CreatePageProposalRunRequestSchema.safeParse(body ?? {});

    if (!parsed.success) {
      throw new BadRequestException("Page proposal generation requires a project-owned opportunityId.");
    }

    return this.pages.queuePageProposal(projectId, parsed.data, persistedActorUserId(request));
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

  @Post(":pageVersionId/review")
  @RequireProjectPermission("page:approve")
  reviewVersion(
    @Param("projectId") projectId: string,
    @Param("pageVersionId") pageVersionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth
  ) {
    const parsed = ReviewPageVersionRequestSchema.safeParse(body ?? {});

    if (!parsed.success) {
      throw new BadRequestException("Page version review requires a valid review decision.");
    }

    return this.pages.reviewPageVersion(projectId, pageVersionId, parsed.data, persistedActorUserId(request));
  }
}

@Module({
  controllers: [PagesController],
  providers: [PagesService]
})
export class PagesModule {}

async function assertOpportunityForPageProposal(db: Db, projectId: string, opportunityId: string): Promise<void> {
  if (!isPersistedId(opportunityId)) {
    throw new BadRequestException("Opportunity id must be a UUID.");
  }

  const [opportunity] = await db
    .select({ id: opportunities.id, status: opportunities.status })
    .from(opportunities)
    .where(and(eq(opportunities.id, opportunityId), eq(opportunities.projectId, projectId)))
    .limit(1);

  if (!opportunity) {
    throw new NotFoundException("Opportunity was not found for this project.");
  }

  if (opportunity.status === "rejected") {
    throw new BadRequestException("Rejected opportunities cannot create page proposals.");
  }
}

async function findActivePageProposalRun(db: Db, projectId: string, opportunityId: string) {
  const [run] = await db
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.projectId, projectId),
        eq(agentRuns.task, "page_brief_draft"),
        eq(agentRuns.subjectId, opportunityId),
        inArray(agentRuns.status, ["queued", "running"])
      )
    )
    .orderBy(desc(agentRuns.createdAt))
    .limit(1);

  return run;
}

function activePageProposalResponse(run: typeof agentRuns.$inferSelect): PageProposalQueueResponse {
  const diagnostics = recordFromUnknown(run.diagnosticsJson);
  const opportunityId = run.subjectId ?? stringFromUnknown(diagnostics.opportunityId);

  return PageProposalQueueResponseSchema.parse({
    jobId: run.id,
    projectId: run.projectId,
    runId: run.id,
    opportunityId,
    type: "page_generation",
    status: "already_active",
    inputRef: run.inputRef ?? run.id,
    message: "A page proposal run is already queued or running for this opportunity.",
    createdAt: run.createdAt.toISOString()
  });
}

async function markPageProposalQueueFailure(
  db: Db,
  runId: string,
  failureCode: AiReasoningEnqueueFailureCode,
  message: string
): Promise<void> {
  await db
    .update(agentRuns)
    .set({
      status: "failed",
      failureCode,
      diagnosticsJson: {
        message
      },
      completedAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(agentRuns.id, runId));
}

function normalizePageProposalQueueFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "page_generation_queue_failed";
  return message.slice(0, 500);
}

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

async function countOpenApprovalBlockers(db: ApprovalBlockerReader, pageVersionId: string): Promise<number> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`
    })
    .from(pageSectionNotes)
    .where(
      and(
        eq(pageSectionNotes.pageVersionId, pageVersionId),
        eq(pageSectionNotes.instructionType, "approval_blocker"),
        isNull(pageSectionNotes.resolvedAt)
      )
    );

  return row?.count ?? 0;
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

function pageVersionApprovalToResponse(projectId: string, row: PageVersionApprovalRow) {
  return PageVersionReviewResponseSchema.shape.approval.parse({
    id: row.id,
    projectId,
    pageVersionId: row.pageVersionId,
    status: row.status,
    decisionNote: row.decisionNote ?? undefined,
    decidedByUserId: row.userId ?? undefined,
    decidedAt: row.decidedAt?.toISOString(),
    createdAt: row.createdAt.toISOString()
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

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringFromUnknown(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
