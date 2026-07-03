import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Param,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";
import {
  CreateRankingProofRequestSchema,
  RankingProofListResponseSchema,
  RankingProofSchema,
  type CreateRankingProofRequest,
  type RankingProof,
  type RankingProofListResponse
} from "@localseo/contracts";
import { rankingProofs } from "@localseo/db";
import { desc, eq } from "drizzle-orm";
import { BetterAuthGuard } from "../auth/guards/better-auth.guard.js";
import { PermissionGuard } from "../auth/permissions/permission.guard.js";
import { RequireProjectPermission } from "../auth/permissions/require-permission.decorator.js";
import { ProjectAccessGuard } from "../auth/project-access.guard.js";
import type { RequestWithAuth } from "../auth/types/authenticated-request.js";
import { DatabaseService } from "../database/database.service.js";
import { CsrfGuard } from "../security/csrf/csrf.guard.js";

@Injectable()
export class OpportunitiesService {
  constructor(private readonly database: DatabaseService) {}

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
}

@Controller("projects/:projectId/ranking-proofs")
@UseGuards(BetterAuthGuard, CsrfGuard, ProjectAccessGuard, PermissionGuard)
@RequireProjectPermission("project:read")
class RankingProofsController {
  constructor(private readonly opportunities: OpportunitiesService) {}

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

@Module({
  controllers: [RankingProofsController],
  providers: [OpportunitiesService]
})
export class OpportunitiesModule {}

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
