import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { mountBetterAuthFastify } from "./better-auth.fastify-mount.js";
import type { AppEnv } from "@localseo/config";

void describe("mountBetterAuthFastify", () => {
  void it("mounts an auth route that fails explicitly when auth is not configured", async () => {
    const fastify = Fastify();
    mountBetterAuthFastify(fastify, undefined, testEnv());

    const response = await fastify.inject({
      method: "GET",
      url: "/api/auth/session"
    });

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), {
      error: "Authentication is not configured.",
      code: "AUTH_NOT_CONFIGURED"
    });
    await fastify.close();
  });
});

function testEnv(): AppEnv {
  return {
    NODE_ENV: "test",
    ALLOW_LOCAL_SCAFFOLD_AUTH: false,
    PORT: 4000,
    WEB_ORIGIN: "http://localhost:5173",
    API_PUBLIC_URL: "http://localhost:4000",
    TRUST_PROXY: "false",
    DATABASE_POOL_MAX: 10,
    DATABASE_IDLE_TIMEOUT_SECONDS: 30,
    DATABASE_CONNECT_TIMEOUT_SECONDS: 5,
    DATABASE_PING_TIMEOUT_MS: 2000,
    AWS_REGION: "eu-central-1"
  };
}
