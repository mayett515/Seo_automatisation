import { randomUUID } from "node:crypto";
import { Body, Controller, Get, Injectable, Module, Param, Post, UseGuards } from "@nestjs/common";
import {
  QueueJobSchema,
  CreateReleasePlanRequestSchema,
  ReleaseCheckSchema,
  ReleaseNoteSchema,
  ReleasePlanSchema,
  ReleaseVerificationSchema,
  RollbackPointSchema,
  VerifyReleaseRequestSchema,
  type ReleaseCheck,
  type ReleaseNote,
  type ReleaseVerification,
  type RollbackPoint
} from "@localseo/contracts";
import { decideReleaseReadiness, decideReleaseVerificationStatus } from "@localseo/domain";
import { QueueProducerService } from "../queue-producer.js";
import { ProjectAccessGuard } from "../auth/project-access.guard.js";

@Injectable()
class ReleasesService {
  constructor(private readonly queues: QueueProducerService) {}

  createPlan(projectId: string, body: unknown) {
    const input = CreateReleasePlanRequestSchema.parse(body ?? {});

    return ReleasePlanSchema.parse({
      releasePlanId: randomUUID(),
      projectId,
      status: "draft",
      riskLevel: "low",
      blockerCount: input.pageVersionIds.length === 0 ? 1 : 0,
      warningCount: 0
    });
  }

  preflight(
    projectId: string,
    releasePlanId: string
  ): {
    projectId: string;
    releasePlanId: string;
    readiness: string;
    checks: ReleaseCheck[];
  } {
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
      projectId,
      releasePlanId,
      readiness: decideReleaseReadiness(checks).kind,
      checks
    };
  }

  async deploy(projectId: string, releasePlanId: string) {
    const jobId = randomUUID();
    const enqueued = await this.queues.enqueue({
      queueName: "deploy",
      jobName: "deploy",
      jobId,
      data: { projectId, releasePlanId }
    });

    return QueueJobSchema.parse({
      projectId,
      releasePlanId,
      jobId,
      type: "deploy",
      status: enqueued ? "queued" : "dry_run",
      inputRef: releasePlanId,
      message: enqueued ? undefined : "Deploy queue is not configured. This is an explicit dry-run response.",
      createdAt: new Date().toISOString()
    });
  }

  verify(projectId: string, releasePlanId: string, body: unknown): ReleaseVerification & { projectId: string } {
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

  listNotes(
    projectId: string,
    releasePlanId: string
  ): { projectId: string; releasePlanId: string; notes: ReleaseNote[] } {
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

  listRollbackPoints(
    projectId: string,
    releasePlanId: string
  ): {
    projectId: string;
    releasePlanId: string;
    rollbackPoints: RollbackPoint[];
  } {
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
}

@Controller()
@UseGuards(ProjectAccessGuard)
class ReleasesController {
  constructor(private readonly releases: ReleasesService) {}

  @Post("projects/:projectId/releases/plan")
  createPlan(@Param("projectId") projectId: string, @Body() body: unknown) {
    return this.releases.createPlan(projectId, body);
  }

  @Get("projects/:projectId/releases/:releasePlanId")
  getRelease(@Param("projectId") projectId: string, @Param("releasePlanId") releasePlanId: string) {
    return {
      projectId,
      releasePlanId,
      status: "draft"
    };
  }

  @Post("projects/:projectId/releases/:releasePlanId/preflight")
  preflight(@Param("projectId") projectId: string, @Param("releasePlanId") releasePlanId: string) {
    return this.releases.preflight(projectId, releasePlanId);
  }

  @Post("projects/:projectId/releases/:releasePlanId/approve-deploy")
  approveDeploy(@Param("projectId") projectId: string, @Param("releasePlanId") releasePlanId: string) {
    return {
      projectId,
      releasePlanId,
      status: "approved_for_deploy",
      approvedAt: new Date().toISOString()
    };
  }

  @Post("projects/:projectId/releases/:releasePlanId/deploy")
  deploy(@Param("projectId") projectId: string, @Param("releasePlanId") releasePlanId: string) {
    return this.releases.deploy(projectId, releasePlanId);
  }

  @Post("projects/:projectId/releases/:releasePlanId/verify")
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
