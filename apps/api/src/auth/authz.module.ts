import { Global, Module } from "@nestjs/common";
import { PermissionGuard } from "./permissions/permission.guard.js";
import { ProjectAccessGuard } from "./project-access.guard.js";
import { ProjectMembershipService } from "./project-membership.service.js";

@Global()
@Module({
  providers: [PermissionGuard, ProjectAccessGuard, ProjectMembershipService],
  exports: [PermissionGuard, ProjectAccessGuard, ProjectMembershipService]
})
export class AuthzModule {}
