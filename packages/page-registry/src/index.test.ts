import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PageJson } from "@localseo/contracts";
import {
  createPageRegistry,
  getPageRegistryAiCopyFieldKeys,
  getPageRegistryEntry,
  pageRegistry,
  pageRegistryEntries,
  pageRegistrySummary,
  derivePageRegistrySeoFacts,
  renderApprovedReleaseArtifact,
  renderPagePreviewArtifact,
  renderPagePreviewFile,
  validatePageJsonAgainstRegistry,
  validatePageSectionProps,
  type ResolvedPageMediaVariant
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

  void it("allows only contact-safe header phone links", () => {
    const valid = validatePageJsonAgainstRegistry(
      pageJson({
        sections: [
          headerSection({
            props: {
              brandName: "Dach Service",
              phoneLabel: "Anrufen",
              phoneHref: "tel:+4989123456"
            }
          }),
          heroSection({ order: 1 }),
          faqSection({ order: 2 })
        ]
      })
    );
    const invalid = validatePageJsonAgainstRegistry(
      pageJson({
        sections: [
          headerSection({
            props: {
              brandName: "Dach Service",
              phoneLabel: "Anrufen",
              phoneHref: "https://example.test"
            }
          }),
          heroSection({ order: 1 }),
          faqSection({ order: 2 })
        ]
      })
    );

    assert.equal(valid.success, true);
    assertIssue(invalid, "invalid_props");
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

  void it("rejects control-character-obfuscated unsafe header phone links at the PageJson boundary", () => {
    const result = validatePageJsonAgainstRegistry(
      pageJson({
        sections: [
          headerSection({
            props: {
              brandName: "Dach Service",
              phoneLabel: "Anrufen",
              phoneHref: "java\tscript:alert(1)"
            }
          }),
          heroSection({ order: 1 }),
          faqSection({ order: 2 })
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
    assert.ok(firstEntry.editorFields.length > 0);
    assert.doesNotMatch(JSON.stringify(pageRegistrySummary), /propsSchema/u);
  });

  void it("exposes only registry-owned copy fields to section text generation", () => {
    assert.deepEqual(getPageRegistryAiCopyFieldKeys("Hero.default"), ["h1", "lead", "primaryCtaLabel", "trustLine"]);
    assert.equal(getPageRegistryAiCopyFieldKeys("Hero.default").includes("primaryCtaHref"), false);
    assert.deepEqual(getPageRegistryAiCopyFieldKeys("Header.default"), []);
    assert.deepEqual(getPageRegistryAiCopyFieldKeys("ServiceAreaList.default"), ["heading"]);
    assert.deepEqual(getPageRegistryAiCopyFieldKeys("ImageText.default"), ["heading", "body"]);
  });

  void it("keeps editor metadata aligned with registry prop schemas", () => {
    assert.doesNotThrow(() => createPageRegistry(pageRegistryEntries));

    const accepted = validatePageSectionProps("Hero.default", {
      h1: "Dachreinigung Muenchen",
      lead: "Lokale Dachreinigung fuer Wohn- und Gewerbeimmobilien."
    });
    const rejected = validatePageSectionProps("Hero.default", {
      h1: "Dachreinigung Muenchen",
      lead: "Lokale Dachreinigung fuer Wohn- und Gewerbeimmobilien.",
      inventedField: "not in the registry"
    });

    assert.equal(accepted.success, true);
    assert.equal(rejected.success, false);
  });

  void it("fails fast when editor control types drift from registry prop schemas", () => {
    const hero = pageRegistryEntries.find((entry) => entry.registryKey === "Hero.default");
    assert.ok(hero);

    assert.throws(
      () =>
        createPageRegistry([
          {
            ...hero,
            editorFields: hero.editorFields.map((field) =>
              field.key === "h1"
                ? {
                    key: "h1",
                    label: "Headline",
                    control: "list" as const,
                    itemLabel: "Headline",
                    itemTemplate: ""
                  }
                : field
            )
          }
        ]),
      /control must match its prop schema/u
    );

    const imageText = pageRegistryEntries.find((entry) => entry.registryKey === "ImageText.default");
    assert.ok(imageText);
    assert.throws(
      () =>
        createPageRegistry([
          {
            ...imageText,
            editorFields: imageText.editorFields.map((field) =>
              field.key === "media" ? { key: "media", label: "Image", control: "text" as const } : field
            )
          }
        ]),
      /control must match its prop schema/u
    );
  });

  void it("keeps ImageText media props opaque and registry-owned", () => {
    const accepted = validatePageJsonAgainstRegistry(
      pageJson({ sections: [heroSection(), imageTextSection(), faqSection({ order: 2 })] })
    );
    const rejected = validatePageJsonAgainstRegistry(
      pageJson({
        sections: [
          heroSection(),
          imageTextSection({
            props: {
              heading: "Proof",
              body: "Verified work in Dachau.",
              media: {
                assetId: mediaAssetId,
                purpose: "content",
                alt: "A completed project",
                url: "https://example.test/untrusted.webp"
              }
            }
          }),
          faqSection({ order: 2 })
        ]
      })
    );

    assert.equal(accepted.success, true);
    assertIssue(rejected, "invalid_props");
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

  void it("renders sections by PageJson order instead of array position", () => {
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
            sections: [
              faqSection({ order: 1 }),
              heroSection({
                order: 0,
                props: {
                  h1: "Ordered Hero",
                  lead: "This hero is first by order."
                }
              })
            ]
          })
        }
      ]
    });

    const body = site.files[0]?.body ?? "";

    assert.ok(body.indexOf("Ordered Hero") < body.indexOf("Haeufige Fragen"));
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

  void it("renders deploy preview output byte-identical to the deploy artifact", () => {
    const page = pageJson({
      seo: {
        title: "Dachreinigung Dachau",
        metaDescription: "Lokale Dachreinigung in Dachau.",
        canonicalPath: "/dachreinigung-dachau/",
        robots: "noindex",
        jsonLd: [],
        sitemapReady: false
      }
    });
    const deployArtifact = renderApprovedReleaseArtifact({
      projectId: "project-1",
      releasePlanId: "release-1",
      deploymentKey: "release_plan:release-1",
      createdAt: "2026-06-29T00:00:00.000Z",
      pages: [
        {
          releasePlanItemId: "preview",
          pageVersionId: null,
          targetUrl: "/dachreinigung-dachau/",
          targetSubdomain: null,
          action: "create",
          pageJson: page
        }
      ]
    });
    const previewArtifact = renderPagePreviewArtifact({
      pageJson: page,
      targetUrl: "/dachreinigung-dachau/",
      mode: "deploy",
      previewId: "preview"
    });

    assert.deepEqual(previewArtifact, deployArtifact);
  });

  void it("renders exact media manifests with deterministic paths and focal placement", () => {
    const page = pageJson({ sections: [heroSection(), imageTextSection(), faqSection({ order: 2 })] });
    const variants = mediaVariants();
    const deployArtifact = renderApprovedReleaseArtifact(
      {
        projectId: "project-1",
        releasePlanId: "release-1",
        deploymentKey: "release_plan:release-1",
        createdAt: "2026-07-15T00:00:00.000Z",
        pages: [
          {
            releasePlanItemId: "item-1",
            pageVersionId: "version-1",
            targetUrl: "/entruempelung-dachau/",
            targetSubdomain: null,
            action: "create",
            pageJson: page
          }
        ]
      },
      pageRegistry,
      [{ pageVersionId: "version-1", variants }]
    );
    const previewArtifact = renderPagePreviewArtifact({
      pageJson: page,
      targetUrl: "/entruempelung-dachau/",
      mode: "deploy",
      previewId: "item-1",
      pageVersionId: "version-1",
      mediaVariants: variants
    });
    const body = deployArtifact.files[0]?.body ?? "";

    assert.deepEqual(previewArtifact, deployArtifact);
    assert.match(body, new RegExp(`src="${escapeRegExp(variants[1]?.path ?? "missing")}"`, "u"));
    assert.match(body, /srcset="[^"]+ 640w, [^"]+ 1280w"/u);
    assert.match(body, /alt="Completed courtyard clearance in Dachau"/u);
    assert.match(body, /object-position: 25% 75%/u);
  });

  void it("fails closed when media references and resolved manifests differ", () => {
    const pageWithMedia = pageJson({ sections: [heroSection(), imageTextSection(), faqSection({ order: 2 })] });

    assert.throws(
      () =>
        renderPagePreviewFile({
          pageJson: pageWithMedia,
          targetUrl: "/entruempelung-dachau/",
          mediaVariants: []
        }),
      /do not exactly match the resolved media manifest/u
    );
    assert.throws(
      () =>
        renderPagePreviewFile({
          pageJson: pageJson(),
          targetUrl: "/entruempelung-dachau/",
          mediaVariants: mediaVariants()
        }),
      /do not exactly match the resolved media manifest/u
    );
  });

  void it("renders editor preview with noindex while sharing the static renderer", () => {
    const file = renderPagePreviewFile({
      pageJson: pageJson({
        seo: {
          title: "Dachreinigung Dachau",
          metaDescription: "Lokale Dachreinigung in Dachau.",
          canonicalPath: "/dachreinigung-dachau/",
          robots: "index",
          jsonLd: [],
          sitemapReady: false
        }
      }),
      targetUrl: "/dachreinigung-dachau/"
    });

    assert.equal(file.path, "/dachreinigung-dachau/index.html");
    assert.match(file.body, /<meta name="robots" content="noindex">/u);
    assert.match(file.body, /@layer reset, tokens, base, primitives, components, sections/u);
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

function headerSection(input: Partial<PageJson["sections"][number]> = {}): PageJson["sections"][number] {
  return {
    id: "header-1",
    type: "Header",
    registryKey: "Header.default",
    schemaVersion: 1,
    zone: "frame_top",
    order: 0,
    variant: "default",
    props: {
      brandName: "Dach Service"
    },
    evidenceRefs: [],
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

const mediaAssetId = "10000000-0000-4000-8000-000000000001";

function imageTextSection(input: Partial<PageJson["sections"][number]> = {}): PageJson["sections"][number] {
  return {
    id: "image-text-1",
    type: "ImageText",
    registryKey: "ImageText.default",
    schemaVersion: 1,
    zone: "proof_media",
    order: 1,
    variant: "media_left",
    props: {
      heading: "Local proof",
      body: "Verified work completed for a customer in Dachau.",
      media: {
        assetId: mediaAssetId,
        purpose: "content",
        alt: "Completed courtyard clearance in Dachau",
        focalPoint: { x: 0.25, y: 0.75 }
      }
    },
    evidenceRefs: [],
    ...input
  };
}

function mediaVariants(): ResolvedPageMediaVariant[] {
  return [
    {
      assetId: mediaAssetId,
      variantKey: "640w",
      contentType: "image/webp",
      width: 640,
      height: 480,
      byteSize: 12,
      sha256: "a".repeat(64),
      path: `/assets/${mediaAssetId}/${"a".repeat(64)}-640.webp`
    },
    {
      assetId: mediaAssetId,
      variantKey: "1280w",
      contentType: "image/webp",
      width: 1280,
      height: 960,
      byteSize: 24,
      sha256: "b".repeat(64),
      path: `/assets/${mediaAssetId}/${"b".repeat(64)}-1280.webp`
    }
  ];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
