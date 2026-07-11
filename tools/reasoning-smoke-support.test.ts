import assert from "node:assert/strict";
import test from "node:test";
import { assertOpenCodeGoSmokeConfiguration, redactReasoningSmokeText } from "./reasoning-smoke-support.js";

void test("real-provider smoke configuration fails closed and redacts loaded secrets", () => {
  const previous = {
    provider: process.env.AI_REASONING_PROVIDER,
    model: process.env.AI_REASONING_MODEL,
    apiKey: process.env.AI_REASONING_OPENCODE_GO_API_KEY,
    databaseUrl: process.env.DATABASE_URL
  };

  try {
    process.env.AI_REASONING_PROVIDER = "mock";
    process.env.AI_REASONING_MODEL = "glm-5.2";
    process.env.AI_REASONING_OPENCODE_GO_API_KEY = "provider-secret";
    assert.throws(() => assertOpenCodeGoSmokeConfiguration(), /must be opencode_go/u);

    process.env.AI_REASONING_PROVIDER = "opencode_go";
    delete process.env.AI_REASONING_OPENCODE_GO_API_KEY;
    assert.throws(() => assertOpenCodeGoSmokeConfiguration(), /API_KEY is required/u);

    process.env.AI_REASONING_OPENCODE_GO_API_KEY = "provider-secret";
    process.env.DATABASE_URL = "postgres://secret-database-url";
    assert.doesNotThrow(() => assertOpenCodeGoSmokeConfiguration());
    assert.equal(redactReasoningSmokeText("provider-secret postgres://secret-database-url"), "[redacted] [redacted]");
  } finally {
    restoreEnv("AI_REASONING_PROVIDER", previous.provider);
    restoreEnv("AI_REASONING_MODEL", previous.model);
    restoreEnv("AI_REASONING_OPENCODE_GO_API_KEY", previous.apiKey);
    restoreEnv("DATABASE_URL", previous.databaseUrl);
  }
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
