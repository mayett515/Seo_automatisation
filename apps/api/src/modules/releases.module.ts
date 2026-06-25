import { randomUUID } from "node:crypto";
import { Body, Controller, Get, Injectable, Module, Param, Post } from "@nestjs/common";
import { ReleaseCheckSchema, ReleasePlanSchema, type ReleaseCheck } from "@localseo/contracts";
import { decideReleaseReadiness } from "@localseo/domain";

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
}

@Module({
  controllers: [ReleasesController],
  providers: [ReleasesService]
})
export class ReleasesModule {}
