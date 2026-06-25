import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ReleaseCheck, ReleasePlan } from "@localseo/contracts";
import { canDeployRelease, decideReleaseReadiness, decideReleaseVerificationStatus } from "./index.js";

void describe("release readiness decisions", () => {
  void it("blocks deploy when any blocker check fails", () => {
    const decision = decideReleaseReadiness([
      releaseCheck({ severity: "blocker", result: "failed" }),
      releaseCheck({ severity: "warning", result: "passed" })
    ]);

    assert.equal(decision.kind, "blocked");
  });

  void it("allows approved releases when checks have no blockers", () => {
    const plan: ReleasePlan = {
      releasePlanId: "release-1",
      projectId: "project-1",
      status: "approved_for_deploy",
      riskLevel: "low",
      blockerCount: 0,
      warningCount: 0
    };

    assert.equal(canDeployRelease(plan, [releaseCheck({ severity: "blocker", result: "passed" })]), true);
  });

  void it("does not deploy unapproved release plans", () => {
    const plan: ReleasePlan = {
      releasePlanId: "release-1",
      projectId: "project-1",
      status: "ready",
      riskLevel: "low",
      blockerCount: 0,
      warningCount: 0
    };

    assert.equal(canDeployRelease(plan, [releaseCheck({ severity: "blocker", result: "passed" })]), false);
  });
});

void describe("release verification status", () => {
  void it("recommends rollback for failed blocker checks", () => {
    assert.equal(
      decideReleaseVerificationStatus([releaseCheck({ severity: "blocker", result: "failed" })]),
      "rollback_recommended"
    );
  });

  void it("returns live_with_warnings for failed warning checks", () => {
    assert.equal(
      decideReleaseVerificationStatus([releaseCheck({ severity: "warning", result: "failed" })]),
      "live_with_warnings"
    );
  });

  void it("returns live_healthy when checks pass", () => {
    assert.equal(
      decideReleaseVerificationStatus([releaseCheck({ severity: "blocker", result: "passed" })]),
      "live_healthy"
    );
  });
});

function releaseCheck(input: Pick<ReleaseCheck, "severity" | "result">): ReleaseCheck {
  return {
    checkKey: `${input.severity}-${input.result}`,
    scope: "project",
    severity: input.severity,
    result: input.result,
    message: "test check"
  };
}
