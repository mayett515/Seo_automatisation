import type {
  AgentRunSummary,
  EvidenceRef,
  OpportunityBrief,
  OpportunityExplorerOpportunity,
  OpportunityLifecycleStatus
} from "@localseo/contracts";

export type OpportunityDecisionStatus = Exclude<OpportunityLifecycleStatus, "brief_created">;

export const opportunityDecisionStatuses = [
  "monitoring",
  "held",
  "rejected",
  "new"
] as const satisfies readonly OpportunityDecisionStatus[];

export function maxProofTier(brief: OpportunityBrief): EvidenceRef["proofTier"] {
  if (brief.evidence.some((evidence) => evidence.proofTier === "customer_safe_proof")) {
    return "customer_safe_proof";
  }

  if (brief.evidence.some((evidence) => evidence.proofTier === "supporting_context")) {
    return "supporting_context";
  }

  return "internal_signal";
}

export function classificationTone(classification: string | undefined) {
  if (classification === "proven_win" || classification === "defend_advance") {
    return "success";
  }

  if (
    classification === "near_term_target" ||
    classification === "quick_win" ||
    classification === "strategic_market"
  ) {
    return "warning";
  }

  if (classification === "rejected") {
    return "danger";
  }

  return "neutral";
}

export function proofTierTone(proofTier: EvidenceRef["proofTier"]) {
  if (proofTier === "customer_safe_proof") {
    return "success";
  }

  if (proofTier === "supporting_context") {
    return "warning";
  }

  return "neutral";
}

export function researchEvidenceTone(
  readiness: NonNullable<OpportunityExplorerOpportunity["research"]>["evidenceReadiness"]
) {
  if (readiness === "reviewed_proof") return "success";
  if (readiness === "supporting_context") return "warning";
  return "neutral";
}

export function runStatusTone(status: AgentRunSummary["status"]) {
  if (status === "succeeded") {
    return "success";
  }

  if (status === "failed") {
    return "danger";
  }

  return "warning";
}

export function isActiveRun(run: AgentRunSummary): boolean {
  return run.status === "queued" || run.status === "running";
}

export function agentRunDescription(run: AgentRunSummary): string {
  if (run.failure?.message) {
    return run.failure.message;
  }

  if (run.failureCode) {
    return run.failure?.gateId ? `${run.failureCode}: ${run.failure.gateId}` : run.failureCode;
  }

  if (run.task === "page_brief_draft") {
    return run.subjectId ? `opportunity ${shortId(run.subjectId)}` : "opportunity unknown";
  }

  return `${run.opportunityCount} opportunities`;
}

export function pageProposalDisabledReason(
  opportunity: OpportunityExplorerOpportunity,
  brief: OpportunityBrief,
  latestRun?: AgentRunSummary
): string | undefined {
  if (latestRun && isActiveRun(latestRun)) {
    return "A proposal run is already active for this opportunity.";
  }

  if (latestRun?.status === "succeeded") {
    return "A draft proposal already exists for this opportunity.";
  }

  if (opportunity.status === "rejected") {
    return "Rejected opportunities cannot create page proposals.";
  }

  if (opportunity.status === "brief_created") {
    return "A draft proposal already exists for this opportunity.";
  }

  if (brief.recommendedAction !== "create_page_proposal") {
    return `Recommended action is ${label(brief.recommendedAction)}.`;
  }

  return undefined;
}

export function proposalButtonLabel(
  latestRun: AgentRunSummary | undefined,
  isPending: boolean,
  activeRun: boolean
): string {
  if (isPending) {
    return "Queueing";
  }

  if (activeRun) {
    return "Run active";
  }

  if (latestRun?.status === "failed") {
    return "Retry proposal";
  }

  return "Generate proposal";
}

export function lifecycleTone(status: OpportunityExplorerOpportunity["status"]) {
  if (status === "monitoring" || status === "brief_created") {
    return "success";
  }

  if (status === "held") {
    return "warning";
  }

  if (status === "rejected") {
    return "danger";
  }

  return "neutral";
}

export function decisionLabel(status: OpportunityDecisionStatus): string {
  if (status === "new") {
    return "Reopen";
  }

  return label(status);
}

export function label(value: string): string {
  return value.replaceAll("_", " ");
}

export function shortId(value: string): string {
  return value.length > 8 ? value.slice(0, 8) : value;
}

export function safeUrlLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return url;
  }
}
