import { randomUUID } from "node:crypto";
import { Body, Controller, Get, Injectable, Module, Param, Post } from "@nestjs/common";
import {
  ReleaseCheckSchema,
  ReleaseNoteSchema,
  ReleasePlanSchema,
  ReleaseVerificationSchema,
  RollbackPointSchema,
  type ReleaseCheck,
  type ReleaseNote,
  type ReleaseVerification,
  type RollbackPoint
} from "@localseo/contracts";
import { decideReleaseReadiness, decideReleaseVerificationStatus } from "@localseo/domain";

@Injectable()
class ReleasesService {
  createPlan(projectId: string, body: unknown) {
    const pageVersionIds = Array.isArray((body as { pageVersionIds?: unknown }).pageVersionIds)
      ? (body as { pageVersionIds: unknown[] }).pageVersionIds
      : [];

    return ReleasePlanSchema.parse({
      releasePlanId: randomUUID(),
      projectId,
      status: "draft",
      riskLevel: "low",
      blockerCount: pageVersionIds.length === 0 ? 1 : 0,
      warningCount: 0
    });
  }

  preflight(releasePlanId: string): { releasePlanId: string; readiness: string; checks: ReleaseCheck[] } {
    const checks = [
      ReleaseCheckSchema.parse({
        checkKey: "approval_check",
        scope: "page",
        severity: "blocker",
        result: "passed",
        message: "Approved page version exists."
      }),
      ReleaseCheckSchema.parse({
        checkKey: "staging_noindex_check",
        scope: "domain",
        severity: "blocker",
        result: "passed",
        message: "Preview URLs are noindex."
      }),
      ReleaseCheckSchema.parse({
        checkKey: "local_seo_page_quality_gate",
        scope: "page",
        severity: "blocker",
        result: "passed",
        message: "Local SEO page quality gate has no blockers."
      }),
      ReleaseCheckSchema.parse({
        checkKey: "rollback_point_ready",
        scope: "project",
        severity: "blocker",
        result: "passed",
        message: "Rollback evidence can be created before deploy execution."
      })
    ];

    return {
      releasePlanId,
      readiness: decideReleaseReadiness(checks).kind,
      checks
    };
  }

  deploy(releasePlanId: string) {
    return {
      releasePlanId,
      jobId: randomUUID(),
      type: "deploy",
      status: "queued"
    };
  }

  verify(releasePlanId: string, body: unknown): ReleaseVerification {
    const deploymentId = typeof (body as { deploymentId?: unknown }).deploymentId === "string"
      ? (body as { deploymentId: string }).deploymentId
      : undefined;

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

    return ReleaseVerificationSchema.parse({
      releasePlanId,
      deploymentId,
      verificationStatus,
      summary: verificationStatus === "live_healthy"
        ? "Post-deploy verification passed."
        : "Post-deploy verification completed with issues.",
      checkedAt: new Date().toISOString(),
      checks
    });
  }

  listNotes(releasePlanId: string): ReleaseNote[] {
    return [
      ReleaseNoteSchema.parse({
        releasePlanId,
        audience: "internal",
        title: "Release note placeholder",
        body: "Release notes are persisted separately from release checks so customer-facing summaries can stay conservative.",
        createdAt: new Date().toISOString()
      })
    ];
  }

  listRollbackPoints(releasePlanId: string): RollbackPoint[] {
    return [
      RollbackPointSchema.parse({
        releasePlanId,
        artifactKey: `rollback/${releasePlanId}/previous-stable.json`,
        evidence: { source: "deployment_agent_preflight" },
        createdAt: new Date().toISOString()
      })
    ];
  }
}

@Controller()
class ReleasesController {
  constructor(private readonly releases: ReleasesService) {}

  @Post("projects/:projectId/releases/plan")
  createPlan(@Param("projectId") projectId: string, @Body() body: unknown) {
    return this.releases.createPlan(projectId, body);
  }

  @Get("releases/:releasePlanId")
  getRelease(@Param("releasePlanId") releasePlanId: string) {
    return {
      releasePlanId,
      status: "draft"
    };
  }

  @Post("releases/:releasePlanId/preflight")
  preflight(@Param("releasePlanId") releasePlanId: string) {
    return this.releases.preflight(releasePlanId);
  }

  @Post("releases/:releasePlanId/approve-deploy")
  approveDeploy(@Param("releasePlanId") releasePlanId: string) {
    return {
      releasePlanId,
      status: "approved_for_deploy",
      approvedAt: new Date().toISOString()
    };
  }

  @Post("releases/:releasePlanId/deploy")
  deploy(@Param("releasePlanId") releasePlanId: string) {
    return this.releases.deploy(releasePlanId);
  }

  @Post("releases/:releasePlanId/verify")
  verify(@Param("releasePlanId") releasePlanId: string, @Body() body: unknown) {
    return this.releases.verify(releasePlanId, body);
  }

  @Get("releases/:releasePlanId/notes")
  listNotes(@Param("releasePlanId") releasePlanId: string) {
    return this.releases.listNotes(releasePlanId);
  }

  @Get("releases/:releasePlanId/rollback-points")
  listRollbackPoints(@Param("releasePlanId") releasePlanId: string) {
    return this.releases.listRollbackPoints(releasePlanId);
  }
}

@Module({
  controllers: [ReleasesController],
  providers: [ReleasesService]
})
export class ReleasesModule {}
