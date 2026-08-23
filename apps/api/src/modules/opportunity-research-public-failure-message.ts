import {
  OpportunityResearchFailureCodeSchema,
  type AgentRunFailureCode,
  type OpportunityResearchFailureCode
} from "@localseo/contracts";

const genericOpportunityResearchFailureMessage = "Opportunity Research failed. Review the failure code and timeline.";

const opportunityResearchPublicFailureMessages = {
  configuration_error: "Opportunity Research is not configured.",
  provider_not_configured: "Opportunity Research is not configured.",
  provider_timeout: "Opportunity Research provider timed out.",
  provider_unavailable: "Opportunity Research provider is unavailable.",
  provider_response_invalid: "Opportunity Research provider returned invalid structured output.",
  model_egress_blocked: "Opportunity Research was stopped because selected material matched the secret-egress policy.",
  material_or_evidence_invalid: "Opportunity Research evidence changed or is no longer eligible.",
  material_stale: "Opportunity Research evidence changed or is no longer eligible.",
  qa_rejected: "Opportunity Research output failed deterministic QA.",
  enqueue_failed: "Opportunity Research could not be queued.",
  queue_enqueue_failed: "Opportunity Research could not be queued.",
  work_recovery_exhausted: "Opportunity Research exhausted its bounded recovery attempts.",
  work_transport_inconsistent: "Opportunity Research transport completed without terminal product truth.",
  lifecycle_conflict: "Opportunity Research lost workflow lifecycle ownership.",
  workflow_in_progress: "Opportunity Research lost workflow lifecycle ownership.",
  workflow_failed: genericOpportunityResearchFailureMessage,
  workflow_execution_failed: genericOpportunityResearchFailureMessage
} as const satisfies Record<OpportunityResearchFailureCode, string>;

export function publicOpportunityResearchFailureMessage(
  failureCode: AgentRunFailureCode | undefined
): string | undefined {
  if (!failureCode) {
    return undefined;
  }

  const parsed = OpportunityResearchFailureCodeSchema.safeParse(failureCode);
  if (!parsed.success) {
    return genericOpportunityResearchFailureMessage;
  }

  return opportunityResearchPublicFailureMessages[parsed.data];
}
