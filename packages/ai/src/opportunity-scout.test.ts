import assert from "node:assert/strict";
import test from "node:test";
import { OpportunityScoutOutputSchema, type OpportunityScoutOutput } from "@localseo/contracts";
import { evaluateOpportunityScoutOutput } from "./index.js";

const projectId = "project-1";

void test("accepts a valid GSC-grouped near-term opportunity and computes score", () => {
  const result = evaluateOpportunityScoutOutput({
    projectId,
    output: validOutput(),
    resolvableEvidence: [
      { sourceType: "gsc_row", sourceId: "gsc-row-1" },
      { sourceType: "serp_snapshot", sourceId: "serp-1" }
    ],
    existingRoutes: ["/kontakt/"]
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.briefs[0]?.groupHints[0]?.source, "gsc_query_cluster");
  assert.equal(result.output.groups[0]?.source, "gsc_query_cluster");
  assert.ok((result.output.briefs[0]?.score ?? 0) > 0);
});

void test("rejects proven_win when only weak GSC evidence exists", () => {
  const output = validOutput({
    classification: "proven_win",
    recommendedAction: "monitor"
  });

  const result = evaluateOpportunityScoutOutput({
    projectId,
    output,
    resolvableEvidence: [{ sourceType: "gsc_row", sourceId: "gsc-row-1" }]
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.failure.gateId, "proof_gate");
});

void test("rejects GSC evidence that claims customer-safe proof", () => {
  const output = validOutput({
    evidence: [
      {
        sourceType: "gsc_row",
        sourceId: "gsc-row-1",
        summary: "GSC showed impressions for entruempelung dachau.",
        observedMetric: { name: "position", value: 8 },
        strength: "strong",
        proofTier: "customer_safe_proof"
      }
    ]
  });

  const result = evaluateOpportunityScoutOutput({
    projectId,
    output,
    resolvableEvidence: [{ sourceType: "gsc_row", sourceId: "gsc-row-1" }]
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.failure.gateId, "gsc_containment");
});

void test("rejects unresolved supporting evidence", () => {
  const output = validOutput({
    evidence: [
      {
        sourceType: "serp_snapshot",
        sourceId: "missing-serp",
        summary: "SERP result showed a weak competitor page.",
        observedMetric: { name: "rank", value: 4 },
        strength: "strong",
        proofTier: "supporting_context"
      }
    ]
  });

  const result = evaluateOpportunityScoutOutput({
    projectId,
    output,
    resolvableEvidence: []
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.failure.gateId, "evidence_resolution");
});

void test("rejects page proposal when the route collides with an existing route", () => {
  const output = validOutput({
    recommendedAction: "create_page_proposal",
    suggestedRoute: "/entruempelung-dachau/",
    uniquenessRationale: "Dedicated Dachau page separates clear-out intent from the generic service hub.",
    hubSpokeRole: "spoke"
  });

  const result = evaluateOpportunityScoutOutput({
    projectId,
    output,
    resolvableEvidence: [{ sourceType: "gsc_row", sourceId: "gsc-row-1" }],
    existingRoutes: ["/entruempelung-dachau"]
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.failure.gateId, "cannibalization_gate");
});

void test("rejects duplicate service-location opportunities in one run", () => {
  const first = baseBrief();
  const second = baseBrief({ primaryKeyword: "dachau entruempelung" });
  const output = OpportunityScoutOutputSchema.parse({ briefs: [first, second], groups: [] });

  const result = evaluateOpportunityScoutOutput({
    projectId,
    output,
    resolvableEvidence: [{ sourceType: "gsc_row", sourceId: "gsc-row-1" }]
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.failure.gateId, "dedupe_gate");
});

function validOutput(overrides: Partial<OpportunityScoutOutput["briefs"][number]> = {}): OpportunityScoutOutput {
  return OpportunityScoutOutputSchema.parse({
    briefs: [baseBrief(overrides)],
    groups: [
      {
        key: "gsc:entruempelung-dachau",
        label: "GSC cluster: Entruempelung Dachau",
        source: "gsc_query_cluster",
        description: "Queries where Google tests the generic clear-out page for Dachau intent.",
        evidence: [
          {
            sourceType: "gsc_row",
            sourceId: "gsc-row-1",
            summary: "Generic clear-out page receives Dachau impressions.",
            strength: "medium",
            proofTier: "internal_signal"
          }
        ]
      }
    ]
  });
}

function baseBrief(
  overrides: Partial<OpportunityScoutOutput["briefs"][number]> = {}
): OpportunityScoutOutput["briefs"][number] {
  return {
    projectId,
    classification: "near_term_target",
    service: "Entruempelung",
    location: {
      name: "Dachau",
      kind: "city",
      adjacencyReason: "gsc_testing_signal",
      existingClusterStrength: "medium",
      mapGroupKey: "dachau-south",
      evidence: []
    },
    primaryKeyword: "entruempelung dachau",
    secondaryKeywords: ["wohnungsaufloesung dachau"],
    suggestedRoute: "/entruempelung-dachau/",
    suggestedPageType: "normal_page",
    evidence: [
      {
        sourceType: "gsc_row",
        sourceId: "gsc-row-1",
        summary: "GSC shows the generic clear-out page receiving Dachau impressions.",
        observedMetric: { name: "impressions", value: 28 },
        strength: "medium",
        proofTier: "internal_signal"
      }
    ],
    competitorObservations: [
      {
        url: "https://example.com/entruempelung-dachau/",
        observation: "Competitor page is thin and lacks Dachau-specific disposal context.",
        gap: "Add stronger local logistics and service proof."
      }
    ],
    corridorCluster: {
      name: "Dachau south",
      hubPlace: "Dachau",
      places: ["Dachau", "Karlsfeld", "Hebertshausen"],
      rationale: "Adjacent high-intent places near the existing service area.",
      clusterStrength: "medium",
      recommendedSequence: ["Dachau", "Karlsfeld", "Hebertshausen"]
    },
    groupHints: [
      {
        key: "gsc:entruempelung-dachau",
        label: "GSC cluster: Entruempelung Dachau",
        source: "gsc_query_cluster",
        evidence: [
          {
            sourceType: "gsc_row",
            sourceId: "gsc-row-1",
            summary: "Same GSC query group supports this opportunity.",
            strength: "medium",
            proofTier: "internal_signal"
          }
        ]
      }
    ],
    hubSpokeRole: "spoke",
    uniquenessRationale: "Dedicated Dachau page separates local clear-out intent from the generic service hub.",
    cannibalizationRisk: { level: "low", conflictingRoutes: ["/entruempelung/"] },
    missingEvidence: ["Manual SERP check", "Customer project proof"],
    confidence: 0.67,
    recommendedAction: "create_brief",
    ...overrides
  };
}
