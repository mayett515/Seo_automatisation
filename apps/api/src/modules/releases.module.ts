import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Module,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import {
  QueueJobSchema,
  CreateReleasePlanRequestSchema,
  DeployJobDataSchema,
  ExecuteRollbackRequestSchema,
  ReleaseCheckSchema,
  ReleaseItemActionSchema,
  ReleaseNoteSchema,
  ReleasePlanSchema,
  ReleaseVerificationJobDataSchema,
  ReleaseVerificationQueueResponseSchema,
  RollbackJobDataSchema,
  RollbackPointSchema,
  VerifyReleaseRequestSchema,
  type DeploymentStatus,
  type ReleasePlan,
  type ReleaseCheck,
  type ReleaseNote,
  type ReleaseVerificationStatus,
  type ReleaseVerificationQueueResponse,
  type RollbackPoint
} from "@localseo/contracts";
import { buildReleaseDeploymentKey, canDeployRelease, decideReleaseReadiness } from "@localseo/domain";
import { buildReleasePreflightChecks, type ReleasePreflightEvidence } from "@localseo/seo";
import {
  approvals,
  deployments,
  isDatabaseUniqueViolation,
  pageProposals,
  pageVersions,
  projectTrackingKeys,
  releaseChecks,
  releasePlanItems,
  releasePlans,
  releaseVerificationChecks,
  releaseVerifications,
  rollbackPoints,
  type DatabaseClient
} from "@localseo/db";
import { and, desc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { QueueProducerService } from "../queue-producer.js";
import { BetterAuthGuard } from "../auth/guards/better-auth.guard.js";
import { PermissionGuard } from "../auth/permissions/permission.guard.js";
import { RequireProjectPermission } from "../auth/permissions/require-permission.decorator.js";
import { ProjectAccessGuard } from "../auth/project-access.guard.js";
import type { RequestWithAuth } from "../auth/types/authenticated-request.js";
import { DatabaseService } from "../database/database.service.js";
import { CsrfGuard } from "../security/csrf/csrf.guard.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type Db = DatabaseClient;

const approvableReleaseStatuses = new Set<ReleasePlan["status"]>(["ready", "ready_with_warnings"]);
const rollbackVerifiedSourceDeploymentStatuses = [
  "live_healthy",
  "live_with_warnings"
] as const satisfies DeploymentStatus[];
const rollbackFallbackSourceDeploymentStatuses = ["provider_succeeded"] as const satisfies DeploymentStatus[];
const rollbackSourceDeploymentStatuses = [
  "provider_succeeded",
  "live_healthy",
  "live_with_warnings"
] as const satisfies DeploymentStatus[];
const rollbackExecutionReadyStatuses = [
  "provider_succeeded",
  "live_healthy",
  "live_with_warnings",
  "rollback_recommended",
  "failed"
] as const satisfies DeploymentStatus[];
const deployJobAttempts = 20;
const deployJobBackoffDelayMs = 15_000;
const rollbackJobAttempts = 5;
const rollbackJobBackoffDelayMs = 15_000;
const releaseVerificationJobAttempts = 3;
const releaseVerificationJobBackoffDelayMs = 10_000;

@Injectable()
export class ReleasesService {
  constructor(
    @Inject(QueueProducerService)
    private readonly queues: QueueProducerService,
    @Inject(DatabaseService)
    private readonly database: DatabaseService
  ) {}

  async createPlan(projectId: string, body: unknown): Promise<ReleasePlan> {
    const input = CreateReleasePlanRequestSchema.parse(body ?? {});
    const requestedPageVersionIds = [...new Set(input.pageVersionIds)];
    const releasePlanId = randomUUID();
    const plan = ReleasePlanSchema.parse({
      releasePlanId,
      projectId,
      status: "draft",
      riskLevel: "low",
      blockerCount: requestedPageVersionIds.length === 0 ? 1 : 0,
      warningCount: 0
    });

    const db = this.database.db;

    if (!db || !isPersistedId(projectId)) {
      return plan;
    }

    if (requestedPageVersionIds.some((pageVersionId) => !isPersistedId(pageVersionId))) {
      throw new BadRequestException("Release page version ids must be UUIDs.");
    }

    const insertedPlan = await db.transaction(async (tx) => {
      const [createdPlan] = await tx
        .insert(releasePlans)
        .values({
          id: releasePlanId,
          projectId,
          status: "draft",
          summary: `Release plan for ${requestedPageVersionIds.length} page version(s).`,
          riskLevel: "low",
          blockerCount: plan.blockerCount,
          warningCount: 0
        })
        .returning();

      if (!createdPlan) {
        throw new Error("Failed to persist release plan");
      }

      if (requestedPageVersionIds.length === 0) {
        return createdPlan;
      }

      const rows = await tx
        .select({
          pageVersionId: pageVersions.id,
          targetUrl: pageProposals.route
        })
        .from(pageVersions)
        .innerJoin(pageProposals, eq(pageVersions.pageProposalId, pageProposals.id))
        .where(and(eq(pageProposals.projectId, projectId), inArray(pageVersions.id, requestedPageVersionIds)));

      if (rows.length !== requestedPageVersionIds.length) {
        throw new BadRequestException("Every release page version must belong to this project.");
      }

      await tx.insert(releasePlanItems).values(
        rows.map((row) => ({
          releasePlanId,
          pageVersionId: row.pageVersionId,
          targetUrl: normalizeRelativeReleaseTargetRoute(row.targetUrl),
          action: "create" as const,
          status: "pending"
        }))
      );

      return createdPlan;
    });

    return mapReleasePlan(insertedPlan);
  }

  async getRelease(projectId: string, releasePlanId: string): Promise<ReleasePlan> {
    if (!this.database.db || !isPersistedId(releasePlanId)) {
      return ReleasePlanSchema.parse({
        releasePlanId,
        projectId,
        status: "draft",
        riskLevel: "low",
        blockerCount: 0,
        warningCount: 0
      });
    }

    return mapReleasePlan(await this.loadReleasePlanForProject(projectId, releasePlanId));
  }

  async preflight(
    projectId: string,
    releasePlanId: string
  ): Promise<{
    projectId: string;
    releasePlanId: string;
    readiness: string;
    checks: ReleaseCheck[];
  }> {
    await this.assertReleasePlanForProject(projectId, releasePlanId);
    const db = this.database.db;
    const evidence =
      db && isPersistedId(releasePlanId)
        ? await loadPreparedReleasePreflightEvidence(db, projectId, releasePlanId)
        : {
            pages: [],
            rollbackPointCount: 0,
            priorSuccessfulDeploymentCount: 0,
            usableTrackingKeyCount: 0
          };
    const checks = buildReleasePreflightChecks(evidence);
    const readiness = decideReleaseReadiness(checks);

    if (db && isPersistedId(releasePlanId)) {
      await persistReleaseChecks(db, releasePlanId, checks);
      await db
        .update(releasePlans)
        .set({
          status: readiness.kind,
          blockerCount: checks.filter((check) => check.severity === "blocker" && check.result === "failed").length,
          warningCount: checks.filter((check) => check.severity === "warning" && check.result === "failed").length,
          updatedAt: new Date()
        })
        .where(and(eq(releasePlans.id, releasePlanId), eq(releasePlans.projectId, projectId)));
    }

    return {
      projectId,
      releasePlanId,
      readiness: readiness.kind,
      checks
    };
  }

  async approveDeploy(projectId: string, releasePlanId: string, userId: string) {
    await this.assertReleasePlanForProject(projectId, releasePlanId);

    const db = this.database.db;

    if (db && isPersistedId(releasePlanId)) {
      const plan = await this.loadReleasePlanForProject(projectId, releasePlanId);

      if (!approvableReleaseStatuses.has(plan.status)) {
        throw new BadRequestException("Release plan is not in an approvable state.");
      }

      const checks = await loadReleaseChecks(db, releasePlanId);

      if (checks.length === 0 || decideReleaseReadiness(checks).kind === "blocked") {
        throw new BadRequestException("Release preflight must pass before approval.");
      }

      await db.transaction(async (tx) => {
        await tx
          .update(releasePlans)
          .set({
            status: "approved_for_deploy",
            approvedAt: new Date(),
            updatedAt: new Date()
          })
          .where(and(eq(releasePlans.id, releasePlanId), eq(releasePlans.projectId, projectId)));
        await tx.insert(approvals).values({
          releasePlanId,
          userId,
          status: "approved",
          decidedAt: new Date()
        });
      });
    }

    return {
      projectId,
      releasePlanId,
      status: "approved_for_deploy",
      approvedAt: new Date().toISOString()
    };
  }

  async deploy(projectId: string, releasePlanId: string, userId?: string) {
    const db = this.database.db;

    if (!db || !isPersistedId(releasePlanId)) {
      return QueueJobSchema.parse({
        projectId,
        releasePlanId,
        jobId: randomUUID(),
        type: "deploy",
        status: "dry_run",
        inputRef: releasePlanId,
        createdBy: userId,
        message: "Release persistence is not configured. This is an explicit dry-run response.",
        createdAt: new Date().toISOString()
      });
    }

    const plan = mapReleasePlan(await this.loadReleasePlanForProject(projectId, releasePlanId));
    const checks = await loadReleaseChecks(db, releasePlanId);

    if (checks.length === 0 || !canDeployRelease(plan, checks) || !(await hasApprovedRelease(db, releasePlanId))) {
      throw new BadRequestException("Release must pass preflight and be approved before deploy.");
    }

    const deploymentKey = buildReleaseDeploymentKey(releasePlanId);
    const jobId = deploymentKey;

    const enqueued = await this.queues.enqueue({
      queueName: "deploy",
      jobName: "deploy",
      jobId,
      data: DeployJobDataSchema.parse({
        projectId,
        releasePlanId,
        deploymentKey,
        triggeredByUserId: userId ?? null,
        triggerSource: "user_action"
      }),
      options: {
        attempts: deployJobAttempts,
        backoff: {
          type: "fixed",
          delay: deployJobBackoffDelayMs
        },
        removeOnComplete: true,
        removeOnFail: true
      },
      audit: {
        projectId,
        type: "deploy",
        inputRef: releasePlanId,
        actorType: userId ? "user" : "system",
        actorUserId: userId,
        triggerSource: "user_action"
      }
    });

    if (enqueued) {
      await db
        .update(releasePlans)
        .set({
          status: "deploying",
          updatedAt: new Date()
        })
        .where(and(eq(releasePlans.id, releasePlanId), eq(releasePlans.projectId, projectId)));
    }

    return QueueJobSchema.parse({
      projectId,
      releasePlanId,
      jobId,
      type: "deploy",
      status: enqueued ? "queued" : "dry_run",
      inputRef: releasePlanId,
      createdBy: userId,
      message: enqueued ? undefined : "Deploy queue is not configured. This is an explicit dry-run response.",
      createdAt: new Date().toISOString()
    });
  }

  async executeRollback(projectId: string, releasePlanId: string, userId: string | undefined, body: unknown) {
    await this.assertReleasePlanForProject(projectId, releasePlanId);
    const input = ExecuteRollbackRequestSchema.parse(body ?? {});
    const db = this.database.db;
    const jobId = rollbackJobId(releasePlanId, input.rollbackPointId);

    if (!isPersistedId(input.rollbackPointId)) {
      throw new BadRequestException("Rollback point id must be a UUID.");
    }

    if (!db || !isPersistedId(releasePlanId)) {
      return QueueJobSchema.parse({
        projectId,
        releasePlanId,
        jobId,
        type: "rollback",
        status: "dry_run",
        inputRef: input.rollbackPointId,
        createdBy: userId,
        message: "Release persistence is not configured. This is an explicit dry-run response.",
        createdAt: new Date().toISOString()
      });
    }

    await loadRollbackPointForRelease(db, projectId, releasePlanId, input.rollbackPointId);
    await loadReleasePlanForRollbackExecution(db, projectId, releasePlanId);
    const deployment = await loadDeploymentForRollbackExecution(db, projectId, releasePlanId);

    const enqueued = await this.queues.enqueue({
      queueName: "rollback",
      jobName: "rollback",
      jobId,
      data: RollbackJobDataSchema.parse({
        projectId,
        releasePlanId,
        deploymentId: deployment.id,
        rollbackPointId: input.rollbackPointId,
        triggeredByUserId: userId ?? null,
        triggerSource: "user_action"
      }),
      options: {
        attempts: rollbackJobAttempts,
        backoff: {
          type: "fixed",
          delay: rollbackJobBackoffDelayMs
        },
        removeOnComplete: true,
        removeOnFail: true
      },
      audit: {
        projectId,
        type: "rollback",
        inputRef: input.rollbackPointId,
        actorType: userId ? "user" : "system",
        actorUserId: userId,
        triggerSource: "user_action"
      }
    });

    return QueueJobSchema.parse({
      projectId,
      releasePlanId,
      jobId,
      type: "rollback",
      status: enqueued ? "queued" : "dry_run",
      inputRef: input.rollbackPointId,
      createdBy: userId,
      message: enqueued ? undefined : "Rollback queue is not configured. This is an explicit dry-run response.",
      createdAt: new Date().toISOString()
    });
  }

  async verify(
    projectId: string,
    releasePlanId: string,
    userId: string | undefined,
    body: unknown
  ): Promise<ReleaseVerificationQueueResponse> {
    await this.assertReleasePlanForProject(projectId, releasePlanId);
    const input = VerifyReleaseRequestSchema.parse(body ?? {});
    const db = this.database.db;

    if (!db || !isPersistedId(releasePlanId)) {
      return ReleaseVerificationQueueResponseSchema.parse({
        jobId: `release-verification:${releasePlanId}:dry-run`,
        projectId,
        releasePlanId,
        deploymentId: input.deploymentId,
        type: "release_verification",
        status: "dry_run",
        message: "Release persistence is required before post-deploy verification can run.",
        createdAt: new Date().toISOString()
      });
    }

    const deployment = await loadDeploymentForVerification(db, projectId, releasePlanId, input.deploymentId);
    const active = await findActiveReleaseVerification(db, deployment.id);

    if (active) {
      return ReleaseVerificationQueueResponseSchema.parse({
        jobId: active.id,
        projectId,
        releasePlanId,
        deploymentId: deployment.id,
        verificationId: active.id,
        type: "release_verification",
        status: "already_active",
        inputRef: active.id,
        message: "Release verification is already running for this deployment.",
        createdAt: active.createdAt.toISOString()
      });
    }

    const verificationId = randomUUID();
    const jobId = verificationId;

    try {
      await db.insert(releaseVerifications).values({
        id: verificationId,
        releasePlanId,
        deploymentId: deployment.id,
        status: "running",
        summary: "Post-deploy verification is queued.",
        evidenceJson: {
          source: "release_verify_endpoint",
          state: "queued"
        }
      });
    } catch (error) {
      if (isDatabaseUniqueViolation(error)) {
        const conflictingRun = await findActiveReleaseVerification(db, deployment.id);
        if (conflictingRun) {
          return ReleaseVerificationQueueResponseSchema.parse({
            jobId: conflictingRun.id,
            projectId,
            releasePlanId,
            deploymentId: deployment.id,
            verificationId: conflictingRun.id,
            type: "release_verification",
            status: "already_active",
            inputRef: conflictingRun.id,
            message: "Release verification is already running for this deployment.",
            createdAt: conflictingRun.createdAt.toISOString()
          });
        }
      }

      throw error;
    }

    let enqueued: boolean;

    try {
      enqueued = await this.queues.enqueue({
        queueName: "release-verification",
        jobName: "release_verification",
        jobId,
        data: ReleaseVerificationJobDataSchema.parse({
          projectId,
          releasePlanId,
          deploymentId: deployment.id,
          verificationId,
          triggeredByUserId: userId ?? null,
          triggerSource: "user_action"
        }),
        options: {
          attempts: releaseVerificationJobAttempts,
          backoff: {
            type: "exponential",
            delay: releaseVerificationJobBackoffDelayMs
          }
        },
        audit: {
          projectId,
          type: "release_verification",
          inputRef: verificationId,
          actorType: userId ? "user" : "system",
          actorUserId: userId,
          triggerSource: "user_action"
        }
      });
    } catch (error) {
      await markReleaseVerificationQueueFailure(db, verificationId, normalizeQueueFailureMessage(error));
      throw error;
    }

    if (!enqueued) {
      await markReleaseVerificationQueueFailure(
        db,
        verificationId,
        "Release verification queue was not configured after run creation."
      );
    }

    return ReleaseVerificationQueueResponseSchema.parse({
      jobId,
      projectId,
      releasePlanId,
      deploymentId: deployment.id,
      verificationId,
      type: "release_verification",
      status: enqueued ? "queued" : "dry_run",
      inputRef: verificationId,
      message: enqueued
        ? undefined
        : "Release verification queue is not configured. This is an explicit dry-run response.",
      createdAt: new Date().toISOString()
    });
  }

  async listNotes(
    projectId: string,
    releasePlanId: string
  ): Promise<{ projectId: string; releasePlanId: string; notes: ReleaseNote[] }> {
    await this.assertReleasePlanForProject(projectId, releasePlanId);

    return {
      projectId,
      releasePlanId,
      notes: [
        ReleaseNoteSchema.parse({
          releasePlanId,
          audience: "internal",
          title: "Release note placeholder",
          body: "Release notes are persisted separately from release checks so customer-facing summaries can stay conservative.",
          createdAt: new Date().toISOString()
        })
      ]
    };
  }

  async listRollbackPoints(
    projectId: string,
    releasePlanId: string
  ): Promise<{
    projectId: string;
    releasePlanId: string;
    rollbackPoints: RollbackPoint[];
  }> {
    await this.assertReleasePlanForProject(projectId, releasePlanId);
    const db = this.database.db;

    if (db && isPersistedId(releasePlanId)) {
      const rows = await db
        .select()
        .from(rollbackPoints)
        .where(and(eq(rollbackPoints.projectId, projectId), eq(rollbackPoints.releasePlanId, releasePlanId)));

      return {
        projectId,
        releasePlanId,
        rollbackPoints: rows.map((row) =>
          RollbackPointSchema.parse({
            releasePlanId: row.releasePlanId,
            deploymentId: row.deploymentId ?? undefined,
            artifactKey: row.artifactKey,
            providerDeployId: row.providerDeployId ?? undefined,
            liveUrl: row.liveUrl ?? undefined,
            evidence: row.evidenceJson ?? undefined,
            createdAt: row.createdAt.toISOString()
          })
        )
      };
    }

    return {
      projectId,
      releasePlanId,
      rollbackPoints: [
        RollbackPointSchema.parse({
          releasePlanId,
          artifactKey: `rollback/${releasePlanId}/previous-stable.json`,
          evidence: { source: "deployment_agent_preflight" },
          createdAt: new Date().toISOString()
        })
      ]
    };
  }

  private async assertReleasePlanForProject(projectId: string, releasePlanId: string): Promise<void> {
    if (!this.database.db || !isPersistedId(releasePlanId)) {
      return;
    }

    await this.loadReleasePlanForProject(projectId, releasePlanId);
  }

  private async loadReleasePlanForProject(
    projectId: string,
    releasePlanId: string
  ): Promise<typeof releasePlans.$inferSelect> {
    const db = this.database.db;

    if (!db) {
      throw new UnauthorizedException("Release persistence is required for persisted release plans.");
    }

    const [plan] = await db
      .select()
      .from(releasePlans)
      .where(and(eq(releasePlans.id, releasePlanId), eq(releasePlans.projectId, projectId)))
      .limit(1);

    if (!plan) {
      throw new UnauthorizedException("Release plan is not authorized for this project.");
    }

    return plan;
  }
}

@Controller()
@UseGuards(BetterAuthGuard, CsrfGuard, ProjectAccessGuard, PermissionGuard)
class ReleasesController {
  constructor(@Inject(ReleasesService) private readonly releases: ReleasesService) {}

  @Post("projects/:projectId/releases/plan")
  @RequireProjectPermission("release:plan")
  createPlan(@Param("projectId") projectId: string, @Body() body: unknown) {
    return this.releases.createPlan(projectId, body);
  }

  @Get("projects/:projectId/releases/:releasePlanId")
  getRelease(@Param("projectId") projectId: string, @Param("releasePlanId") releasePlanId: string) {
    return this.releases.getRelease(projectId, releasePlanId);
  }

  @Post("projects/:projectId/releases/:releasePlanId/preflight")
  @RequireProjectPermission("release:preflight")
  preflight(@Param("projectId") projectId: string, @Param("releasePlanId") releasePlanId: string) {
    return this.releases.preflight(projectId, releasePlanId);
  }

  @Post("projects/:projectId/releases/:releasePlanId/approve-deploy")
  @RequireProjectPermission("release:approve")
  approveDeploy(
    @Param("projectId") projectId: string,
    @Param("releasePlanId") releasePlanId: string,
    @Req() request: RequestWithAuth
  ) {
    return this.releases.approveDeploy(projectId, releasePlanId, request.auth?.user.id ?? "local-scaffold-user");
  }

  @Post("projects/:projectId/releases/:releasePlanId/deploy")
  @RequireProjectPermission("deploy:execute")
  deploy(
    @Param("projectId") projectId: string,
    @Param("releasePlanId") releasePlanId: string,
    @Req() request: RequestWithAuth
  ) {
    return this.releases.deploy(projectId, releasePlanId, request.auth?.user.id);
  }

  @Post("projects/:projectId/releases/:releasePlanId/rollback/execute")
  @RequireProjectPermission("rollback:execute")
  executeRollback(
    @Param("projectId") projectId: string,
    @Param("releasePlanId") releasePlanId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth
  ) {
    return this.releases.executeRollback(projectId, releasePlanId, request.auth?.user.id, body);
  }

  @Post("projects/:projectId/releases/:releasePlanId/verify")
  @RequireProjectPermission("release:verify")
  verify(
    @Param("projectId") projectId: string,
    @Param("releasePlanId") releasePlanId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth
  ) {
    return this.releases.verify(projectId, releasePlanId, request.auth?.user.id, body);
  }

  @Get("projects/:projectId/releases/:releasePlanId/notes")
  listNotes(@Param("projectId") projectId: string, @Param("releasePlanId") releasePlanId: string) {
    return this.releases.listNotes(projectId, releasePlanId);
  }

  @Get("projects/:projectId/releases/:releasePlanId/rollback-points")
  listRollbackPoints(@Param("projectId") projectId: string, @Param("releasePlanId") releasePlanId: string) {
    return this.releases.listRollbackPoints(projectId, releasePlanId);
  }
}

@Module({
  controllers: [ReleasesController],
  providers: [ReleasesService]
})
export class ReleasesModule {}

async function persistReleaseChecks(db: Db, releasePlanId: string, checks: ReleaseCheck[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(releaseChecks).where(eq(releaseChecks.releasePlanId, releasePlanId));

    if (checks.length === 0) {
      return;
    }

    await tx.insert(releaseChecks).values(
      checks.map((check) => ({
        releasePlanId,
        scope: check.scope,
        checkKey: check.checkKey,
        severity: check.severity,
        result: check.result,
        message: check.message,
        evidenceJson: check.evidence
      }))
    );
  });
}

async function loadReleasePreflightEvidence(
  db: Db,
  projectId: string,
  releasePlanId: string
): Promise<ReleasePreflightEvidence> {
  const pageRows = await db
    .select({
      pageVersionId: releasePlanItems.pageVersionId,
      action: releasePlanItems.action,
      targetUrl: releasePlanItems.targetUrl,
      approvedAt: pageVersions.approvedAt,
      pageJson: pageVersions.pageJson,
      sitemapReady: pageProposals.sitemapReady,
      uniquenessRationale: pageProposals.uniquenessRationale
    })
    .from(releasePlanItems)
    .leftJoin(pageVersions, eq(releasePlanItems.pageVersionId, pageVersions.id))
    .leftJoin(pageProposals, eq(pageVersions.pageProposalId, pageProposals.id))
    .where(eq(releasePlanItems.releasePlanId, releasePlanId));
  const rollbackRows = await db
    .select({ id: rollbackPoints.id })
    .from(rollbackPoints)
    .where(
      and(
        eq(rollbackPoints.projectId, projectId),
        eq(rollbackPoints.releasePlanId, releasePlanId),
        isNotNull(rollbackPoints.providerDeployId)
      )
    );
  const priorDeploymentRows = await db
    .select({ id: deployments.id })
    .from(deployments)
    .where(
      and(
        eq(deployments.projectId, projectId),
        ne(deployments.releasePlanId, releasePlanId),
        inArray(deployments.status, rollbackSourceDeploymentStatuses)
      )
    );
  const activeTrackingKeyRows = await db
    .select({
      id: projectTrackingKeys.id,
      allowedOrigins: projectTrackingKeys.allowedOrigins
    })
    .from(projectTrackingKeys)
    .where(
      and(
        eq(projectTrackingKeys.projectId, projectId),
        eq(projectTrackingKeys.status, "active"),
        isNull(projectTrackingKeys.revokedAt)
      )
    );

  return {
    pages: pageRows.map((row) => ({
      pageVersionId: row.pageVersionId,
      action: ReleaseItemActionSchema.parse(row.action),
      targetUrl: row.targetUrl,
      approvedAt: row.approvedAt,
      pageJson: row.pageJson,
      sitemapReady: row.sitemapReady ?? false,
      uniquenessRationale: row.uniquenessRationale ?? null
    })),
    rollbackPointCount: rollbackRows.length,
    priorSuccessfulDeploymentCount: priorDeploymentRows.length,
    usableTrackingKeyCount: activeTrackingKeyRows.filter((row) => hasUsableTrackingOrigins(row.allowedOrigins)).length
  };
}

async function loadPreparedReleasePreflightEvidence(
  db: Db,
  projectId: string,
  releasePlanId: string
): Promise<ReleasePreflightEvidence> {
  await prepareRollbackPointForReleasePreflight(db, projectId, releasePlanId);
  return loadReleasePreflightEvidence(db, projectId, releasePlanId);
}

async function prepareRollbackPointForReleasePreflight(
  db: Db,
  projectId: string,
  releasePlanId: string
): Promise<void> {
  const [existingRollbackPoint] = await db
    .select({ id: rollbackPoints.id })
    .from(rollbackPoints)
    .where(
      and(
        eq(rollbackPoints.projectId, projectId),
        eq(rollbackPoints.releasePlanId, releasePlanId),
        isNotNull(rollbackPoints.providerDeployId)
      )
    )
    .limit(1);

  if (existingRollbackPoint) {
    return;
  }

  const sourceDeployment =
    (await loadRollbackSourceDeployment(db, projectId, releasePlanId, rollbackVerifiedSourceDeploymentStatuses)) ??
    (await loadRollbackSourceDeployment(db, projectId, releasePlanId, rollbackFallbackSourceDeploymentStatuses));

  if (!sourceDeployment?.providerDeployId) {
    return;
  }

  const preparedAt = new Date();

  await db
    .insert(rollbackPoints)
    .values({
      projectId,
      releasePlanId,
      deploymentId: sourceDeployment.id,
      artifactKey: `rollback/${releasePlanId}/${sourceDeployment.id}.json`,
      providerDeployId: sourceDeployment.providerDeployId,
      liveUrl: sourceDeployment.liveUrl,
      evidenceJson: {
        source: "release_preflight_rollback_point_preparation",
        preparedAt: preparedAt.toISOString(),
        sourceDeploymentId: sourceDeployment.id,
        sourceReleasePlanId: sourceDeployment.releasePlanId,
        sourceDeploymentKey: sourceDeployment.deploymentKey,
        sourceDeploymentStatus: sourceDeployment.status,
        sourceVerificationStatus: sourceDeployment.verificationStatus
      }
    })
    .onConflictDoNothing({
      target: [rollbackPoints.releasePlanId, rollbackPoints.deploymentId, rollbackPoints.providerDeployId]
    });
}

async function loadRollbackSourceDeployment(
  db: Db,
  projectId: string,
  releasePlanId: string,
  statuses: readonly DeploymentStatus[]
): Promise<
  | {
      id: string;
      releasePlanId: string | null;
      deploymentKey: string;
      providerDeployId: string | null;
      liveUrl: string | null;
      status: DeploymentStatus;
      verificationStatus: ReleaseVerificationStatus;
    }
  | undefined
> {
  const [sourceDeployment] = await db
    .select({
      id: deployments.id,
      releasePlanId: deployments.releasePlanId,
      deploymentKey: deployments.deploymentKey,
      providerDeployId: deployments.providerDeployId,
      liveUrl: deployments.liveUrl,
      status: deployments.status,
      verificationStatus: deployments.verificationStatus
    })
    .from(deployments)
    .where(
      and(
        eq(deployments.projectId, projectId),
        ne(deployments.releasePlanId, releasePlanId),
        isNotNull(deployments.providerDeployId),
        inArray(deployments.status, statuses)
      )
    )
    .orderBy(desc(deployments.updatedAt))
    .limit(1);

  return sourceDeployment;
}

async function loadRollbackPointForRelease(
  db: Db,
  projectId: string,
  releasePlanId: string,
  rollbackPointId: string
): Promise<typeof rollbackPoints.$inferSelect> {
  const [rollbackPoint] = await db
    .select()
    .from(rollbackPoints)
    .where(
      and(
        eq(rollbackPoints.id, rollbackPointId),
        eq(rollbackPoints.projectId, projectId),
        eq(rollbackPoints.releasePlanId, releasePlanId)
      )
    )
    .limit(1);

  if (!rollbackPoint) {
    throw new BadRequestException("Rollback point is not available for this release plan.");
  }

  if (!rollbackPoint.providerDeployId) {
    throw new BadRequestException("Rollback point is missing provider deploy evidence.");
  }

  return rollbackPoint;
}

async function loadDeploymentForRollbackExecution(
  db: Db,
  projectId: string,
  releasePlanId: string
): Promise<typeof deployments.$inferSelect> {
  const [deployment] = await db
    .select()
    .from(deployments)
    .where(
      and(
        eq(deployments.projectId, projectId),
        eq(deployments.releasePlanId, releasePlanId),
        isNotNull(deployments.providerDeployId),
        inArray(deployments.status, rollbackExecutionReadyStatuses)
      )
    )
    .orderBy(desc(deployments.updatedAt))
    .limit(1);

  if (!deployment) {
    throw new BadRequestException("No rollback-eligible deployment is available for this release plan.");
  }

  return deployment;
}

async function loadReleasePlanForRollbackExecution(
  db: Db,
  projectId: string,
  releasePlanId: string
): Promise<typeof releasePlans.$inferSelect> {
  const [releasePlan] = await db
    .select()
    .from(releasePlans)
    .where(
      and(eq(releasePlans.id, releasePlanId), eq(releasePlans.projectId, projectId), eq(releasePlans.status, "failed"))
    )
    .limit(1);

  if (!releasePlan) {
    throw new BadRequestException("Release plan is not eligible for rollback execution.");
  }

  return releasePlan;
}

function hasUsableTrackingOrigins(allowedOrigins: string[]): boolean {
  return allowedOrigins.some((origin) => {
    try {
      const parsed = new URL(origin);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  });
}

async function loadReleaseChecks(db: Db, releasePlanId: string): Promise<ReleaseCheck[]> {
  const rows = await db.select().from(releaseChecks).where(eq(releaseChecks.releasePlanId, releasePlanId));

  return rows.map((row) =>
    ReleaseCheckSchema.parse({
      checkKey: row.checkKey,
      scope: row.scope,
      severity: row.severity,
      result: row.result,
      message: row.message,
      evidence: row.evidenceJson ?? undefined
    })
  );
}

async function loadDeploymentForVerification(
  db: Db,
  projectId: string,
  releasePlanId: string,
  deploymentId?: string
): Promise<typeof deployments.$inferSelect> {
  const verificationReadyStatuses = [
    "provider_succeeded",
    "verifying",
    "live_healthy",
    "live_with_warnings",
    "rollback_recommended"
  ] as const satisfies DeploymentStatus[];

  const filters = [
    eq(deployments.projectId, projectId),
    eq(deployments.releasePlanId, releasePlanId),
    inArray(deployments.status, verificationReadyStatuses)
  ];

  if (deploymentId) {
    if (!isPersistedId(deploymentId)) {
      throw new BadRequestException("Deployment id must be a UUID.");
    }

    filters.push(eq(deployments.id, deploymentId));
  }

  const [deployment] = await db
    .select()
    .from(deployments)
    .where(and(...filters))
    .orderBy(desc(deployments.updatedAt))
    .limit(1);

  if (!deployment) {
    throw new BadRequestException("No provider-succeeded deployment is available for verification.");
  }

  return deployment;
}

function normalizeRelativeReleaseTargetRoute(targetUrl: string): string {
  const trimmed = targetUrl.trim();

  if (
    trimmed.length === 0 ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\") ||
    /^[a-z][a-z\d+\-.]*:/iu.test(trimmed)
  ) {
    throw new BadRequestException("Release verification target routes must be relative paths.");
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

async function findActiveReleaseVerification(db: Db, deploymentId: string) {
  const [row] = await db
    .select()
    .from(releaseVerifications)
    .where(and(eq(releaseVerifications.deploymentId, deploymentId), eq(releaseVerifications.status, "running")))
    .limit(1);

  return row;
}

async function markReleaseVerificationQueueFailure(db: Db, verificationId: string, message: string): Promise<void> {
  const checkedAt = new Date();

  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(releaseVerifications)
      .set({
        status: "execution_failed",
        summary: "Post-deploy verification could not be queued.",
        checkedAt,
        evidenceJson: {
          source: "release_verify_endpoint",
          queueFailure: { message }
        },
        updatedAt: new Date()
      })
      .where(and(eq(releaseVerifications.id, verificationId), eq(releaseVerifications.status, "running")))
      .returning({ id: releaseVerifications.id });

    if (!updated) {
      return;
    }

    await tx.insert(releaseVerificationChecks).values({
      verificationId,
      checkKey: "verification_queue_check",
      scope: "project",
      severity: "warning",
      result: "failed",
      message: "Post-deploy verification could not be queued.",
      evidenceJson: {
        queueFailure: { message }
      },
      checkedAt
    });
  });
}

function normalizeQueueFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "queue_enqueue_failed";
  return message.slice(0, 500);
}

async function hasApprovedRelease(db: Db, releasePlanId: string): Promise<boolean> {
  const [approval] = await db
    .select({ id: approvals.id })
    .from(approvals)
    .where(and(eq(approvals.releasePlanId, releasePlanId), eq(approvals.status, "approved")))
    .limit(1);

  return Boolean(approval);
}

function mapReleasePlan(plan: typeof releasePlans.$inferSelect): ReleasePlan {
  return ReleasePlanSchema.parse({
    releasePlanId: plan.id,
    projectId: plan.projectId,
    status: plan.status,
    riskLevel: plan.riskLevel,
    blockerCount: plan.blockerCount,
    warningCount: plan.warningCount
  });
}

function rollbackJobId(releasePlanId: string, rollbackPointId: string): string {
  return `rollback:${releasePlanId}:${rollbackPointId}`;
}

function isPersistedId(value: string): boolean {
  return uuidPattern.test(value);
}
