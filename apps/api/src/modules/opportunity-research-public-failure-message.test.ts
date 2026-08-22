import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { opportunityResearchFailureCodes } from "@localseo/contracts";
import { publicOpportunityResearchFailureMessage } from "./opportunity-research-public-failure-message.js";

const genericMessage = "Opportunity Research failed. Review the failure code and timeline.";

void describe("publicOpportunityResearchFailureMessage", () => {
  void it("returns undefined when failureCode is undefined", () => {
    assert.equal(publicOpportunityResearchFailureMessage(undefined), undefined);
  });

  void it("maps every Opportunity Research failure code to a non-empty string", () => {
    for (const code of opportunityResearchFailureCodes) {
      const message = publicOpportunityResearchFailureMessage(code);
      assert.equal(typeof message, "string");
      assert.ok(message && message.length > 0, `expected message for ${code}`);
    }
  });

  void it("preserves exact user-visible messages from the prior switch", () => {
    assert.equal(
      publicOpportunityResearchFailureMessage("configuration_error"),
      "Opportunity Research is not configured."
    );
    assert.equal(
      publicOpportunityResearchFailureMessage("provider_timeout"),
      "Opportunity Research provider timed out."
    );
    assert.equal(
      publicOpportunityResearchFailureMessage("model_egress_blocked"),
      "Opportunity Research was stopped because selected material matched the secret-egress policy."
    );
    assert.equal(
      publicOpportunityResearchFailureMessage("qa_rejected"),
      "Opportunity Research output failed deterministic QA."
    );
    assert.equal(publicOpportunityResearchFailureMessage("workflow_failed"), genericMessage);
    assert.equal(publicOpportunityResearchFailureMessage("workflow_execution_failed"), genericMessage);
    assert.equal(publicOpportunityResearchFailureMessage("operator_cancelled"), genericMessage);
  });
});
