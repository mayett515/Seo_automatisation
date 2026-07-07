import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PageJson } from "@localseo/contracts";
import {
  assertCustomerReportPayloadSafe,
  buildReleasePreflightChecks,
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
    assert.equal(checks.find((check) => check.checkKey === "release_action_materialization_check")?.result, "passed");
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
