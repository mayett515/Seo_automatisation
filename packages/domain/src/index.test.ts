import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ReleaseCheck, ReleasePlan } from "@localseo/contracts";
import {
  buildReleaseDeploymentKey,
  canDeployRelease,
  classifyRollbackReconciliation,
  deriveTechnicalAuditFindings,
  deriveWebsiteImportFacts,
  decidePageProposalTargetAdmission,
  decideReleasePlanTargetAdmission,
  decideReleaseReadiness,
  decideReleaseVerificationStatus,
  hasActiveRollbackOperationEvidence,
  isActiveRollbackOperationStatus
} from "./index.js";

void describe("page proposal target admission", () => {
  void it("allows a request pinned to the current eligible opportunity revision", () => {
    assert.deepEqual(
      decidePageProposalTargetAdmission({
        expected: { status: "monitoring", rowVersion: 4 },
        current: { status: "monitoring", rowVersion: 4 }
      }),
      { kind: "allow" }
    );
  });

  void it("rejects a stale status or row version before queue admission", () => {
    assert.deepEqual(
      decidePageProposalTargetAdmission({
        expected: { status: "new", rowVersion: 0 },
        current: { status: "held", rowVersion: 1 }
      }),
      { kind: "stale", current: { status: "held", rowVersion: 1 } }
    );
  });

  void it("denies rejected and completed proposal targets", () => {
    assert.deepEqual(
      decidePageProposalTargetAdmission({
        expected: { status: "rejected", rowVersion: 2 },
        current: { status: "rejected", rowVersion: 2 }
      }),
      { kind: "deny", reason: "rejected" }
    );
    assert.deepEqual(
      decidePageProposalTargetAdmission({
        expected: { status: "brief_created", rowVersion: 3 },
        current: { status: "brief_created", rowVersion: 3 }
      }),
      { kind: "deny", reason: "proposal_already_created" }
    );
  });
});

void describe("release plan target admission", () => {
  void it("allows a request pinned to the current approved page-version revision", () => {
    assert.deepEqual(
      decideReleasePlanTargetAdmission({
        expected: { status: "approved", rowVersion: 4 },
        current: { status: "approved", rowVersion: 4, hasApprovalEvidence: true }
      }),
      { kind: "allow" }
    );
  });

  void it("rejects stale target state before evaluating release eligibility", () => {
    assert.deepEqual(
      decideReleasePlanTargetAdmission({
        expected: { status: "approved", rowVersion: 2 },
        current: { status: "release_candidate", rowVersion: 3, hasApprovalEvidence: true }
      }),
      { kind: "stale", current: { status: "release_candidate", rowVersion: 3 } }
    );
  });

  void it("denies current targets without approved status and approval evidence", () => {
    assert.deepEqual(
      decideReleasePlanTargetAdmission({
        expected: { status: "preview", rowVersion: 0 },
        current: { status: "preview", rowVersion: 0, hasApprovalEvidence: false }
      }),
      { kind: "deny", reason: "not_approved" }
    );
    assert.deepEqual(
      decideReleasePlanTargetAdmission({
        expected: { status: "approved", rowVersion: 0 },
        current: { status: "approved", rowVersion: 0, hasApprovalEvidence: false }
      }),
      { kind: "deny", reason: "approval_evidence_missing" }
    );
  });
});

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

void describe("buildReleaseDeploymentKey", () => {
  void it("derives a stable local idempotency key from a release plan id", () => {
    assert.equal(buildReleaseDeploymentKey("release-plan-1"), "release_plan:release-plan-1");
  });
});

void describe("classifyRollbackReconciliation", () => {
  void it("completes only when the intended deploy is published and ready", () => {
    assert.deepEqual(
      classifyRollbackReconciliation({
        intendedProviderDeployId: "deploy-a",
        targetProviderDeployId: "deploy-b",
        publishedProviderDeployId: "deploy-a",
        publishedStatus: "ready"
      }),
      { kind: "completed", publishedProviderDeployId: "deploy-a" }
    );
  });

  void it("keeps rollback pending while the intended deploy is not ready", () => {
    assert.deepEqual(
      classifyRollbackReconciliation({
        intendedProviderDeployId: "deploy-a",
        targetProviderDeployId: "deploy-b",
        publishedProviderDeployId: "deploy-a",
        publishedStatus: "deploying"
      }),
      { kind: "still_pending", reason: "provider_not_ready" }
    );
  });

  void it("keeps rollback pending while the target deploy is still published", () => {
    assert.deepEqual(
      classifyRollbackReconciliation({
        intendedProviderDeployId: "deploy-a",
        targetProviderDeployId: "deploy-b",
        publishedProviderDeployId: "deploy-b",
        publishedStatus: "ready"
      }),
      { kind: "still_pending", reason: "provider_not_ready" }
    );
  });

  void it("requires manual reconciliation when another deploy is published", () => {
    assert.deepEqual(
      classifyRollbackReconciliation({
        intendedProviderDeployId: "deploy-a",
        targetProviderDeployId: "deploy-b",
        publishedProviderDeployId: "deploy-c",
        publishedStatus: "ready"
      }),
      { kind: "manual_required", reason: "published_identity_mismatch" }
    );
  });
});

void describe("active rollback operation evidence", () => {
  void it("recognizes the shared active status vocabulary in both persisted evidence shapes", () => {
    assert.equal(isActiveRollbackOperationStatus("restore_in_flight"), true);
    assert.equal(isActiveRollbackOperationStatus("rollback_pending"), true);
    assert.equal(isActiveRollbackOperationStatus("manual_reconciliation_required"), false);
    assert.equal(hasActiveRollbackOperationEvidence({ rollbackExecution: { status: "restore_in_flight" } }), true);
    assert.equal(hasActiveRollbackOperationEvidence({ rollback: { status: "rollback_pending" } }), true);
    assert.equal(hasActiveRollbackOperationEvidence({ rollbackExecution: { status: "completed" } }), false);
  });
});

void describe("deriveWebsiteImportFacts", () => {
  void it("extracts conservative brand, service, and area candidates from crawl evidence", () => {
    const facts = deriveWebsiteImportFacts({
      sourceUrl: "https://example.test/",
      pages: [
        {
          route: "/",
          title: "Gebaeudeservice Mueller | Muenchen",
          h1: "Gebaeudeservice in Muenchen",
          metaDescription: "Dachreinigung und Hausmeisterservice in Muenchen."
        },
        {
          route: "/dachreinigung-muenchen/",
          title: "Dachreinigung Muenchen",
          h1: "Dachreinigung in Muenchen"
        }
      ]
    });

    assert.equal(facts.brand?.name, "Gebaeudeservice Mueller");
    assert.equal(
      facts.services.some((service) => service.value === "Dachreinigung"),
      true
    );
    assert.equal(
      facts.services.some((service) => service.value === "Hausmeisterservice"),
      true
    );
    assert.equal(
      facts.areas.some((area) => area.value === "Muenchen"),
      true
    );
  });

  void it("keeps empty facts possible when imported evidence is too weak", () => {
    assert.deepEqual(
      deriveWebsiteImportFacts({
        sourceUrl: "https://example.test/",
        pages: []
      }),
      {
        services: [],
        areas: []
      }
    );
  });
});

void describe("deriveTechnicalAuditFindings", () => {
  void it("derives deterministic basic technical audit findings from crawl evidence", () => {
    const findings = deriveTechnicalAuditFindings({
      sourceUrl: "https://example.test/",
      pages: [
        {
          url: "https://example.test/broken/",
          route: "/broken/",
          status: 404,
          title: "",
          metaDescription: "",
          h1: "",
          internalLinks: [],
          schemaTypes: []
        },
        {
          url: "https://example.test/noindex/",
          route: "/noindex/",
          status: 200,
          title: "Noindex",
          metaDescription: "Noindex page",
          h1: "Noindex",
          canonical: "https://example.test/noindex/",
          robots: "noindex",
          internalLinks: ["/"],
          schemaTypes: ["LocalBusiness"]
        }
      ],
      skippedUrls: [{ url: "https://example.test/private/", reason: "robots_disallow" }]
    });

    assert.deepEqual(
      findings.map((finding) => finding.checkKey),
      [
        "http_status.client_error",
        "indexability.noindex",
        "canonical.missing",
        "internal_links.none_detected",
        "metadata.missing_description",
        "metadata.missing_h1",
        "metadata.missing_title",
        "schema.missing",
        "crawl.skipped_url"
      ]
    );
    assert.equal(findings[0]?.severity, "blocker");
    assert.equal(findings.at(-1)?.severity, "info");
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
