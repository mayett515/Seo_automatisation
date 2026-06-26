import { CanActivate, ExecutionContext, Injectable, Optional, UnauthorizedException } from "@nestjs/common";
import { parseAppEnv } from "@localseo/config";
import type { FastifyRequest } from "fastify";
import { ProjectMembershipService } from "./project-membership.service.js";

type ProjectScopedParams = {
  projectId?: string;
  id?: string;
};

@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(@Optional() private readonly memberships?: ProjectMembershipService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest<{ Params: ProjectScopedParams }>>();
    const projectId = request.params.projectId ?? request.params.id;

    if (!projectId) {
      throw new UnauthorizedException("Project access guard requires a project route context.");
    }

    const env = parseAppEnv(process.env);

    if (projectId === "demo-project" && env.NODE_ENV !== "production") {
      return true;
    }

    const userId = readHeader(request, "x-user-id");

    if (!userId) {
      throw new UnauthorizedException("Project access requires an authenticated user context.");
    }

    if (isUuid(projectId)) {
      if (!isUuid(userId)) {
        throw new UnauthorizedException("Authenticated user context is malformed.");
      }

      if (!this.memberships?.isDatabaseBacked()) {
        throw new UnauthorizedException("Persisted project access requires database-backed membership checks.");
      }

      if (!(await this.memberships.canAccessProject({ userId, projectId }))) {
        throw new UnauthorizedException("Authenticated user is not authorized for this project.");
      }

      return true;
    }

    if (env.NODE_ENV === "production") {
      throw new UnauthorizedException("Non-persisted project ids are not accepted in production.");
    }

    const allowedProjectIds = parseProjectIds(readHeader(request, "x-project-ids"));
    const singleProjectId = readHeader(request, "x-project-id");

    if (singleProjectId) {
      allowedProjectIds.add(singleProjectId);
    }

    if (!allowedProjectIds.has(projectId)) {
      throw new UnauthorizedException("Authenticated user is not authorized for this project.");
    }

    return true;
  }
}

function readHeader(request: FastifyRequest, headerName: string): string | undefined {
  const value = request.headers[headerName];

  if (Array.isArray(value)) {
    return value.find((item) => item.length > 0);
  }

  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseProjectIds(value: string | undefined): Set<string> {
  if (!value) {
    return new Set();
  }

  return new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}
