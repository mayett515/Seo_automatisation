import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PageJson } from "@localseo/contracts";
import {
  createPageRegistry,
  getPageRegistryEntry,
  pageRegistry,
  pageRegistryEntries,
  pageRegistrySummary,
  derivePageRegistrySeoFacts,
  renderApprovedReleaseArtifact,
  validatePageJsonAgainstRegistry
} from "./index.js";

void describe("page registry", () => {
  void it("validates a PageJson document against registry-owned prop schemas", () => {
    const result = validatePageJsonAgainstRegistry(pageJson());

    assert.equal(result.success, true);
  });

  void it("rejects unknown registry keys", () => {
    const result = validatePageJsonAgainstRegistry(
      pageJson({
        sections: [heroSection({ registryKey: "Unknown.default" })]
      })
    );

    assertIssue(result, "unknown_registry_key");
  });

  void it("rejects section type and registry key mismatches", () => {
    const result = validatePageJsonAgainstRegistry(
      pageJson({
        sections: [heroSection({ type: "FAQ", registryKey: "Hero.default" })]
      })
    );

    assertIssue(result, "section_type_mismatch");
  });

  void it("rejects illegal zones for known sections", () => {
    const result = validatePageJsonAgainstRegistry(
      pageJson({
        sections: [heroSection({ zone: "body_main" })]
      })
    );

    assertIssue(result, "illegal_zone");
  });

  void it("rejects unknown variants for known sections", () => {
    const result = validatePageJsonAgainstRegistry(
      pageJson({
        sections: [heroSection({ variant: "floating" })]
      })
    );

    assertIssue(result, "unknown_variant");
  });

  void it("rejects section schema versions that do not match the registry entry", () => {
    const result = validatePageJsonAgainstRegistry(
      pageJson({
        sections: [heroSection({ schemaVersion: 2 })]
      })
    );

    assertIssue(result, "schema_version_mismatch");
  });

  void it("rejects props outside the section schema allow-list", () => {
    const result = validatePageJsonAgainstRegistry(
      pageJson({
        sections: [
          heroSection({
            props: {
              h1: "Entruempelung Dachau",
              lead: "Lokale Entruempelung in Dachau.",
              extraMarketingKnob: "not allowed"
            }
          })
        ]
      })
    );

    assertIssue(result, "invalid_props");
  });

  void it("runs the PageJson safety guard before registry validation", () => {
    const result = validatePageJsonAgainstRegistry(
      pageJson({
        sections: [
          heroSection({
            props: {
              h1: "Entruempelung Dachau",
              lead: "Lokale Entruempelung in Dachau.",
              onClick: "alert(1)"
            }
          })
        ]
      })
    );

    assertIssue(result, "invalid_page_json");
  });

  void it("exports a schema-free registry summary for domain and UI consumers", () => {
    assert.ok(pageRegistrySummary.length > 0);
    const firstEntry = pageRegistrySummary[0];
    assert.ok(firstEntry);
    assert.equal("propsSchema" in firstEntry, false);
    assert.doesNotMatch(JSON.stringify(pageRegistrySummary), /propsSchema/u);
  });

  void it("keeps registry keys unique and internally consistent", () => {
    assert.doesNotThrow(() => createPageRegistry(pageRegistryEntries));

    for (const entry of pageRegistry.entries) {
      assert.equal(getPageRegistryEntry(entry.registryKey), entry);
      assert.ok(entry.allowedZones.includes(entry.defaultZone));
      assert.ok(entry.variants.includes(entry.defaultVariant));
    }
  });

  void it("fails fast when constructing duplicate registry keys", () => {
    assert.throws(
      () => createPageRegistry([pageRegistryEntries[0], pageRegistryEntries[0]]),
      /Duplicate page registry key/u
    );
  });

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
          action: "create",
          pageJson: pageJson()
        }
      ]
    });

    assert.deepEqual(
      site.files.map((file) => file.path),
      ["/dachreinigung-dachau/index.html"]
    );
  });

  void it("escapes PageJson values before writing HTML", () => {
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
          action: "create",
          pageJson: pageJson({
            seo: {
              title: "<script>alert(1)</script>",
              metaDescription: '"onload=alert(1)',
              canonicalPath: "/",
              robots: "noindex",
              jsonLd: [],
              sitemapReady: false
            },
            sections: [
              heroSection({
                props: {
                  h1: "<script>alert(1)</script>",
                  lead: "<img src=x onerror=alert(1)>"
                }
              }),
              faqSection()
            ]
          })
        }
      ]
    });

    const body = site.files[0]?.body ?? "";

    assert.match(body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u);
    assert.match(body, /&quot;onload=alert\(1\)/u);
    assert.match(body, /&lt;img src=x onerror=alert\(1\)&gt;/u);
    assert.doesNotMatch(body, /<script>/u);
  });

  void it("renders canonical, JSON-LD, release-resolved robots, and internal CSS", () => {
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
          action: "create",
          pageJson: pageJson({
            seo: {
              title: "Dachreinigung Dachau",
              metaDescription: "Lokale Dachreinigung in Dachau.",
              canonicalPath: "/dachreinigung-dachau/",
              robots: "noindex",
              jsonLd: [
                {
                  "@context": "https://schema.org",
                  "@type": "LocalBusiness",
                  name: "Dachreinigung Dachau"
                }
              ],
              sitemapReady: false
            }
          })
        }
      ]
    });

    const body = site.files[0]?.body ?? "";

    assert.match(body, /<link rel="canonical" href="\/dachreinigung-dachau\/">/u);
    assert.match(body, /<meta name="robots" content="index">/u);
    assert.match(body, /<script type="application\/ld\+json">/u);
    assert.match(body, /"@type":"LocalBusiness"/u);
    assert.match(body, /@layer reset, tokens, base, primitives, components, sections/u);
  });

  void it("derives SEO facts from typed PageJson and registry-owned props", () => {
    const facts = derivePageRegistrySeoFacts(
      pageJson({
        internalLinks: ["/kontakt/"],
        sections: [
          heroSection({
            props: {
              h1: "Dachreinigung Dachau",
              lead: "Lokale Dachreinigung in Dachau.",
              primaryCtaLabel: "Anfragen",
              primaryCtaHref: "/kontakt/"
            }
          }),
          faqSection()
        ]
      })
    );

    assert.equal(facts.h1, "Dachreinigung Dachau");
    assert.equal(facts.hasLocalFaq, true);
    assert.equal(facts.hasVisibleCta, true);
    assert.deepEqual(facts.internalLinks, ["/kontakt/"]);
  });
});

function assertIssue(result: ReturnType<typeof validatePageJsonAgainstRegistry>, code: string): void {
  assert.equal(result.success, false);
  assert.ok(
    result.issues.some((issue) => issue.code === code),
    `Expected registry issue '${code}'.`
  );
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
      jsonLd: [],
      sitemapReady: false
    },
    sections: [heroSection(), faqSection()],
    internalLinks: [],
    evidenceRefs: [],
    uniquenessRationale: "Dachau-specific service page.",
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

function faqSection(input: Partial<PageJson["sections"][number]> = {}): PageJson["sections"][number] {
  return {
    id: "faq-1",
    type: "FAQ",
    registryKey: "FAQ.default",
    schemaVersion: 1,
    zone: "body_late",
    order: 1,
    variant: "default",
    props: {
      heading: "Haeufige Fragen",
      items: [{ question: "Wie schnell geht das?", answer: "Nach Absprache kurzfristig." }]
    },
    evidenceRefs: [],
    ...input
  };
}
