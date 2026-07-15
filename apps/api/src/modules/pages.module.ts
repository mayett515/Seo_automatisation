import { randomUUID } from "node:crypto";
import type { MediaAssetStoragePort } from "@localseo/adapters";
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  Inject,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UnprocessableEntityException,
  UseGuards
} from "@nestjs/common";
import { parseAppEnv } from "@localseo/config";
import {
  type AiReasoningEnqueueFailureCode,
  CreatePageProposalRunRequestSchema,
  CreatePageSectionNoteRequestSchema,
  CreateSectionCopySuggestionRequestSchema,
  EditPageVersionRequestSchema,
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
  SectionCopySuggestionJobDataSchema,
  SectionCopySuggestionListResponseSchema,
  SectionCopySuggestionQueueResponseSchema,
  SectionCopySuggestionSchema,
  PageVersionDetailSchema,
  PageVersionEditResponseSchema,
  PageVersionListResponseSchema,
  PageVersionPreviewResponseSchema,
  PageVersionReviewResponseSchema,
  PageVersionSummarySchema,
  ReviewPageVersionRequestSchema,
  decodedStaticSiteFileByteLength,
  type CreatePageProposalRunRequest,
  type CreatePageSectionNoteRequest,
  type CreateSectionCopySuggestionRequest,
  type PageGeneration,
  type PageJson,
  type PageProposalDetail,
  type PageProposalListResponse,
  type PageProposalQueueResponse,
  type PageProposalSummary,
  type PageSectionNote,
  type PageSectionNoteListResponse,
  type SectionCopySuggestion,
  type SectionCopySuggestionListResponse,
  type SectionCopySuggestionQueueResponse,
  type PageVersionDetail,
  type PageVersionEditResponse,
  type PageVersionListResponse,
  type PageVersionPreviewResponse,
  type PageVersionReviewResponse,
  type PageVersionSummary
} from "@localseo/contracts";
import {
  applyPageStudioEditCommand,
  decidePageStudioPublishReadiness,
  decideSectionCopySuggestionAttribution
} from "@localseo/domain";
import {
  agentRuns,
  approvals,
  isDatabaseUniqueViolation,
  loadSelectablePageMediaVariants,
  MediaAssetSelectionError,
  opportunities,
  pageProposals,
  pageSectionCopySuggestions,
  pageSectionNotes,
  pageVersions,
  persistPageVersionMediaAssetProjection,
  type DatabaseClient
} from "@localseo/db";
import {
  collectPageMediaAssetIds,
  getPageRegistryAiCopyFieldKeys,
  pageRegistrySummary,
  renderPagePreviewFile,
  validatePageJsonAgainstRegistry,
  validatePageSectionProps
} from "@localseo/page-registry";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { FastifyReply } from "fastify";
import { QueueProducerService } from "../queue-producer.js";
import { BetterAuthGuard } from "../auth/guards/better-auth.guard.js";
import { PermissionGuard } from "../auth/permissions/permission.guard.js";
import { RequireProjectPermission } from "../auth/permissions/require-permission.decorator.js";
import { ProjectAccessGuard } from "../auth/project-access.guard.js";
import type { RequestWithAuth } from "../auth/types/authenticated-request.js";
import { DatabaseService } from "../database/database.service.js";
import { MEDIA_ASSET_STORAGE } from "../media-storage.module.js";
import { CsrfGuard } from "../security/csrf/csrf.guard.js";
import {
  previewAssetCookieName,
  previewDocumentCookieName,
  readCookieValue,
  serializePreviewCapabilityCookie,
  signPreviewCapability,
  verifyPreviewCapability
} from "../preview-capability.js";
import {
  loadPreviewMediaManifest,
  mediaVariantRecordsToRenderVariants,
  previewMediaManifestToRenderVariants,
  verifyPreviewMediaManifestBytes
} from "../preview-media.js";

const env = parseAppEnv(process.env);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const unavailableMediaReader: Pick<MediaAssetStoragePort, "readPrivateObject"> = {
  readPrivateObject: () => Promise.reject(new Error("Media storage reader is not configured."))
};

type Db = DatabaseClient;
type PageProposalRow = Awaited<ReturnType<typeof selectPageProposalRows>>[number];
type PageSectionNoteRow = Awaited<ReturnType<typeof selectPageSectionNoteRows>>[number];
type SectionCopySuggestionRow = typeof pageSectionCopySuggestions.$inferSelect;
type PageVersionRow = Awaited<ReturnType<typeof selectPageVersionRows>>[number];
type PageVersionApprovalRow = typeof approvals.$inferSelect;
type ApprovalBlockerReader = Pick<DatabaseClient, "select">;
type PageVersionLockClient = Pick<DatabaseClient, "execute">;

@Injectable()
export class PagesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(QueueProducerService) private readonly queues: QueueProducerService,
    @Inject(MEDIA_ASSET_STORAGE)
    private readonly mediaStorage: Pick<MediaAssetStoragePort, "readPrivateObject"> = unavailableMediaReader
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

  async listSectionCopySuggestions(
    projectId: string,
    pageVersionId: string
  ): Promise<SectionCopySuggestionListResponse> {
    const pageVersion = await this.loadPageVersion(projectId, pageVersionId);
    const rows = await selectSectionCopySuggestionRows(this.database.requireDb(), projectId, pageVersion.id);

    return SectionCopySuggestionListResponseSchema.parse({
      projectId,
      pageVersionId: pageVersion.id,
      suggestions: rows.map(sectionCopySuggestionToResponse)
    });
  }

  async queueSectionCopySuggestion(
    projectId: string,
    pageVersionId: string,
    input: CreateSectionCopySuggestionRequest,
    requestedByUserId?: string
  ): Promise<SectionCopySuggestionQueueResponse> {
    if (!requestedByUserId) {
      throw new BadRequestException("Section copy generation requires an authenticated persisted user id.");
    }

    if (!this.database.isConfigured()) {
      return SectionCopySuggestionQueueResponseSchema.parse({
        jobId: randomUUID(),
        projectId,
        pageVersionId,
        sectionId: input.sectionId,
        type: "page_generation",
        status: "dry_run",
        createdBy: requestedByUserId,
        message: "Database is not configured. Section copy persistence is in explicit dry-run mode.",
        createdAt: new Date().toISOString()
      });
    }

    if (!this.queues.isQueueConfigured("page-generation")) {
      const jobId = randomUUID();
      await this.queues.enqueue({
        queueName: "page-generation",
        jobName: "section_text_generation",
        jobId,
        data: SectionCopySuggestionJobDataSchema.parse({
          projectId,
          runId: jobId,
          suggestionId: "dry-run",
          pageVersionId,
          sectionId: input.sectionId,
          triggeredByUserId: requestedByUserId,
          triggerSource: "user_action"
        }),
        audit: {
          projectId,
          type: "page_generation",
          inputRef: pageVersionId,
          actorType: "user",
          actorUserId: requestedByUserId,
          triggerSource: "user_action"
        }
      });

      return SectionCopySuggestionQueueResponseSchema.parse({
        jobId,
        projectId,
        pageVersionId,
        sectionId: input.sectionId,
        type: "page_generation",
        status: "dry_run",
        createdBy: requestedByUserId,
        message: "Page generation queue is not configured. This is an explicit dry-run response.",
        createdAt: new Date().toISOString()
      });
    }

    const initialBase = await this.loadPageVersion(projectId, pageVersionId);
    const db = this.database.requireDb();
    const runId = randomUUID();
    const suggestionId = randomUUID();
    let suggestion: SectionCopySuggestionRow | undefined;
    let alreadyActive = false;

    try {
      await db.transaction(async (tx) => {
        await lockPageProposalForVersioning(tx, projectId, initialBase.pageProposalId);
        const latest = await selectLatestPageVersionIdentity(tx, initialBase.pageProposalId);
        if (!latest || latest.id !== initialBase.id) {
          throw new ConflictException("Section copy generation must use the latest page version.");
        }

        const [base] = await selectPageVersionRows(tx, projectId, { pageVersionId: initialBase.id });
        if (!base) {
          throw new NotFoundException("Page version was not found for this project.");
        }
        assertSectionCopySuggestionTarget(parseStoredPageJson(base), input.sectionId);

        const [active] = await selectSectionCopySuggestionRows(
          tx,
          projectId,
          base.id,
          undefined,
          input.sectionId,
          true
        );
        if (active) {
          suggestion = active;
          alreadyActive = true;
          return;
        }

        await tx.insert(agentRuns).values({
          id: runId,
          projectId,
          subjectId: suggestionId,
          task: "section_text_generation",
          status: "queued",
          diagnosticsJson: {
            suggestionId,
            pageVersionId: base.id,
            sectionId: input.sectionId
          }
        });

        const [created] = await tx
          .insert(pageSectionCopySuggestions)
          .values({
            id: suggestionId,
            projectId,
            pageVersionId: base.id,
            sectionId: input.sectionId,
            agentRunId: runId,
            requestedByUserId,
            status: "queued",
            instruction: input.instruction
          })
          .returning();

        if (!created) {
          throw new Error("Failed to create section copy suggestion.");
        }
        suggestion = created;
      });
    } catch (error) {
      if (isDatabaseUniqueViolation(error)) {
        const [active] = await selectSectionCopySuggestionRows(
          db,
          projectId,
          initialBase.id,
          undefined,
          input.sectionId,
          true
        );
        if (active) {
          suggestion = active;
          alreadyActive = true;
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }

    if (!suggestion) {
      throw new Error("Failed to load the created section copy suggestion.");
    }
    if (alreadyActive) {
      return activeSectionCopySuggestionResponse(suggestion);
    }

    let enqueued: boolean;
    try {
      enqueued = await this.queues.enqueue({
        queueName: "page-generation",
        jobName: "section_text_generation",
        jobId: suggestion.agentRunId,
        data: SectionCopySuggestionJobDataSchema.parse({
          projectId,
          runId: suggestion.agentRunId,
          suggestionId: suggestion.id,
          pageVersionId: suggestion.pageVersionId,
          sectionId: suggestion.sectionId,
          triggeredByUserId: requestedByUserId,
          triggerSource: "user_action"
        }),
        options: {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 }
        },
        audit: {
          projectId,
          type: "page_generation",
          inputRef: suggestion.id,
          actorType: "user",
          actorUserId: requestedByUserId,
          triggerSource: "user_action"
        }
      });
    } catch (error) {
      await markSectionCopySuggestionQueueFailure(
        db,
        suggestion,
        "queue_enqueue_failed",
        normalizePageProposalQueueFailure(error)
      );
      throw error;
    }

    if (!enqueued) {
      await markSectionCopySuggestionQueueFailure(
        db,
        suggestion,
        "queue_not_configured",
        "Page generation queue was not configured after suggestion creation."
      );
    }

    return SectionCopySuggestionQueueResponseSchema.parse({
      jobId: suggestion.agentRunId,
      projectId,
      runId: suggestion.agentRunId,
      suggestionId: suggestion.id,
      pageVersionId: suggestion.pageVersionId,
      sectionId: suggestion.sectionId,
      type: "page_generation",
      status: enqueued ? "queued" : "dry_run",
      inputRef: suggestion.id,
      createdBy: requestedByUserId,
      message: enqueued ? undefined : "Page generation queue is not configured. This is an explicit dry-run response.",
      createdAt: suggestion.createdAt.toISOString()
    });
  }

  async dismissSectionCopySuggestion(
    projectId: string,
    pageVersionId: string,
    suggestionId: string,
    dismissedByUserId?: string
  ): Promise<SectionCopySuggestion> {
    if (!dismissedByUserId) {
      throw new BadRequestException(
        "Dismissing a section copy suggestion requires an authenticated persisted user id."
      );
    }
    if (!isPersistedId(suggestionId)) {
      throw new BadRequestException("Section copy suggestion id must be a UUID.");
    }

    const pageVersion = await this.loadPageVersion(projectId, pageVersionId);
    const db = this.database.requireDb();
    let dismissed: SectionCopySuggestionRow | undefined;

    await db.transaction(async (tx) => {
      const [candidate] = await selectSectionCopySuggestionRows(tx, projectId, pageVersion.id, suggestionId);
      if (!candidate) {
        throw new NotFoundException("Section copy suggestion was not found for this page version.");
      }

      await lockAgentRunForSectionCopyCancellation(tx, projectId, candidate.agentRunId);
      await lockSectionCopySuggestion(tx, projectId, pageVersion.id, suggestionId);
      const [existing] = await selectSectionCopySuggestionRows(tx, projectId, pageVersion.id, suggestionId);
      if (!existing) {
        throw new NotFoundException("Section copy suggestion was not found for this page version.");
      }
      if (existing.status === "dismissed") {
        dismissed = existing;
        return;
      }
      if (existing.status !== "queued" && existing.status !== "generating" && existing.status !== "ready") {
        throw new BadRequestException("Only unresolved section copy suggestions can be dismissed.");
      }

      const now = new Date();
      await tx
        .update(agentRuns)
        .set({
          status: "failed",
          failureCode: "operator_cancelled",
          diagnosticsJson: {
            suggestionId: existing.id,
            pageVersionId: existing.pageVersionId,
            sectionId: existing.sectionId,
            message: "Section copy suggestion was cancelled by the operator."
          },
          completedAt: now,
          updatedAt: now
        })
        .where(
          and(
            eq(agentRuns.id, existing.agentRunId),
            eq(agentRuns.projectId, projectId),
            inArray(agentRuns.status, ["queued", "running"])
          )
        );

      const [updated] = await tx
        .update(pageSectionCopySuggestions)
        .set({
          status: "dismissed",
          dismissedByUserId,
          dismissedAt: now,
          updatedAt: now
        })
        .where(
          and(
            eq(pageSectionCopySuggestions.id, existing.id),
            eq(pageSectionCopySuggestions.projectId, projectId),
            eq(pageSectionCopySuggestions.pageVersionId, pageVersion.id),
            inArray(pageSectionCopySuggestions.status, ["queued", "generating", "ready"])
          )
        )
        .returning();
      dismissed = updated;
    });

    if (!dismissed) {
      throw new ConflictException("Section copy suggestion is no longer dismissible.");
    }
    return sectionCopySuggestionToResponse(dismissed);
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
    const rendered = await this.renderPageVersionPreview(projectId, pageVersionId);
    await this.assertPreviewMediaBytes(rendered.manifest);
    return pageVersionPreviewResponse(projectId, rendered.row, rendered.file);
  }

  async preparePageVersionPreview(projectId: string, pageVersionId: string) {
    const rendered = await this.renderPageVersionPreview(projectId, pageVersionId);
    await this.assertPreviewMediaBytes(rendered.manifest);
    const response = pageVersionPreviewResponse(projectId, rendered.row, rendered.file);
    const documentToken = signPreviewCapability(
      {
        kind: "document",
        projectId,
        pageVersionId,
        manifestSha256: rendered.manifest.sha256
      },
      env.PREVIEW_CAPABILITY_SECRET
    );

    return { response, documentToken };
  }

  async previewPageVersionDocument(projectId: string, pageVersionId: string, documentToken: string | undefined) {
    const claims = documentToken
      ? verifyPreviewCapability(documentToken, env.PREVIEW_CAPABILITY_SECRET, "document")
      : undefined;
    if (!claims || claims.projectId !== projectId || claims.pageVersionId !== pageVersionId) {
      throw new UnauthorizedException("Preview document capability is invalid or expired.");
    }

    const { file, manifest } = await this.renderPageVersionPreview(projectId, pageVersionId);
    if (claims.manifestSha256 !== manifest.sha256) {
      throw new UnauthorizedException("Preview document capability no longer matches the media manifest.");
    }
    if (file.encoding !== "utf8") {
      throw new UnprocessableEntityException("Preview document must use UTF-8 encoding.");
    }

    return {
      file,
      assetToken: signPreviewCapability(
        {
          kind: "assets",
          projectId,
          pageVersionId,
          manifestSha256: manifest.sha256
        },
        env.PREVIEW_CAPABILITY_SECRET
      )
    };
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

  async editPageVersion(
    projectId: string,
    basePageVersionId: string,
    body: unknown,
    createdByUserId?: string
  ): Promise<PageVersionEditResponse> {
    const input = EditPageVersionRequestSchema.parse(body ?? {});

    if (!createdByUserId) {
      throw new BadRequestException("Page Studio editing requires an authenticated persisted user id.");
    }

    const initialBase = await this.loadPageVersion(projectId, basePageVersionId);
    const db = this.database.requireDb();
    let createdPageVersionId: string | undefined;

    await db.transaction(async (tx) => {
      await lockPageProposalForVersioning(tx, projectId, initialBase.pageProposalId);
      const latest = await selectLatestPageVersionIdentity(tx, initialBase.pageProposalId);

      if (!latest || latest.id !== initialBase.id) {
        throw new ConflictException("Page Studio edits must use the latest page version as their base.");
      }

      const [base] = await selectPageVersionRows(tx, projectId, { pageVersionId: initialBase.id });
      if (!base) {
        throw new NotFoundException("Page version was not found for this project.");
      }

      if (base.status === "superseded") {
        throw new BadRequestException("Superseded page versions cannot be used as Page Studio edit bases.");
      }

      const basePageJson = parseStoredPageJson(base);
      const baseMediaAssetIds = collectPageMediaAssetIds(basePageJson);
      let generation: PageGeneration = {
        source: "human",
        reason: `page_studio:${input.command.type}`
      };
      let appliedSuggestion: SectionCopySuggestionRow | undefined;

      if (input.suggestionId) {
        if (input.command.type !== "update_section_props") {
          throw new BadRequestException("Section copy suggestions require an update_section_props command.");
        }

        await lockSectionCopySuggestion(tx, projectId, base.id, input.suggestionId);
        const [suggestion] = await selectSectionCopySuggestionRows(tx, projectId, base.id, input.suggestionId);
        if (!suggestion) {
          throw new NotFoundException("Section copy suggestion was not found for this page version.");
        }
        if (suggestion.status !== "ready" || !suggestion.suggestedProps) {
          throw new ConflictException("Section copy suggestion is not ready to apply.");
        }
        if (suggestion.sectionId !== input.command.sectionId) {
          throw new BadRequestException("Section copy suggestion does not target this edit command section.");
        }

        const targetSection = basePageJson.sections.find((section) => section.id === suggestion.sectionId);
        if (!targetSection) {
          throw new UnprocessableEntityException("Section copy suggestion targets a missing PageJson section.");
        }
        const suggestedProps = validatePageSectionProps(targetSection.registryKey, suggestion.suggestedProps);
        if (!suggestedProps.success) {
          throw new UnprocessableEntityException("Stored section copy suggestion failed registry validation.");
        }

        generation = decideSectionCopySuggestionAttribution({
          agentRunId: suggestion.agentRunId,
          suggestedProps: suggestedProps.props,
          submittedProps: input.command.props
        }).generation;
        appliedSuggestion = suggestion;
      }

      const mutation = applyPageStudioEditCommand({
        pageJson: basePageJson,
        command: input.command,
        generation,
        registryEntries: pageRegistrySummary
      });

      if (!mutation.success) {
        throw new UnprocessableEntityException(`Page Studio edit was rejected: ${mutation.decision.reason}.`);
      }

      const editedPageJson = parseStoredPageJson({ ...base, pageJson: mutation.pageJson });
      const editedMediaAssetIds = collectPageMediaAssetIds(editedPageJson);
      const readiness = decidePageStudioPublishReadiness(editedPageJson, pageRegistrySummary);
      if (readiness.kind === "blocked") {
        throw new UnprocessableEntityException(
          `Page Studio edit would break page composition: ${readiness.issues[0]?.code ?? "unknown_issue"}.`
        );
      }

      try {
        const candidateMediaVariants = await loadSelectablePageMediaVariants(tx, {
          projectId,
          assetIds: editedMediaAssetIds,
          inheritedAssetIds: baseMediaAssetIds
        });
        renderPagePreviewFile({
          pageJson: editedPageJson,
          pageVersionId: base.id,
          previewId: base.id,
          targetUrl: base.route,
          mode: "editor",
          mediaVariants: mediaVariantRecordsToRenderVariants(candidateMediaVariants)
        });
      } catch (error) {
        if (error instanceof MediaAssetSelectionError) {
          throw new UnprocessableEntityException(error.message);
        }
        throw new UnprocessableEntityException("Edited PageJson cannot be rendered as a preview.");
      }

      const now = new Date();
      const [created] = await tx
        .insert(pageVersions)
        .values({
          pageProposalId: base.pageProposalId,
          versionNumber: latest.versionNumber + 1,
          status: "preview",
          pageJson: editedPageJson,
          basedOnVersionId: base.id,
          createdByUserId,
          updatedAt: now
        })
        .returning({ id: pageVersions.id });

      if (!created) {
        throw new Error("Failed to create edited page version.");
      }

      await persistPageVersionMediaAssetProjection(tx, {
        projectId,
        pageVersionId: created.id,
        assetIds: editedMediaAssetIds,
        inheritedAssetIds: baseMediaAssetIds
      });

      if (appliedSuggestion) {
        const [updatedSuggestion] = await tx
          .update(pageSectionCopySuggestions)
          .set({
            status: "applied",
            appliedPageVersionId: created.id,
            appliedByUserId: createdByUserId,
            appliedAt: now,
            updatedAt: now
          })
          .where(
            and(
              eq(pageSectionCopySuggestions.id, appliedSuggestion.id),
              eq(pageSectionCopySuggestions.projectId, projectId),
              eq(pageSectionCopySuggestions.pageVersionId, base.id),
              eq(pageSectionCopySuggestions.status, "ready")
            )
          )
          .returning({ id: pageSectionCopySuggestions.id });

        if (!updatedSuggestion) {
          throw new ConflictException("Section copy suggestion was already applied or dismissed.");
        }
      }

      await tx
        .update(pageProposals)
        .set({ status: "draft", updatedAt: now })
        .where(and(eq(pageProposals.id, base.pageProposalId), eq(pageProposals.projectId, projectId)));

      createdPageVersionId = created.id;
    });

    if (!createdPageVersionId) {
      throw new Error("Failed to persist Page Studio edit.");
    }

    const [createdRow] = await selectPageVersionRows(db, projectId, { pageVersionId: createdPageVersionId });
    if (!createdRow) {
      throw new NotFoundException("Edited page version was not found for this project.");
    }

    return PageVersionEditResponseSchema.parse({
      projectId,
      basePageVersionId: initialBase.id,
      pageVersion: {
        ...pageVersionSummaryToResponse(createdRow),
        pageJson: parseStoredPageJson(createdRow)
      }
    });
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
    const pageJson = parseStoredPageJson(row);

    if (input.decision === "approve") {
      try {
        const manifest = await loadPreviewMediaManifest(this.database.requireDb(), projectId, row.id, pageJson);
        await verifyPreviewMediaManifestBytes(this.mediaStorage, manifest);
      } catch {
        throw new UnprocessableEntityException(
          "Page version media references are not fully available from the immutable project manifest."
        );
      }
    }

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
      await lockPageProposalForVersioning(tx, projectId, row.pageProposalId);
      const latest = await selectLatestPageVersionIdentity(tx, row.pageProposalId);
      if (!latest || latest.id !== row.id) {
        throw new ConflictException("Only the latest page version can be reviewed.");
      }

      await lockPageVersionForReview(tx, row.id);

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

  private async renderPageVersionPreview(projectId: string, pageVersionId: string) {
    const row = await this.loadPageVersion(projectId, pageVersionId);
    const pageJson = parseStoredPageJson(row);

    try {
      const manifest = await loadPreviewMediaManifest(this.database.requireDb(), projectId, row.id, pageJson);
      return {
        row,
        manifest,
        file: renderPagePreviewFile({
          pageJson,
          pageVersionId: row.id,
          previewId: row.id,
          targetUrl: row.route,
          mode: "editor",
          mediaVariants: previewMediaManifestToRenderVariants(manifest)
        })
      };
    } catch {
      throw new UnprocessableEntityException("Page version cannot be rendered as a preview.");
    }
  }

  private async assertPreviewMediaBytes(manifest: Awaited<ReturnType<typeof loadPreviewMediaManifest>>): Promise<void> {
    try {
      await verifyPreviewMediaManifestBytes(this.mediaStorage, manifest);
    } catch {
      throw new UnprocessableEntityException(
        "Page version media bytes are unavailable or do not match the immutable manifest."
      );
    }
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
  async preview(
    @Param("projectId") projectId: string,
    @Param("pageVersionId") pageVersionId: string,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const prepared = await this.pages.preparePageVersionPreview(projectId, pageVersionId);
    reply.header(
      "set-cookie",
      serializePreviewCapabilityCookie({
        name: previewDocumentCookieName(pageVersionId),
        token: prepared.documentToken,
        path: "/"
      })
    );
    reply.header("cache-control", "private, no-store");
    return prepared.response;
  }

  @Get(":pageVersionId/copy-suggestions")
  listCopySuggestions(@Param("projectId") projectId: string, @Param("pageVersionId") pageVersionId: string) {
    return this.pages.listSectionCopySuggestions(projectId, pageVersionId);
  }

  @Post(":pageVersionId/copy-suggestions")
  @RequireProjectPermission("page:edit")
  queueCopySuggestion(
    @Param("projectId") projectId: string,
    @Param("pageVersionId") pageVersionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth
  ) {
    const parsed = CreateSectionCopySuggestionRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException("Section copy generation requires a valid sectionId and optional instruction.");
    }

    return this.pages.queueSectionCopySuggestion(projectId, pageVersionId, parsed.data, persistedActorUserId(request));
  }

  @Patch(":pageVersionId/copy-suggestions/:suggestionId/dismiss")
  @RequireProjectPermission("page:edit")
  dismissCopySuggestion(
    @Param("projectId") projectId: string,
    @Param("pageVersionId") pageVersionId: string,
    @Param("suggestionId") suggestionId: string,
    @Req() request: RequestWithAuth
  ) {
    return this.pages.dismissSectionCopySuggestion(
      projectId,
      pageVersionId,
      suggestionId,
      persistedActorUserId(request)
    );
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

  @Post(":pageVersionId/edits")
  @RequireProjectPermission("page:edit")
  editVersion(
    @Param("projectId") projectId: string,
    @Param("pageVersionId") pageVersionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth
  ) {
    const parsed = EditPageVersionRequestSchema.safeParse(body ?? {});

    if (!parsed.success) {
      throw new BadRequestException("Page Studio edit requires a valid explicit edit command.");
    }

    return this.pages.editPageVersion(projectId, pageVersionId, parsed.data, persistedActorUserId(request));
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

@Controller("projects/:projectId/pages")
class PagePreviewDocumentController {
  constructor(@Inject(PagesService) private readonly pages: PagesService) {}

  @Get(":pageVersionId/preview/document")
  async document(
    @Param("projectId") projectId: string,
    @Param("pageVersionId") pageVersionId: string,
    @Headers("cookie") cookieHeader: string | undefined,
    @Res() reply: FastifyReply
  ) {
    const result = await this.pages.previewPageVersionDocument(
      projectId,
      pageVersionId,
      readCookieValue(cookieHeader, previewDocumentCookieName(pageVersionId))
    );
    reply.removeHeader("x-frame-options");
    reply.header(
      "content-security-policy",
      `default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors ${env.WEB_ORIGIN}`
    );
    reply.header("referrer-policy", "no-referrer");
    reply.header("cache-control", "private, no-store");
    reply.header("content-type", result.file.contentType);
    reply.header(
      "set-cookie",
      serializePreviewCapabilityCookie({
        name: previewAssetCookieName(pageVersionId),
        token: result.assetToken,
        path: "/assets"
      })
    );
    return reply.send(result.file.body);
  }
}

@Module({
  controllers: [PagesController, PagePreviewDocumentController],
  providers: [PagesService]
})
export class PagesModule {}

function pageVersionPreviewResponse(
  projectId: string,
  row: PageVersionRow,
  file: ReturnType<typeof renderPagePreviewFile>
): PageVersionPreviewResponse {
  return PageVersionPreviewResponseSchema.parse({
    projectId,
    pageVersionId: row.id,
    route: row.route,
    mode: "editor",
    documentPath: previewDocumentPath(projectId, row.id),
    file: {
      path: file.path,
      contentType: file.contentType,
      encoding: file.encoding,
      decodedBytes: decodedStaticSiteFileByteLength(file)
    }
  });
}

function previewDocumentPath(projectId: string, pageVersionId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/pages/${encodeURIComponent(pageVersionId)}/preview/document`;
}

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

function activeSectionCopySuggestionResponse(suggestion: SectionCopySuggestionRow): SectionCopySuggestionQueueResponse {
  return SectionCopySuggestionQueueResponseSchema.parse({
    jobId: suggestion.agentRunId,
    projectId: suggestion.projectId,
    runId: suggestion.agentRunId,
    suggestionId: suggestion.id,
    pageVersionId: suggestion.pageVersionId,
    sectionId: suggestion.sectionId,
    type: "page_generation",
    status: "already_active",
    inputRef: suggestion.id,
    message: "A copy suggestion is already queued, generating, or ready for this section version.",
    createdAt: suggestion.createdAt.toISOString()
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

async function markSectionCopySuggestionQueueFailure(
  db: Db,
  suggestion: SectionCopySuggestionRow,
  failureCode: AiReasoningEnqueueFailureCode,
  message: string
): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(agentRuns)
      .set({
        status: "failed",
        failureCode,
        diagnosticsJson: { message, suggestionId: suggestion.id },
        completedAt: now,
        updatedAt: now
      })
      .where(and(eq(agentRuns.id, suggestion.agentRunId), eq(agentRuns.projectId, suggestion.projectId)));

    await tx
      .update(pageSectionCopySuggestions)
      .set({
        status: "failed",
        failureCode,
        failureMessage: message,
        updatedAt: now
      })
      .where(
        and(
          eq(pageSectionCopySuggestions.id, suggestion.id),
          eq(pageSectionCopySuggestions.projectId, suggestion.projectId),
          inArray(pageSectionCopySuggestions.status, ["queued", "generating"])
        )
      );
  });
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

async function selectSectionCopySuggestionRows(
  db: ApprovalBlockerReader,
  projectId: string,
  pageVersionId: string,
  suggestionId?: string,
  sectionId?: string,
  activeOnly = false
) {
  const filters = [
    eq(pageSectionCopySuggestions.projectId, projectId),
    eq(pageSectionCopySuggestions.pageVersionId, pageVersionId)
  ];
  if (suggestionId) {
    filters.push(eq(pageSectionCopySuggestions.id, suggestionId));
  }
  if (sectionId) {
    filters.push(eq(pageSectionCopySuggestions.sectionId, sectionId));
  }
  if (activeOnly) {
    filters.push(inArray(pageSectionCopySuggestions.status, ["queued", "generating", "ready"]));
  }

  return db
    .select()
    .from(pageSectionCopySuggestions)
    .where(and(...filters))
    .orderBy(desc(pageSectionCopySuggestions.createdAt))
    .limit(suggestionId || activeOnly ? 1 : 100);
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

async function lockPageVersionForReview(db: PageVersionLockClient, pageVersionId: string): Promise<void> {
  await db.execute(sql`SELECT "id" FROM "page_versions" WHERE "id" = ${pageVersionId} FOR UPDATE`);
}

async function lockSectionCopySuggestion(
  db: PageVersionLockClient,
  projectId: string,
  pageVersionId: string,
  suggestionId: string
): Promise<void> {
  await db.execute(
    sql`SELECT "id" FROM "page_section_copy_suggestions" WHERE "id" = ${suggestionId} AND "project_id" = ${projectId} AND "page_version_id" = ${pageVersionId} FOR UPDATE`
  );
}

async function lockAgentRunForSectionCopyCancellation(
  db: PageVersionLockClient,
  projectId: string,
  agentRunId: string
): Promise<void> {
  await db.execute(
    sql`SELECT "id" FROM "agent_runs" WHERE "id" = ${agentRunId} AND "project_id" = ${projectId} FOR UPDATE`
  );
}

async function lockPageProposalForVersioning(
  db: PageVersionLockClient,
  projectId: string,
  pageProposalId: string
): Promise<void> {
  await db.execute(
    sql`SELECT "id" FROM "page_proposals" WHERE "id" = ${pageProposalId} AND "project_id" = ${projectId} FOR UPDATE`
  );
}

async function selectLatestPageVersionIdentity(db: ApprovalBlockerReader, pageProposalId: string) {
  const [row] = await db
    .select({ id: pageVersions.id, versionNumber: pageVersions.versionNumber })
    .from(pageVersions)
    .where(eq(pageVersions.pageProposalId, pageProposalId))
    .orderBy(desc(pageVersions.versionNumber))
    .limit(1);

  return row;
}

async function selectPageVersionRows(
  db: ApprovalBlockerReader,
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
      basedOnVersionId: pageVersions.basedOnVersionId,
      createdByUserId: pageVersions.createdByUserId,
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
    basedOnVersionId: row.basedOnVersionId ?? undefined,
    createdByUserId: row.createdByUserId ?? undefined,
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

function sectionCopySuggestionToResponse(row: SectionCopySuggestionRow): SectionCopySuggestion {
  return SectionCopySuggestionSchema.parse({
    id: row.id,
    projectId: row.projectId,
    pageVersionId: row.pageVersionId,
    sectionId: row.sectionId,
    agentRunId: row.agentRunId,
    status: row.status,
    instruction: row.instruction ?? undefined,
    suggestedProps: row.suggestedProps ?? undefined,
    failureCode: row.failureCode ?? undefined,
    failureMessage: row.failureMessage ?? undefined,
    requestedByUserId: row.requestedByUserId,
    appliedPageVersionId: row.appliedPageVersionId ?? undefined,
    appliedByUserId: row.appliedByUserId ?? undefined,
    dismissedByUserId: row.dismissedByUserId ?? undefined,
    readyAt: row.readyAt?.toISOString(),
    appliedAt: row.appliedAt?.toISOString(),
    dismissedAt: row.dismissedAt?.toISOString(),
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

function assertSectionCopySuggestionTarget(pageJson: PageJson, sectionId: string): void {
  const section = pageJson.sections.find((candidate) => candidate.id === sectionId);
  if (!section) {
    throw new UnprocessableEntityException("Section copy generation must target an existing PageJson section id.");
  }

  if (getPageRegistryAiCopyFieldKeys(section.registryKey).length === 0) {
    throw new UnprocessableEntityException("This Page Studio section has no registry-approved AI copy fields.");
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
