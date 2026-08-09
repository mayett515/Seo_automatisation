import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OpportunityResearchJobDataSchema,
  OpportunityResearchWorkflowOutputSchema,
  type OpportunityResearchWorkflowOutput
} from "@localseo/contracts";
import { opportunityResearchPromotionFixtureCorpus, opportunityResearchPromotionFixtureSetVersion } from "@localseo/ai";
import type { OpportunityResearchMaterial } from "@localseo/db";
import {
  finalizeOpportunityResearchOutput,
  OpportunityResearchQaError,
  opportunityResearchCandidateId
} from "./opportunity-research.js";

const promotionBase = opportunityResearchPromotionFixtureCorpus.base;
const projectId = promotionBase.projectId;
const runId = promotionBase.runId;

void describe("Opportunity Research candidate identity", () => {
  void it("derives a stable run-scoped UUID from canonical candidate content", () => {
    const input = {
      runId: "11111111-1111-4111-8111-111111111111",
      candidateKey: "service:area:keyword",
      candidate: { area: "Dachau", service: "Dachreinigung", evidenceKeys: ["proof:1"] }
    };

    const first = opportunityResearchCandidateId(input);
    const reordered = opportunityResearchCandidateId({
      ...input,
      candidate: { evidenceKeys: ["proof:1"], service: "Dachreinigung", area: "Dachau" }
    });
    const changed = opportunityResearchCandidateId({
      ...input,
      candidate: { ...input.candidate, area: "Muenchen" }
    });

    assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    assert.equal(reordered, first);
    assert.notEqual(changed, first);
  });
});

void describe(`Opportunity Research promotion corpus ${opportunityResearchPromotionFixtureSetVersion}`, () => {
  for (const fixture of opportunityResearchPromotionFixtureCorpus.cases) {
    void it(fixture.fixtureKey, () => {
      const execute = () =>
        finalizeOpportunityResearchOutput(material(fixture), output(fixture.candidateOverrides), jobData());

      if (fixture.expected.kind === "rejected") {
        const messageIncludes = fixture.expected.messageIncludes;
        assert.throws(
          execute,
          (error: unknown) => error instanceof OpportunityResearchQaError && error.message.includes(messageIncludes)
        );
        return;
      }

      const result = execute();
      assert.equal(result.candidates.length, 1);
      const candidate = result.candidates[0];
      assert.ok(candidate);
      if ("rankingMilestone" in fixture.expected) {
        assert.equal(candidate.rankingMilestone, fixture.expected.rankingMilestone);
        assert.equal(candidate.evidenceReadiness, fixture.expected.evidenceReadiness);
      }
      if ("candidateKey" in fixture.expected) {
        assert.equal(candidate.candidateKey, fixture.expected.candidateKey);
        assert.equal(candidate.lane, fixture.expected.lane);
      }
    });
  }
});

function jobData() {
  return OpportunityResearchJobDataSchema.parse({
    projectId,
    runId,
    materialDigest: "a".repeat(64),
    triggerSource: "user_action",
    jobRunId: "66666666-6666-4666-8666-666666666666",
    maxAttempts: 3
  });
}

function material(
  fixture: (typeof opportunityResearchPromotionFixtureCorpus.cases)[number]
): OpportunityResearchMaterial {
  const evidenceSources: OpportunityResearchMaterial["evidenceSources"] = [
    ...(fixture.useBaseEvidenceSource ? [promotionBase.evidenceSource] : []),
    ...fixture.evidenceSources
  ].map((source) => ({ ...source }));
  return {
    projectId,
    materialDigest: "a".repeat(64),
    readinessIssues: [],
    initialQueries: [promotionBase.candidate.primaryKeyword],
    evidencePacket: {
      services: [{ ...promotionBase.service }],
      areas: [{ ...promotionBase.area }],
      rankingProofs: [],
      existingRoutes: [...fixture.existingRoutes]
    },
    evidenceSources,
    sourceVersions: evidenceSources.map((entry) => entry.sourceVersion),
    paused: false,
    packetBytes: 1
  };
}

function output(overrides: Readonly<Record<string, unknown>>): OpportunityResearchWorkflowOutput {
  const candidate = { ...promotionBase.candidate, ...overrides };
  const evidenceKeys = isStringArray(overrides.evidenceKeys)
    ? [...overrides.evidenceKeys]
    : [...promotionBase.candidate.evidenceKeys];
  return OpportunityResearchWorkflowOutputSchema.parse({
    captures: [],
    research: {
      followUpQueries: [],
      findings: [{ findingKey: "local-demand", summary: "Local intent is supported.", evidenceKeys }]
    },
    candidates: [{ ...candidate, evidenceKeys }]
  });
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry: unknown) => typeof entry === "string");
}
