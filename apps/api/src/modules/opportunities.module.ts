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
  RankingProofListResponseSchema,
  RankingProofSchema,
  ReasoningTaskSchema,
  UpdateOpportunityLifecycleRequestSchema,
  type AgentRunListResponse,
  type CreateRankingProofRequest,
  type OpportunityExplorerOpportunity,
  type OpportunityExplorerListResponse,
  type RankingProof,
  type RankingProofListResponse,
  type UpdateOpportunityLifecycleRequest
} from "@localseo/contracts";
import { agentRuns, opportunities, rankingProofs } from "@localseo/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { BetterAuthGuard } from "../auth/guards/better-auth.guard.js";
import { PermissionGuard } from "../auth/permissions/permission.guard.js";
import { RequireProjectPermission } from "../auth/permissions/require-permission.decorator.js";
import { ProjectAccessGuard } from "../auth/project-access.guard.js";
import type { RequestWithAuth } from "../auth/types/authenticated-request.js";
import { DatabaseService } from "../database/database.service.js";
import { CsrfGuard } from "../security/csrf/csrf.guard.js";

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

    return OpportunityExplorerListResponseSchema.parse({
      projectId,
      opportunities: rows.map((row) => opportunityToResponse(row))
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
        screenshotArtifactKey: input.screenshotArtifactKey,
        notes: input.notes,
        createdByUserId,
        evidenceJson: {
          sourceType: "ranking_proof",
          proofTier: "customer_safe_proof",
          locator: {
            query: input.query,
            pageUrl: input.pageUrl
          },
          observedMetric: {
            name: "rank",
            value: input.rank
          },
          entrySource: "manual_operator_entry"
        }
      })
      .returning();

    if (!row) {
      throw new Error("Failed to create ranking proof.");
    }

    return rankingProofToResponse(row);
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
      .where(and(eq(opportunities.id, opportunityId), eq(opportunities.projectId, projectId)))
      .returning();

    if (!row) {
      throw new NotFoundException("Opportunity was not found for this project.");
    }

    return opportunityToResponse(row);
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

function opportunityToResponse(row: typeof opportunities.$inferSelect) {
  const parsedBrief = OpportunityBriefSchema.safeParse(row.evidenceJson);

  return OpportunityExplorerListResponseSchema.shape.opportunities.element.parse({
    id: row.id,
    projectId: row.projectId,
    agentRunId: row.agentRunId ?? undefined,
    classification: row.classification,
    primaryKeyword: row.primaryKeyword,
    score: row.score,
    status: row.status,
    statusReason: row.statusReason ?? undefined,
    decidedByUserId: row.decidedByUserId ?? undefined,
    evidenceJson: parsedBrief.success ? parsedBrief.data : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  });
}

function agentRunToResponse(row: typeof agentRuns.$inferSelect, opportunityCount: number) {
  const failureCode = parseFailureCode(row.failureCode);
  const diagnostics = recordFromUnknown(row.diagnosticsJson);
  const gateId = stringFromUnknown(diagnostics.gateId);
  const message =
    failureCode === "qa_rejected" && gateId === "dedupe_gate"
      ? "No new opportunities; the run only found duplicates of existing open opportunities."
      : stringFromUnknown(diagnostics.message);

  return AgentRunListResponseSchema.shape.runs.element.parse({
    id: row.id,
    projectId: row.projectId,
    task: row.task,
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
    screenshotArtifactKey: row.screenshotArtifactKey ?? undefined,
    notes: row.notes ?? undefined,
    createdByUserId: row.createdByUserId ?? undefined,
    createdAt: row.createdAt.toISOString()
  });
}

function parseFailureCode(value: string | null): ReturnType<typeof AgentRunFailureCodeSchema.parse> | undefined {
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
