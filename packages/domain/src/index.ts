import type { ReleaseCheck, ReleasePlan } from "@localseo/contracts";

export type DeployDecision =
  | { kind: "blocked"; blockerCount: number; warnings: ReleaseCheck[] }
  | { kind: "ready"; warnings: ReleaseCheck[] }
  | { kind: "ready_with_warnings"; warnings: ReleaseCheck[] };

export function decideReleaseReadiness(checks: ReleaseCheck[]): DeployDecision {
  const blockers = checks.filter((check) => check.severity === "blocker" && check.result === "failed");
  const warnings = checks.filter((check) => check.severity === "warning" && check.result === "failed");

  if (blockers.length > 0) {
    return { kind: "blocked", blockerCount: blockers.length, warnings };
  }

  if (warnings.length > 0) {
    return { kind: "ready_with_warnings", warnings };
  }

  return { kind: "ready", warnings: [] };
}

export function canDeployRelease(plan: ReleasePlan, checks: ReleaseCheck[]): boolean {
  const readiness = decideReleaseReadiness(checks);
  return plan.status === "approved_for_deploy" && readiness.kind !== "blocked";
}

export type LocalRouteStrategy = "local_page" | "subdomain" | "backlog";

export function chooseLocalRouteStrategy(input: {
  marketSize: "small" | "medium" | "large";
  contentDepth: "thin" | "adequate" | "strong";
  hasUniqueLocalProof: boolean;
}): LocalRouteStrategy {
  if (!input.hasUniqueLocalProof || input.contentDepth === "thin") {
    return "backlog";
  }

  if (input.marketSize === "large" && input.contentDepth === "strong") {
    return "subdomain";
  }

  return "local_page";
}

export type RankingProofTier = "customer_proof" | "internal_roadmap" | "internal_radar";

export function classifyRankingProof(input: {
  isTop10: boolean;
  isTop5: boolean;
  isTop3: boolean;
  isPositionOne: boolean;
}): RankingProofTier {
  if (input.isTop10 || input.isTop5 || input.isTop3 || input.isPositionOne) {
    return "customer_proof";
  }

  return "internal_radar";
}

