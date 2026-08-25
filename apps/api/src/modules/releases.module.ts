import { Body, Controller, Get, Inject, Module, Param, Post, Req, UseGuards } from "@nestjs/common";
import { BetterAuthGuard } from "../auth/guards/better-auth.guard.js";
import { PermissionGuard } from "../auth/permissions/permission.guard.js";
import { RequireProjectPermission } from "../auth/permissions/require-permission.decorator.js";
import { ProjectAccessGuard } from "../auth/project-access.guard.js";
import type { RequestWithAuth } from "../auth/types/authenticated-request.js";
import { CsrfGuard } from "../security/csrf/csrf.guard.js";
import { isPersistedId } from "../persisted-id.js";
import { ReleasesService } from "./releases/releases.service.js";

@Controller()
@UseGuards(BetterAuthGuard, CsrfGuard, ProjectAccessGuard, PermissionGuard)
class ReleasesController {
  constructor(@Inject(ReleasesService) private readonly releases: ReleasesService) {}

  @Post("projects/:projectId/releases/plan")
  @RequireProjectPermission("release:plan")
  createPlan(@Param("projectId") projectId: string, @Body() body: unknown, @Req() request: RequestWithAuth) {
    return this.releases.createPlan(projectId, body, persistedActorUserId(request));
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
    return this.releases.approveDeploy(projectId, releasePlanId, persistedActorUserId(request));
  }

  @Post("projects/:projectId/releases/:releasePlanId/cancel")
  @RequireProjectPermission("release:plan")
  cancelPlan(
    @Param("projectId") projectId: string,
    @Param("releasePlanId") releasePlanId: string,
    @Req() request: RequestWithAuth
  ) {
    return this.releases.cancelPlan(projectId, releasePlanId, persistedActorUserId(request));
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

export { ReleasesService } from "./releases/releases.service.js";

function persistedActorUserId(request: RequestWithAuth): string | undefined {
  const userId = request.auth?.user.id;
  return userId && isPersistedId(userId) ? userId : undefined;
}
