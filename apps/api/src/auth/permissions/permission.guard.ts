import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { projectPermissionsMetadataKey } from "./require-permission.decorator.js";
import { roleHasProjectPermission, type ProjectPermission } from "./project-permissions.js";
import type { RequestWithAuth } from "../types/authenticated-request.js";

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<ProjectPermission[]>(projectPermissionsMetadataKey, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!requiredPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithAuth<FastifyRequest>>();
    const projectAccess = request.projectAccess;

    if (!projectAccess) {
      throw new ForbiddenException("Project permission checks require resolved project access.");
    }

    const allowed = requiredPermissions.every((permission) => roleHasProjectPermission(projectAccess.role, permission));

    if (!allowed) {
      throw new ForbiddenException("Authenticated user does not have permission for this project action.");
    }

    return true;
  }
}
