import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Module,
  Optional,
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
  ReleaseNoteSchema,
  ReleasePlanSchema,
  ReleaseVerificationCheckSchema,
  ReleaseVerificationSchema,
  RollbackJobDataSchema,
  RollbackPointSchema,
  VerifyReleaseRequestSchema,
  type DeploymentStatus,
  type ReleasePlan,
  type ReleaseCheck,
  type ReleaseNote,
  type ReleasePlanStatus,
  type ReleaseVerification,
  type ReleaseVerificationStatus,
  type RollbackPoint
} from "@localseo/contracts";
import {
  AesGcmTokenCipher,
  GoogleSearchConsoleAdapter,
  HttpReleaseVerificationAdapter,
  PlaywrightBrowserRuntimeVerifier,
  isProviderRequestError,
  type VerificationPort
} from "@localseo/adapters";
import { parseAppEnv } from "@localseo/config";
import {
  buildReleaseDeploymentKey,
  canDeployRelease,
  decideReleaseReadiness,
  decideReleaseVerificationStatus
} from "@localseo/domain";
import { buildReleasePreflightChecks, type ReleasePreflightEvidence } from "@localseo/seo";
import {
  approvals,
  deployments,
  gscConnections,
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

const env = parseAppEnv(process.env);
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
const maxGscInspectionUrlsPerVerification = 10;
export const RELEASE_VERIFICATION_PORT = Symbol("RELEASE_VERIFICATION_PORT");

@Injectable()
export class ReleasesService {
  constructor(
    @Inject(QueueProducerService)
    private readonly queues: QueueProducerService,
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
    @Optional()
    @Inject(RELEASE_VERIFICATION_PORT)
    private readonly verification: VerificationPort = createReleaseVerificationAdapter()
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
          action: "create",
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
    body: unknown
  ): Promise<ReleaseVerification & { projectId: string }> {
    await this.assertReleasePlanForProject(projectId, releasePlanId);
    const input = VerifyReleaseRequestSchema.parse(body ?? {});
    const db = this.database.db;

    if (!db || !isPersistedId(releasePlanId)) {
      return {
        projectId,
        ...ReleaseVerificationSchema.parse({
          releasePlanId,
          deploymentId: input.deploymentId,
          verificationStatus: "execution_failed",
          summary: "Release persistence is required before post-deploy verification can run.",
          checkedAt: new Date().toISOString(),
          checks: [
            ReleaseCheckSchema.parse({
              checkKey: "verification_persistence_check",
              scope: "project",
              severity: "warning",
              result: "skipped",
              message: "Release persistence is required before post-deploy verification can run."
            })
          ]
        })
      };
    }

    const deployment = await loadDeploymentForVerification(db, projectId, releasePlanId, input.deploymentId);
    const targetUrls = await loadVerificationTargetUrls(db, releasePlanId, deployment);
    const trackingExpected = await hasActiveTrackingKey(db, projectId);

    const verification = await this.verification
      .verifyRelease({
        releasePlanId,
        deploymentId: deployment.id,
        liveUrls: targetUrls,
        trackingExpected
      })
      .catch((error: unknown) =>
        verificationExecutionFailureResult({
          releasePlanId,
          deploymentId: deployment.id,
          error
        })
      );
    const gscChecks = await buildGscPostDeployChecks(db, projectId, targetUrls);
    const checks = [...verification.checks, ...gscChecks];
    const verificationStatus =
      verification.verificationStatus === "execution_failed"
        ? verification.verificationStatus
        : decideReleaseVerificationStatus(checks);

    const persisted = await persistReleaseVerification(db, projectId, deployment.id, {
      ...verification,
      releasePlanId,
      deploymentId: deployment.id,
      verificationStatus,
      summary:
        verificationStatus === "execution_failed"
          ? verification.summary
          : verificationSummaryFromStatus(verificationStatus),
      checks
    });

    return {
      projectId,
      ...ReleaseVerificationSchema.parse({
        releasePlanId,
        deploymentId: persisted.deploymentId ?? undefined,
        verificationStatus: persisted.verificationStatus,
        summary: persisted.summary,
        checkedAt: persisted.checkedAt,
        checks: persisted.checks
      })
    };
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
  verify(@Param("projectId") projectId: string, @Param("releasePlanId") releasePlanId: string, @Body() body: unknown) {
    return this.releases.verify(projectId, releasePlanId, body);
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
  providers: [
    ReleasesService,
    {
      provide: RELEASE_VERIFICATION_PORT,
      useFactory: () => createReleaseVerificationAdapter()
    }
  ]
})
export class ReleasesModule {}

function createReleaseVerificationAdapter(): VerificationPort {
  return new HttpReleaseVerificationAdapter({
    browserCheckTimeoutMs: env.RELEASE_BROWSER_VERIFICATION_TIMEOUT_MS,
    browserRuntime: env.RELEASE_BROWSER_VERIFICATION_ENABLED
      ? new PlaywrightBrowserRuntimeVerifier({
          executablePath: env.RELEASE_BROWSER_VERIFICATION_EXECUTABLE_PATH
        })
      : undefined
  });
}

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

async function loadVerificationTargetUrls(
  db: Db,
  releasePlanId: string,
  deployment: typeof deployments.$inferSelect
): Promise<string[]> {
  const baseLiveUrl = liveUrlsFromDeployment(deployment)[0];
  const itemRows = await db
    .select({
      targetUrl: releasePlanItems.targetUrl
    })
    .from(releasePlanItems)
    .where(eq(releasePlanItems.releasePlanId, releasePlanId));

  if (!baseLiveUrl || itemRows.length === 0) {
    return liveUrlsFromDeployment(deployment);
  }

  return [...new Set(itemRows.map((row) => resolveVerificationTargetUrl(row.targetUrl, baseLiveUrl)))];
}

function resolveVerificationTargetUrl(targetUrl: string, baseLiveUrl: string): string {
  const route = normalizeRelativeReleaseTargetRoute(targetUrl);
  const base = new URL(baseLiveUrl);
  const resolved = new URL(route, base);

  if (resolved.origin !== base.origin) {
    throw new BadRequestException("Release verification target routes must stay on the deployment host.");
  }

  return resolved.toString();
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

async function buildGscPostDeployChecks(db: Db, projectId: string, targetUrls: string[]): Promise<ReleaseCheck[]> {
  const connection = await loadLatestGscConnection(db, projectId);
  const propertyUrl = connection?.propertyUrl ?? undefined;
  const firstTargetUrl = targetUrls[0];

  if (!connection || connection.status !== "connected" || !connection.encryptedRefreshToken || !propertyUrl) {
    return [
      gscCheck({
        checkKey: "gsc_connection_check",
        result: "skipped",
        message: "Google Search Console handoff skipped because no connected property is available.",
        evidence: {
          observed: {
            connectionStatus: connection?.status ?? "missing"
          }
        }
      })
    ];
  }

  const searchConsole = createSearchConsoleForHandoff();
  const tokenCipher = env.GSC_TOKEN_ENCRYPTION_KEY ? new AesGcmTokenCipher(env.GSC_TOKEN_ENCRYPTION_KEY) : undefined;

  if (!searchConsole || !tokenCipher) {
    return [
      gscCheck({
        checkKey: "gsc_connection_check",
        result: "skipped",
        message: "Google Search Console handoff skipped because OAuth runtime configuration is incomplete.",
        evidence: {
          observed: { connectionStatus: "connected", runtimeConfigured: false }
        }
      })
    ];
  }

  let refreshToken: string;
  let accessToken: string;

  try {
    refreshToken = tokenCipher.decrypt(connection.encryptedRefreshToken);
  } catch {
    const reason = "refresh_token_decrypt_failed";
    await markGscConnectionError(db, connection.id, reason);

    return [
      gscCheck({
        checkKey: "gsc_connection_check",
        result: "failed",
        message: "Google Search Console handoff could not decrypt the stored refresh token. Reconnect Search Console.",
        evidence: {
          observed: {
            reason,
            reconnectRequired: true
          }
        }
      })
    ];
  }

  try {
    const tokens = await searchConsole.refreshAccessToken({ refreshToken });
    accessToken = tokens.accessToken;
  } catch (error) {
    const reason = classifyGscHandoffAuthFailure(error);

    if (reason.reconnectRequired) {
      await markGscConnectionError(db, connection.id, reason.reason);
    }

    return [
      gscCheck({
        checkKey: "gsc_connection_check",
        result: "failed",
        message: "Google Search Console handoff could not refresh access. Reconnect Search Console.",
        evidence: {
          observed: {
            reason: reason.reason,
            reconnectRequired: reason.reconnectRequired,
            provider: providerDiagnostic(error)
          }
        }
      })
    ];
  }

  const checks: ReleaseCheck[] = [
    gscCheck({
      checkKey: "gsc_connection_check",
      result: "passed",
      message: "Google Search Console connection is ready for post-deploy handoff.",
      evidence: {
        observed: {
          propertyUrl
        }
      }
    })
  ];

  if (firstTargetUrl) {
    const sitemapUrl = new URL("/sitemap.xml", firstTargetUrl).toString();

    try {
      await searchConsole.submitSitemap({
        accessToken,
        projectId,
        propertyUrl,
        sitemapUrl
      });
      checks.push(
        gscCheck({
          checkKey: "gsc_sitemap_submission_check",
          result: "passed",
          message: "Sitemap was submitted to Google Search Console.",
          evidence: {
            targetUrl: sitemapUrl,
            observed: { propertyUrl, sitemapUrl }
          }
        })
      );
    } catch (error) {
      checks.push(
        gscCheck({
          checkKey: "gsc_sitemap_submission_check",
          result: "failed",
          message: "Sitemap submission to Google Search Console failed.",
          evidence: {
            targetUrl: sitemapUrl,
            observed: {
              propertyUrl,
              provider: providerDiagnostic(error)
            }
          }
        })
      );
    }
  }

  for (const inspectionUrl of targetUrls.slice(0, maxGscInspectionUrlsPerVerification)) {
    try {
      const inspection = await searchConsole.inspectUrl({
        accessToken,
        siteUrl: propertyUrl,
        inspectionUrl
      });
      checks.push(
        gscCheck({
          checkKey: "gsc_url_inspection_check",
          result: "passed",
          message: "Google Search Console URL Inspection returned indexing diagnostics.",
          evidence: {
            targetUrl: inspectionUrl,
            observed: {
              siteUrl: inspection.siteUrl,
              inspectionUrl: inspection.inspectionUrl,
              verdict: inspection.verdict ?? null,
              coverageState: inspection.coverageState ?? null,
              checkedAt: inspection.checkedAt
            }
          }
        })
      );
    } catch (error) {
      checks.push(
        gscCheck({
          checkKey: "gsc_url_inspection_check",
          result: "failed",
          message: "Google Search Console URL Inspection failed.",
          evidence: {
            targetUrl: inspectionUrl,
            observed: {
              propertyUrl,
              provider: providerDiagnostic(error)
            }
          }
        })
      );
    }
  }

  if (targetUrls.length > maxGscInspectionUrlsPerVerification) {
    checks.push(
      gscCheck({
        checkKey: "gsc_url_inspection_limit_check",
        result: "skipped",
        message: "Additional URLs were not inspected because the post-deploy GSC handoff batch is bounded.",
        evidence: {
          observed: {
            inspectedUrlCount: maxGscInspectionUrlsPerVerification,
            skippedUrlCount: targetUrls.length - maxGscInspectionUrlsPerVerification
          }
        }
      })
    );
  }

  return checks;
}

async function loadLatestGscConnection(db: Db, projectId: string) {
  const [connection] = await db
    .select()
    .from(gscConnections)
    .where(eq(gscConnections.projectId, projectId))
    .orderBy(desc(gscConnections.createdAt))
    .limit(1);

  return connection;
}

function createSearchConsoleForHandoff() {
  const redirectUri = env.GOOGLE_OAUTH_REDIRECT_URI ?? `${env.API_PUBLIC_URL}/gsc/callback`;
  const stateSecret = env.GSC_OAUTH_STATE_SECRET ?? env.BETTER_AUTH_SECRET;

  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET || !stateSecret) {
    return undefined;
  }

  return new GoogleSearchConsoleAdapter({
    clientId: env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri,
    stateSecret
  });
}

async function markGscConnectionError(db: Db, connectionId: string, reason: string): Promise<void> {
  await db
    .update(gscConnections)
    .set({
      status: "error",
      failureJson: { reason },
      updatedAt: new Date()
    })
    .where(eq(gscConnections.id, connectionId));
}

function classifyGscHandoffAuthFailure(error: unknown): { reason: string; reconnectRequired: boolean } {
  if (
    isProviderRequestError(error) &&
    (error.providerReasonCode === "invalid_grant" ||
      error.providerReasonCode === "invalid_client" ||
      error.statusCode === 400 ||
      error.statusCode === 401 ||
      error.statusCode === 403)
  ) {
    return { reason: "google_refresh_token_invalid", reconnectRequired: true };
  }

  return { reason: "google_oauth_refresh_failed", reconnectRequired: false };
}

function providerDiagnostic(error: unknown): Record<string, unknown> {
  if (!isProviderRequestError(error)) {
    return { reason: error instanceof Error ? error.name : "unknown_error" };
  }

  return {
    provider: error.provider,
    operation: error.operation,
    reasonCode: error.reasonCode,
    statusCode: error.statusCode ?? null,
    providerReasonCode: error.providerReasonCode ?? null
  };
}

function gscCheck(input: Omit<ReleaseCheck, "scope" | "severity">): ReleaseCheck {
  return ReleaseCheckSchema.parse({
    ...input,
    scope: "gsc",
    severity: "warning"
  });
}

function verificationSummaryFromStatus(status: ReleaseVerificationStatus): string {
  return status === "live_healthy"
    ? "Post-deploy verification passed."
    : "Post-deploy verification completed with issues.";
}

async function hasActiveTrackingKey(db: Db, projectId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: projectTrackingKeys.id })
    .from(projectTrackingKeys)
    .where(
      and(
        eq(projectTrackingKeys.projectId, projectId),
        eq(projectTrackingKeys.status, "active"),
        isNull(projectTrackingKeys.revokedAt)
      )
    )
    .limit(1);

  return Boolean(row);
}

async function persistReleaseVerification(
  db: Db,
  projectId: string,
  deploymentId: string,
  verification: ReleaseVerification
): Promise<ReleaseVerification> {
  const checkedAt = new Date(verification.checkedAt);
  const verificationStatus = verification.verificationStatus;

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(releaseVerifications)
      .values({
        releasePlanId: verification.releasePlanId,
        deploymentId,
        status: verificationStatus,
        summary: verification.summary,
        checkedAt,
        evidenceJson: {
          source: "release_verify_endpoint",
          checkCount: verification.checks.length
        }
      })
      .returning();

    if (!created) {
      throw new Error("Failed to persist release verification");
    }

    if (verification.checks.length > 0) {
      await tx.insert(releaseVerificationChecks).values(
        verification.checks.map((check) => {
          const evidence = recordFromUnknown(check.evidence);

          return {
            verificationId: created.id,
            checkKey: check.checkKey,
            scope: check.scope,
            targetUrl: stringFromUnknown(evidence.targetUrl),
            severity: check.severity,
            result: check.result,
            message: check.message,
            expectedJson: recordOrUndefined(evidence.expected),
            observedJson: recordOrUndefined(evidence.observed),
            evidenceJson: check.evidence,
            checkedAt
          };
        })
      );
    }

    const nextDeploymentStatus = deploymentStatusFromVerification(verificationStatus);

    await tx
      .update(deployments)
      .set({
        ...(nextDeploymentStatus ? { status: nextDeploymentStatus } : {}),
        verificationStatus,
        verifiedAt: checkedAt,
        updatedAt: new Date()
      })
      .where(and(eq(deployments.id, deploymentId), eq(deployments.projectId, projectId)));

    const nextReleasePlanStatus = releasePlanStatusFromVerification(verificationStatus);

    if (nextReleasePlanStatus) {
      await tx
        .update(releasePlans)
        .set({
          status: nextReleasePlanStatus,
          ...(nextReleasePlanStatus === "live" ? { deployedAt: checkedAt } : {}),
          updatedAt: new Date()
        })
        .where(and(eq(releasePlans.id, verification.releasePlanId), eq(releasePlans.projectId, projectId)));
    }

    return ReleaseVerificationSchema.parse({
      releasePlanId: created.releasePlanId,
      deploymentId: created.deploymentId ?? undefined,
      verificationStatus: created.status,
      summary: created.summary,
      checkedAt: created.checkedAt.toISOString(),
      checks: verification.checks.map((check) =>
        ReleaseVerificationCheckSchema.parse({
          ...check,
          checkedAt: verification.checkedAt
        })
      )
    });
  });
}

function deploymentStatusFromVerification(status: ReleaseVerificationStatus): DeploymentStatus | undefined {
  if (status === "live_healthy" || status === "live_with_warnings" || status === "rollback_recommended") {
    return status;
  }

  if (status === "running") {
    return "verifying";
  }

  if (status === "execution_failed" || status === "not_started") {
    return undefined;
  }

  return "failed";
}

function releasePlanStatusFromVerification(status: ReleaseVerificationStatus): ReleasePlanStatus | undefined {
  if (status === "live_healthy" || status === "live_with_warnings") {
    return "live";
  }

  if (status === "rollback_recommended" || status === "failed") {
    return "failed";
  }

  return undefined;
}

function verificationExecutionFailureResult(input: {
  releasePlanId: string;
  deploymentId: string;
  error: unknown;
}): ReleaseVerification {
  const message = normalizeFailureMessage(input.error);

  return ReleaseVerificationSchema.parse({
    releasePlanId: input.releasePlanId,
    deploymentId: input.deploymentId,
    verificationStatus: "execution_failed",
    summary: "Post-deploy verification did not complete.",
    checkedAt: new Date().toISOString(),
    checks: [
      ReleaseCheckSchema.parse({
        checkKey: "verification_execution_error",
        scope: "project",
        severity: "warning",
        result: "skipped",
        message: "Post-deploy verification did not complete.",
        evidence: {
          executionFailure: { message }
        }
      })
    ]
  });
}

function liveUrlsFromDeployment(deployment: typeof deployments.$inferSelect): string[] {
  const evidence = recordFromUnknown(deployment.evidenceJson);
  const provider = recordFromUnknown(evidence.provider);
  const providerLiveUrls = Array.isArray(provider.liveUrls)
    ? provider.liveUrls.filter((url): url is string => typeof url === "string" && url.length > 0)
    : [];
  const urls = deployment.liveUrl ? [deployment.liveUrl, ...providerLiveUrls] : providerLiveUrls;

  return [...new Set(urls)].sort(compareLiveUrlsForVerification);
}

function compareLiveUrlsForVerification(left: string, right: string): number {
  return liveUrlVerificationScore(left) - liveUrlVerificationScore(right);
}

function liveUrlVerificationScore(value: string): number {
  try {
    const url = new URL(value);
    const previewPenalty = url.hostname.includes("--") ? 10 : 0;
    const insecurePenalty = url.protocol === "https:" ? 0 : 1;
    return previewPenalty + insecurePenalty;
  } catch {
    return 100;
  }
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function recordOrUndefined(value: unknown): Record<string, unknown> | undefined {
  const record = recordFromUnknown(value);
  return Object.keys(record).length > 0 ? record : undefined;
}

function stringFromUnknown(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : "verification_failed";
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
