import assert from "node:assert/strict";
import test from "node:test";
import { OpportunityScoutOutputSchema, type OpportunityScoutOutput } from "@localseo/contracts";
import { buildOpportunityScoutEvidencePacket, evaluateOpportunityScoutOutput, scoreOpportunityBrief } from "./index.js";

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

void test("accepts proven_win only when the brief carries customer-safe ranking proof", () => {
  const output = validOutput({
    classification: "proven_win",
    recommendedAction: "monitor",
    evidence: [rankingProofEvidence()]
  });

  const result = evaluateOpportunityScoutOutput({
    projectId,
    output,
    resolvableEvidence: [
      { sourceType: "gsc_row", sourceId: "gsc-row-1" },
      { sourceType: "ranking_proof", sourceId: "rank-1" }
    ]
  });

  assert.equal(result.ok, true);
});

void test("does not let output-level group evidence satisfy proven_win proof gate", () => {
  const output = OpportunityScoutOutputSchema.parse({
    briefs: [
      baseBrief({
        classification: "proven_win",
        recommendedAction: "monitor"
      })
    ],
    groups: [
      {
        key: "global:other-ranking-proof",
        label: "Other ranking proof",
        source: "agent_suggested",
        evidence: [rankingProofEvidence()]
      }
    ]
  });

  const result = evaluateOpportunityScoutOutput({
    projectId,
    output,
    resolvableEvidence: [
      { sourceType: "gsc_row", sourceId: "gsc-row-1" },
      { sourceType: "ranking_proof", sourceId: "rank-1" }
    ]
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.failure.gateId, "proof_gate");
});

void test("does not let brief group evidence satisfy proven_win proof gate", () => {
  const output = OpportunityScoutOutputSchema.parse({
    briefs: [
      baseBrief({
        classification: "proven_win",
        recommendedAction: "monitor",
        groupHints: [
          {
            key: "brief-group:other-ranking-proof",
            label: "Brief-level unrelated ranking proof",
            source: "agent_suggested",
            evidence: [rankingProofEvidence()]
          }
        ]
      })
    ],
    groups: []
  });

  const result = evaluateOpportunityScoutOutput({
    projectId,
    output,
    resolvableEvidence: [
      { sourceType: "gsc_row", sourceId: "gsc-row-1" },
      { sourceType: "ranking_proof", sourceId: "rank-1" }
    ]
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.failure.gateId, "proof_gate");
});

void test("does not let location evidence satisfy proven_win proof gate", () => {
  const output = OpportunityScoutOutputSchema.parse({
    briefs: [
      baseBrief({
        classification: "proven_win",
        recommendedAction: "monitor",
        location: {
          name: "Dachau",
          kind: "city",
          adjacencyReason: "gsc_testing_signal",
          existingClusterStrength: "medium",
          mapGroupKey: "dachau-south",
          evidence: [rankingProofEvidence()]
        }
      })
    ],
    groups: []
  });

  const result = evaluateOpportunityScoutOutput({
    projectId,
    output,
    resolvableEvidence: [
      { sourceType: "gsc_row", sourceId: "gsc-row-1" },
      { sourceType: "ranking_proof", sourceId: "rank-1" }
    ]
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

void test("rejects briefs for a different project", () => {
  const result = evaluateOpportunityScoutOutput({
    projectId,
    output: validOutput({ projectId: "other-project" }),
    resolvableEvidence: [{ sourceType: "gsc_row", sourceId: "gsc-row-1" }]
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.failure.gateId, "project_scope");
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

void test("rejects create actions without uniqueness and hub-spoke evidence", () => {
  const result = evaluateOpportunityScoutOutput({
    projectId,
    output: validOutput({
      recommendedAction: "create_brief",
      uniquenessRationale: undefined,
      hubSpokeRole: undefined
    }),
    resolvableEvidence: [{ sourceType: "gsc_row", sourceId: "gsc-row-1" }]
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.failure.gateId, "uniqueness_gate");
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

void test("rejects verbatim competitor evidence copied into generated opportunity text", () => {
  const copiedExcerpt =
    "This competitor page repeats a highly specific service description about attic clear-outs, disposal logistics, estate cleanups, and same-week apartment handovers in Dachau.";
  const result = evaluateOpportunityScoutOutput({
    projectId,
    output: validOutput({
      uniquenessRationale: copiedExcerpt,
      evidence: [
        {
          sourceType: "gsc_row",
          sourceId: "gsc-row-1",
          summary: "GSC shows Dachau search testing.",
          strength: "medium",
          proofTier: "internal_signal"
        },
        {
          sourceType: "competitor_snapshot",
          sourceId: "competitor-1",
          summary: "Competitor page content excerpt.",
          excerpt: copiedExcerpt,
          strength: "medium",
          proofTier: "supporting_context"
        }
      ]
    }),
    resolvableEvidence: [
      { sourceType: "gsc_row", sourceId: "gsc-row-1" },
      { sourceType: "competitor_snapshot", sourceId: "competitor-1" }
    ]
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.failure.gateId, "competitor_containment");
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

void test("does not let model confidence change deterministic score", () => {
  assert.equal(
    scoreOpportunityBrief(baseBrief({ confidence: 0 })),
    scoreOpportunityBrief(baseBrief({ confidence: 1 }))
  );
});

void test("lowers deterministic score for higher cannibalization risk", () => {
  assert.ok(
    scoreOpportunityBrief(baseBrief({ cannibalizationRisk: { level: "none", conflictingRoutes: [] } })) >
      scoreOpportunityBrief(
        baseBrief({ cannibalizationRisk: { level: "high", conflictingRoutes: ["/entruempelung/"] } })
      )
  );
});

void test("buildOpportunityScoutEvidencePacket uses stable ordering for audit artifacts", () => {
  const first = buildOpportunityScoutEvidencePacket({
    projectId,
    generatedAt: "2026-07-03T00:00:00.000Z",
    gsc: {
      rows: [
        { sourceId: "row-2", query: "b", pageUrl: "https://example.test/b" },
        { sourceId: "row-1", query: "a", pageUrl: "https://example.test/a" }
      ],
      signals: [
        { sourceId: "signal-2", signalType: "positions_11_100", query: "b" },
        { sourceId: "signal-1", signalType: "impressions_no_clicks", query: "a" }
      ]
    },
    tracking: {
      recentEvents: [
        { occurredAt: "2026-07-03T00:00:02.000Z", eventName: "cta_click", route: "/b" },
        { occurredAt: "2026-07-03T00:00:01.000Z", eventName: "page_view", route: "/a" }
      ]
    },
    existingRoutes: ["/b", "/a"],
    existingOpportunityKeys: ["b", "a"]
  });

  const second = buildOpportunityScoutEvidencePacket({
    projectId,
    generatedAt: "2026-07-03T00:00:00.000Z",
    gsc: {
      rows: [...first.gsc.rows].reverse(),
      signals: [...first.gsc.signals].reverse()
    },
    tracking: {
      recentEvents: [...first.tracking.recentEvents].reverse()
    },
    existingRoutes: [...first.existingRoutes].reverse(),
    existingOpportunityKeys: [...first.existingOpportunityKeys].reverse()
  });

  assert.deepEqual(second, first);
});

function rankingProofEvidence(): OpportunityScoutOutput["briefs"][number]["evidence"][number] {
  return {
    sourceType: "ranking_proof",
    sourceId: "rank-1",
    locator: {
      query: "entruempelung dachau",
      pageUrl: "https://customer.example/entruempelung-dachau/"
    },
    summary: "Manual SERP proof shows the Dachau page in the Top 10.",
    observedMetric: { name: "rank", value: 4 },
    strength: "strong",
    proofTier: "customer_safe_proof"
  };
}

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
