import type { AiReasoningRunPolicy } from "@localseo/adapters";
import type { ReasoningTask } from "@localseo/contracts";

export class ReasoningPolicyConfigurationError extends Error {}

const reasoningTaskPolicies: Partial<Record<ReasoningTask, AiReasoningRunPolicy>> = {
  opportunity_scout: {
    canMutateProduction: false,
    allowedToolCategories: ["read_evidence", "analyze"]
  },
  page_brief_draft: {
    canMutateProduction: false,
    allowedToolCategories: [
      "read_evidence",
      "read_registry",
      "analyze",
      "draft_content",
      "draft_page_json",
      "render_preview"
    ]
  },
  section_text_generation: {
    canMutateProduction: false,
    allowedToolCategories: ["read_evidence", "draft_content"]
  }
} satisfies Partial<Record<ReasoningTask, AiReasoningRunPolicy>>;

export function policyForReasoningTask(task: ReasoningTask): AiReasoningRunPolicy {
  const policy = reasoningTaskPolicies[task];

  if (!policy) {
    throw new ReasoningPolicyConfigurationError(`No AI reasoning policy is configured for task ${task}.`);
  }

  return {
    ...policy,
    allowedToolCategories: [...policy.allowedToolCategories]
  };
}
