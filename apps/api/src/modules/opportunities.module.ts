import {
  BadRequestException,
  Body,
  Controller,
  ConflictException,
  Get,
  Inject,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import {
  AgentRunFailureCodeSchema,
  AgentRunListResponseSchema,
  CreateRankingProofRequestSchema,
  OpportunityExplorerListResponseSchema,
  OpportunityBriefSchema,
  OpportunityResearchCitationSummarySchema,
  OpportunityResearchStoredEvidenceSchema,
  RankingProofListResponseSchema,
  RankingProofSchema,
  ReasoningTaskSchema,
  UpdateOpportunityLifecycleRequestSchema,
  UpdateRankingProofStatusRequestSchema,
  type AgentRunFailureCode,
  type AgentRunListResponse,
  type CreateRankingProofRequest,
  type OpportunityExplorerOpportunity,
  type OpportunityExplorerListResponse,
  type OpportunityResearchCitationSummary,
  type OpportunityResearchStoredEvidence,
  type RankingProof,
  type RankingProofListResponse,
  type UpdateOpportunityLifecycleRequest,
  type UpdateRankingProofStatusRequest
} from "@localseo/contracts";
import {
  agentRunEvidenceItems,
  agentRuns,
  opportunities,
  rankingProofs,
  reportEvidenceAlerts,
  reportEvidenceItems,
  reports
} from "@localseo/db";
import { and, desc, eq, inArray, sql } from "@localseo/db/query";
import { decideRankingProofTransition } from "@localseo/domain";
import { BetterAuthGuard } from "../auth/guards/better-auth.guard.js";
import { PermissionGuard } from "../auth/permissions/permission.guard.js";
import { RequireProjectPermission } from "../auth/permissions/require-permission.decorator.js";
import { ProjectAccessGuard } from "../auth/project-access.guard.js";
import type { RequestWithAuth } from "../auth/types/authenticated-request.js";
import { DatabaseService } from "../database/database.service.js";
import { CsrfGuard } from "../security/csrf/csrf.guard.js";
import { publicOpportunityResearchFailureMessage } from "./opportunity-research-public-failure-message.js";

@Injectable()
export class OpportunitiesService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listOpportunities(projectId: string): Promise<OpportunityExplorerListResponse> {
    const db = this.database.requireDb();
    const rows = await db
      .select()
      .from(opportunities)
      .where(eq(opportunities.projectId, projectId))
      .orderBy(desc(opportunities.score), desc(opportunities.createdAt))
      .limit(100);

    const responses = await opportunityRowsToResponses(db, projectId, rows);
    return OpportunityExplorerListResponseSchema.parse({
      projectId,
      opportunities: responses
    });
  }

  async listAgentRuns(projectId: string, task?: string): Promise<AgentRunListResponse> {
    const parsedTask = task ? ReasoningTaskSchema.safeParse(task) : undefined;
    if (parsedTask && !parsedTask.success) {
      throw new BadRequestException("Agent run task filter is not supported.");
    }

    const db = this.database.requireDb();
    const taskFilter = parsedTask?.data;
    const rows = await db
      .select()
      .from(agentRuns)
      .where(
        taskFilter
          ? and(eq(agentRuns.projectId, projectId), eq(agentRuns.task, taskFilter))
          : eq(agentRuns.projectId, projectId)
      )
      .orderBy(desc(agentRuns.createdAt))
      .limit(100);

    const runIds = rows.map((row) => row.id);
    const counts = await countOpportunitiesByRun(db, projectId, runIds);

    return AgentRunListResponseSchema.parse({
      projectId,
      runs: rows.map((row) => agentRunToResponse(row, counts.get(row.id) ?? 0))
    });
  }

  async listRankingProofs(projectId: string): Promise<RankingProofListResponse> {
    const db = this.database.requireDb();
    const rows = await db
      .select()
      .from(rankingProofs)
      .where(eq(rankingProofs.projectId, projectId))
      .orderBy(desc(rankingProofs.capturedAt))
      .limit(100);

    return RankingProofListResponseSchema.parse({
      projectId,
      proofs: rows.map((row) => rankingProofToResponse(row))
    });
  }

  async createRankingProof(
    projectId: string,
    input: CreateRankingProofRequest,
    createdByUserId?: string
  ): Promise<RankingProof> {
    if (!createdByUserId) throw new BadRequestException("Ranking proof capture requires a persisted actor.");
    const db = this.database.requireDb();
    const capturedAt = input.capturedAt ? new Date(input.capturedAt) : new Date();
    const [row] = await db
      .insert(rankingProofs)
      .values({
        projectId,
        query: input.query,
        pageUrl: input.pageUrl,
        rank: input.rank,
        capturedAt,
        searchEngine: input.searchEngine,
        device: input.device,
        locale: input.locale,
        notes: input.notes,
        createdByUserId,
        evidenceJson: {
          sourceType: "ranking_proof",
          proofTier: "internal_signal",
          locator: {
            query: input.query,
            pageUrl: input.pageUrl
          },
          observedMetric: {
            name: "rank",
            value: input.rank
          },
          entrySource: "manual_operator_capture"
        }
      })
      .returning();

    if (!row) {
      throw new Error("Failed to create ranking proof.");
    }

    return rankingProofToResponse(row);
  }

  async updateRankingProofStatus(
    projectId: string,
    proofId: string,
    input: UpdateRankingProofStatusRequest,
    userId?: string
  ): Promise<RankingProof> {
    const db = this.database.requireDb();
    if (!userId) throw new BadRequestException("Ranking proof review requires a persisted actor.");
    const invalidating = input.status === "invalidated";
    let result: typeof rankingProofs.$inferSelect | undefined;
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT "id" FROM "ranking_proofs" WHERE "id" = ${proofId} AND "project_id" = ${projectId} FOR UPDATE`
      );
      const [current] = await tx
        .select()
        .from(rankingProofs)
        .where(and(eq(rankingProofs.id, proofId), eq(rankingProofs.projectId, projectId)))
        .limit(1);
      if (!current) throw new NotFoundException("Ranking proof was not found for this project.");
      if (current.status !== input.expectedStatus || current.rowVersion !== input.expectedRowVersion) {
        throw new ConflictException("Ranking proof changed before this decision was applied.");
      }
      const decision = decideRankingProofTransition({
        currentStatus: current.status,
        nextStatus: input.status,
        reason: "reason" in input ? input.reason : undefined
      });
      if (decision.kind === "deny")
        throw new ConflictException(`Ranking proof transition rejected: ${decision.reason}.`);
      const now = new Date();
      const [row] = await tx
        .update(rankingProofs)
        .set({
          status: input.status,
          reviewedAt: input.status === "reviewed" ? now : current.reviewedAt,
          reviewedByUserId: input.status === "reviewed" ? userId : current.reviewedByUserId,
          invalidatedAt: invalidating ? now : null,
          invalidatedByUserId: invalidating ? userId : null,
          invalidationReason: invalidating && "reason" in input ? input.reason : null,
          updatedAt: now
        })
        .where(
          and(
            eq(rankingProofs.id, proofId),
            eq(rankingProofs.projectId, projectId),
            eq(rankingProofs.status, input.expectedStatus),
            eq(rankingProofs.rowVersion, input.expectedRowVersion)
          )
        )
        .returning();
      if (!row) throw new ConflictException("Ranking proof changed before this decision was applied.");

      if (invalidating) {
        await tx.execute(sql`
          SELECT r."id"
          FROM "reports" r
          INNER JOIN "report_evidence_items" rei ON rei."report_id" = r."id"
          WHERE r."project_id" = ${projectId}
            AND r."status" = 'published'
            AND rei."source_kind" = 'ranking_proof'
            AND rei."source_id" = ${proofId}
          ORDER BY r."id"
          FOR UPDATE OF r
        `);
        const affected = await tx
          .select({ report: reports, evidence: reportEvidenceItems })
          .from(reportEvidenceItems)
          .innerJoin(reports, eq(reportEvidenceItems.reportId, reports.id))
          .where(
            and(
              eq(reports.projectId, projectId),
              eq(reports.status, "published"),
              eq(reportEvidenceItems.sourceKind, "ranking_proof"),
              eq(reportEvidenceItems.sourceId, proofId)
            )
          );
        if (affected.length > 0) {
          await tx
            .insert(reportEvidenceAlerts)
            .values(
              affected.map(({ report, evidence }) => ({
                projectId,
                reportId: report.id,
                reportEvidenceItemId: evidence.id,
                evidenceKey: evidence.evidenceKey,
                sourceKind: evidence.sourceKind,
                sourceId: evidence.sourceId,
                alertKind: "source_invalidated" as const,
                status: "open" as const,
                detectedAt: now
              }))
            )
            .onConflictDoNothing();
        }
      }
      result = row;
    });

    if (!result) throw new Error("Ranking proof status update produced no result.");
    return rankingProofToResponse(result);
  }

  async updateOpportunityLifecycle(
    projectId: string,
    opportunityId: string,
    input: UpdateOpportunityLifecycleRequest,
    decidedByUserId?: string
  ): Promise<OpportunityExplorerOpportunity> {
    const db = this.database.requireDb();
    const [row] = await db
      .update(opportunities)
      .set({
        status: input.status,
        statusReason: input.reason ?? null,
        decidedByUserId: decidedByUserId ?? null,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(opportunities.id, opportunityId),
          eq(opportunities.projectId, projectId),
          eq(opportunities.status, input.expectedStatus),
          eq(opportunities.rowVersion, input.expectedRowVersion)
        )
      )
      .returning();

    if (!row) {
      const [current] = await db
        .select({ id: opportunities.id })
        .from(opportunities)
        .where(and(eq(opportunities.id, opportunityId), eq(opportunities.projectId, projectId)))
        .limit(1);

      if (!current) {
        throw new NotFoundException("Opportunity was not found for this project.");
      }

      throw new ConflictException("Opportunity changed after it was loaded. Refresh and review the current state.");
    }

    const [response] = await opportunityRowsToResponses(db, projectId, [row]);
    if (!response) throw new Error("Opportunity response projection produced no result.");
    return response;
  }
}

@Controller("projects/:projectId/ranking-proofs")
@UseGuards(BetterAuthGuard, CsrfGuard, ProjectAccessGuard, PermissionGuard)
@RequireProjectPermission("project:read")
class RankingProofsController {
  constructor(@Inject(OpportunitiesService) private readonly opportunities: OpportunitiesService) {}

  @Get()
  list(@Param("projectId") projectId: string) {
    return this.opportunities.listRankingProofs(projectId);
  }

  @Post()
  @RequireProjectPermission("opportunity:evidence")
  create(@Param("projectId") projectId: string, @Body() body: unknown, @Req() request: RequestWithAuth) {
    const parsed = CreateRankingProofRequestSchema.safeParse(body ?? {});

    if (!parsed.success) {
      throw new BadRequestException(
        "Ranking proof requires query, http(s) pageUrl, and a positive rank no greater than 100."
      );
    }

    return this.opportunities.createRankingProof(projectId, parsed.data, request.auth?.user.id);
  }

  @Patch(":proofId/status")
  @RequireProjectPermission("opportunity:evidence")
  updateStatus(
    @Param("projectId") projectId: string,
    @Param("proofId") proofId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth
  ) {
    const parsed = UpdateRankingProofStatusRequestSchema.safeParse(body ?? {});

    if (!parsed.success) {
      throw new BadRequestException(
        "Ranking proof status requires reviewed or invalidated; invalidation needs a reason."
      );
    }

    return this.opportunities.updateRankingProofStatus(projectId, proofId, parsed.data, request.auth?.user.id);
  }
}

@Controller("projects/:projectId/opportunities")
@UseGuards(BetterAuthGuard, CsrfGuard, ProjectAccessGuard, PermissionGuard)
@RequireProjectPermission("project:read")
class OpportunitiesController {
  constructor(@Inject(OpportunitiesService) private readonly opportunities: OpportunitiesService) {}

  @Get()
  list(@Param("projectId") projectId: string) {
    return this.opportunities.listOpportunities(projectId);
  }

  @Patch(":opportunityId/status")
  @RequireProjectPermission("opportunity:decide")
  updateStatus(
    @Param("projectId") projectId: string,
    @Param("opportunityId") opportunityId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth
  ) {
    const parsed = UpdateOpportunityLifecycleRequestSchema.safeParse(body ?? {});

    if (!parsed.success) {
      throw new BadRequestException("Opportunity decisions require a valid status; rejection requires a reason.");
    }

    return this.opportunities.updateOpportunityLifecycle(projectId, opportunityId, parsed.data, request.auth?.user.id);
  }
}

@Controller("projects/:projectId/agent-runs")
@UseGuards(BetterAuthGuard, CsrfGuard, ProjectAccessGuard, PermissionGuard)
@RequireProjectPermission("project:read")
class AgentRunsController {
  constructor(@Inject(OpportunitiesService) private readonly opportunities: OpportunitiesService) {}

  @Get()
  list(@Param("projectId") projectId: string, @Query("task") task?: string) {
    return this.opportunities.listAgentRuns(projectId, task);
  }
}

@Module({
  controllers: [RankingProofsController, OpportunitiesController, AgentRunsController],
  providers: [OpportunitiesService]
})
export class OpportunitiesModule {}

async function countOpportunitiesByRun(
  db: ReturnType<DatabaseService["requireDb"]>,
  projectId: string,
  runIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  if (runIds.length === 0) {
    return counts;
  }

  const rows = await db
    .select({ agentRunId: opportunities.agentRunId })
    .from(opportunities)
    .where(and(eq(opportunities.projectId, projectId), inArray(opportunities.agentRunId, runIds)));

  for (const row of rows) {
    if (row.agentRunId) {
      counts.set(row.agentRunId, (counts.get(row.agentRunId) ?? 0) + 1);
    }
  }

  return counts;
}

type OpportunityResearchProjection = {
  artifact: OpportunityResearchStoredEvidence;
  citations: OpportunityResearchCitationSummary[];
};

async function opportunityRowsToResponses(
  db: ReturnType<DatabaseService["requireDb"]>,
  projectId: string,
  rows: Array<typeof opportunities.$inferSelect>
): Promise<OpportunityExplorerOpportunity[]> {
  const artifactsByOpportunityId = new Map<string, OpportunityResearchStoredEvidence>();
  const runIds = new Set<string>();
  const evidenceKeys = new Set<string>();

  for (const row of rows) {
    if (!hasOpportunityResearchProjection(row)) continue;
    const artifact = OpportunityResearchStoredEvidenceSchema.safeParse(row.evidenceJson);
    if (!artifact.success || !row.agentRunId) {
      throw new Error(`Opportunity Research evidence is invalid for opportunity ${row.id}.`);
    }
    assertOpportunityResearchProjectionMatches(row, artifact.data);
    artifactsByOpportunityId.set(row.id, artifact.data);
    runIds.add(row.agentRunId);
    for (const evidenceKey of artifact.data.citedEvidenceKeys) evidenceKeys.add(evidenceKey);
  }

  const evidenceRows =
    runIds.size > 0 && evidenceKeys.size > 0
      ? await db
          .select({
            agentRunId: agentRunEvidenceItems.agentRunId,
            evidenceKey: agentRunEvidenceItems.evidenceKey,
            sourceKind: agentRunEvidenceItems.sourceKind,
            proofTier: agentRunEvidenceItems.proofTier,
            evidenceJson: agentRunEvidenceItems.evidenceJson
          })
          .from(agentRunEvidenceItems)
          .where(
            and(
              eq(agentRunEvidenceItems.projectId, projectId),
              inArray(agentRunEvidenceItems.agentRunId, [...runIds]),
              inArray(agentRunEvidenceItems.evidenceKey, [...evidenceKeys])
            )
          )
      : [];
  const evidenceByRunAndKey = new Map(
    evidenceRows.map((row) => [researchEvidenceMapKey(row.agentRunId, row.evidenceKey), row] as const)
  );

  return rows.map((row) => {
    const artifact = artifactsByOpportunityId.get(row.id);
    if (!artifact) return opportunityToResponse(row);
    if (!row.agentRunId) throw new Error(`Opportunity Research run identity is missing for opportunity ${row.id}.`);
    const citations = artifact.citedEvidenceKeys.map((evidenceKey) => {
      const evidence = evidenceByRunAndKey.get(researchEvidenceMapKey(row.agentRunId!, evidenceKey));
      if (!evidence) {
        throw new Error(`Opportunity Research citation ${evidenceKey} is missing for opportunity ${row.id}.`);
      }
      return OpportunityResearchCitationSummarySchema.parse({
        evidenceKey,
        sourceKind: evidence.sourceKind,
        proofTier: evidence.proofTier,
        summary: evidenceSummary(evidence.evidenceJson, evidence.sourceKind)
      });
    });
    return opportunityToResponse(row, { artifact, citations });
  });
}

function opportunityToResponse(
  row: typeof opportunities.$inferSelect,
  researchProjection?: OpportunityResearchProjection
): OpportunityExplorerOpportunity {
  const parsedBrief = OpportunityBriefSchema.safeParse(row.evidenceJson);

  return OpportunityExplorerListResponseSchema.shape.opportunities.element.parse({
    id: row.id,
    projectId: row.projectId,
    agentRunId: row.agentRunId ?? undefined,
    areaId: row.areaId ?? undefined,
    serviceId: row.serviceId ?? undefined,
    classification: row.classification ?? undefined,
    primaryKeyword: row.primaryKeyword,
    score: row.score ?? undefined,
    research:
      researchProjection &&
      row.rankingMilestone &&
      row.evidenceReadiness &&
      row.businessValue &&
      row.marketDifficulty &&
      row.executionEffort &&
      row.lane &&
      row.policyVersion &&
      row.researchMaterialDigest &&
      row.candidateKey
        ? {
            rankingMilestone: row.rankingMilestone,
            evidenceReadiness: row.evidenceReadiness,
            businessValue: row.businessValue,
            marketDifficulty: row.marketDifficulty,
            executionEffort: row.executionEffort,
            lane: row.lane,
            policyVersion: row.policyVersion,
            materialDigest: row.researchMaterialDigest,
            candidateKey: row.candidateKey,
            portfolioSelected: row.portfolioSelected,
            portfolioOrder: row.portfolioOrder ?? undefined,
            candidate: researchProjection.artifact.candidate,
            citations: researchProjection.citations
          }
        : undefined,
    status: row.status,
    rowVersion: row.rowVersion,
    statusReason: row.statusReason ?? undefined,
    decidedByUserId: row.decidedByUserId ?? undefined,
    evidenceJson: parsedBrief.success ? parsedBrief.data : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  });
}

function hasOpportunityResearchProjection(row: typeof opportunities.$inferSelect): boolean {
  return [
    row.rankingMilestone,
    row.evidenceReadiness,
    row.businessValue,
    row.marketDifficulty,
    row.executionEffort,
    row.lane,
    row.policyVersion,
    row.researchMaterialDigest,
    row.candidateKey
  ].some((value) => value !== null);
}

function assertOpportunityResearchProjectionMatches(
  row: typeof opportunities.$inferSelect,
  artifact: OpportunityResearchStoredEvidence
): void {
  const matches =
    row.serviceId === artifact.candidate.serviceId &&
    row.areaId === artifact.candidate.areaId &&
    row.primaryKeyword === artifact.candidate.primaryKeyword &&
    row.rankingMilestone === artifact.derivedAxes.rankingMilestone &&
    row.evidenceReadiness === artifact.derivedAxes.evidenceReadiness &&
    row.businessValue === artifact.derivedAxes.businessValue &&
    row.marketDifficulty === artifact.derivedAxes.marketDifficulty &&
    row.executionEffort === artifact.derivedAxes.executionEffort &&
    row.lane === artifact.derivedAxes.lane;
  if (!matches) throw new Error(`Opportunity Research projection drifted for opportunity ${row.id}.`);
}

function researchEvidenceMapKey(runId: string, evidenceKey: string): string {
  return `${runId}\u0000${evidenceKey}`;
}

function evidenceSummary(value: unknown, fallback: string): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const summary = (value as Record<string, unknown>).summary;
    if (typeof summary === "string" && summary.trim().length > 0) return summary.slice(0, 1_000);
  }
  return fallback.replaceAll("_", " ");
}

function agentRunToResponse(row: typeof agentRuns.$inferSelect, opportunityCount: number) {
  const failureCode = parseFailureCode(row.failureCode);
  const diagnostics = recordFromUnknown(row.diagnosticsJson);
  const gateId = stringFromUnknown(diagnostics.gateId);
  const message =
    row.workflowName === "opportunity_research"
      ? publicOpportunityResearchFailureMessage(failureCode)
      : failureCode === "qa_rejected" && gateId === "dedupe_gate"
        ? "No new opportunities; the run only found duplicates of existing open opportunities."
        : stringFromUnknown(diagnostics.message);

  return AgentRunListResponseSchema.shape.runs.element.parse({
    id: row.id,
    projectId: row.projectId,
    subjectId: row.subjectId ?? undefined,
    task: row.task,
    workflowName: row.workflowName ?? undefined,
    workflowVersion: row.workflowVersion ?? undefined,
    constraintProfileVersion: row.constraintProfileVersion ?? undefined,
    status: row.status,
    failureCode,
    failure: failureCode ? { code: failureCode, gateId, message } : undefined,
    provider: row.provider ?? undefined,
    model: row.model ?? undefined,
    latencyMs: row.latencyMs ?? undefined,
    opportunityCount,
    startedAt: row.startedAt?.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  });
}

function rankingProofToResponse(row: typeof rankingProofs.$inferSelect): RankingProof {
  return RankingProofSchema.parse({
    id: row.id,
    projectId: row.projectId,
    query: row.query,
    pageUrl: row.pageUrl,
    rank: row.rank,
    capturedAt: row.capturedAt.toISOString(),
    searchEngine: row.searchEngine,
    device: row.device,
    locale: row.locale ?? undefined,
    notes: row.notes ?? undefined,
    status: row.status,
    rowVersion: row.rowVersion,
    reviewedAt: row.reviewedAt?.toISOString(),
    reviewedByUserId: row.reviewedByUserId ?? undefined,
    invalidatedAt: row.invalidatedAt?.toISOString(),
    invalidatedByUserId: row.invalidatedByUserId ?? undefined,
    invalidationReason: row.invalidationReason ?? undefined,
    createdByUserId: row.createdByUserId ?? undefined,
    createdAt: row.createdAt.toISOString()
  });
}

function parseFailureCode(value: string | null): AgentRunFailureCode | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = AgentRunFailureCodeSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringFromUnknown(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
