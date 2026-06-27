import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { allowsLocalScaffoldAuth, parseAppEnv } from "@localseo/config";
import type { FastifyRequest } from "fastify";
import { BetterAuthService } from "../better-auth/better-auth.service.js";
import type { RequestWithAuth } from "../types/authenticated-request.js";

type ProjectScopedParams = {
  projectId?: string;
  id?: string;
};

@Injectable()
export class BetterAuthGuard implements CanActivate {
  constructor(private readonly betterAuth: BetterAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<RequestWithAuth<FastifyRequest<{ Params: ProjectScopedParams }>>>();
    const sessionContext = await this.betterAuth.getSessionFromHeaders(request.headers);

    if (sessionContext) {
      request.auth = sessionContext;
      return true;
    }

    const env = parseAppEnv(process.env);

    if (allowsLocalScaffoldAuth(env)) {
      const scaffoldContext = createLocalScaffoldContext(request);

      if (scaffoldContext) {
        request.auth = scaffoldContext;
        return true;
      }
    }

    throw new UnauthorizedException("A valid application session is required.");
  }
}

function createLocalScaffoldContext(
  request: FastifyRequest<{ Params: ProjectScopedParams }>
): RequestWithAuth["auth"] | undefined {
  const projectId = request.params.projectId ?? request.params.id;
  const userId = readHeader(request, "x-user-id");

  if (projectId === "demo-project") {
    return localContext(userId ?? "00000000-0000-4000-8000-000000000000");
  }

  if (userId) {
    return localContext(userId);
  }

  return undefined;
}

function localContext(userId: string): NonNullable<RequestWithAuth["auth"]> {
  return {
    user: {
      id: userId,
      email: null,
      name: "Local scaffold user"
    },
    session: {
      id: "local-scaffold-session",
      userId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    },
    source: "local_scaffold"
  };
}

function readHeader(request: FastifyRequest, headerName: string): string | undefined {
  const value = request.headers[headerName];

  if (Array.isArray(value)) {
    return value.find((item) => item.length > 0);
  }

  return typeof value === "string" && value.length > 0 ? value : undefined;
}
