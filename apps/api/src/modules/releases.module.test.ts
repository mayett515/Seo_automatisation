import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decideReleaseReadiness } from "@localseo/domain";
import { buildReleasePreflightChecks, type ReleasePreflightEvidence } from "@localseo/seo";

void describe("buildReleasePreflightChecks", () => {
  void it("blocks release approval when persisted evidence is missing", () => {
    const checks = buildReleasePreflightChecks({
      pages: [
        {
          pageVersionId: "page-version-1",
          targetUrl: "/dachreinigung-muenchen/",
          approvedAt: null,
          pageJson: {},
          sitemapReady: false,
          uniquenessRationale: null
        }
      ],
      rollbackPointCount: 0,
      priorSuccessfulDeploymentCount: 1,
      usableTrackingKeyCount: 0
    });

    assert.equal(checks.find((check) => check.checkKey === "approval_check")?.result, "failed");
    assert.equal(checks.find((check) => check.checkKey === "staging_noindex_check")?.result, "failed");
    assert.equal(checks.find((check) => check.checkKey === "local_seo_page_quality_gate")?.result, "failed");
    assert.equal(checks.find((check) => check.checkKey === "rollback_point_ready")?.result, "failed");
    assert.equal(checks.find((check) => check.checkKey === "tracking_key_ready")?.severity, "warning");
  });

  void it("passes blockers when page, preview, QA, and rollback evidence are present", () => {
    const checks = buildReleasePreflightChecks(readyEvidence());

    assert.equal(checks.find((check) => check.checkKey === "approval_check")?.result, "passed");
    assert.equal(checks.find((check) => check.checkKey === "staging_noindex_check")?.result, "passed");
    assert.equal(checks.find((check) => check.checkKey === "local_seo_page_quality_gate")?.result, "passed");
    assert.equal(checks.find((check) => check.checkKey === "rollback_point_ready")?.result, "passed");
    assert.equal(checks.find((check) => check.checkKey === "tracking_key_ready")?.result, "passed");
  });

  void it("allows first deploys without rollback point evidence", () => {
    const checks = buildReleasePreflightChecks({
      ...readyEvidence(),
      rollbackPointCount: 0,
      priorSuccessfulDeploymentCount: 0
    });

    assert.equal(checks.find((check) => check.checkKey === "rollback_point_ready")?.result, "passed");
  });

  void it("keeps tracking readiness as a warning instead of a deploy blocker", () => {
    const checks = buildReleasePreflightChecks({
      ...readyEvidence(),
      usableTrackingKeyCount: 0
    });
    const tracking = checks.find((check) => check.checkKey === "tracking_key_ready");

    assert.equal(tracking?.severity, "warning");
    assert.equal(tracking?.result, "failed");
  });

  void it("returns ready_with_warnings when local SEO QA only has warnings", () => {
    const evidence = readyEvidence();
    const basePage = evidence.pages[0];

    assert.ok(basePage);

    const checks = buildReleasePreflightChecks({
      ...evidence,
      pages: [
        {
          ...basePage,
          pageJson: {
            title: "Dachreinigung Muenchen",
            metaDescription: "Lokale Dachreinigung in Muenchen.",
            h1: "Dachreinigung in Muenchen",
            canonical: "https://example.test/dachreinigung-muenchen/",
            jsonLd: { "@type": "LocalBusiness" },
            areaServed: ["Muenchen"],
            internalLinks: ["/dachreinigung/"],
            robots: "noindex,nofollow",
            sitemapReady: true
          }
        }
      ]
    });
    const blocker = checks.find((check) => check.checkKey === "local_seo_page_quality_gate");
    const warning = checks.find((check) => check.checkKey === "local_seo_page_quality_warning");

    assert.equal(blocker?.result, "passed");
    assert.equal(warning?.severity, "warning");
    assert.equal(warning?.result, "failed");
    assert.equal(decideReleaseReadiness(checks).kind, "ready_with_warnings");
  });
});

function readyEvidence(): ReleasePreflightEvidence {
  return {
    pages: [
      {
        pageVersionId: "page-version-1",
        targetUrl: "/dachreinigung-muenchen/",
        approvedAt: new Date("2026-01-01T00:00:00.000Z"),
        pageJson: {
          title: "Dachreinigung Muenchen",
          metaDescription: "Lokale Dachreinigung in Muenchen.",
          h1: "Dachreinigung in Muenchen",
          canonical: "https://example.test/dachreinigung-muenchen/",
          jsonLd: { "@type": "LocalBusiness" },
          areaServed: ["Muenchen"],
          internalLinks: ["/dachreinigung/"],
          localFaq: [{ question: "Wie schnell?", answer: "Nach Absprache." }],
          cta: { label: "Anfragen" },
          robots: "noindex,nofollow",
          sitemapReady: true
        },
        sitemapReady: true,
        uniquenessRationale: "Dedicated local proof for Muenchen."
      }
    ],
    rollbackPointCount: 1,
    priorSuccessfulDeploymentCount: 1,
    usableTrackingKeyCount: 1
  };
}
