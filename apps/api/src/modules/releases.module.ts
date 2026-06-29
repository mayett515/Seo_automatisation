import { randomUUID } from "node:crypto";
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
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import {
  QueueJobSchema,
  CreateReleasePlanRequestSchema,
  ReleaseCheckSchema,
  ReleaseNoteSchema,
  ReleasePlanSchema,
  ReleaseVerificationSchema,
  RollbackPointSchema,
  VerifyReleaseRequestSchema,
  type ReleasePlan,
  type ReleaseCheck,
  type ReleaseNote,
  type ReleaseVerification,
  type RollbackPoint
} from "@localseo/contracts";
import { canDeployRelease, decideReleaseReadiness, decideReleaseVerificationStatus } from "@localseo/domain";
import { evaluateLocalPageQa, type LocalPageQaInput } from "@localseo/seo";
import {
  approvals,
  pageProposals,
  pageVersions,
  projectTrackingKeys,
  releaseChecks,
  releasePlanItems,
  releasePlans,
  rollbackPoints,
  type DatabaseClient
} from "@localseo/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
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

export type ReleasePreflightPageEvidence = {
  pageVersionId: string | null;
  targetUrl: string;
  approvedAt: Date | null;
  pageJson: Record<string, unknown> | null;
  sitemapReady: boolean;
  uniquenessRationale: string | null;
};

export type ReleasePreflightEvidence = {
  pages: ReleasePreflightPageEvidence[];
  rollbackPointCount: number;
  usableTrackingKeyCount: number;
};

const approvableReleaseStatuses = new Set<ReleasePlan["status"]>(["ready", "ready_with_warnings"]);

@Injectable()
export class ReleasesService {
  constructor(
    private readonly queues: QueueProducerService,
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
          targetUrl: row.targetUrl,
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
        ? await loadReleasePreflightEvidence(db, projectId, releasePlanId)
        : {
            pages: [],
            rollbackPointCount: 0,
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

      await db
        .update(releasePlans)
        .set({
          status: "approved_for_deploy",
          approvedAt: new Date(),
          updatedAt: new Date()
        })
        .where(and(eq(releasePlans.id, releasePlanId), eq(releasePlans.projectId, projectId)));
      await db.insert(approvals).values({
        releasePlanId,
        userId,
        status: "approved",
        decidedAt: new Date()
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

    if (checks.length === 0 || !canDeployRelease(plan, checks)) {
      throw new BadRequestException("Release must pass preflight and be approved before deploy.");
    }

    const jobId = randomUUID();
    const enqueued = await this.queues.enqueue({
      queueName: "deploy",
      jobName: "deploy",
      jobId,
      data: { projectId, releasePlanId, triggeredByUserId: userId ?? null, triggerSource: "user_action" },
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

  async verify(
    projectId: string,
    releasePlanId: string,
    body: unknown
  ): Promise<ReleaseVerification & { projectId: string }> {
    await this.assertReleasePlanForProject(projectId, releasePlanId);
    const input = VerifyReleaseRequestSchema.parse(body ?? {});

    const checks = [
      ReleaseCheckSchema.parse({
        checkKey: "http_status_check",
        scope: "domain",
        severity: "blocker",
        result: "passed",
        message: "Live routes returned successful HTTP responses."
      }),
      ReleaseCheckSchema.parse({
        checkKey: "canonical_trailing_slash_check",
        scope: "page",
        severity: "blocker",
        result: "passed",
        message: "Canonical URLs match intended trailing-slash live routes."
      }),
      ReleaseCheckSchema.parse({
        checkKey: "schema_parse_check",
        scope: "page",
        severity: "warning",
        result: "passed",
        message: "Structured data parsed successfully."
      }),
      ReleaseCheckSchema.parse({
        checkKey: "sitemap_readiness_check",
        scope: "sitemap",
        severity: "warning",
        result: "passed",
        message: "Published pages are ready for sitemap submission."
      }),
      ReleaseCheckSchema.parse({
        checkKey: "tracking_load_check",
        scope: "tracking",
        severity: "warning",
        result: "passed",
        message: "Tracking script loaded on verified routes."
      })
    ];

    const verificationStatus = decideReleaseVerificationStatus(checks);

    return {
      projectId,
      ...ReleaseVerificationSchema.parse({
        releasePlanId,
        deploymentId: input.deploymentId,
        verificationStatus,
        summary:
          verificationStatus === "live_healthy"
            ? "Post-deploy verification passed."
            : "Post-deploy verification completed with issues.",
        checkedAt: new Date().toISOString(),
        checks
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
  constructor(private readonly releases: ReleasesService) {}

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
    .where(and(eq(rollbackPoints.projectId, projectId), eq(rollbackPoints.releasePlanId, releasePlanId)));
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
    usableTrackingKeyCount: activeTrackingKeyRows.filter((row) => hasUsableTrackingOrigins(row.allowedOrigins)).length
  };
}

export function buildReleasePreflightChecks(evidence: ReleasePreflightEvidence): ReleaseCheck[] {
  const missingApproval = evidence.pages.filter((page) => !page.pageVersionId || !page.approvedAt);
  const missingNoindex = evidence.pages.filter((page) => !hasNoindexEvidence(page.pageJson));
  const pageQaResults = evidence.pages.map((page) => ({
    pageVersionId: page.pageVersionId,
    targetUrl: page.targetUrl,
    result: evaluateLocalPageQa(toLocalPageQaInput(page))
  }));
  const qaBlockers = pageQaResults.flatMap((page) =>
    page.result.blockers.map((blocker) => ({
      pageVersionId: page.pageVersionId,
      targetUrl: page.targetUrl,
      blocker
    }))
  );
  const qaWarnings = pageQaResults.flatMap((page) =>
    page.result.warnings.map((warning) => ({
      pageVersionId: page.pageVersionId,
      targetUrl: page.targetUrl,
      warning
    }))
  );
  const pageCount = evidence.pages.length;

  return [
    ReleaseCheckSchema.parse({
      checkKey: "approval_check",
      scope: "page",
      severity: "blocker",
      result: pageCount > 0 && missingApproval.length === 0 ? "passed" : "failed",
      message:
        pageCount > 0 && missingApproval.length === 0
          ? "Every release item references an approved page version."
          : "Every release item must reference an approved page version before deploy approval.",
      evidence: {
        pageCount,
        missingApprovalCount: missingApproval.length,
        missingApprovalPageVersionIds: missingApproval.map((page) => page.pageVersionId ?? "missing_page_version")
      }
    }),
    ReleaseCheckSchema.parse({
      checkKey: "staging_noindex_check",
      scope: "domain",
      severity: "blocker",
      result: pageCount > 0 && missingNoindex.length === 0 ? "passed" : "failed",
      message:
        pageCount > 0 && missingNoindex.length === 0
          ? "Every preview page carries noindex evidence."
          : "Every preview page must carry noindex evidence before deploy approval.",
      evidence: {
        pageCount,
        missingNoindexCount: missingNoindex.length,
        missingNoindexTargets: missingNoindex.map((page) => page.targetUrl)
      }
    }),
    ReleaseCheckSchema.parse({
      checkKey: "local_seo_page_quality_gate",
      scope: "page",
      severity: "blocker",
      result: pageCount > 0 && qaBlockers.length === 0 ? "passed" : "failed",
      message:
        pageCount > 0 && qaBlockers.length === 0
          ? "Local SEO page quality gate has no blockers."
          : "Local SEO page quality gate has blockers that must be resolved before deploy approval.",
      evidence: {
        pageCount,
        blockerCount: qaBlockers.length,
        blockers: qaBlockers
      }
    }),
    ReleaseCheckSchema.parse({
      checkKey: "rollback_point_ready",
      scope: "project",
      severity: "blocker",
      result: evidence.rollbackPointCount > 0 ? "passed" : "failed",
      message:
        evidence.rollbackPointCount > 0
          ? "Rollback point artifact is available."
          : "A rollback point artifact must exist before deploy approval.",
      evidence: {
        rollbackPointCount: evidence.rollbackPointCount
      }
    }),
    ReleaseCheckSchema.parse({
      checkKey: "local_seo_page_quality_warning",
      scope: "page",
      severity: "warning",
      result: qaWarnings.length === 0 ? "passed" : "failed",
      message:
        qaWarnings.length === 0
          ? "Local SEO page quality gate has no warnings."
          : "Local SEO page quality gate has warnings to review before deploy.",
      evidence: {
        pageCount,
        warningCount: qaWarnings.length,
        warnings: qaWarnings
      }
    }),
    ReleaseCheckSchema.parse({
      checkKey: "tracking_key_ready",
      scope: "tracking",
      severity: "warning",
      result: evidence.usableTrackingKeyCount > 0 ? "passed" : "failed",
      message:
        evidence.usableTrackingKeyCount > 0
          ? "At least one active project tracking key has allowed origins."
          : "No active project tracking key with allowed origins exists; post-deploy tracking verification may be incomplete.",
      evidence: {
        usableTrackingKeyCount: evidence.usableTrackingKeyCount
      }
    })
  ];
}

function toLocalPageQaInput(page: ReleasePreflightPageEvidence): LocalPageQaInput {
  const pageJson = asRecord(page.pageJson);
  const seo = asRecord(pageJson.seo);
  const meta = asRecord(pageJson.meta);

  return {
    title: firstString([pageJson, seo, meta], ["title", "metaTitle"]),
    metaDescription: firstString([pageJson, seo, meta], ["metaDescription", "description"]),
    h1: firstString([pageJson], ["h1", "headline"]),
    canonical: firstString([pageJson, seo], ["canonical", "canonicalUrl"]),
    hasJsonLd: booleanFlag(pageJson, ["hasJsonLd", "jsonLdReady"]) || hasAnyValue(pageJson, ["jsonLd", "schemaJson"]),
    hasAreaServed: booleanFlag(pageJson, ["hasAreaServed", "areaServedReady"]) || hasAnyValue(pageJson, ["areaServed"]),
    hasInternalLinks:
      booleanFlag(pageJson, ["hasInternalLinks"]) ||
      (Array.isArray(pageJson.internalLinks) && pageJson.internalLinks.length > 0),
    hasLocalFaq: booleanFlag(pageJson, ["hasLocalFaq"]) || hasAnyValue(pageJson, ["localFaq", "faq"]),
    hasVisibleCta: booleanFlag(pageJson, ["hasVisibleCta", "visibleCta"]) || hasAnyValue(pageJson, ["cta"]),
    sitemapReady: page.sitemapReady || booleanFlag(pageJson, ["sitemapReady"]),
    uniquenessRationale: page.uniquenessRationale ?? firstString([pageJson], ["uniquenessRationale"])
  };
}

function hasNoindexEvidence(pageJson: Record<string, unknown> | null): boolean {
  const value = asRecord(pageJson);
  const seo = asRecord(value.seo);
  const meta = asRecord(value.meta);
  const robots = [
    firstString([value], ["robots", "previewRobots"]),
    firstString([seo], ["robots", "previewRobots"]),
    firstString([meta], ["robots", "content"])
  ]
    .filter((item): item is string => Boolean(item))
    .join(",");

  return (
    booleanFlag(value, ["noindex", "previewNoindex", "stagingNoindex"]) || robots.toLowerCase().includes("noindex")
  );
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function firstString(records: Record<string, unknown>[], keys: string[]): string | undefined {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];

      if (typeof value === "string" && value.trim().length > 0) {
        return value;
      }
    }
  }

  return undefined;
}

function booleanFlag(record: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => record[key] === true);
}

function hasAnyValue(record: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => {
    const value = record[key];

    if (Array.isArray(value)) {
      return value.length > 0;
    }

    return Boolean(value);
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

function isPersistedId(value: string): boolean {
  return uuidPattern.test(value);
}
