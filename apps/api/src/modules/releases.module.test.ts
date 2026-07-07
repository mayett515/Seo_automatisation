import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PageJson } from "@localseo/contracts";
import { decideReleaseReadiness } from "@localseo/domain";
import { buildReleasePreflightChecks, type ReleasePreflightEvidence } from "@localseo/seo";

void describe("buildReleasePreflightChecks", () => {
  void it("blocks release approval when persisted evidence is missing", () => {
    const checks = buildReleasePreflightChecks({
      pages: [
        {
          action: "create",
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
    assert.equal(checks.find((check) => check.checkKey === "resolved_robots_check")?.result, "passed");
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
          pageJson: pageJson({
            sections: [heroSection(), serviceAreaSection()],
            internalLinks: ["/dachreinigung/"]
          })
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
        action: "create",
        pageVersionId: "page-version-1",
        targetUrl: "/dachreinigung-muenchen/",
        approvedAt: new Date("2026-01-01T00:00:00.000Z"),
        pageJson: pageJson(),
        sitemapReady: true,
        uniquenessRationale: "Dedicated local proof for Muenchen."
      }
    ],
    rollbackPointCount: 1,
    priorSuccessfulDeploymentCount: 1,
    usableTrackingKeyCount: 1
  };
}

function pageJson(input: Partial<PageJson> = {}): PageJson {
  return {
    schemaVersion: 1,
    route: "/dachreinigung-muenchen/",
    pageType: "service_area_page",
    target: {
      service: "Dachreinigung",
      location: "Muenchen",
      primaryKeyword: "Dachreinigung Muenchen",
      secondaryKeywords: []
    },
    seo: {
      title: "Dachreinigung Muenchen",
      metaDescription: "Lokale Dachreinigung in Muenchen.",
      canonicalPath: "/dachreinigung-muenchen/",
      robots: "noindex",
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          name: "Dachreinigung Muenchen"
        }
      ],
      sitemapReady: true
    },
    sections: [heroSection(), serviceAreaSection(), faqSection(), ctaSection()],
    internalLinks: ["/dachreinigung/"],
    evidenceRefs: [],
    uniquenessRationale: "Dedicated local proof for Muenchen.",
    ...input
  };
}

function heroSection(): PageJson["sections"][number] {
  return {
    id: "hero-1",
    type: "Hero",
    registryKey: "Hero.default",
    schemaVersion: 1,
    zone: "hero",
    order: 0,
    variant: "default",
    props: {
      h1: "Dachreinigung in Muenchen",
      lead: "Lokale Dachreinigung in Muenchen."
    },
    evidenceRefs: []
  };
}

function serviceAreaSection(): PageJson["sections"][number] {
  return {
    id: "areas-1",
    type: "ServiceAreaList",
    registryKey: "ServiceAreaList.default",
    schemaVersion: 1,
    zone: "body_late",
    order: 1,
    variant: "default",
    props: {
      heading: "Einsatzgebiet",
      areas: [{ name: "Muenchen", route: "/dachreinigung/" }]
    },
    evidenceRefs: []
  };
}

function faqSection(): PageJson["sections"][number] {
  return {
    id: "faq-1",
    type: "FAQ",
    registryKey: "FAQ.default",
    schemaVersion: 1,
    zone: "body_late",
    order: 2,
    variant: "default",
    props: {
      heading: "Haeufige Fragen",
      items: [{ question: "Wie schnell?", answer: "Nach Absprache." }]
    },
    evidenceRefs: []
  };
}

function ctaSection(): PageJson["sections"][number] {
  return {
    id: "cta-1",
    type: "FinalCTA",
    registryKey: "FinalCTA.default",
    schemaVersion: 1,
    zone: "cta_late",
    order: 3,
    variant: "default",
    props: {
      heading: "Dachreinigung anfragen",
      body: "Wir pruefen die passende Ausfuehrung fuer Ihr Objekt.",
      ctaLabel: "Anfragen",
      ctaHref: "/kontakt/"
    },
    evidenceRefs: []
  };
}
