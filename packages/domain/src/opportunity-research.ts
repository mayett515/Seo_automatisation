import canonicalize from "canonicalize";
import type {
  AgentRunStepStatus,
  KnowledgeVersionStatus,
  OpportunityEvidenceReadiness,
  OpportunityLane,
  OpportunityRankingMilestone,
  OpportunityResearchAxes,
  OpportunityValueBand,
  ProjectBusinessProfileContent
} from "@localseo/contracts";

export type AgentRunStepTransitionDecision =
  | { kind: "allow"; nextAttemptCount: number }
  | { kind: "deny"; reason: "invalid_transition" | "attempts_exhausted" };

export function decideAgentRunStepTransition(input: {
  currentStatus: AgentRunStepStatus;
  nextStatus: AgentRunStepStatus;
  attemptCount: number;
  maxAttempts: number;
}): AgentRunStepTransitionDecision {
  if (input.currentStatus === "pending" && input.nextStatus === "running") {
    return { kind: "allow", nextAttemptCount: input.attemptCount + 1 };
  }
  if (input.currentStatus === "pending" && input.nextStatus === "skipped") {
    return { kind: "allow", nextAttemptCount: input.attemptCount };
  }
  if (input.currentStatus === "pending" && input.nextStatus === "failed") {
    return { kind: "allow", nextAttemptCount: input.attemptCount };
  }
  if (input.currentStatus === "running" && ["succeeded", "failed"].includes(input.nextStatus)) {
    return { kind: "allow", nextAttemptCount: input.attemptCount };
  }
  if (input.currentStatus === "failed" && input.nextStatus === "running") {
    return input.attemptCount >= input.maxAttempts
      ? { kind: "deny", reason: "attempts_exhausted" }
      : { kind: "allow", nextAttemptCount: input.attemptCount + 1 };
  }
  return { kind: "deny", reason: "invalid_transition" };
}

export type KnowledgeReviewDecision =
  | { kind: "allow"; nextStatus: "approved" | "rejected" }
  | {
      kind: "deny";
      reason: "stale_status" | "stale_model_use_policy" | "agent_cannot_approve" | "rejection_reason_required";
    };

export function decideKnowledgeReview(input: {
  currentStatus: KnowledgeVersionStatus;
  expectedStatus: "proposed";
  currentModelUsePolicy: "operator_only" | "model_allowed";
  expectedModelUsePolicy: "operator_only" | "model_allowed";
  decision: "approve" | "reject";
  sourceKind: "human" | "agent" | "website_import" | "field_evidence" | "research";
  actorUserId?: string;
  rejectionReason?: string;
}): KnowledgeReviewDecision {
  if (input.currentStatus !== input.expectedStatus) return { kind: "deny", reason: "stale_status" };
  if (input.currentModelUsePolicy !== input.expectedModelUsePolicy) {
    return { kind: "deny", reason: "stale_model_use_policy" };
  }
  if (input.decision === "approve" && input.sourceKind === "agent" && !input.actorUserId) {
    return { kind: "deny", reason: "agent_cannot_approve" };
  }
  if (input.decision === "reject" && !input.rejectionReason?.trim()) {
    return { kind: "deny", reason: "rejection_reason_required" };
  }
  return { kind: "allow", nextStatus: input.decision === "approve" ? "approved" : "rejected" };
}

export type KnowledgeRetirementDecision =
  | { kind: "allow" }
  | { kind: "deny"; reason: "already_retired" | "no_current_approved_version" | "stale_current_version" };

export function decideKnowledgeRetirement(input: {
  currentApprovedVersionId: string | null;
  expectedCurrentApprovedVersionId: string;
  retiredAt: Date | null;
}): KnowledgeRetirementDecision {
  if (input.retiredAt) return { kind: "deny", reason: "already_retired" };
  if (!input.currentApprovedVersionId) return { kind: "deny", reason: "no_current_approved_version" };
  if (input.currentApprovedVersionId !== input.expectedCurrentApprovedVersionId) {
    return { kind: "deny", reason: "stale_current_version" };
  }
  return { kind: "allow" };
}

export type RankingProofTransitionDecision =
  | { kind: "allow" }
  | { kind: "deny"; reason: "invalid_transition" | "reason_required" };

export function decideRankingProofTransition(input: {
  currentStatus: "captured" | "reviewed" | "invalidated";
  nextStatus: "captured" | "reviewed" | "invalidated";
  reason?: string;
}): RankingProofTransitionDecision {
  const allowed =
    (input.currentStatus === "captured" && input.nextStatus === "reviewed") ||
    (input.currentStatus === "reviewed" && input.nextStatus === "invalidated");
  if (!allowed) return { kind: "deny", reason: "invalid_transition" };
  if (input.nextStatus === "invalidated" && !input.reason?.trim()) return { kind: "deny", reason: "reason_required" };
  return { kind: "allow" };
}

export function opportunityRankingMilestoneForRank(rank: number | undefined): OpportunityRankingMilestone {
  if (rank === undefined) return "unverified";
  if (rank === 1) return "rank_1";
  if (rank <= 3) return "top_3";
  if (rank <= 5) return "top_5";
  if (rank <= 10) return "top_10";
  return "outside_top_10";
}

export function opportunityEvidenceReadinessForSources(input: {
  hasReviewedRankingProof: boolean;
  hasSupportingContext: boolean;
}): OpportunityEvidenceReadiness {
  if (input.hasReviewedRankingProof) return "reviewed_proof";
  return input.hasSupportingContext ? "supporting_context" : "internal_signal";
}

export function deriveOpportunityLane(input: Omit<OpportunityResearchAxes, "lane">): OpportunityLane {
  if (["top_10", "top_5", "top_3", "rank_1"].includes(input.rankingMilestone)) return "defend_advance";
  if (
    ["medium", "high"].includes(input.businessValue) &&
    input.marketDifficulty === "low" &&
    ["low", "medium"].includes(input.executionEffort)
  ) {
    return "quick_win";
  }
  if (input.businessValue === "high" && ["high"].includes(input.marketDifficulty)) return "strategic_market";
  if (input.businessValue === "high" && input.executionEffort === "high") return "strategic_market";
  return "build_cluster";
}

export type OpportunityPortfolioCandidate = {
  id: string;
  stableKey: string;
  axes: OpportunityResearchAxes;
};

export type OpportunityPortfolioSelection = {
  selected: Array<{ id: string; portfolioOrder: number }>;
  shortfalls: { defendAdvance: number; quickBuild: number; strategic: number };
};

const readinessWeight: Record<OpportunityEvidenceReadiness, number> = {
  internal_signal: 0,
  supporting_context: 1,
  reviewed_proof: 2
};
const valueWeight: Record<OpportunityValueBand, number> = { unknown: 0, low: 1, medium: 2, high: 3 };
const inverseBandWeight: Record<OpportunityValueBand, number> = { unknown: 0, high: 1, medium: 2, low: 3 };
export function dedupeOpportunityPortfolioCandidates<T extends OpportunityPortfolioCandidate>(
  candidates: readonly T[]
): T[] {
  const canonicalOrder = [...candidates].sort(comparePortfolioCandidates);
  const unique = new Map<string, T>();
  for (const candidate of canonicalOrder) {
    if (!unique.has(candidate.stableKey)) unique.set(candidate.stableKey, candidate);
  }
  return [...unique.values()];
}

export function prepareOpportunityPortfolio<T extends OpportunityPortfolioCandidate>(
  candidates: readonly T[],
  existingStableKeys: ReadonlySet<string>
): { candidates: T[]; selection: OpportunityPortfolioSelection } {
  const remaining = dedupeOpportunityPortfolioCandidates(
    candidates.filter((candidate) => !existingStableKeys.has(candidate.stableKey))
  );
  return { candidates: remaining, selection: selectOpportunityPortfolio(remaining) };
}

export function selectOpportunityPortfolio(
  candidates: readonly OpportunityPortfolioCandidate[]
): OpportunityPortfolioSelection {
  const ordered = dedupeOpportunityPortfolioCandidates(candidates);
  const defend = ordered.filter((candidate) => candidate.axes.lane === "defend_advance").slice(0, 2);
  const quickBuild = ordered
    .filter((candidate) => candidate.axes.lane === "quick_win" || candidate.axes.lane === "build_cluster")
    .slice(0, 4);
  const strategic = ordered.filter((candidate) => candidate.axes.lane === "strategic_market").slice(0, 2);
  const selected = [...defend, ...quickBuild, ...strategic].map((candidate, index) => ({
    id: candidate.id,
    portfolioOrder: index + 1
  }));
  return {
    selected,
    shortfalls: {
      defendAdvance: 2 - defend.length,
      quickBuild: 4 - quickBuild.length,
      strategic: 2 - strategic.length
    }
  };
}

function comparePortfolioCandidates(left: OpportunityPortfolioCandidate, right: OpportunityPortfolioCandidate): number {
  const differences = [
    readinessWeight[right.axes.evidenceReadiness] - readinessWeight[left.axes.evidenceReadiness],
    valueWeight[right.axes.businessValue] - valueWeight[left.axes.businessValue],
    inverseBandWeight[right.axes.marketDifficulty] - inverseBandWeight[left.axes.marketDifficulty],
    inverseBandWeight[right.axes.executionEffort] - inverseBandWeight[left.axes.executionEffort]
  ];
  const material = differences.find((difference) => difference !== 0);
  if (material !== undefined) return material;
  if (left.stableKey < right.stableKey) return -1;
  if (left.stableKey > right.stableKey) return 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export function normalizeOpportunityResearchKey(input: {
  serviceId: string;
  areaId: string;
  primaryKeyword: string;
}): string {
  return `${input.serviceId}:${input.areaId}:${input.primaryKeyword.trim().toLowerCase().replace(/\s+/gu, " ")}`;
}

export type OpportunityResearchReadinessInput = {
  profileConfirmed: boolean;
  confirmedServiceCount: number;
  confirmedAreaCount: number;
  eligibleSourceCount: number;
  paused: boolean;
};

export function opportunityResearchReadinessIssues(input: OpportunityResearchReadinessInput): string[] {
  const issues: string[] = [];
  if (!input.profileConfirmed) issues.push("business_profile_unconfirmed");
  if (input.confirmedServiceCount < 1) issues.push("confirmed_service_required");
  if (input.confirmedAreaCount < 1) issues.push("confirmed_area_required");
  if (input.eligibleSourceCount < 1) issues.push("eligible_source_required");
  if (input.paused) issues.push("research_paused");
  return issues;
}

export function buildOpportunityResearchQuerySeeds(input: {
  services: readonly string[];
  areas: readonly string[];
  gscQueries?: readonly string[];
  knowledgeQueries?: readonly string[];
  maxQueries?: number;
}): string[] {
  const maxQueries = Math.min(Math.max(input.maxQueries ?? 9, 1), 9);
  const candidates = [
    ...input.services.flatMap((service) => input.areas.map((area) => `${service} ${area}`)),
    ...(input.gscQueries ?? []),
    ...(input.knowledgeQueries ?? [])
  ];
  const unique = new Map<string, string>();
  for (const candidate of candidates) {
    const normalized = candidate.trim().toLowerCase().replace(/\s+/gu, " ");
    if (normalized && !unique.has(normalized)) unique.set(normalized, candidate.trim().replace(/\s+/gu, " "));
  }
  return [...unique.values()].slice(0, maxQueries);
}

export function canonicalizeOpportunityResearchMaterial(input: {
  profileRevisionId: string;
  serviceIds: readonly string[];
  areaIds: readonly string[];
  sourceVersions: readonly string[];
  evidencePacketSha256: string;
  initialQueries: readonly string[];
}): string {
  const canonical = canonicalize({
    profileRevisionId: input.profileRevisionId,
    serviceIds: [...new Set(input.serviceIds)].sort(compareText),
    areaIds: [...new Set(input.areaIds)].sort(compareText),
    sourceVersions: [...new Set(input.sourceVersions)].sort(compareText),
    evidencePacketSha256: input.evidencePacketSha256,
    initialQueries: [...input.initialQueries]
  });
  if (canonical === undefined) throw new Error("Opportunity research material could not be canonicalized.");
  return canonical;
}

export function canonicalizeProjectBusinessProfileContent(input: ProjectBusinessProfileContent): string {
  const normalized = canonicalize({
    businessName: input.businessName,
    websiteUrl: input.websiteUrl,
    description: input.description,
    differentiators: [...input.differentiators],
    targetCustomers: [...input.targetCustomers],
    operatingNotes: [...input.operatingNotes]
  });
  if (normalized === undefined) throw new Error("Business profile could not be canonicalized.");
  return normalized;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
