import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allowsLocalScaffoldAuth, assertProductionRuntimeEnv, parseAppEnv } from "./index.js";

void describe("AppEnvSchema", () => {
  void it("rejects weak Better Auth secrets", () => {
    assert.throws(() =>
      parseAppEnv({
        BETTER_AUTH_SECRET: "short"
      })
    );
  });

  void it("accepts Better Auth secrets with at least 32 characters", () => {
    const env = parseAppEnv({
      BETTER_AUTH_SECRET: "12345678901234567890123456789012"
    });

    assert.equal(env.BETTER_AUTH_SECRET, "12345678901234567890123456789012");
  });

  void it("defaults AI reasoning to the mock provider", () => {
    const env = parseAppEnv({});

    assert.equal(env.AI_REASONING_PROVIDER, "mock");
    assert.equal(env.AI_REASONING_MODEL, "glm-5.2");
    assert.equal(env.AI_REASONING_OPENCODE_GO_ENDPOINT, "https://opencode.ai/zen/go/v1/chat/completions");
    assert.equal(env.AI_REASONING_TIMEOUT_MS, 120_000);
  });

  void it("accepts explicit OpenCode Go reasoning configuration", () => {
    const env = parseAppEnv({
      AI_REASONING_PROVIDER: "opencode_go",
      AI_REASONING_MODEL: "deepseek-v4-flash",
      AI_REASONING_OPENCODE_GO_API_KEY: "opencode-go-key",
      AI_REASONING_OPENCODE_GO_ENDPOINT: "https://opencode.ai/zen/go/v1/chat/completions",
      AI_REASONING_TIMEOUT_MS: "45000"
    });

    assert.equal(env.AI_REASONING_PROVIDER, "opencode_go");
    assert.equal(env.AI_REASONING_MODEL, "deepseek-v4-flash");
    assert.equal(env.AI_REASONING_OPENCODE_GO_API_KEY, "opencode-go-key");
    assert.equal(env.AI_REASONING_TIMEOUT_MS, 45_000);
  });

  void it("parses bounded work recovery settings", () => {
    const defaults = parseAppEnv({});
    assert.equal(defaults.WORK_RECOVERY_STALE_AFTER_MS, 15 * 60_000);
    assert.equal(defaults.WORK_RECOVERY_MAX_COUNT, 3);
    assert.equal(defaults.WORK_RECOVERY_BATCH_SIZE, 25);

    const configured = parseAppEnv({
      WORK_RECOVERY_STALE_AFTER_MS: "300000",
      WORK_RECOVERY_MAX_COUNT: "5",
      WORK_RECOVERY_BATCH_SIZE: "40"
    });
    assert.equal(configured.WORK_RECOVERY_STALE_AFTER_MS, 300_000);
    assert.equal(configured.WORK_RECOVERY_MAX_COUNT, 5);
    assert.equal(configured.WORK_RECOVERY_BATCH_SIZE, 40);
  });

  void it("keeps media upload and project quotas within the accepted MVP bounds", () => {
    const defaults = parseAppEnv({});
    assert.equal(defaults.MEDIA_UPLOAD_GRANT_TTL_SECONDS, 600);
    assert.equal(defaults.MEDIA_MAX_UPLOAD_BYTES, 10 * 1024 * 1024);
    assert.equal(defaults.MEDIA_MAX_UNRESOLVED_ASSETS, 5);
    assert.equal(defaults.MEDIA_MAX_RETAINED_ASSETS, 250);
    assert.equal(defaults.MEDIA_MAX_DERIVATIVE_BYTES, 2 * 1024 * 1024 * 1024);

    assert.throws(() => parseAppEnv({ MEDIA_UPLOAD_GRANT_TTL_SECONDS: "601" }));
    assert.throws(() => parseAppEnv({ MEDIA_MAX_UPLOAD_BYTES: String(10 * 1024 * 1024 + 1) }));
  });

  void it("strips obsolete global tracking ingest token config", () => {
    const env = parseAppEnv({
      TRACKING_INGEST_TOKEN: "12345678901234567890123456789012"
    });

    assert.equal("TRACKING_INGEST_TOKEN" in env, false);
  });

  void it("requires an explicit true flag for local scaffold auth and never allows it in production", () => {
    assert.equal(
      allowsLocalScaffoldAuth(
        parseAppEnv({
          NODE_ENV: "development"
        })
      ),
      false
    );
    assert.equal(
      allowsLocalScaffoldAuth(
        parseAppEnv({
          NODE_ENV: "development",
          ALLOW_LOCAL_SCAFFOLD_AUTH: "true"
        })
      ),
      true
    );
    assert.equal(
      allowsLocalScaffoldAuth(
        parseAppEnv({
          NODE_ENV: "production",
          ALLOW_LOCAL_SCAFFOLD_AUTH: "true"
        })
      ),
      false
    );
  });

  void it("rejects production boot when local scaffold auth is enabled", () => {
    assert.throws(
      () =>
        assertProductionRuntimeEnv({
          NODE_ENV: "production",
          ALLOW_LOCAL_SCAFFOLD_AUTH: "true",
          WEB_ORIGIN: "https://app.example.com",
          API_PUBLIC_URL: "https://api.example.com",
          TRUST_PROXY: "1",
          DATABASE_URL: "postgres://postgres:postgres@example.com:5432/local_seo",
          REDIS_URL: "redis://redis.example.com:6379",
          BETTER_AUTH_SECRET: "12345678901234567890123456789012",
          BETTER_AUTH_URL: "https://api.example.com",
          GOOGLE_OAUTH_CLIENT_ID: "google-client-id",
          GOOGLE_OAUTH_CLIENT_SECRET: "google-client-secret",
          GOOGLE_OAUTH_REDIRECT_URI: "https://api.example.com/gsc/callback",
          GSC_TOKEN_ENCRYPTION_KEY: "12345678901234567890123456789012",
          GSC_OAUTH_STATE_SECRET: "12345678901234567890123456789012"
        }),
      /ALLOW_LOCAL_SCAFFOLD_AUTH/u
    );
  });

  void it("rejects production boot when required secrets still use placeholders", () => {
    assert.throws(
      () =>
        assertProductionRuntimeEnv({
          ...productionEnv(),
          BETTER_AUTH_SECRET: "replace-with-at-least-32-characters"
        }),
      /BETTER_AUTH_SECRET/u
    );
    assert.throws(
      () =>
        assertProductionRuntimeEnv({
          ...productionEnv(),
          GSC_TOKEN_ENCRYPTION_KEY: "replace-with-at-least-32-characters"
        }),
      /GSC_TOKEN_ENCRYPTION_KEY/u
    );
    assert.throws(
      () =>
        assertProductionRuntimeEnv({
          ...productionEnv(),
          GSC_OAUTH_STATE_SECRET: "replace-with-at-least-32-characters"
        }),
      /GSC_OAUTH_STATE_SECRET/u
    );
  });

  void it("rejects production boot when required secrets are repeated characters", () => {
    assert.throws(
      () =>
        assertProductionRuntimeEnv({
          ...productionEnv(),
          BETTER_AUTH_SECRET: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        }),
      /BETTER_AUTH_SECRET/u
    );
  });

  void it("rejects production boot when proxy trust is broad", () => {
    assert.throws(
      () =>
        assertProductionRuntimeEnv({
          ...productionEnv(),
          TRUST_PROXY: "true"
        }),
      /TRUST_PROXY/u
    );
  });

  void it("rejects production boot when browser verification is disabled", () => {
    assert.throws(
      () =>
        assertProductionRuntimeEnv({
          ...productionEnv(),
          RELEASE_BROWSER_VERIFICATION_ENABLED: "false"
        }),
      /RELEASE_BROWSER_VERIFICATION_ENABLED/u
    );
  });

  void it("rejects production boot without durable S3 storage", () => {
    const input = productionEnv();
    delete input.S3_BUCKET;

    assert.throws(() => assertProductionRuntimeEnv(input), /S3_BUCKET/u);
  });
});

function productionEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    WEB_ORIGIN: "https://app.example.com",
    API_PUBLIC_URL: "https://api.example.com",
    TRUST_PROXY: "1",
    DATABASE_URL: "postgres://postgres:postgres@example.com:5432/local_seo",
    REDIS_URL: "redis://redis.example.com:6379",
    S3_BUCKET: "local-seo-artifacts",
    BETTER_AUTH_SECRET: "12345678901234567890123456789012",
    BETTER_AUTH_URL: "https://api.example.com",
    GOOGLE_OAUTH_CLIENT_ID: "google-client-id",
    GOOGLE_OAUTH_CLIENT_SECRET: "google-client-secret",
    GOOGLE_OAUTH_REDIRECT_URI: "https://api.example.com/gsc/callback",
    GSC_TOKEN_ENCRYPTION_KEY: "12345678901234567890123456789012",
    GSC_OAUTH_STATE_SECRET: "12345678901234567890123456789012",
    RELEASE_BROWSER_VERIFICATION_ENABLED: "true"
  };
}
