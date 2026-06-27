import type { AppEnv } from "@localseo/config";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { BetterAuthService } from "./better-auth.service.js";

type LocalSeoAuth = NonNullable<BetterAuthService["auth"]>;

export function mountBetterAuthFastify(fastify: FastifyInstance, auth: LocalSeoAuth | undefined, env: AppEnv): void {
  fastify.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    config: {
      rateLimit: {
        max: env.NODE_ENV === "production" ? 60 : 300,
        timeWindow: "1 minute"
      }
    },
    handler: async (request, reply) => handleBetterAuthRequest(request, reply, auth, env)
  });
}

async function handleBetterAuthRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  auth: LocalSeoAuth | undefined,
  env: AppEnv
) {
  if (!auth) {
    return reply.status(503).send({
      error: "Authentication is not configured.",
      code: "AUTH_NOT_CONFIGURED"
    });
  }

  const url = new URL(request.url, env.BETTER_AUTH_URL ?? env.API_PUBLIC_URL);
  const betterAuthRequest = new Request(url.toString(), {
    method: request.method,
    headers: fromNodeHeaders(request.headers),
    body: serializeRequestBody(request.method, request.body)
  });
  const response = await auth.handler(betterAuthRequest);
  const responseBody = await response.text();

  reply.status(response.status);
  setResponseHeaders(reply, response.headers);

  return reply.send(responseBody.length > 0 ? responseBody : null);
}

function serializeRequestBody(method: string, body: unknown): BodyInit | undefined {
  if (method === "GET" || method === "HEAD" || body === undefined) {
    return undefined;
  }

  if (
    typeof body === "string" ||
    body instanceof URLSearchParams ||
    body instanceof ArrayBuffer ||
    body instanceof Blob ||
    body instanceof FormData
  ) {
    return body;
  }

  return JSON.stringify(body);
}

function setResponseHeaders(reply: FastifyReply, headers: Headers): void {
  const setCookieHeaders = getSetCookieHeaders(headers);

  headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") {
      reply.header(key, value);
    }
  });

  if (setCookieHeaders.length > 0) {
    reply.header("set-cookie", setCookieHeaders);
  }
}

function getSetCookieHeaders(headers: Headers): string[] {
  const headersWithSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
  };

  return headersWithSetCookie.getSetCookie?.() ?? [];
}
