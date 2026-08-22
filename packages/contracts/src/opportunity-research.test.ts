import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CreateProjectKnowledgeVersionRequestSchema,
  opportunityResearchFailureCodes,
  OpportunityResearchFailureCodeSchema,
  OpportunityResearchEnqueueDataSchema,
  OpportunityResearchJobDataSchema,
  PublicWebSearchCaptureSchema
} from "./opportunity-research.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const jobRunId = "33333333-3333-4333-8333-333333333333";
const materialDigest = "a".repeat(64);

void describe("Opportunity Research transport contracts", () => {
  void it("accepts every stable operator-visible Opportunity Research failure code", () => {
    for (const code of opportunityResearchFailureCodes) {
      assert.equal(OpportunityResearchFailureCodeSchema.parse(code), code);
    }
  });

  void it("rejects Markdown that fits the character cap but exceeds the UTF-8 byte budget", () => {
    const parsed = CreateProjectKnowledgeVersionRequestSchema.safeParse({
      documentKey: "business.utf8-budget",
      title: "UTF-8 budget",
      bodyMarkdown: "ä".repeat(25_001),
      taskScopes: ["opportunity_research"],
      sourceKind: "human"
    });

    assert.equal(parsed.success, false);
  });

  void it("separates pre-audit enqueue data from worker-deliverable job identity", () => {
    const enqueueData = {
      projectId,
      runId,
      materialDigest,
      triggerSource: "user_action" as const,
      requestedByUserId: projectId
    };

    assert.equal(OpportunityResearchEnqueueDataSchema.safeParse(enqueueData).success, true);
    assert.equal(OpportunityResearchJobDataSchema.safeParse(enqueueData).success, false);
    assert.equal(OpportunityResearchJobDataSchema.safeParse({ ...enqueueData, jobRunId }).success, true);
  });

  void it("requires recovery deliveries to carry both audit and recovery-generation ownership", () => {
    const recoveryData = {
      projectId,
      runId,
      materialDigest,
      triggerSource: "work_recovery" as const,
      jobRunId
    };

    assert.equal(OpportunityResearchJobDataSchema.safeParse(recoveryData).success, false);
    assert.equal(
      OpportunityResearchJobDataSchema.safeParse({ ...recoveryData, expectedRecoveryCount: 2 }).success,
      true
    );
  });

  void it("derives one canonical evidence key from every public-search capture id", () => {
    const capture = {
      id: jobRunId,
      projectId,
      runId,
      executionEpoch: 1,
      query: "Dachreinigung Dachau",
      provider: "duckduckgo_html" as const,
      requestedLocale: "de-DE",
      maxResults: 5,
      effectiveLocale: "de-DE",
      researchOrdinal: 1,
      round: 1,
      status: "succeeded" as const,
      results: [],
      evidencePolicy: "research_support_only" as const,
      capturedAt: new Date().toISOString()
    };

    assert.equal(PublicWebSearchCaptureSchema.parse(capture).evidenceKey, `public_web_search_capture:${jobRunId}`);
    assert.equal(
      PublicWebSearchCaptureSchema.safeParse({ ...capture, evidenceKey: `public_web_search_capture:${runId}` }).success,
      false
    );
  });
});
