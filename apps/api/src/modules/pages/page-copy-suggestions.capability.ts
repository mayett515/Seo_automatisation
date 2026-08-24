import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import {
  SectionCopySuggestionJobDataSchema,
  SectionCopySuggestionListResponseSchema,
  SectionCopySuggestionQueueResponseSchema,
  secondaryJobNames,
  type CreateSectionCopySuggestionRequest,
  type SectionCopySuggestion,
  type SectionCopySuggestionListResponse,
  type SectionCopySuggestionQueueResponse
} from "@localseo/contracts";
import { agentRuns, isDatabaseUniqueViolation, pageSectionCopySuggestions } from "@localseo/db";
import { and, eq, inArray } from "@localseo/db/query";
import { DatabaseService } from "../../database/database.service.js";
import { QueueProducerService } from "../../queue-producer.js";
import {
  activeSectionCopySuggestionResponse,
  assertSectionCopySuggestionTarget,
  isPersistedId,
  loadPageVersion,
  lockAgentRunForSectionCopyCancellation,
  lockPageProposalForVersioning,
  lockSectionCopySuggestion,
  markSectionCopySuggestionQueueFailure,
  normalizePageProposalQueueFailure,
  parseStoredPageJson,
  sectionCopySuggestionToResponse,
  selectLatestPageVersionIdentity,
  selectPageVersionRows,
  selectSectionCopySuggestionRows,
  type SectionCopySuggestionRow
} from "./page-aggregate-store.js";

export class PageCopySuggestionsCapability {
  constructor(
    private readonly database: DatabaseService,
    private readonly queues: QueueProducerService
  ) {}

  async listSectionCopySuggestions(
    projectId: string,
    pageVersionId: string
  ): Promise<SectionCopySuggestionListResponse> {
    const pageVersion = await loadPageVersion(this.database.requireDb(), projectId, pageVersionId);
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
        jobName: secondaryJobNames.pageGeneration,
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

    const initialBase = await loadPageVersion(this.database.requireDb(), projectId, pageVersionId);
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
        jobName: secondaryJobNames.pageGeneration,
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

    const pageVersion = await loadPageVersion(this.database.requireDb(), projectId, pageVersionId);
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
}
