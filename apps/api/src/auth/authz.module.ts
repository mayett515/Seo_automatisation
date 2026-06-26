import { Global, Module } from "@nestjs/common";
import { ProjectAccessGuard } from "./project-access.guard.js";
import { ProjectMembershipService } from "./project-membership.service.js";

@Global()
@Module({
  providers: [ProjectAccessGuard, ProjectMembershipService],
  exports: [ProjectAccessGuard, ProjectMembershipService]
})
export class AuthzModule {}
