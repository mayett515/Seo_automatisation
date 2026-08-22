import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PageJson } from "@localseo/contracts";
import { derivePageRegistrySeoFacts } from "@localseo/page-registry";
import {
  assertCustomerReportPayloadSafe,
  buildReleasePreflightChecks,
  evaluateLocalPageQa,
  type ReleasePreflightEvidence
} from "./index.js";

void describe("buildReleasePreflightChecks", () => {
  void it("blocks PageJson that passes contracts but fails registry validation", () => {
    const evidence = readyEvidence();
    const page = evidence.pages[0];

    assert.ok(page);

    const checks = buildReleasePreflightChecks({
      ...evidence,
      pages: [
        {
          ...page,
          pageJson: pageJson({
            sections: [
              heroSection({
                variant: "unsupported"
              })
            ]
          })
        }
      ]
    });
    const quality = checks.find((check) => check.checkKey === "local_seo_page_quality_gate");

    assert.equal(quality?.result, "failed");
    const blockers = (quality?.evidence as { blockers: Array<{ blocker: string }> }).blockers;

    assert.ok(blockers.some((blocker) => blocker.blocker === "invalid_page_json"));
  });

  void it("blocks non-rendering actions until directive artifacts exist", () => {
    const checks = buildReleasePreflightChecks({
      ...readyEvidence(),
      pages: [
        {
          action: "noindex",
          pageVersionId: null,
          targetUrl: "/entruempelung-dachau/",
          approvedAt: null,
          pageJson: null,
          mediaManifestValid: true,
          sitemapReady: false,
          uniquenessRationale: null
        }
      ]
    });
    const materialization = checks.find((check) => check.checkKey === "release_action_materialization_check");

    assert.equal(materialization?.severity, "blocker");
    assert.equal(materialization?.result, "failed");
    assert.deepEqual(
      (materialization?.evidence as { unmaterializedTargets: Array<{ action: string; targetUrl: string }> })
        .unmaterializedTargets,
      [{ action: "noindex", targetUrl: "/entruempelung-dachau/" }]
    );
  });

  void it("passes renderable actions with registry-valid PageJson", () => {
    const checks = buildReleasePreflightChecks(readyEvidence());

    assert.equal(checks.find((check) => check.checkKey === "local_seo_page_quality_gate")?.result, "passed");
    assert.equal(checks.find((check) => check.checkKey === "media_manifest_check")?.result, "passed");
    assert.equal(checks.find((check) => check.checkKey === "release_action_materialization_check")?.result, "passed");
  });

  void it("returns the complete preflight catalog in stable evaluation order", () => {
    const checks = buildReleasePreflightChecks(readyEvidence());

    assert.deepEqual(
      checks.map(({ checkKey, scope, severity, result, message }) => ({ checkKey, scope, severity, result, message })),
      [
        {
          checkKey: "approval_check",
          scope: "page",
          severity: "blocker",
          result: "passed",
          message: "Every renderable release item references an approved page version."
        },
        {
          checkKey: "media_manifest_check",
          scope: "page",
          severity: "blocker",
          result: "passed",
          message: "Every renderable release item has an exact, available immutable media manifest."
        },
        {
          checkKey: "staging_noindex_check",
          scope: "domain",
          severity: "blocker",
          result: "passed",
          message: "Every preview page carries noindex evidence."
        },
        {
          checkKey: "resolved_robots_check",
          scope: "domain",
          severity: "blocker",
          result: "passed",
          message: "Release actions resolve to deterministic robots directives."
        },
        {
          checkKey: "release_action_materialization_check",
          scope: "domain",
          severity: "blocker",
          result: "passed",
          message: "Every release action materializes to a rendered page artifact."
        },
        {
          checkKey: "local_seo_page_quality_gate",
          scope: "page",
          severity: "blocker",
          result: "passed",
          message: "Local SEO page quality gate has no blockers."
        },
        {
          checkKey: "rollback_point_ready",
          scope: "project",
          severity: "blocker",
          result: "passed",
          message: "Rollback point artifact is available."
        },
        {
          checkKey: "local_seo_page_quality_warning",
          scope: "page",
          severity: "warning",
          result: "passed",
          message: "Local SEO page quality gate has no warnings."
        },
        {
          checkKey: "tracking_key_ready",
          scope: "tracking",
          severity: "warning",
          result: "passed",
          message: "At least one active project tracking key has allowed origins."
        }
      ]
    );
  });

  void it("blocks renderable actions when immutable media references cannot be resolved exactly", () => {
    const evidence = readyEvidence();
    const page = evidence.pages[0];

    assert.ok(page);

    const checks = buildReleasePreflightChecks({
      ...evidence,
      pages: [{ ...page, mediaManifestValid: false }]
    });
    const media = checks.find((check) => check.checkKey === "media_manifest_check");

    assert.equal(media?.severity, "blocker");
    assert.equal(media?.result, "failed");
  });
});

void describe("evaluateLocalPageQa", () => {
  void it("reports every unmet page requirement when the page JSON never parsed", () => {
    const result = evaluateLocalPageQa({ kind: "invalid_page_json" });

    assert.equal(result.passed, false);
    assert.deepEqual(result.blockers, [
      "invalid_page_json",
      "missing_title",
      "missing_meta_description",
      "missing_h1",
      "missing_canonical",
      "missing_json_ld",
      "missing_area_served",
      "missing_internal_links",
      "missing_uniqueness_rationale"
    ]);
    assert.deepEqual(result.warnings, ["missing_local_faq", "missing_visible_cta", "not_sitemap_ready"]);
  });

  void it("accepts sitemap readiness and uniqueness rationale recorded on the release item", () => {
    const result = evaluateLocalPageQa({
      kind: "page_facts",
      facts: {
        ...derivePageRegistrySeoFacts(pageJson()),
        sitemapReady: false,
        uniquenessRationale: undefined
      },
      releaseSitemapReady: true,
      releaseUniquenessRationale: "Dedicated local proof for Dachau."
    });

    assert.equal(result.passed, true);
    assert.deepEqual(result.blockers, []);
    assert.deepEqual(result.warnings, []);
  });
});

void describe("assertCustomerReportPayloadSafe", () => {
  void it("allows customer proof payloads without banned GSC metrics", () => {
    assert.doesNotThrow(() =>
      assertCustomerReportPayloadSafe({
        title: "Visibility proof",
        proof: [{ route: "/dachreinigung-dachau/", rankingTier: "top_10" }]
      })
    );
  });

  void it("rejects nested customer report payloads containing banned GSC metrics", () => {
    assert.throws(
      () =>
        assertCustomerReportPayloadSafe({
          sections: [
            {
              headline: "Internal GSC data leaked",
              metrics: {
                impressions: 1200
              }
            }
          ]
        }),
      /sections\.0\.metrics\.impressions/u
    );
  });

  void it("allows non-GSC uses of a generic position key", () => {
    assert.doesNotThrow(() =>
      assertCustomerReportPayloadSafe({
        contact: {
          name: "Customer Champion",
          position: "CEO"
        },
        mapPin: {
          position: {
            lat: 48.137,
            lng: 11.575
          }
        }
      })
    );
  });
});

function readyEvidence(): ReleasePreflightEvidence {
  return {
    pages: [
      {
        action: "create",
        pageVersionId: "page-version-1",
        targetUrl: "/entruempelung-dachau/",
        approvedAt: new Date("2026-01-01T00:00:00.000Z"),
        pageJson: pageJson(),
        mediaManifestValid: true,
        sitemapReady: true,
        uniquenessRationale: "Dedicated local proof for Dachau."
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
    route: "/entruempelung-dachau/",
    pageType: "service_area_page",
    target: {
      service: "Entruempelung",
      location: "Dachau",
      primaryKeyword: "Entruempelung Dachau",
      secondaryKeywords: []
    },
    seo: {
      title: "Entruempelung Dachau",
      metaDescription: "Lokale Entruempelung in Dachau.",
      canonicalPath: "/entruempelung-dachau/",
      robots: "noindex",
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          name: "Entruempelung Dachau"
        }
      ],
      sitemapReady: true
    },
    sections: [heroSection(), serviceAreaSection(), faqSection(), finalCtaSection()],
    internalLinks: ["/entruempelung/"],
    evidenceRefs: [],
    uniquenessRationale: "Dedicated local proof for Dachau.",
    ...input
  };
}

function heroSection(input: Partial<PageJson["sections"][number]> = {}): PageJson["sections"][number] {
  return {
    id: "hero-1",
    type: "Hero",
    registryKey: "Hero.default",
    schemaVersion: 1,
    zone: "hero",
    order: 0,
    variant: "default",
    props: {
      h1: "Entruempelung Dachau",
      lead: "Lokale Entruempelung in Dachau."
    },
    evidenceRefs: [],
    ...input
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
      areas: [{ name: "Dachau", route: "/entruempelung/" }]
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

function finalCtaSection(): PageJson["sections"][number] {
  return {
    id: "cta-1",
    type: "FinalCTA",
    registryKey: "FinalCTA.default",
    schemaVersion: 1,
    zone: "cta_late",
    order: 3,
    variant: "default",
    props: {
      heading: "Entruempelung anfragen",
      body: "Wir pruefen die passende Ausfuehrung fuer Ihr Objekt.",
      ctaLabel: "Anfragen",
      ctaHref: "/kontakt/"
    },
    evidenceRefs: []
  };
}
