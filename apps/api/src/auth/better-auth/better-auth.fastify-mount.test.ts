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
    PREVIEW_CAPABILITY_SECRET: "local-preview-capability-secret-at-least-32",
    TRUST_PROXY: "false",
    DATABASE_POOL_MAX: 10,
    DATABASE_IDLE_TIMEOUT_SECONDS: 30,
    DATABASE_CONNECT_TIMEOUT_SECONDS: 5,
    DATABASE_PING_TIMEOUT_MS: 2000,
    AWS_REGION: "eu-central-1",
    LOCAL_OBJECT_STORAGE_DIR: ".local-object-storage",
    MEDIA_UPLOAD_GRANT_TTL_SECONDS: 600,
    MEDIA_MAX_UPLOAD_BYTES: 10 * 1024 * 1024,
    MEDIA_MAX_UNRESOLVED_ASSETS: 5,
    MEDIA_MAX_RETAINED_ASSETS: 250,
    MEDIA_MAX_DERIVATIVE_BYTES: 2 * 1024 * 1024 * 1024,
    RELEASE_BROWSER_VERIFICATION_ENABLED: false,
    RELEASE_BROWSER_VERIFICATION_TIMEOUT_MS: 15_000,
    AI_REASONING_PROVIDER: "mock",
    AI_REASONING_MODEL: "glm-5.2",
    AI_REASONING_OPENCODE_GO_ENDPOINT: "https://opencode.ai/zen/go/v1/chat/completions",
    AI_REASONING_TIMEOUT_MS: 120_000,
    WORK_RECOVERY_STALE_AFTER_MS: 15 * 60_000,
    WORK_RECOVERY_MAX_COUNT: 3,
    WORK_RECOVERY_BATCH_SIZE: 25
  };
}
