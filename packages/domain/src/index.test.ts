import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ReleaseCheck, ReleasePlan } from "@localseo/contracts";
import {
  buildReleaseDeploymentKey,
  canDeployRelease,
  classifyRollbackReconciliation,
  deriveTechnicalAuditFindings,
  deriveWebsiteImportFacts,
  decideReleaseReadiness,
  decideReleaseVerificationStatus,
  renderApprovedReleaseArtifact
} from "./index.js";

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

void describe("renderApprovedReleaseArtifact", () => {
  void it("renders intended routes without adding a position-based root fallback", () => {
    const site = renderApprovedReleaseArtifact({
      projectId: "project-1",
      releasePlanId: "release-1",
      deploymentKey: "release_plan:release-1",
      createdAt: "2026-06-29T00:00:00.000Z",
      pages: [
        {
          releasePlanItemId: "item-1",
          pageVersionId: "version-1",
          targetUrl: "/dachreinigung-dachau/",
          targetSubdomain: null,
          action: "publish",
          pageJson: { title: "Dachreinigung Dachau" }
        }
      ]
    });

    assert.deepEqual(
      site.files.map((file) => file.path),
      ["/dachreinigung-dachau/index.html"]
    );
  });

  void it("escapes page JSON before writing HTML", () => {
    const site = renderApprovedReleaseArtifact({
      projectId: "project-1",
      releasePlanId: "release-1",
      deploymentKey: "release_plan:release-1",
      createdAt: "2026-06-29T00:00:00.000Z",
      pages: [
        {
          releasePlanItemId: "item-1",
          pageVersionId: "version-1",
          targetUrl: "/",
          targetSubdomain: null,
          action: "publish",
          pageJson: {
            title: "<script>alert(1)</script>",
            description: '"onload=alert(1)',
            body: "javascript:<img src=x onerror=alert(1)>"
          }
        }
      ]
    });

    const body = site.files[0]?.body ?? "";

    assert.match(body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u);
    assert.match(body, /&quot;onload=alert\(1\)/u);
    assert.match(body, /javascript:&lt;img src=x onerror=alert\(1\)&gt;/u);
    assert.doesNotMatch(body, /<script>/u);
  });

  void it("renders canonical and JSON-LD from approved page JSON", () => {
    const site = renderApprovedReleaseArtifact({
      projectId: "project-1",
      releasePlanId: "release-1",
      deploymentKey: "release_plan:release-1",
      createdAt: "2026-06-29T00:00:00.000Z",
      pages: [
        {
          releasePlanItemId: "item-1",
          pageVersionId: "version-1",
          targetUrl: "/dachreinigung-dachau/",
          targetSubdomain: null,
          action: "publish",
          pageJson: {
            title: "Dachreinigung Dachau",
            canonical: "https://example.test/dachreinigung-dachau/",
            jsonLd: {
              "@context": "https://schema.org",
              "@type": "LocalBusiness",
              name: "Dachreinigung Dachau"
            }
          }
        }
      ]
    });

    const body = site.files[0]?.body ?? "";

    assert.match(body, /<link rel="canonical" href="https:\/\/example\.test\/dachreinigung-dachau\/">/u);
    assert.match(body, /<script type="application\/ld\+json">/u);
    assert.match(body, /"@type":"LocalBusiness"/u);
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
