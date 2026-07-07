import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PageJson } from "@localseo/contracts";
import {
  createPageRegistry,
  getPageRegistryEntry,
  pageRegistry,
  pageRegistryEntries,
  pageRegistrySummary,
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
