import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PageJson, PageSectionInstance, PageSectionType, PageZone } from "@localseo/contracts";
import {
  decideMovePageSection,
  decidePageStudioPublishReadiness,
  decideReplacePageSection,
  decideSwitchPageSectionVariant,
  getPageStudioSectionCapabilities,
  movePageSection,
  replacePageSection,
  switchPageSectionVariant,
  validatePageStudioComposition,
  type PageStudioRegistryEntry
} from "./page-studio.js";

void describe("Page Studio composition decisions", () => {
  void it("accepts the MVP Local SEO page skeleton", () => {
    assert.deepEqual(validatePageStudioComposition(pageJson(), registryEntries), { success: true });
    assert.deepEqual(decidePageStudioPublishReadiness(pageJson(), registryEntries), { kind: "ready" });
  });

  void it("blocks publish readiness when required frame sections are missing", () => {
    const page = pageJson({
      sections: pageJson()
        .sections.filter((section) => section.type !== "FinalCTA")
        .map((section, order) => ({
          ...section,
          order
        }))
    });

    const readiness = decidePageStudioPublishReadiness(page, registryEntries);

    assert.equal(readiness.kind, "blocked");
    assertIssue(readiness.issues, "missing_required_section");
  });

  void it("rejects duplicate singleton frame sections", () => {
    const page = pageJson({
      sections: [
        ...pageJson().sections,
        section({
          id: "hero-duplicate",
          type: "Hero",
          registryKey: "Hero.default",
          zone: "hero",
          order: 9
        })
      ]
    });

    const result = validatePageStudioComposition(page, registryEntries);

    assert.equal(result.success, false);
    assertIssue(result.issues, "duplicate_singleton_section");
  });

  void it("rejects non-contiguous and duplicate section order values", () => {
    const page = pageJson({
      sections: pageJson().sections.map((section) => (section.id === "benefits-1" ? { ...section, order: 3 } : section))
    });

    const result = validatePageStudioComposition(page, registryEntries);

    assert.equal(result.success, false);
    assertIssue(result.issues, "duplicate_section_order");
    assertIssue(result.issues, "non_contiguous_section_order");
  });

  void it("rejects pages whose locked sections drift out of position", () => {
    const page = pageJson({
      sections: pageJson().sections.map((section) => {
        if (section.id === "hero-1") {
          return { ...section, order: 2 };
        }

        if (section.id === "intro-1") {
          return { ...section, order: 1 };
        }

        return section;
      })
    });

    const result = validatePageStudioComposition(page, registryEntries);

    assert.equal(result.success, false);
    assertIssue(result.issues, "illegal_section_order");
  });
});

void describe("Page Studio movement decisions", () => {
  void it("moves flexible body sections within a legal zone", () => {
    const result = movePageSection({
      pageJson: pageJson(),
      sectionId: "benefits-1",
      direction: "up",
      registryEntries
    });

    assert.equal(result.success, true);

    if (result.success) {
      assert.deepEqual(
        result.pageJson.sections.map((section) => section.id),
        ["header-1", "hero-1", "intro-1", "benefits-1", "description-1", "faq-1", "areas-1", "final-cta-1", "footer-1"]
      );
      assert.deepEqual(
        result.pageJson.sections.map((section) => section.order),
        [0, 1, 2, 3, 4, 5, 6, 7, 8]
      );
    }
  });

  void it("denies movement for locked sections", () => {
    assert.deepEqual(
      decideMovePageSection({
        pageJson: pageJson(),
        sectionId: "hero-1",
        direction: "down",
        registryEntries
      }),
      { kind: "deny", reason: "section_locked" }
    );
  });

  void it("denies movement that would break zone ordering", () => {
    const decision = decideMovePageSection({
      pageJson: pageJson(),
      sectionId: "intro-1",
      direction: "down",
      registryEntries
    });

    assert.equal(decision.kind, "deny");

    if (decision.kind === "deny") {
      assert.equal(decision.reason, "would_break_composition");
      assertIssue(decision.issues ?? [], "illegal_section_order");
    }
  });
});

void describe("Page Studio variant and replacement decisions", () => {
  void it("switches variants even for locked frame sections", () => {
    const result = switchPageSectionVariant({
      pageJson: pageJson(),
      sectionId: "hero-1",
      variant: "split",
      registryEntries
    });

    assert.equal(result.success, true);

    if (result.success) {
      assert.equal(result.pageJson.sections.find((section) => section.id === "hero-1")?.variant, "split");
    }
  });

  void it("rejects unknown variants", () => {
    assert.deepEqual(
      decideSwitchPageSectionVariant({
        pageJson: pageJson(),
        sectionId: "hero-1",
        variant: "floating",
        registryEntries
      }),
      { kind: "deny", reason: "unknown_variant" }
    );
  });

  void it("allows replacing a flexible body section with another legal body section", () => {
    const result = replacePageSection({
      pageJson: pageJson(),
      sectionId: "benefits-1",
      replacement: {
        type: "ServiceDescription",
        registryKey: "ServiceDescription.default",
        schemaVersion: 1,
        zone: "body_main",
        variant: "detailed",
        props: { heading: "Mehr Details", paragraphs: ["Lokale Details fuer Dachau."] }
      },
      registryEntries
    });

    assert.equal(result.success, true);

    if (result.success) {
      const replaced = result.pageJson.sections.find((section) => section.id === "benefits-1");
      assert.equal(replaced?.type, "ServiceDescription");
      assert.equal(replaced?.order, 4);
    }
  });

  void it("denies replacing locked sections", () => {
    assert.deepEqual(
      decideReplacePageSection({
        pageJson: pageJson(),
        sectionId: "header-1",
        replacement: {
          type: "ServiceIntro",
          registryKey: "ServiceIntro.default",
          schemaVersion: 1,
          zone: "body_intro",
          variant: "default",
          props: {}
        },
        registryEntries
      }),
      { kind: "deny", reason: "section_locked" }
    );
  });

  void it("reports section capabilities for UI controls", () => {
    assert.deepEqual(getPageStudioSectionCapabilities({ pageJson: pageJson(), sectionId: "hero-1", registryEntries }), {
      found: true,
      canMove: false,
      canDelete: false,
      canSwitchVariant: true,
      allowedMoveZones: ["hero"],
      variants: ["default", "split", "compact"]
    });

    assert.deepEqual(
      getPageStudioSectionCapabilities({ pageJson: pageJson(), sectionId: "description-1", registryEntries }),
      {
        found: true,
        canMove: true,
        canDelete: true,
        canSwitchVariant: true,
        allowedMoveZones: ["body_main"],
        variants: ["default", "detailed"]
      }
    );
  });
});

function assertIssue(issues: readonly { code: string }[], code: string): void {
  assert.ok(
    issues.some((issue) => issue.code === code),
    `Expected Page Studio issue '${code}'.`
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
    sections: [
      section({ id: "header-1", type: "Header", registryKey: "Header.default", zone: "frame_top", order: 0 }),
      section({ id: "hero-1", type: "Hero", registryKey: "Hero.default", zone: "hero", order: 1 }),
      section({
        id: "intro-1",
        type: "ServiceIntro",
        registryKey: "ServiceIntro.default",
        zone: "body_intro",
        order: 2
      }),
      section({
        id: "description-1",
        type: "ServiceDescription",
        registryKey: "ServiceDescription.default",
        zone: "body_main",
        order: 3
      }),
      section({
        id: "benefits-1",
        type: "BenefitsGrid",
        registryKey: "BenefitsGrid.default",
        zone: "body_main",
        order: 4
      }),
      section({ id: "faq-1", type: "FAQ", registryKey: "FAQ.default", zone: "body_late", order: 5 }),
      section({
        id: "areas-1",
        type: "ServiceAreaList",
        registryKey: "ServiceAreaList.default",
        zone: "body_late",
        order: 6
      }),
      section({ id: "final-cta-1", type: "FinalCTA", registryKey: "FinalCTA.default", zone: "cta_late", order: 7 }),
      section({ id: "footer-1", type: "Footer", registryKey: "Footer.default", zone: "frame_bottom", order: 8 })
    ],
    internalLinks: [],
    evidenceRefs: [],
    uniquenessRationale: "Dachau-specific service page.",
    ...input
  };
}

function section(input: {
  id: string;
  type: PageSectionType;
  registryKey: string;
  zone: PageZone;
  order: number;
  variant?: string;
}): PageSectionInstance {
  return {
    schemaVersion: 1,
    variant: input.variant ?? "default",
    props: {},
    evidenceRefs: [],
    ...input
  };
}

const registryEntries = [
  registryEntry("Header", "Header.default", "frame_top", ["frame_top"], ["default", "compact"]),
  registryEntry("Hero", "Hero.default", "hero", ["hero"], ["default", "split", "compact"]),
  registryEntry(
    "ServiceIntro",
    "ServiceIntro.default",
    "body_intro",
    ["body_intro", "body_main"],
    ["default", "compact"]
  ),
  registryEntry(
    "ServiceDescription",
    "ServiceDescription.default",
    "body_main",
    ["body_main"],
    ["default", "detailed"]
  ),
  registryEntry(
    "BenefitsGrid",
    "BenefitsGrid.default",
    "body_main",
    ["body_main", "proof_media"],
    ["default", "icons"]
  ),
  registryEntry("FAQ", "FAQ.default", "body_late", ["body_late"], ["default", "accordion"]),
  registryEntry("ServiceAreaList", "ServiceAreaList.default", "body_late", ["body_late"], ["default", "columns"]),
  registryEntry("FinalCTA", "FinalCTA.default", "cta_late", ["cta_late"], ["default", "contact"]),
  registryEntry("Footer", "Footer.default", "frame_bottom", ["frame_bottom"], ["default", "compact"])
] as const satisfies readonly PageStudioRegistryEntry[];

function registryEntry(
  type: PageSectionType,
  registryKey: string,
  defaultZone: PageZone,
  allowedZones: readonly PageZone[],
  variants: readonly string[]
): PageStudioRegistryEntry {
  return {
    type,
    registryKey,
    schemaVersion: 1,
    defaultZone,
    allowedZones,
    variants,
    defaultVariant: variants[0] ?? "default"
  };
}
