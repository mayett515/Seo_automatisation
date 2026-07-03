import assert from "node:assert/strict";
import test from "node:test";
import { MockReasoningAdapter } from "./mock-ai-reasoning.js";

void test("MockReasoningAdapter records structured reasoning calls", async () => {
  const adapter = new MockReasoningAdapter();

  const result = await adapter.runStructured({
    task: "opportunity_scout",
    projectId: "project-1",
    runId: "run-1",
    prompt: "Return JSON.",
    inputJson: { evidence: [] },
    outputSchemaName: "OpportunityScoutOutput",
    timeoutMs: 1_000,
    policy: {
      canMutateProduction: false,
      allowedToolCategories: ["read_evidence", "analyze"]
    }
  });

  assert.equal(result.ok, true);
  assert.equal(adapter.calls.length, 1);
  assert.equal(adapter.calls[0]?.task, "opportunity_scout");
});

void test("MockReasoningAdapter can return adapter failures", async () => {
  const adapter = new MockReasoningAdapter({
    ok: false,
    failureCode: "provider_timeout",
    provider: "mock",
    diagnostics: {
      latencyMs: 10,
      detail: "timeout"
    }
  });

  const result = await adapter.runStructured({
    task: "opportunity_scout",
    projectId: "project-1",
    runId: "run-1",
    prompt: "Return JSON.",
    inputJson: {},
    outputSchemaName: "OpportunityScoutOutput",
    timeoutMs: 1_000,
    policy: {
      canMutateProduction: false,
      allowedToolCategories: ["read_evidence"]
    }
  });

  assert.deepEqual(result, {
    ok: false,
    failureCode: "provider_timeout",
    provider: "mock",
    diagnostics: {
      latencyMs: 10,
      detail: "timeout"
    }
  });
});
