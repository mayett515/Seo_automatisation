import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOpportunityResearchQuerySeeds,
  canonicalizeOpportunityResearchMaterial,
  decideAgentRunStepTransition,
  decideKnowledgeRetirement,
  decideKnowledgeReview,
  decideRankingProofTransition,
  deriveOpportunityLane,
  opportunityEvidenceReadinessForSources,
  opportunityResearchReadinessIssues,
  opportunityRankingMilestoneForRank,
  prepareOpportunityPortfolio,
  selectOpportunityPortfolio
} from "./opportunity-research.js";

void describe("opportunity research domain", () => {
  void it("keeps exact ranking and evidence readiness source-owned", () => {
    assert.equal(opportunityRankingMilestoneForRank(undefined), "unverified");
    assert.equal(opportunityRankingMilestoneForRank(1), "rank_1");
    assert.equal(opportunityRankingMilestoneForRank(7), "top_10");
    assert.equal(opportunityRankingMilestoneForRank(18), "outside_top_10");
    assert.equal(
      opportunityEvidenceReadinessForSources({ hasReviewedRankingProof: false, hasSupportingContext: true }),
      "supporting_context"
    );
  });

  void it("derives lanes without a magic score", () => {
    assert.equal(
      deriveOpportunityLane({
        rankingMilestone: "top_5",
        evidenceReadiness: "reviewed_proof",
        businessValue: "medium",
        marketDifficulty: "medium",
        executionEffort: "low"
      }),
      "defend_advance"
    );
    assert.equal(
      deriveOpportunityLane({
        rankingMilestone: "unverified",
        evidenceReadiness: "supporting_context",
        businessValue: "high",
        marketDifficulty: "low",
        executionEffort: "medium"
      }),
      "quick_win"
    );
  });

  void it("allocates fixed 2/4/2 portfolio slots without cross-filling", () => {
    const candidate = (id: string, lane: "defend_advance" | "quick_win" | "build_cluster" | "strategic_market") => ({
      id,
      stableKey: id,
      axes: {
        rankingMilestone: lane === "defend_advance" ? ("top_10" as const) : ("unverified" as const),
        evidenceReadiness: "supporting_context" as const,
        businessValue: "high" as const,
        marketDifficulty: lane === "strategic_market" ? ("high" as const) : ("low" as const),
        executionEffort: "medium" as const,
        lane
      }
    });
    const result = selectOpportunityPortfolio([
      candidate("d1", "defend_advance"),
      candidate("q1", "quick_win"),
      candidate("q2", "quick_win"),
      candidate("q3", "build_cluster"),
      candidate("q4", "build_cluster"),
      candidate("q5", "quick_win")
    ]);
    assert.deepEqual(
      result.selected.map((entry) => entry.id),
      ["d1", "q1", "q2", "q3", "q4"]
    );
    assert.deepEqual(result.shortfalls, { defendAdvance: 1, quickBuild: 0, strategic: 2 });
  });

  void it("selects the same portfolio across input permutations and conflicting duplicate keys", () => {
    const lowEvidence = {
      id: "candidate-low",
      stableKey: "service:area:keyword",
      axes: {
        rankingMilestone: "outside_top_10" as const,
        evidenceReadiness: "internal_signal" as const,
        businessValue: "medium" as const,
        marketDifficulty: "medium" as const,
        executionEffort: "medium" as const,
        lane: "build_cluster" as const
      }
    };
    const reviewed = {
      id: "candidate-reviewed",
      stableKey: "service:area:keyword",
      axes: {
        rankingMilestone: "unverified" as const,
        evidenceReadiness: "reviewed_proof" as const,
        businessValue: "medium" as const,
        marketDifficulty: "medium" as const,
        executionEffort: "medium" as const,
        lane: "build_cluster" as const
      }
    };
    const other = {
      id: "candidate-other",
      stableKey: "service:area:other",
      axes: {
        rankingMilestone: "unverified" as const,
        evidenceReadiness: "supporting_context" as const,
        businessValue: "high" as const,
        marketDifficulty: "low" as const,
        executionEffort: "low" as const,
        lane: "quick_win" as const
      }
    };

    const forward = selectOpportunityPortfolio([lowEvidence, other, reviewed]);
    const reversed = selectOpportunityPortfolio([reviewed, other, lowEvidence]);
    assert.deepEqual(forward, reversed);
    assert.deepEqual(
      forward.selected.map((entry) => entry.id),
      ["candidate-reviewed", "candidate-other"]
    );
  });

  void it("removes project-wide and same-run duplicates before allocating the 2/4/2 portfolio", () => {
    const candidate = (
      id: string,
      stableKey: string,
      lane: "defend_advance" | "quick_win" | "build_cluster" | "strategic_market"
    ) => ({
      id,
      stableKey,
      axes: {
        rankingMilestone: lane === "defend_advance" ? ("top_10" as const) : ("unverified" as const),
        evidenceReadiness: "supporting_context" as const,
        businessValue: "high" as const,
        marketDifficulty: lane === "strategic_market" ? ("high" as const) : ("low" as const),
        executionEffort: "medium" as const,
        lane
      }
    });
    const prepared = prepareOpportunityPortfolio(
      [
        candidate("existing", "existing-defend", "defend_advance"),
        candidate("d1", "d1", "defend_advance"),
        candidate("d2", "d2", "defend_advance"),
        candidate("q1-low", "q1", "quick_win"),
        candidate("q1", "q1", "quick_win"),
        candidate("q2", "q2", "quick_win"),
        candidate("q3", "q3", "build_cluster"),
        candidate("q4", "q4", "build_cluster"),
        candidate("s1", "s1", "strategic_market"),
        candidate("s2", "s2", "strategic_market")
      ],
      new Set(["existing-defend"])
    );

    assert.equal(prepared.candidates.length, 8);
    assert.equal(
      prepared.candidates.some((entry) => entry.stableKey === "existing-defend"),
      false
    );
    assert.equal(prepared.candidates.filter((entry) => entry.stableKey === "q1").length, 1);
    assert.equal(prepared.selection.selected.length, 8);
    assert.deepEqual(prepared.selection.shortfalls, { defendAdvance: 0, quickBuild: 0, strategic: 0 });
  });

  void it("fails closed on invalid lifecycle transitions", () => {
    assert.deepEqual(
      decideAgentRunStepTransition({ currentStatus: "failed", nextStatus: "running", attemptCount: 3, maxAttempts: 3 }),
      { kind: "deny", reason: "attempts_exhausted" }
    );
    assert.deepEqual(decideRankingProofTransition({ currentStatus: "captured", nextStatus: "invalidated" }), {
      kind: "deny",
      reason: "invalid_transition"
    });
    assert.deepEqual(
      decideAgentRunStepTransition({ currentStatus: "pending", nextStatus: "failed", attemptCount: 0, maxAttempts: 3 }),
      { kind: "allow", nextAttemptCount: 0 }
    );
    assert.deepEqual(
      decideKnowledgeReview({
        currentStatus: "proposed",
        expectedStatus: "proposed",
        currentModelUsePolicy: "operator_only",
        expectedModelUsePolicy: "operator_only",
        decision: "reject",
        sourceKind: "human"
      }),
      { kind: "deny", reason: "rejection_reason_required" }
    );
    assert.deepEqual(
      decideKnowledgeReview({
        currentStatus: "proposed",
        expectedStatus: "proposed",
        currentModelUsePolicy: "model_allowed",
        expectedModelUsePolicy: "operator_only",
        decision: "approve",
        sourceKind: "human",
        actorUserId: "operator"
      }),
      { kind: "deny", reason: "stale_model_use_policy" }
    );
    assert.deepEqual(
      decideKnowledgeRetirement({
        currentApprovedVersionId: "version-2",
        expectedCurrentApprovedVersionId: "version-1",
        retiredAt: null
      }),
      { kind: "deny", reason: "stale_current_version" }
    );
  });

  void it("reports readiness gaps and builds bounded deterministic query seeds", () => {
    assert.deepEqual(
      opportunityResearchReadinessIssues({
        profileConfirmed: false,
        confirmedServiceCount: 0,
        confirmedAreaCount: 1,
        eligibleSourceCount: 0,
        paused: false
      }),
      ["business_profile_unconfirmed", "confirmed_service_required", "eligible_source_required"]
    );
    assert.deepEqual(
      buildOpportunityResearchQuerySeeds({
        services: ["Reinigung"],
        areas: ["Berlin"],
        gscQueries: ["reinigung berlin", "Bueroreinigung Berlin"],
        knowledgeQueries: ["Hausmeister Berlin"]
      }),
      ["Reinigung Berlin", "Bueroreinigung Berlin", "Hausmeister Berlin"]
    );
  });

  void it("binds exact model packet bytes and query seeds into material identity", () => {
    const base = {
      profileRevisionId: "00000000-0000-4000-8000-000000000001",
      serviceIds: ["00000000-0000-4000-8000-000000000002"],
      areaIds: ["00000000-0000-4000-8000-000000000003"],
      sourceVersions: ["source:1"],
      evidencePacketSha256: "2".repeat(64),
      initialQueries: ["cleaning dachau"]
    };
    const canonical = canonicalizeOpportunityResearchMaterial(base);
    assert.notEqual(
      canonical,
      canonicalizeOpportunityResearchMaterial({ ...base, evidencePacketSha256: "3".repeat(64) })
    );
    assert.notEqual(
      canonical,
      canonicalizeOpportunityResearchMaterial({ ...base, initialQueries: ["office cleaning dachau"] })
    );
  });
});
