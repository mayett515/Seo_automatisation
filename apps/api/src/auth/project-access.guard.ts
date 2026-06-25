import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

type ProjectScopedParams = {
  projectId?: string;
  id?: string;
};

@Injectable()
export class ProjectAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest<{ Params: ProjectScopedParams }>>();
    const projectId = request.params.projectId ?? request.params.id;

    if (!projectId) {
      return true;
    }

    if (projectId === "demo-project") {
      return true;
    }

    const userId = readHeader(request, "x-user-id");

    if (!userId) {
      throw new UnauthorizedException("Project access requires an authenticated user context.");
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
