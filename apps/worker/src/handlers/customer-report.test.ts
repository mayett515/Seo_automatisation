import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { customerReportContractLimits, CustomerReportCompletedRollbackEvidenceSchema } from "@localseo/contracts";
import { customerReportActionQuotas } from "@localseo/domain";
import { reportEvidenceLimits } from "./customer-report.js";

void describe("customer report worker policy bounds", () => {
  void it("keeps the maximum selected evidence below the report claim cap", () => {
    const maximumSelectedEvidence = Object.values(reportEvidenceLimits).reduce((total, limit) => total + limit, 0);
    assert.ok(maximumSelectedEvidence <= customerReportContractLimits.maxClaims);
  });

  void it("keeps the action quotas within the report action cap", () => {
    const maximumSelectedActions = Object.values(customerReportActionQuotas).reduce((total, limit) => total + limit, 0);
    assert.ok(maximumSelectedActions <= customerReportContractLimits.maxNextActions);
  });

  void it("accepts the completed rollback writer envelope while tolerating future audit fields", () => {
    const parsed = CustomerReportCompletedRollbackEvidenceSchema.parse({
      status: "completed",
      operationAttemptId: "11111111-1111-4111-8111-111111111111",
      providerResultStatus: "succeeded",
      providerDeployId: "deploy-restored",
      sourceProviderDeployId: "deploy-source",
      targetProviderDeployId: "deploy-target",
      rolledBackFromProviderDeployId: "deploy-target",
      executedAt: "2026-07-28T09:00:00.000Z",
      restoredProviderDeployId: "deploy-restored",
      liveUrl: "https://example.test/",
      evidence: { provider: "netlify" },
      futureAuditField: "retained"
    });

    assert.equal(parsed.status, "completed");
    assert.equal(parsed.futureAuditField, "retained");
  });
});
