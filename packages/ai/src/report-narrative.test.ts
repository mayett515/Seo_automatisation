import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateCustomerReportNarrative } from "./report-narrative.js";

const packet = {
  schemaVersion: "customer_report_narrative_packet.v1" as const,
  projectId: "11111111-1111-4111-8111-111111111111",
  reportId: "22222222-2222-4222-8222-222222222222",
  generationRunId: "33333333-3333-4333-8333-333333333333",
  locale: "de-DE" as const,
  period: "2026-07",
  factProjectionSha256: "a".repeat(64),
  slots: [
    {
      slotKey: "heading:ranking_results",
      kind: "heading" as const,
      section: "ranking_results" as const,
      sectionLabel: "Ranking-Ergebnisse",
      supportingClaims: []
    },
    {
      slotKey: "transition:ranking_results:01",
      kind: "transition" as const,
      section: "ranking_results" as const,
      sectionLabel: "Ranking-Ergebnisse",
      supportingClaims: [
        { claimKey: "ranking:one", kind: "ranking_result" as const, summary: "Ein geprueftes Ergebnis liegt vor." }
      ]
    }
  ]
};

void describe("customer report narrative QA", () => {
  void it("attributes server-owned slot metadata after strict model output", () => {
    const result = evaluateCustomerReportNarrative({
      packet,
      output: {
        schemaVersion: "customer_report_narrative_draft.v1",
        fragments: [
          { slotKey: "heading:ranking_results", text: "Gepruefte Sichtbarkeit" },
          { slotKey: "transition:ranking_results:01", text: "Die geprueften Ergebnisse geben einen klaren Ueberblick." }
        ]
      }
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.fragments[1]?.supportingClaimKeys, ["ranking:one"]);
    assert.equal(result.fragments[1]?.kind, "transition");
  });

  void it("rejects missing slots, factual tokens, markup, and unsupported promises", () => {
    const outputs = [
      [{ slotKey: "heading:ranking_results", text: "Gepruefte Sichtbarkeit" }],
      [
        { slotKey: "heading:ranking_results", text: "Top 3 Ergebnisse" },
        { slotKey: "transition:ranking_results:01", text: "Solide Einordnung" }
      ],
      [
        { slotKey: "heading:ranking_results", text: "<strong>Sichtbarkeit</strong>" },
        { slotKey: "transition:ranking_results:01", text: "Solide Einordnung" }
      ],
      [
        { slotKey: "heading:ranking_results", text: "**Wichtig**" },
        { slotKey: "transition:ranking_results:01", text: "Solide Einordnung" }
      ],
      [
        { slotKey: "heading:ranking_results", text: "Gepruefte Sichtbarkeit" },
        { slotKey: "transition:ranking_results:01", text: "Das fuehrt zu mehr Umsatz." }
      ]
    ];
    for (const fragments of outputs) {
      const result = evaluateCustomerReportNarrative({
        packet,
        output: { schemaVersion: "customer_report_narrative_draft.v1", fragments }
      });
      assert.equal(result.ok, false);
    }
  });
});
