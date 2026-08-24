import type { MediaAssetStoragePort } from "@localseo/adapters";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException
} from "@nestjs/common";
import {
  EditPageVersionRequestSchema,
  PageVersionDetailSchema,
  PageVersionEditResponseSchema,
  PageVersionListResponseSchema,
  PageVersionReviewResponseSchema,
  type PageGeneration,
  type PageVersionDetail,
  type PageVersionEditResponse,
  type PageVersionListResponse,
  type PageVersionReviewResponse,
  type ReviewPageVersionRequest
} from "@localseo/contracts";
import {
  applyPageStudioEditCommand,
  decidePageStudioPublishReadiness,
  decideSectionCopySuggestionAttribution
} from "@localseo/domain";
import {
  approvals,
  loadSelectablePageMediaVariants,
  MediaAssetSelectionError,
  pageProposals,
  pageSectionCopySuggestions,
  pageVersions,
  persistPageVersionMediaAssetProjection
} from "@localseo/db";
import { and, eq, inArray } from "@localseo/db/query";
import {
  collectPageMediaAssetIds,
  pageRegistrySummary,
  renderPagePreviewFile,
  validatePageSectionProps
} from "@localseo/page-registry";
import { DatabaseService } from "../../database/database.service.js";
import {
  loadPreviewMediaManifest,
  mediaVariantRecordsToRenderVariants,
  verifyPreviewMediaManifestBytes
} from "../../preview-media.js";
import {
  countOpenApprovalBlockers,
  loadPageVersion,
  lockPageProposalForVersioning,
  lockPageVersionForReview,
  lockSectionCopySuggestion,
  pageVersionApprovalToResponse,
  pageVersionSummaryToResponse,
  parseStoredPageJson,
  selectLatestPageVersionIdentity,
  selectPageVersionRows,
  selectSectionCopySuggestionRows,
  type PageVersionApprovalRow,
  type SectionCopySuggestionRow
} from "./page-aggregate-store.js";

export class PageVersionCapability {
  constructor(
    private readonly database: DatabaseService,
    private readonly mediaStorage: Pick<MediaAssetStoragePort, "readPrivateObject">
  ) {}

  async listPageVersions(projectId: string): Promise<PageVersionListResponse> {
    const db = this.database.requireDb();
    const rows = await selectPageVersionRows(db, projectId);

    return PageVersionListResponseSchema.parse({
      projectId,
      pageVersions: rows.map((row) => pageVersionSummaryToResponse(row))
    });
  }

  async getPageVersion(projectId: string, pageVersionId: string): Promise<PageVersionDetail> {
    const row = await loadPageVersion(this.database.requireDb(), projectId, pageVersionId);
    const pageJson = parseStoredPageJson(row);

    return PageVersionDetailSchema.parse({
      ...pageVersionSummaryToResponse(row),
      pageJson
    });
  }

  async editPageVersion(
    projectId: string,
    basePageVersionId: string,
    body: unknown,
    createdByUserId?: string
  ): Promise<PageVersionEditResponse> {
    const parsed = EditPageVersionRequestSchema.safeParse(body ?? {});

    if (!parsed.success) {
      throw new BadRequestException("Page Studio edit requires a valid explicit edit command.");
    }

    const input = parsed.data;

    if (!createdByUserId) {
      throw new BadRequestException("Page Studio editing requires an authenticated persisted user id.");
    }

    const initialBase = await loadPageVersion(this.database.requireDb(), projectId, basePageVersionId);
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
    input: ReviewPageVersionRequest,
    decidedByUserId?: string
  ): Promise<PageVersionReviewResponse> {
    if (!decidedByUserId) {
      throw new BadRequestException("Page version review requires an authenticated persisted user id.");
    }

    const row = await loadPageVersion(this.database.requireDb(), projectId, pageVersionId);
    const pageJson = parseStoredPageJson(row);

    if (input.decision === "approve") {
      try {
        const manifest = await loadPreviewMediaManifest(this.database.requireDb(), projectId, row.id, pageJson);
        await verifyPreviewMediaManifestBytes(this.mediaStorage, manifest);
      } catch (error) {
        throw new UnprocessableEntityException(
          "Page version media references are not fully available from the immutable project manifest.",
          { cause: error }
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
}
