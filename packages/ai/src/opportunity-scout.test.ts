import assert from "node:assert/strict";
import test from "node:test";
import { evidenceSourceTypes, OpportunityScoutOutputSchema, type OpportunityScoutOutput } from "@localseo/contracts";
import {
  buildOpportunityScoutEvidencePacket,
  buildOpportunityScoutPrompt,
  evaluateOpportunityScoutOutput,
  opportunityScoutPromptSections,
  scoreOpportunityBrief
} from "./index.js";

const projectId = "project-1";

void test("buildOpportunityScoutPrompt is sectioned around the product safety rules", () => {
  const prompt = buildOpportunityScoutPrompt();

  assert.deepEqual(
    opportunityScoutPromptSections.map((section) => section.key),
    [
      "role",
      "evidence_and_proof",
      "classification",
      "nearby_orte_corridors",
      "competitor_containment",
      "german_local_examples",
      "output_format"
    ]
  );
  assert.match(prompt, /## Evidence And Proof Rules/u);
  assert.match(prompt, /GSC rows and GSC signals are internal radar only/u);
  assert.match(prompt, /ranking_proof EvidenceRef/u);
  assert.match(prompt, /supporting context only for MVP/u);
  assert.match(prompt, /proven_win only for customer-report-safe ranking facts/u);
  assert.match(prompt, /Entruempelung Dachau/u);
  assert.match(prompt, /Dachdecker Markt Indersdorf/u);
  assert.match(prompt, /Return only JSON matching OpportunityScoutOutput/u);
  assert.match(prompt, /maxBriefs value from the input packet/u);
});

void test("accepts empty-evidence scout output as zero persisted briefs", () => {
  const result = evaluateOpportunityScoutOutput({
    projectId,
    output: OpportunityScoutOutputSchema.parse({ briefs: [], groups: [] }),
    resolvableEvidence: []
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.briefs.length, 0);
});

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
    resolvableEvidence: [{ sourceType: "gsc_row", sourceId: "gsc-row-1" }, rankingProofResolvable()]
  });

  assert.equal(result.ok, true);
});

void test("rejects proven_win when a SERP snapshot claims customer-safe proof", () => {
  const output = validOutput({
    classification: "proven_win",
    recommendedAction: "monitor",
    evidence: [
      {
        sourceType: "serp_snapshot",
        sourceId: "serp-1",
        locator: {
          query: "entruempelung dachau",
          pageUrl: "https://customer.example/entruempelung-dachau/"
        },
        summary: "SERP snapshot shows a Top 10 result.",
        observedMetric: { name: "rank", value: 4 },
        strength: "strong",
        proofTier: "customer_safe_proof"
      }
    ]
  });

  const result = evaluateOpportunityScoutOutput({
    projectId,
    output,
    resolvableEvidence: [
      { sourceType: "gsc_row", sourceId: "gsc-row-1" },
      {
        sourceType: "serp_snapshot",
        sourceId: "serp-1",
        rank: 4,
        query: "entruempelung dachau",
        pageUrl: "https://customer.example/entruempelung-dachau/"
      }
    ]
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.failure.gateId, "proof_tier_containment");
  assert.match(result.failure.message, /only ranking_proof/u);
});

void test("rejects proven_win when claimed rank differs from the cited proof row", () => {
  const output = validOutput({
    classification: "proven_win",
    recommendedAction: "monitor",
    evidence: [rankingProofEvidence({ observedMetric: { name: "rank", value: 3 } })]
  });

  const result = evaluateOpportunityScoutOutput({
    projectId,
    output,
    resolvableEvidence: [{ sourceType: "gsc_row", sourceId: "gsc-row-1" }, rankingProofResolvable({ rank: 45 })]
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.failure.gateId, "proof_gate");
  assert.match(result.failure.message, /rank must match/u);
});

void test("rejects proven_win when proof locator differs from the cited proof row", () => {
  const output = validOutput({
    classification: "proven_win",
    recommendedAction: "monitor",
    evidence: [
      rankingProofEvidence({
        locator: {
          query: "entruempelung petershausen",
          pageUrl: "https://customer.example/entruempelung-dachau/"
        }
      })
    ]
  });

  const result = evaluateOpportunityScoutOutput({
    projectId,
    output,
    resolvableEvidence: [{ sourceType: "gsc_row", sourceId: "gsc-row-1" }, rankingProofResolvable()]
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.failure.gateId, "proof_gate");
  assert.match(result.failure.message, /query must match/u);
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

for (const sourceType of evidenceSourceTypes.filter((sourceType) => sourceType !== "ranking_proof")) {
  void test(`rejects ${sourceType} evidence that claims customer-safe proof`, () => {
    const sourceId = `${sourceType}-1`;
    const output = validOutput({
      evidence: [
        {
          sourceType,
          sourceId,
          summary: `${sourceType} should never become customer-safe proof for MVP.`,
          observedMetric: { name: "rank", value: 4 },
          strength: "strong",
          proofTier: "customer_safe_proof"
        }
      ]
    });

    const result = evaluateOpportunityScoutOutput({
      projectId,
      output,
      resolvableEvidence: [
        { sourceType: "gsc_row", sourceId: "gsc-row-1" },
        { sourceType, sourceId }
      ]
    });

    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }

    assert.equal(result.failure.gateId, "proof_tier_containment");
    assert.match(result.failure.message, /only ranking_proof/u);
  });
}

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

void test("bounds opportunity scout output arrays before QA", () => {
  const result = OpportunityScoutOutputSchema.safeParse({
    briefs: [
      baseBrief({
        secondaryKeywords: Array.from({ length: 16 }, (_, index) => `secondary keyword ${index}`)
      })
    ],
    groups: []
  });

  assert.equal(result.success, false);
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
    maxBriefs: 6,
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
    rankingProofs: [
      { sourceId: "rank-2", query: "b", pageUrl: "https://example.test/b", capturedAt: "2026-07-03T00:00:02.000Z" },
      { sourceId: "rank-1", query: "a", pageUrl: "https://example.test/a", capturedAt: "2026-07-03T00:00:01.000Z" }
    ],
    serpSnapshots: [
      { sourceId: "snapshot-2", query: "b", capturedAt: "2026-07-03T00:00:02.000Z" },
      { sourceId: "snapshot-1", query: "a", capturedAt: "2026-07-03T00:00:01.000Z" }
    ],
    technicalAuditFindings: [
      { sourceId: "finding-2", severity: "warning", route: "/b", checkKey: "metadata.missing_title" },
      { sourceId: "finding-1", severity: "blocker", route: "/a", checkKey: "indexability.noindex" }
    ],
    existingRoutes: ["/b", "/a"],
    existingOpportunityKeys: ["b", "a"]
  });

  const second = buildOpportunityScoutEvidencePacket({
    projectId,
    generatedAt: "2026-07-03T00:00:00.000Z",
    maxBriefs: 6,
    gsc: {
      rows: [...first.gsc.rows].reverse(),
      signals: [...first.gsc.signals].reverse()
    },
    tracking: {
      recentEvents: [...first.tracking.recentEvents].reverse()
    },
    rankingProofs: [...first.rankingProofs].reverse(),
    serpSnapshots: [...first.serpSnapshots].reverse(),
    technicalAuditFindings: [...first.technicalAuditFindings].reverse(),
    existingRoutes: [...first.existingRoutes].reverse(),
    existingOpportunityKeys: [...first.existingOpportunityKeys].reverse()
  });

  assert.deepEqual(second, first);
  assert.equal(first.maxBriefs, 6);
});

function rankingProofEvidence(
  overrides: Partial<OpportunityScoutOutput["briefs"][number]["evidence"][number]> = {}
): OpportunityScoutOutput["briefs"][number]["evidence"][number] {
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
    proofTier: "customer_safe_proof",
    ...overrides
  };
}

function rankingProofResolvable(overrides: { rank?: number; query?: string; pageUrl?: string } = {}) {
  return {
    sourceType: "ranking_proof" as const,
    sourceId: "rank-1",
    rank: 4,
    query: "entruempelung dachau",
    pageUrl: "https://customer.example/entruempelung-dachau/",
    ...overrides
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
