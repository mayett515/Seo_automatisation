import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException
} from "@nestjs/common";
import {
  type AiReasoningEnqueueFailureCode,
  type CreatePageProposalRunRequest,
  type CreatePageSectionNoteRequest,
  PageJsonSchema,
  PageProposalJsonSchema,
  PageProposalQueueResponseSchema,
  PageProposalSummarySchema,
  PageSectionNoteFieldPathSchema,
  PageSectionNoteSchema,
  PageVersionPreviewResponseSchema,
  PageVersionReviewResponseSchema,
  PageVersionSummarySchema,
  SectionCopySuggestionQueueResponseSchema,
  SectionCopySuggestionSchema,
  decodedStaticSiteFileByteLength,
  type PageJson,
  type PageProposalQueueResponse,
  type PageProposalSummary,
  type PageSectionNote,
  type PageVersionPreviewResponse,
  type PageVersionSummary,
  type SectionCopySuggestion,
  type SectionCopySuggestionQueueResponse
} from "@localseo/contracts";
import { decidePageProposalTargetAdmission } from "@localseo/domain";
import {
  agentRuns,
  approvals,
  opportunities,
  pageVersionProjectScope,
  pageProposals,
  pageSectionCopySuggestions,
  pageSectionNotes,
  pageVersions,
  type DatabaseClient
} from "@localseo/db";
import { and, desc, eq, inArray, isNull, sql } from "@localseo/db/query";
import {
  getPageRegistryAiCopyFieldKeys,
  renderPagePreviewFile,
  validatePageJsonAgainstRegistry
} from "@localseo/page-registry";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type Db = DatabaseClient;
export type PageProposalRow = Awaited<ReturnType<typeof selectPageProposalRows>>[number];
export type PageSectionNoteRow = Awaited<ReturnType<typeof selectPageSectionNoteRows>>[number];
export type SectionCopySuggestionRow = typeof pageSectionCopySuggestions.$inferSelect;
export type PageVersionRow = Awaited<ReturnType<typeof selectPageVersionRows>>[number];
export type PageVersionApprovalRow = typeof approvals.$inferSelect;
export type ApprovalBlockerReader = Pick<DatabaseClient, "select">;
export type PageVersionLockClient = Pick<DatabaseClient, "execute">;
export type TransactionClient = Pick<DatabaseClient, "execute" | "select">;

export async function loadPageVersion(db: Db, projectId: string, pageVersionId: string): Promise<PageVersionRow> {
  if (!isPersistedId(pageVersionId)) {
    throw new BadRequestException("Page version id must be a UUID.");
  }

  const [row] = await selectPageVersionRows(db, projectId, { pageVersionId });

  if (!row) {
    throw new NotFoundException("Page version was not found for this project.");
  }

  return row;
}

export async function loadPageProposal(db: Db, projectId: string, pageProposalId: string): Promise<PageProposalRow> {
  if (!isPersistedId(pageProposalId)) {
    throw new BadRequestException("Page proposal id must be a UUID.");
  }

  const [row] = await selectPageProposalRows(db, projectId, pageProposalId);

  if (!row) {
    throw new NotFoundException("Page proposal was not found for this project.");
  }

  return row;
}

export function pageVersionPreviewResponse(
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

export function previewDocumentPath(projectId: string, pageVersionId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/pages/${encodeURIComponent(pageVersionId)}/preview/document`;
}

export async function lockOpportunityForPageProposal(
  db: TransactionClient,
  projectId: string,
  opportunityId: string
): Promise<void> {
  if (!isPersistedId(opportunityId)) {
    throw new BadRequestException("Opportunity id must be a UUID.");
  }

  await db.execute(
    sql`SELECT "id" FROM "opportunities" WHERE "id" = ${opportunityId} AND "project_id" = ${projectId} FOR UPDATE`
  );
}

export async function loadOpportunityTargetRevision(db: TransactionClient, projectId: string, opportunityId: string) {
  const [opportunity] = await db
    .select({ status: opportunities.status, rowVersion: opportunities.rowVersion })
    .from(opportunities)
    .where(and(eq(opportunities.id, opportunityId), eq(opportunities.projectId, projectId)))
    .limit(1);

  return opportunity;
}

export async function lockAndLoadPageProposalTarget(
  db: TransactionClient,
  projectId: string,
  opportunityId: string
): Promise<NonNullable<Awaited<ReturnType<typeof loadOpportunityTargetRevision>>>> {
  await lockOpportunityForPageProposal(db, projectId, opportunityId);
  const opportunity = await loadOpportunityTargetRevision(db, projectId, opportunityId);

  if (!opportunity) {
    throw new NotFoundException("Opportunity was not found for this project.");
  }

  return opportunity;
}

export function assertPageProposalTargetAdmission(
  expected: CreatePageProposalRunRequest["expectedOpportunity"],
  current: NonNullable<Awaited<ReturnType<typeof loadOpportunityTargetRevision>>>
): void {
  const decision = decidePageProposalTargetAdmission({ expected, current });

  if (decision.kind === "stale") {
    throw new ConflictException("Opportunity changed after the page proposal request was prepared.");
  }

  if (decision.kind === "deny") {
    switch (decision.reason) {
      case "proposal_already_created":
        throw new ConflictException("A page proposal has already been created for this opportunity.");
      case "rejected":
        throw new BadRequestException("Rejected opportunities cannot create page proposals.");
      default: {
        const exhaustiveReason: never = decision.reason;
        throw new Error(`Unhandled Page Proposal target denial: ${String(exhaustiveReason)}`);
      }
    }
  }
}

export async function findActivePageProposalRun(db: ApprovalBlockerReader, projectId: string, opportunityId: string) {
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

export function activePageProposalResponse(run: typeof agentRuns.$inferSelect): PageProposalQueueResponse {
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

export function activeSectionCopySuggestionResponse(
  suggestion: SectionCopySuggestionRow
): SectionCopySuggestionQueueResponse {
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

export async function markPageProposalQueueFailure(
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

export async function markSectionCopySuggestionQueueFailure(
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

export function normalizePageProposalQueueFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "page_generation_queue_failed";
  return message.slice(0, 500);
}

export async function selectPageProposalRows(db: Db, projectId: string, pageProposalId?: string) {
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

export async function selectPageVersionCountsByProposal(db: Db, projectId: string): Promise<Map<string, number>> {
  const projectScope = pageVersionProjectScope(projectId);
  const rows = await db
    .select({
      pageProposalId: pageVersions.pageProposalId,
      versionCount: sql<number>`count(*)::int`
    })
    .from(pageVersions)
    .innerJoin(pageProposals, projectScope.joinCondition)
    .where(projectScope.projectCondition)
    .groupBy(pageVersions.pageProposalId);

  return new Map(rows.map((row) => [row.pageProposalId, row.versionCount]));
}

export async function selectPageSectionNoteRows(db: Db, pageVersionId: string, noteId?: string) {
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

export async function selectSectionCopySuggestionRows(
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

export async function countOpenApprovalBlockers(db: ApprovalBlockerReader, pageVersionId: string): Promise<number> {
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

export async function lockPageVersionForReview(db: PageVersionLockClient, pageVersionId: string): Promise<void> {
  await db.execute(sql`SELECT "id" FROM "page_versions" WHERE "id" = ${pageVersionId} FOR UPDATE`);
}

export async function lockSectionCopySuggestion(
  db: PageVersionLockClient,
  projectId: string,
  pageVersionId: string,
  suggestionId: string
): Promise<void> {
  await db.execute(
    sql`SELECT "id" FROM "page_section_copy_suggestions" WHERE "id" = ${suggestionId} AND "project_id" = ${projectId} AND "page_version_id" = ${pageVersionId} FOR UPDATE`
  );
}

export async function lockAgentRunForSectionCopyCancellation(
  db: PageVersionLockClient,
  projectId: string,
  agentRunId: string
): Promise<void> {
  await db.execute(
    sql`SELECT "id" FROM "agent_runs" WHERE "id" = ${agentRunId} AND "project_id" = ${projectId} FOR UPDATE`
  );
}

export async function lockPageProposalForVersioning(
  db: PageVersionLockClient,
  projectId: string,
  pageProposalId: string
): Promise<void> {
  await db.execute(
    sql`SELECT "id" FROM "page_proposals" WHERE "id" = ${pageProposalId} AND "project_id" = ${projectId} FOR UPDATE`
  );
}

export async function selectLatestPageVersionIdentity(db: ApprovalBlockerReader, pageProposalId: string) {
  const [row] = await db
    .select({ id: pageVersions.id, versionNumber: pageVersions.versionNumber })
    .from(pageVersions)
    .where(eq(pageVersions.pageProposalId, pageProposalId))
    .orderBy(desc(pageVersions.versionNumber))
    .limit(1);

  return row;
}

export async function selectPageVersionRows(
  db: ApprovalBlockerReader,
  projectId: string,
  filter: { pageVersionId?: string; pageProposalId?: string } = {}
) {
  const projectScope = pageVersionProjectScope(projectId);
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
      rowVersion: pageVersions.rowVersion,
      pageJson: pageVersions.pageJson,
      basedOnVersionId: pageVersions.basedOnVersionId,
      createdByUserId: pageVersions.createdByUserId,
      approvedAt: pageVersions.approvedAt,
      createdAt: pageVersions.createdAt,
      updatedAt: pageVersions.updatedAt
    })
    .from(pageVersions)
    .innerJoin(pageProposals, projectScope.joinCondition)
    .where(
      filter.pageVersionId
        ? and(projectScope.projectCondition, eq(pageVersions.id, filter.pageVersionId))
        : filter.pageProposalId
          ? and(projectScope.projectCondition, eq(pageVersions.pageProposalId, filter.pageProposalId))
          : projectScope.projectCondition
    )
    .orderBy(desc(pageVersions.updatedAt), desc(pageVersions.versionNumber))
    .limit(filter.pageVersionId ? 1 : 100);
}

export function pageProposalSummaryToResponse(row: PageProposalRow, versionCount: number): PageProposalSummary {
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

export function pageVersionSummaryToResponse(row: PageVersionRow): PageVersionSummary {
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
    rowVersion: row.rowVersion,
    basedOnVersionId: row.basedOnVersionId ?? undefined,
    createdByUserId: row.createdByUserId ?? undefined,
    approvedAt: row.approvedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  });
}

export function pageSectionNoteToResponse(projectId: string, row: PageSectionNoteRow): PageSectionNote {
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

export function sectionCopySuggestionToResponse(row: SectionCopySuggestionRow): SectionCopySuggestion {
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

export function pageVersionApprovalToResponse(projectId: string, row: PageVersionApprovalRow) {
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

export function parseStoredPageJson(row: PageVersionRow): PageJson {
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

export function assertPageJsonSectionExists(
  pageJson: PageJson,
  sectionId: CreatePageSectionNoteRequest["sectionId"]
): void {
  const section = pageJson.sections.find((candidate) => candidate.id === sectionId);

  if (!section) {
    throw new UnprocessableEntityException("Page section note must target an existing PageJson section id.");
  }
}

export function assertSectionCopySuggestionTarget(pageJson: PageJson, sectionId: string): void {
  const section = pageJson.sections.find((candidate) => candidate.id === sectionId);
  if (!section) {
    throw new UnprocessableEntityException("Section copy generation must target an existing PageJson section id.");
  }

  if (getPageRegistryAiCopyFieldKeys(section.registryKey).length === 0) {
    throw new UnprocessableEntityException("This Page Studio section has no registry-approved AI copy fields.");
  }
}

export function parseStoredProposalJson(
  row: PageProposalRow
): ReturnType<typeof PageProposalJsonSchema.parse> | undefined {
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

export function isPersistedId(value: string): boolean {
  return uuidPattern.test(value);
}

export function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function stringFromUnknown(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
