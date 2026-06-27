import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { parseAppEnv } from "@localseo/config";
import type { FastifyRequest } from "fastify";

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    if (!unsafeMethods.has(request.method.toUpperCase())) {
      return true;
    }

    const env = parseAppEnv(process.env);
    const origin = readHeader(request, "origin");
    const referer = readHeader(request, "referer");
    const trustedOrigins = allowedOrigins(env.WEB_ORIGIN, env.API_PUBLIC_URL, env.BETTER_AUTH_URL);

    if (origin) {
      return assertTrustedOrigin(origin, trustedOrigins);
    }

    if (referer) {
      return assertTrustedOrigin(originFromUrl(referer), trustedOrigins);
    }

    if (env.NODE_ENV !== "production") {
      return true;
    }

    throw new ForbiddenException("Unsafe authenticated requests require a trusted Origin or Referer.");
  }
}

function assertTrustedOrigin(origin: string, trustedOrigins: Set<string>): true {
  if (trustedOrigins.has(origin)) {
    return true;
  }

  throw new ForbiddenException("Unsafe authenticated request came from an untrusted origin.");
}

function allowedOrigins(...origins: Array<string | undefined>): Set<string> {
  return new Set(origins.filter((origin): origin is string => Boolean(origin)).map((origin) => originFromUrl(origin)));
}

function originFromUrl(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}

function readHeader(request: FastifyRequest, headerName: string): string | undefined {
  const value = request.headers[headerName];

  if (Array.isArray(value)) {
    return value.find((item) => item.length > 0);
  }

  return typeof value === "string" && value.length > 0 ? value : undefined;
}
