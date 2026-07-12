import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { policyForReasoningTask, ReasoningPolicyConfigurationError } from "./reasoning-policy.js";

void describe("policyForReasoningTask", () => {
  void it("keeps Opportunity Scout read/analyze only", () => {
    assert.deepEqual(policyForReasoningTask("opportunity_scout"), {
      canMutateProduction: false,
      allowedToolCategories: ["read_evidence", "analyze"]
    });
  });

  void it("allows Page Proposal to draft structured PageJson but not mutate production", () => {
    assert.deepEqual(policyForReasoningTask("page_brief_draft"), {
      canMutateProduction: false,
      allowedToolCategories: [
        "read_evidence",
        "read_registry",
        "analyze",
        "draft_content",
        "draft_page_json",
        "render_preview"
      ]
    });
  });

  void it("keeps section copy generation bounded to evidence and draft content", () => {
    assert.deepEqual(policyForReasoningTask("section_text_generation"), {
      canMutateProduction: false,
      allowedToolCategories: ["read_evidence", "draft_content"]
    });
  });

  void it("fails closed for reasoning tasks without a named policy profile", () => {
    assert.throws(() => policyForReasoningTask("report_narrative"), ReasoningPolicyConfigurationError);
  });
});
