import type {
  CustomerReportClaim,
  CustomerReportEvidenceItem,
  CustomerReportFactProjection,
  CustomerReportNavigationRef,
  CustomerReportSnapshot,
  CustomerReportStatus
} from "@localseo/contracts";
import { CustomerReportFactProjectionSchema, CustomerReportSnapshotSchema } from "@localseo/contracts";
import canonicalize from "canonicalize";

const reportSectionOrder = {
  ranking_results: 0,
  page_delivery: 1,
  live_health: 2,
  warnings: 3,
  rollback_corrections: 4,
  future_opportunities: 5
} as const satisfies Record<CustomerReportClaim["section"], number>;

export const customerReportRankingProofMaxAgeDays = 30;

export type CustomerReportTransitionCommand =
  | "submit_for_review"
  | "request_changes"
  | "publish"
  | "publish_correction_successor";

export type CustomerReportTransitionDecision =
  | {
      kind: "allow";
      nextStatus: CustomerReportStatus;
      requiresHumanActor: boolean;
      requiresExactDigest: boolean;
    }
  | { kind: "deny"; reason: "invalid_lifecycle_transition" };

export type CustomerReportClaimEligibilityIssue =
  | "missing_evidence"
  | "cross_project_evidence"
  | "evidence_cutoff_mismatch"
  | "evidence_kind_mismatch"
  | "evidence_value_mismatch"
  | "proof_tier_too_weak"
  | "stale_ranking_proof"
  | "ranking_milestone_mismatch"
  | "missing_required_evidence_kind";

export type CustomerReportClaimEligibilityDecision =
  | { kind: "eligible"; evidence: CustomerReportEvidenceItem[] }
  | { kind: "ineligible"; issues: CustomerReportClaimEligibilityIssue[] };

export type CustomerReportActionAvailability =
  | { kind: "available"; action: CustomerReportNavigationRef }
  | { kind: "view_only"; reason: "superseded_report" }
  | { kind: "unavailable"; reason: "report_not_published" };

export function canonicalizeCustomerReportFactProjection(input: unknown): string {
  const projection = CustomerReportFactProjectionSchema.parse(input);
  return serializeCanonicalJson(normalizeCustomerReportFactProjection(projection));
}

export function canonicalizeCustomerReportSnapshot(input: unknown): string {
  const snapshot = CustomerReportSnapshotSchema.parse(input);
  return serializeCanonicalJson(normalizeCustomerReportSnapshot(snapshot));
}

export function normalizeCustomerReportFactProjection(
  projection: CustomerReportFactProjection
): CustomerReportFactProjection {
  return {
    claims: projection.claims
      .map((claim) => ({ ...claim, evidenceKeys: [...claim.evidenceKeys].sort(compareStableText) }))
      .sort(compareReportClaims),
    evidence: [...projection.evidence].sort((left, right) => compareStableText(left.evidenceKey, right.evidenceKey)),
    nextActions: projection.nextActions
      .map((action) => ({
        ...action,
        supportingClaimKeys: [...action.supportingClaimKeys].sort(compareStableText)
      }))
      .sort((left, right) => compareStableText(left.actionKey, right.actionKey))
  };
}

export function normalizeCustomerReportSnapshot(snapshot: CustomerReportSnapshot): CustomerReportSnapshot {
  return {
    ...snapshot,
    factProjection: normalizeCustomerReportFactProjection(snapshot.factProjection),
    narrative: snapshot.narrative
      .map((fragment) => ({
        ...fragment,
        supportingClaimKeys: [...fragment.supportingClaimKeys].sort(compareStableText)
      }))
      .sort((left, right) => compareStableText(left.slotKey, right.slotKey))
  };
}

export function decideCustomerReportTransition(
  status: CustomerReportStatus,
  command: CustomerReportTransitionCommand
): CustomerReportTransitionDecision {
  if (status === "draft" && command === "submit_for_review") {
    return { kind: "allow", nextStatus: "ready_for_review", requiresHumanActor: true, requiresExactDigest: true };
  }

  if (status === "ready_for_review" && command === "request_changes") {
    return { kind: "allow", nextStatus: "draft", requiresHumanActor: true, requiresExactDigest: true };
  }

  if (status === "ready_for_review" && command === "publish") {
    return { kind: "allow", nextStatus: "published", requiresHumanActor: true, requiresExactDigest: true };
  }

  if (status === "published" && command === "publish_correction_successor") {
    return { kind: "allow", nextStatus: "superseded", requiresHumanActor: true, requiresExactDigest: true };
  }

  return { kind: "deny", reason: "invalid_lifecycle_transition" };
}

export function decideCustomerReportClaimEligibility(input: {
  claim: CustomerReportClaim;
  evidence: CustomerReportEvidenceItem[];
  projectId: string;
  evidenceCutoffAt: string;
  rankingProofMaxAgeDays?: number;
}): CustomerReportClaimEligibilityDecision {
  const evidenceByKey = new Map(input.evidence.map((item) => [item.evidenceKey, item]));
  const selectedEvidence = input.claim.evidenceKeys.flatMap((key) => {
    const item = evidenceByKey.get(key);
    return item ? [item] : [];
  });
  const issues = new Set<CustomerReportClaimEligibilityIssue>();
  const cutoff = Date.parse(input.evidenceCutoffAt);

  if (selectedEvidence.length !== input.claim.evidenceKeys.length) {
    issues.add("missing_evidence");
  }

  for (const evidence of selectedEvidence) {
    if (evidence.projectId !== input.projectId) {
      issues.add("cross_project_evidence");
    }

    if (
      Date.parse(evidence.observedAt) > cutoff ||
      Date.parse(evidenceEffectiveAt(evidence)) > cutoff ||
      Date.parse(evidence.selectedAtCutoff) !== cutoff
    ) {
      issues.add("evidence_cutoff_mismatch");
    }

    if (!evidenceKindMatchesClaim(input.claim, evidence)) {
      issues.add("evidence_kind_mismatch");
      continue;
    }

    if (!evidenceValueMatchesClaim(input.claim, evidence)) {
      issues.add("evidence_value_mismatch");
    }

    const requiredProofTier = input.claim.kind === "future_opportunity" ? "supporting_context" : "customer_safe_proof";
    if (evidence.proofTier !== requiredProofTier) {
      issues.add("proof_tier_too_weak");
    }

    if (evidence.sourceKind === "ranking_proof") {
      const maxAgeDays = input.rankingProofMaxAgeDays ?? customerReportRankingProofMaxAgeDays;
      const ageMs = cutoff - Date.parse(evidence.observedAt);
      if (ageMs < 0 || ageMs > maxAgeDays * 24 * 60 * 60 * 1_000) {
        issues.add("stale_ranking_proof");
      }
    }
  }

  if (input.claim.kind === "ranking_result" && rankingMilestoneForRank(input.claim.rank) !== input.claim.milestone) {
    issues.add("ranking_milestone_mismatch");
  }

  if (input.claim.kind === "rollback_correction") {
    const selectedKinds = new Set(selectedEvidence.map((evidence) => evidence.sourceKind));
    if (!selectedKinds.has("rollback") || !selectedKinds.has("release_verification")) {
      issues.add("missing_required_evidence_kind");
    }
  }

  return issues.size > 0
    ? { kind: "ineligible", issues: [...issues].sort() }
    : { kind: "eligible", evidence: selectedEvidence };
}

export function decideCustomerReportActionAvailability(
  reportStatus: CustomerReportStatus,
  action: CustomerReportNavigationRef
): CustomerReportActionAvailability {
  if (reportStatus === "published") {
    return { kind: "available", action };
  }

  if (reportStatus === "superseded") {
    return { kind: "view_only", reason: "superseded_report" };
  }

  return { kind: "unavailable", reason: "report_not_published" };
}

export function rankingMilestoneForRank(
  rank: number
): Extract<CustomerReportClaim, { kind: "ranking_result" }>["milestone"] | undefined {
  if (!Number.isSafeInteger(rank) || rank < 1 || rank > 10) {
    return undefined;
  }
  if (rank === 1) return "rank_1";
  if (rank === 2) return "rank_2";
  if (rank === 3) return "top_3";
  if (rank <= 5) return "top_5";
  return "top_10";
}

export function summarizeCustomerReportClaims(claims: CustomerReportClaim[]): {
  provenRankingResultCount: number;
  futureOpportunityCount: number;
} {
  return {
    provenRankingResultCount: claims.filter((claim) => claim.kind === "ranking_result").length,
    futureOpportunityCount: claims.filter((claim) => claim.kind === "future_opportunity").length
  };
}

function compareReportClaims(left: CustomerReportClaim, right: CustomerReportClaim): number {
  return (
    reportSectionOrder[left.section] - reportSectionOrder[right.section] ||
    compareStableText(left.claimKey, right.claimKey)
  );
}

function compareStableText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function serializeCanonicalJson(value: unknown): string {
  const result = canonicalize(value);
  if (result === undefined) {
    throw new TypeError("Customer report canonicalization produced no JSON value.");
  }
  return result;
}

function evidenceKindMatchesClaim(claim: CustomerReportClaim, evidence: CustomerReportEvidenceItem): boolean {
  if (claim.kind === "rollback_correction") {
    return evidence.sourceKind === "rollback" || evidence.sourceKind === "release_verification";
  }

  const expectedKindByClaim = {
    ranking_result: "ranking_proof",
    page_delivery: "page_version",
    provider_handoff: "deployment",
    live_health: "release_verification",
    release_warning: "release_verification_check",
    future_opportunity: "opportunity"
  } as const satisfies Record<
    Exclude<CustomerReportClaim["kind"], "rollback_correction">,
    CustomerReportEvidenceItem["sourceKind"]
  >;

  return evidence.sourceKind === expectedKindByClaim[claim.kind];
}

function evidenceValueMatchesClaim(claim: CustomerReportClaim, evidence: CustomerReportEvidenceItem): boolean {
  switch (claim.kind) {
    case "ranking_result":
      return (
        evidence.sourceKind === "ranking_proof" &&
        evidence.query === claim.query &&
        evidence.pageUrl === claim.pageUrl &&
        evidence.rank === claim.rank
      );
    case "page_delivery":
      return (
        evidence.sourceKind === "page_version" &&
        evidence.pageVersionId === claim.pageVersionId &&
        evidence.route === claim.route &&
        evidence.versionNumber === claim.versionNumber &&
        (claim.deliveryState === "approved_content" || ["released", "superseded"].includes(evidence.status))
      );
    case "provider_handoff":
      return (
        evidence.sourceKind === "deployment" &&
        evidence.deploymentId === claim.deploymentId &&
        evidence.provider === claim.provider &&
        evidence.handedOffAt === claim.handedOffAt
      );
    case "live_health":
      return (
        evidence.sourceKind === "release_verification" &&
        evidence.verificationId === claim.verificationId &&
        evidence.deploymentId === claim.deploymentId &&
        evidence.status === claim.health &&
        evidence.checkedAt === claim.checkedAt
      );
    case "release_warning":
      return (
        evidence.sourceKind === "release_verification_check" &&
        evidence.verificationId === claim.verificationId &&
        evidence.checkKey === claim.checkKey &&
        evidence.summary === claim.summary
      );
    case "rollback_correction":
      if (evidence.sourceKind === "rollback") {
        return (
          evidence.rollbackPointId === claim.rollbackPointId &&
          evidence.deploymentId === claim.deploymentId &&
          evidence.rolledBackAt === claim.occurredAt
        );
      }
      return (
        evidence.sourceKind === "release_verification" &&
        evidence.verificationId === claim.verificationId &&
        evidence.deploymentId === claim.deploymentId &&
        evidence.checkedAt === claim.verifiedAt
      );
    case "future_opportunity":
      return (
        evidence.sourceKind === "opportunity" &&
        evidence.opportunityId === claim.opportunityId &&
        evidence.title === claim.title
      );
  }
}

function evidenceEffectiveAt(evidence: CustomerReportEvidenceItem): string {
  switch (evidence.sourceKind) {
    case "page_version":
      return evidence.approvedAt;
    case "deployment":
      return evidence.handedOffAt;
    case "release_verification":
    case "release_verification_check":
      return evidence.checkedAt;
    case "rollback":
      return evidence.rolledBackAt;
    case "ranking_proof":
    case "opportunity":
      return evidence.observedAt;
  }
}
