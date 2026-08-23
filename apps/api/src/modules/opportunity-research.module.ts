import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Body,
  ConflictException,
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
  ServiceUnavailableException,
  UseGuards
} from "@nestjs/common";
import {
  AgentRunTimelineResponseSchema,
  OpportunityResearchEnqueueDataSchema,
  OpportunityResearchQueueResponseSchema,
  OpportunityResearchStateSchema,
  RerunOpportunityResearchRequestSchema,
  UpdateOpportunityResearchPauseRequestSchema,
  opportunityResearchConstraintProfileVersion,
  opportunityResearchWorkflowVersion,
  type AgentRunTimelineResponse,
  type OpportunityResearchQueueResponse,
  type OpportunityResearchState,
  type RerunOpportunityResearchRequest,
  type UpdateOpportunityResearchPauseRequest
} from "@localseo/contracts";
import {
  agentRunEvents,
  agentRunEvidenceItems,
  agentRuns,
  agentRunSteps,
  loadOpportunityResearchMaterial,
  projectOpportunityResearchStates
} from "@localseo/db";
import { and, asc, eq, sql } from "@localseo/db/query";
import { BetterAuthGuard } from "../auth/guards/better-auth.guard.js";
import { PermissionGuard } from "../auth/permissions/permission.guard.js";
import { RequireProjectPermission } from "../auth/permissions/require-permission.decorator.js";
import { ProjectAccessGuard } from "../auth/project-access.guard.js";
import type { RequestWithAuth } from "../auth/types/authenticated-request.js";
import { DatabaseService } from "../database/database.service.js";
import { QueueProducerService } from "../queue-producer.js";
import { CsrfGuard } from "../security/csrf/csrf.guard.js";

type DatabaseClient = ReturnType<DatabaseService["requireDb"]>;
type TransactionClient = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];

@Injectable()
export class OpportunityResearchService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(QueueProducerService) private readonly queues: QueueProducerService
  ) {}

  async getState(projectId: string): Promise<OpportunityResearchState> {
    const db = this.database.requireDb();
    const material = await loadOpportunityResearchMaterial(db, projectId);
    const [state] = await db
      .select()
      .from(projectOpportunityResearchStates)
      .where(eq(projectOpportunityResearchStates.projectId, projectId))
      .limit(1);
    return researchStateResponse(projectId, state, material.materialDigest, material.readinessIssues);
  }

  async updatePause(
    projectId: string,
    input: UpdateOpportunityResearchPauseRequest,
    userId?: string
  ): Promise<OpportunityResearchState> {
    const actorUserId = requireActor(userId);
    const db = this.database.requireDb();
    await db.transaction(async (tx) => {
      await lockProject(tx, projectId);
      await ensureResearchState(tx, projectId);
      const state = await lockResearchState(tx, projectId);
      if (state.rowVersion !== input.expectedRowVersion) {
        throw new ConflictException("Opportunity research state changed; refresh before retrying.");
      }
      const now = new Date();
      const nextStatus = input.paused
        ? state.status === "queued" || state.status === "running"
          ? state.status
          : "paused"
        : state.status === "paused"
          ? "needs_research"
          : state.status;
      const [updated] = await tx
        .update(projectOpportunityResearchStates)
        .set({
          status: nextStatus,
          pausedAt: input.paused ? now : null,
          pausedByUserId: input.paused ? actorUserId : null,
          pauseReason: input.paused ? input.reason : null,
          nextScheduledAt: input.paused ? null : now,
          updatedAt: now
        })
        .where(
          and(
            eq(projectOpportunityResearchStates.projectId, projectId),
            eq(projectOpportunityResearchStates.rowVersion, input.expectedRowVersion)
          )
        )
        .returning({ projectId: projectOpportunityResearchStates.projectId });
      if (!updated) throw new ConflictException("Opportunity research state changed before pause was applied.");
    });
    return this.getState(projectId);
  }

  async rerun(
    projectId: string,
    input: RerunOpportunityResearchRequest,
    userId?: string
  ): Promise<OpportunityResearchQueueResponse> {
    const actorUserId = requireActor(userId);
    if (!this.queues.isQueueConfigured("opportunity-research")) {
      throw new ServiceUnavailableException("Opportunity Research queue is not configured.");
    }
    const db = this.database.requireDb();
    const runId = randomUUID();
    const createdAt = new Date();
    const admission = await db.transaction(async (tx) => {
      await lockProject(tx, projectId);
      await ensureResearchState(tx, projectId);
      const state = await lockResearchState(tx, projectId);
      const [replay] = await tx
        .select({
          id: agentRuns.id,
          status: agentRuns.status,
          workflowName: agentRuns.workflowName,
          requestedByUserId: agentRuns.requestedByUserId,
          inputSha256: agentRuns.inputSha256,
          createdAt: agentRuns.createdAt
        })
        .from(agentRuns)
        .where(and(eq(agentRuns.projectId, projectId), eq(agentRuns.idempotencyKey, input.idempotencyKey)))
        .limit(1);
      if (replay) {
        if (
          replay.workflowName !== "opportunity_research" ||
          replay.requestedByUserId !== actorUserId ||
          !replay.inputSha256
        ) {
          throw new ConflictException("Opportunity Research idempotency key was reused with different semantics.");
        }
        return {
          kind: "replay" as const,
          runId: replay.id,
          status: replay.status,
          materialDigest: replay.inputSha256,
          createdBy: replay.requestedByUserId ?? undefined,
          createdAt: replay.createdAt
        };
      }
      if (state.rowVersion !== input.expectedRowVersion) {
        throw new ConflictException("Opportunity research state changed; refresh before rerunning.");
      }
      if (state.pausedAt) throw new ConflictException("Opportunity Research is paused.");
      const [activeRun] = await tx
        .select({
          id: agentRuns.id,
          workflowName: agentRuns.workflowName,
          requestedByUserId: agentRuns.requestedByUserId,
          inputSha256: agentRuns.inputSha256,
          createdAt: agentRuns.createdAt
        })
        .from(agentRuns)
        .where(
          and(
            eq(agentRuns.projectId, projectId),
            eq(agentRuns.task, "opportunity_scout"),
            sql`${agentRuns.status} in ('queued', 'running')`
          )
        )
        .limit(1);
      if (activeRun) {
        if (activeRun.workflowName !== "opportunity_research") {
          throw new ConflictException("A legacy Opportunity Scout run is active for this project.");
        }
        return {
          kind: "already_active" as const,
          runId: activeRun.id,
          materialDigest: activeRun.inputSha256 ?? undefined,
          createdBy: activeRun.requestedByUserId ?? undefined,
          createdAt: activeRun.createdAt
        };
      }

      const material = await loadOpportunityResearchMaterial(tx, projectId);
      if (material.readinessIssues.length > 0) {
        throw new ConflictException(`Opportunity Research is not ready: ${material.readinessIssues.join(", ")}.`);
      }
      const [run] = await tx
        .insert(agentRuns)
        .values({
          id: runId,
          projectId,
          subjectId: projectId,
          task: "opportunity_scout",
          status: "queued",
          workflowName: "opportunity_research",
          workflowVersion: opportunityResearchWorkflowVersion,
          constraintProfileVersion: opportunityResearchConstraintProfileVersion,
          requestedByUserId: actorUserId,
          triggerSource: "user_action",
          idempotencyKey: input.idempotencyKey,
          inputSha256: material.materialDigest,
          createdAt,
          updatedAt: createdAt
        })
        .returning({ id: agentRuns.id, createdAt: agentRuns.createdAt });
      if (!run) throw new Error("Failed to admit Opportunity Research run.");
      await tx.insert(agentRunEvents).values({
        projectId,
        agentRunId: runId,
        eventKey: "run.queued",
        eventType: "run.queued",
        executionEpoch: 0,
        payloadJson: { triggerSource: "user_action", materialDigest: material.materialDigest },
        occurredAt: createdAt
      });
      const [stateUpdated] = await tx
        .update(projectOpportunityResearchStates)
        .set({
          status: "queued",
          activeRunId: runId,
          materialDigest: material.materialDigest,
          materialDirty: false,
          lastRunAt: createdAt,
          nextScheduledAt: null,
          updatedAt: createdAt
        })
        .where(
          and(
            eq(projectOpportunityResearchStates.projectId, projectId),
            eq(projectOpportunityResearchStates.rowVersion, input.expectedRowVersion)
          )
        )
        .returning({ projectId: projectOpportunityResearchStates.projectId });
      if (!stateUpdated) throw new ConflictException("Opportunity research admission lost its compare-and-set.");
      return {
        kind: "created" as const,
        runId,
        materialDigest: material.materialDigest,
        createdBy: actorUserId,
        createdAt: run.createdAt
      };
    });

    if (admission.kind === "already_active") {
      return queueResponse({ projectId, ...admission, status: "already_active" });
    }
    if (admission.kind === "replay") {
      return queueResponse({
        projectId,
        ...admission,
        status: admission.status === "queued" || admission.status === "running" ? "already_active" : admission.status
      });
    }

    try {
      const enqueued = await this.queues.enqueue({
        queueName: "opportunity-research",
        jobName: "opportunity_research",
        jobId: runId,
        data: OpportunityResearchEnqueueDataSchema.parse({
          projectId,
          runId,
          materialDigest: admission.materialDigest,
          requestedByUserId: actorUserId,
          triggerSource: "user_action"
        }),
        options: { attempts: 3, backoff: { type: "exponential", delay: 5_000 } },
        audit: {
          projectId,
          type: "opportunity_research",
          inputRef: runId,
          actorType: "user",
          actorUserId,
          triggerSource: "user_action"
        }
      });
      if (!enqueued) throw new Error("queue_not_configured_after_admission");
    } catch (error) {
      await terminalizeEnqueueFailure(db, projectId, runId, error);
      throw error;
    }
    return queueResponse({ projectId, ...admission, status: "queued" });
  }

  async timeline(projectId: string, runId: string): Promise<AgentRunTimelineResponse> {
    const db = this.database.requireDb();
    const [run] = await db
      .select({ id: agentRuns.id })
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.id, runId),
          eq(agentRuns.projectId, projectId),
          eq(agentRuns.workflowName, "opportunity_research")
        )
      )
      .limit(1);
    if (!run) throw new NotFoundException("Opportunity Research run was not found for this project.");
    const [steps, events, evidence] = await Promise.all([
      db
        .select()
        .from(agentRunSteps)
        .where(and(eq(agentRunSteps.agentRunId, runId), eq(agentRunSteps.projectId, projectId)))
        .orderBy(asc(agentRunSteps.createdAt))
        .limit(100),
      db
        .select()
        .from(agentRunEvents)
        .where(and(eq(agentRunEvents.agentRunId, runId), eq(agentRunEvents.projectId, projectId)))
        .orderBy(asc(agentRunEvents.sequence))
        .limit(500),
      db
        .select()
        .from(agentRunEvidenceItems)
        .where(and(eq(agentRunEvidenceItems.agentRunId, runId), eq(agentRunEvidenceItems.projectId, projectId)))
        .orderBy(asc(agentRunEvidenceItems.createdAt))
        .limit(500)
    ]);
    return AgentRunTimelineResponseSchema.parse({
      projectId,
      runId,
      steps: steps.map((step) => ({
        id: step.id,
        runId,
        stepKey: step.stepKey,
        stepKind: step.stepKind,
        status: step.status,
        attemptCount: step.attemptCount,
        executionEpoch: step.executionEpoch,
        rowVersion: step.rowVersion,
        agentRole: step.agentRole ?? undefined,
        toolKey: step.toolKey ?? undefined,
        provider: step.provider ?? undefined,
        model: step.model ?? undefined,
        failureCode: step.failureCode ?? undefined,
        startedAt: step.startedAt?.toISOString(),
        completedAt: step.completedAt?.toISOString(),
        createdAt: step.createdAt.toISOString(),
        updatedAt: step.updatedAt.toISOString()
      })),
      events: events.map((event) => ({
        id: event.id,
        runId,
        stepId: event.agentRunStepId ?? undefined,
        sequence: event.sequence,
        eventKey: event.eventKey,
        eventType: event.eventType,
        executionEpoch: event.executionEpoch,
        occurredAt: event.occurredAt.toISOString()
      })),
      evidence: evidence.map((item) => ({
        id: item.id,
        runId,
        evidenceKey: item.evidenceKey,
        sourceKind: item.sourceKind,
        sourceId: item.sourceId,
        sourceVersion: item.sourceVersion,
        executionEpoch: item.executionEpoch,
        payloadSha256: item.payloadSha256,
        observedAt: item.observedAt.toISOString(),
        proofTier: item.proofTier,
        summary: evidenceSummary(item.evidenceJson, item.sourceKind)
      }))
    });
  }
}

@Controller("projects/:projectId/opportunity-research")
@UseGuards(BetterAuthGuard, CsrfGuard, ProjectAccessGuard, PermissionGuard)
@RequireProjectPermission("project:read")
class OpportunityResearchController {
  constructor(@Inject(OpportunityResearchService) private readonly research: OpportunityResearchService) {}

  @Get()
  state(@Param("projectId") projectId: string) {
    return this.research.getState(projectId);
  }

  @Patch("pause")
  @RequireProjectPermission("opportunity:run")
  pause(@Param("projectId") projectId: string, @Body() body: unknown, @Req() request: RequestWithAuth) {
    const parsed = UpdateOpportunityResearchPauseRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException("Opportunity Research pause command is invalid.");
    return this.research.updatePause(projectId, parsed.data, request.auth?.user.id);
  }

  @Post("rerun")
  @RequireProjectPermission("opportunity:run")
  rerun(@Param("projectId") projectId: string, @Body() body: unknown, @Req() request: RequestWithAuth) {
    const parsed = RerunOpportunityResearchRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException("Opportunity Research rerun command is invalid.");
    return this.research.rerun(projectId, parsed.data, request.auth?.user.id);
  }
}

@Controller("projects/:projectId/agent-runs/:runId/timeline")
@UseGuards(BetterAuthGuard, CsrfGuard, ProjectAccessGuard, PermissionGuard)
@RequireProjectPermission("project:read")
class OpportunityResearchTimelineController {
  constructor(@Inject(OpportunityResearchService) private readonly research: OpportunityResearchService) {}

  @Get()
  timeline(@Param("projectId") projectId: string, @Param("runId") runId: string) {
    return this.research.timeline(projectId, runId);
  }
}

@Module({
  controllers: [OpportunityResearchController, OpportunityResearchTimelineController],
  providers: [OpportunityResearchService],
  exports: [OpportunityResearchService]
})
export class OpportunityResearchModule {}

async function lockProject(tx: TransactionClient, projectId: string): Promise<void> {
  const rows = await tx.execute(sql`SELECT "id" FROM "projects" WHERE "id" = ${projectId} FOR UPDATE`);
  if (rows.length === 0) throw new NotFoundException("Project was not found.");
}

async function ensureResearchState(tx: TransactionClient, projectId: string): Promise<void> {
  await tx.insert(projectOpportunityResearchStates).values({ projectId }).onConflictDoNothing();
}

async function lockResearchState(tx: TransactionClient, projectId: string) {
  await tx.execute(
    sql`SELECT "project_id" FROM "project_opportunity_research_states" WHERE "project_id" = ${projectId} FOR UPDATE`
  );
  const [state] = await tx
    .select()
    .from(projectOpportunityResearchStates)
    .where(eq(projectOpportunityResearchStates.projectId, projectId))
    .limit(1);
  if (!state) throw new Error("Failed to create or load Opportunity Research state.");
  return state;
}

async function terminalizeEnqueueFailure(
  db: DatabaseClient,
  projectId: string,
  runId: string,
  error: unknown
): Promise<void> {
  await db.transaction(async (tx) => {
    await lockProject(tx, projectId);
    const now = new Date();
    const [terminalized] = await tx
      .update(agentRuns)
      .set({
        status: "failed",
        failureCode: "queue_enqueue_failed",
        diagnosticsJson: { message: error instanceof Error ? error.message.slice(0, 1_000) : "queue_enqueue_failed" },
        completedAt: now,
        updatedAt: now
      })
      .where(and(eq(agentRuns.id, runId), eq(agentRuns.projectId, projectId), eq(agentRuns.status, "queued")))
      .returning({ id: agentRuns.id, executionEpoch: agentRuns.executionEpoch });
    if (!terminalized) return;
    await tx
      .update(projectOpportunityResearchStates)
      .set({ status: "failed", activeRunId: null, nextScheduledAt: now, updatedAt: now })
      .where(
        and(
          eq(projectOpportunityResearchStates.projectId, projectId),
          eq(projectOpportunityResearchStates.activeRunId, runId)
        )
      );
    await tx.insert(agentRunEvents).values({
      projectId,
      agentRunId: runId,
      eventKey: "run.failed.queue_enqueue",
      eventType: "run.failed",
      executionEpoch: terminalized.executionEpoch,
      payloadJson: { failureCode: "queue_enqueue_failed" },
      occurredAt: now
    });
  });
}

function researchStateResponse(
  projectId: string,
  state: typeof projectOpportunityResearchStates.$inferSelect | undefined,
  currentMaterialDigest: string,
  readinessIssues: string[]
): OpportunityResearchState {
  return OpportunityResearchStateSchema.parse({
    projectId,
    status: state?.status ?? "idle",
    rowVersion: state?.rowVersion ?? 0,
    materialDigest: state?.materialDigest ?? undefined,
    currentMaterialDigest,
    materialDirty: Boolean(state?.materialDirty || state?.materialDigest !== currentMaterialDigest),
    lastSuccessfulDigest: state?.lastSuccessfulDigest ?? undefined,
    activeRunId: state?.activeRunId ?? undefined,
    nextScheduledAt: state?.nextScheduledAt?.toISOString(),
    lastRunAt: state?.lastRunAt?.toISOString(),
    pausedAt: state?.pausedAt?.toISOString(),
    pausedByUserId: state?.pausedByUserId ?? undefined,
    pauseReason: state?.pauseReason ?? undefined,
    readinessIssues,
    portfolioShortfalls: state?.portfolioShortfallsJson ?? { defendAdvance: 2, quickBuild: 4, strategic: 2 }
  });
}

function queueResponse(input: {
  projectId: string;
  runId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "already_active";
  materialDigest?: string;
  createdBy?: string;
  createdAt: Date;
}): OpportunityResearchQueueResponse {
  return OpportunityResearchQueueResponseSchema.parse({
    jobId: input.runId,
    projectId: input.projectId,
    runId: input.runId,
    type: "opportunity_research",
    status: input.status,
    materialDigest: input.materialDigest,
    inputRef: input.runId,
    createdBy: input.createdBy,
    createdAt: input.createdAt.toISOString()
  });
}

function requireActor(userId: string | undefined): string {
  if (!userId) throw new BadRequestException("A persisted actor is required for Opportunity Research.");
  return userId;
}

function evidenceSummary(value: unknown, fallback: string): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const summary = (value as Record<string, unknown>).summary;
    if (typeof summary === "string" && summary.trim()) return summary.trim().slice(0, 1_000);
  }
  return fallback.replaceAll("_", " ");
}
