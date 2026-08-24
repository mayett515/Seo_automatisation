import { BadRequestException, NotFoundException } from "@nestjs/common";
import {
  CreatePageSectionNoteRequestSchema,
  PageSectionNoteListResponseSchema,
  type PageSectionNote,
  type PageSectionNoteListResponse
} from "@localseo/contracts";
import { pageSectionNotes } from "@localseo/db";
import { and, eq, isNull } from "@localseo/db/query";
import { DatabaseService } from "../../database/database.service.js";
import {
  assertPageJsonSectionExists,
  isPersistedId,
  loadPageVersion,
  pageSectionNoteToResponse,
  parseStoredPageJson,
  selectPageSectionNoteRows
} from "./page-aggregate-store.js";

export class PageSectionNotesCapability {
  constructor(private readonly database: DatabaseService) {}

  async listPageSectionNotes(projectId: string, pageVersionId: string): Promise<PageSectionNoteListResponse> {
    const row = await loadPageVersion(this.database.requireDb(), projectId, pageVersionId);
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
    const parsed = CreatePageSectionNoteRequestSchema.safeParse(body ?? {});

    if (!parsed.success) {
      throw new BadRequestException(
        "Page section notes require a valid sectionId, fieldPath, instructionType, and note."
      );
    }

    const input = parsed.data;
    const row = await loadPageVersion(this.database.requireDb(), projectId, pageVersionId);
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

    const pageVersion = await loadPageVersion(this.database.requireDb(), projectId, pageVersionId);
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
}
