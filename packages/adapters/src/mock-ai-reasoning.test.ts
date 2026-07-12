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

void test("MockReasoningAdapter returns a bounded section copy suggestion", async () => {
  const adapter = new MockReasoningAdapter();

  const result = await adapter.runStructured({
    task: "section_text_generation",
    projectId: "project-1",
    runId: "run-1",
    prompt: "Return JSON.",
    inputJson: {
      currentSection: {
        id: "hero-1",
        props: {
          h1: "Dachreinigung in Muenchen",
          primaryCtaHref: "/kontakt/"
        }
      },
      allowedCopyFields: ["h1"]
    },
    outputSchemaName: "SectionCopyRevisionOutput",
    timeoutMs: 1_000,
    policy: {
      canMutateProduction: false,
      allowedToolCategories: ["read_evidence", "draft_content"]
    }
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.model, "mock-section-copy");
  assert.deepEqual(result.outputJson, {
    schemaVersion: 1,
    sectionId: "hero-1",
    suggestedFields: {
      h1: "Lokale Leistungen auf den Punkt"
    }
  });
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
