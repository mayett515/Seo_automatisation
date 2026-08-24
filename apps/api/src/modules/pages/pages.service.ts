import type { MediaAssetStoragePort } from "@localseo/adapters";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import {
  ReviewPageVersionRequestSchema,
  type CreatePageProposalRunRequest,
  type CreateSectionCopySuggestionRequest,
  type PageProposalDetail,
  type PageProposalListResponse,
  type PageProposalQueueResponse,
  type PageSectionNote,
  type PageSectionNoteListResponse,
  type PageVersionDetail,
  type PageVersionEditResponse,
  type PageVersionListResponse,
  type PageVersionPreviewResponse,
  type PageVersionReviewResponse,
  type ReviewPageVersionRequest,
  type SectionCopySuggestion,
  type SectionCopySuggestionListResponse,
  type SectionCopySuggestionQueueResponse
} from "@localseo/contracts";
import { DatabaseService } from "../../database/database.service.js";
import { QueueProducerService } from "../../queue-producer.js";
import { MEDIA_ASSET_STORAGE } from "../../media-storage.module.js";
import { PageCopySuggestionsCapability } from "./page-copy-suggestions.capability.js";
import { PagePreviewCapability } from "./page-preview.capability.js";
import { PageProposalCapability } from "./page-proposal.capability.js";
import { PageSectionNotesCapability } from "./page-section-notes.capability.js";
import { PageVersionCapability } from "./page-version.capability.js";

const unavailableMediaReader: Pick<MediaAssetStoragePort, "readPrivateObject"> = {
  readPrivateObject: () => Promise.reject(new Error("Media storage reader is not configured."))
};

function parseReviewPageVersionRequest(body: unknown): ReviewPageVersionRequest {
  const parsed = ReviewPageVersionRequestSchema.safeParse(body ?? {});
  if (parsed.success) return parsed.data;

  const decisionNoteIssue = parsed.error.issues.find(
    (issue) => issue.path[0] === "decisionNote" && issue.message === "Requesting changes requires a decision note."
  );
  throw new BadRequestException(decisionNoteIssue?.message ?? "Page version review requires a valid review decision.");
}

@Injectable()
export class PagesService {
  private readonly proposal: PageProposalCapability;
  private readonly version: PageVersionCapability;
  private readonly sectionNotes: PageSectionNotesCapability;
  private readonly copySuggestions: PageCopySuggestionsCapability;
  private readonly preview: PagePreviewCapability;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(QueueProducerService) private readonly queues: QueueProducerService,
    @Inject(MEDIA_ASSET_STORAGE)
    private readonly mediaStorage: Pick<MediaAssetStoragePort, "readPrivateObject"> = unavailableMediaReader
  ) {
    this.proposal = new PageProposalCapability(database, queues);
    this.version = new PageVersionCapability(database, mediaStorage);
    this.sectionNotes = new PageSectionNotesCapability(database);
    this.copySuggestions = new PageCopySuggestionsCapability(database, queues);
    this.preview = new PagePreviewCapability(database, mediaStorage);
  }

  listPageVersions(projectId: string): Promise<PageVersionListResponse> {
    return this.version.listPageVersions(projectId);
  }

  listPageProposals(projectId: string): Promise<PageProposalListResponse> {
    return this.proposal.listPageProposals(projectId);
  }

  queuePageProposal(
    projectId: string,
    input: CreatePageProposalRunRequest,
    userId?: string
  ): Promise<PageProposalQueueResponse> {
    return this.proposal.queuePageProposal(projectId, input, userId);
  }

  listSectionCopySuggestions(projectId: string, pageVersionId: string): Promise<SectionCopySuggestionListResponse> {
    return this.copySuggestions.listSectionCopySuggestions(projectId, pageVersionId);
  }

  queueSectionCopySuggestion(
    projectId: string,
    pageVersionId: string,
    input: CreateSectionCopySuggestionRequest,
    requestedByUserId?: string
  ): Promise<SectionCopySuggestionQueueResponse> {
    return this.copySuggestions.queueSectionCopySuggestion(projectId, pageVersionId, input, requestedByUserId);
  }

  dismissSectionCopySuggestion(
    projectId: string,
    pageVersionId: string,
    suggestionId: string,
    dismissedByUserId?: string
  ): Promise<SectionCopySuggestion> {
    return this.copySuggestions.dismissSectionCopySuggestion(projectId, pageVersionId, suggestionId, dismissedByUserId);
  }

  getPageProposal(projectId: string, pageProposalId: string): Promise<PageProposalDetail> {
    return this.proposal.getPageProposal(projectId, pageProposalId);
  }

  getPageVersion(projectId: string, pageVersionId: string): Promise<PageVersionDetail> {
    return this.version.getPageVersion(projectId, pageVersionId);
  }

  previewPageVersion(projectId: string, pageVersionId: string): Promise<PageVersionPreviewResponse> {
    return this.preview.previewPageVersion(projectId, pageVersionId);
  }

  preparePageVersionPreview(projectId: string, pageVersionId: string) {
    return this.preview.preparePageVersionPreview(projectId, pageVersionId);
  }

  previewPageVersionDocument(projectId: string, pageVersionId: string, documentToken: string | undefined) {
    return this.preview.previewPageVersionDocument(projectId, pageVersionId, documentToken);
  }

  listPageSectionNotes(projectId: string, pageVersionId: string): Promise<PageSectionNoteListResponse> {
    return this.sectionNotes.listPageSectionNotes(projectId, pageVersionId);
  }

  createPageSectionNote(
    projectId: string,
    pageVersionId: string,
    body: unknown,
    createdByUserId?: string
  ): Promise<PageSectionNote> {
    return this.sectionNotes.createPageSectionNote(projectId, pageVersionId, body, createdByUserId);
  }

  resolvePageSectionNote(
    projectId: string,
    pageVersionId: string,
    noteId: string,
    resolvedByUserId?: string
  ): Promise<PageSectionNote> {
    return this.sectionNotes.resolvePageSectionNote(projectId, pageVersionId, noteId, resolvedByUserId);
  }

  editPageVersion(
    projectId: string,
    basePageVersionId: string,
    body: unknown,
    createdByUserId?: string
  ): Promise<PageVersionEditResponse> {
    return this.version.editPageVersion(projectId, basePageVersionId, body, createdByUserId);
  }

  // async, not a bare delegation: parseReviewPageVersionRequest throws
  // synchronously, and callers rely on that surfacing as a rejected promise.
  async reviewPageVersion(
    projectId: string,
    pageVersionId: string,
    body: unknown,
    decidedByUserId?: string
  ): Promise<PageVersionReviewResponse> {
    return this.version.reviewPageVersion(
      projectId,
      pageVersionId,
      parseReviewPageVersionRequest(body),
      decidedByUserId
    );
  }
}
