import assert from "node:assert/strict";
import test from "node:test";
import { NotConfiguredReasoningAdapter } from "./not-configured-ai-reasoning.js";

void test("NotConfiguredReasoningAdapter returns a clear provider_not_configured result", async () => {
  const adapter = new NotConfiguredReasoningAdapter();

  const result = await adapter.runStructured();

  assert.deepEqual(result, {
    ok: false,
    failureCode: "provider_not_configured",
    provider: "not_configured",
    diagnostics: {
      latencyMs: 0,
      detail: "ai_reasoning_provider_not_configured"
    }
  });
});
