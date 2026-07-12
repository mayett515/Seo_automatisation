import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PageJson, PageSectionInstance, PageVersionSummary } from "@localseo/contracts";
import { pageRegistrySummary } from "@localseo/page-registry";
import {
  createEmptyEditorProps,
  editorListItemValue,
  legalReplacementEntries,
  latestVersionForProposal,
  normalizeEditorProps,
  pageVersionAncestors
} from "./page-studio-state.js";

void describe("Page Studio client state", () => {
  void it("selects the latest version without relying on API arrival order", () => {
    const versions = [version("v2", 2, "v1"), version("other", 9, undefined, "other-proposal"), version("v1", 1)];

    assert.equal(latestVersionForProposal(versions[0]!, versions)?.id, "v2");
  });

  void it("walks direct lineage nearest-first and stops safely on a cycle", () => {
    const versions = [version("v1", 1, "v3"), version("v2", 2, "v1"), version("v3", 3, "v2")];

    assert.deepEqual(
      pageVersionAncestors(versions[2]!, versions).map((item) => item.id),
      ["v2", "v1"]
    );
  });

  void it("normalizes complete replacement props without inventing omitted optional fields", () => {
    assert.deepEqual(
      normalizeEditorProps(
        {
          h1: "  Dachreinigung  ",
          trustLine: "  ",
          areas: [{ name: " Muenchen ", route: " " }]
        },
        [
          { key: "h1", label: "Headline", control: "text" },
          { key: "trustLine", label: "Trust line", control: "text", optional: true },
          {
            key: "areas",
            label: "Areas",
            control: "list",
            itemLabel: "Area",
            itemTemplate: { name: "", route: "/" },
            optionalItemKeys: ["route"]
          }
        ]
      ),
      { h1: "Dachreinigung", areas: [{ name: "Muenchen" }] }
    );
  });

  void it("restores registry-owned optional list inputs from the item template", () => {
    assert.deepEqual(editorListItemValue({ name: "Muenchen" }, { name: "", route: "/" }), {
      name: "Muenchen",
      route: "/"
    });
  });

  void it("creates required replacement rows from registry editor metadata", () => {
    const benefits = pageRegistrySummary.find((entry) => entry.registryKey === "BenefitsGrid.default");
    assert.ok(benefits);

    assert.deepEqual(createEmptyEditorProps(benefits.editorFields), {
      heading: "",
      benefits: [
        { title: "", body: "" },
        { title: "", body: "" }
      ]
    });
  });

  void it("offers only domain-approved replacements for the selected section slot", () => {
    const page = replacementPageJson();

    assert.deepEqual(
      legalReplacementEntries(page, "benefits-1", pageRegistrySummary).map((entry) => entry.registryKey),
      ["ServiceIntro.default", "ServiceDescription.default"]
    );
    assert.deepEqual(legalReplacementEntries(page, "hero-1", pageRegistrySummary), []);
  });
});

function version(
  id: string,
  versionNumber: number,
  basedOnVersionId?: string,
  pageProposalId = "proposal-1"
): PageVersionSummary {
  return {
    id,
    projectId: "project-1",
    pageProposalId,
    route: "/dachreinigung/",
    primaryKeyword: "Dachreinigung",
    uniquenessRationale: "Dedicated local page.",
    proposalStatus: "draft",
    sitemapReady: true,
    versionNumber,
    status: "preview",
    basedOnVersionId,
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z"
  };
}

function replacementPageJson(): PageJson {
  return {
    schemaVersion: 1,
    route: "/dachreinigung/",
    pageType: "service_area_page",
    target: {
      service: "Dachreinigung",
      primaryKeyword: "Dachreinigung Muenchen",
      secondaryKeywords: []
    },
    seo: {
      title: "Dachreinigung Muenchen",
      metaDescription: "Lokale Dachreinigung in Muenchen.",
      canonicalPath: "/dachreinigung/",
      robots: "noindex",
      jsonLd: [],
      sitemapReady: false
    },
    sections: [
      replacementSection("header-1", "Header", "Header.default", "frame_top", 0),
      replacementSection("hero-1", "Hero", "Hero.default", "hero", 1),
      replacementSection("benefits-1", "BenefitsGrid", "BenefitsGrid.default", "body_main", 2),
      replacementSection("cta-1", "FinalCTA", "FinalCTA.default", "cta_late", 3),
      replacementSection("footer-1", "Footer", "Footer.default", "frame_bottom", 4)
    ],
    internalLinks: [],
    evidenceRefs: []
  };
}

function replacementSection(
  id: string,
  type: PageSectionInstance["type"],
  registryKey: string,
  zone: PageSectionInstance["zone"],
  order: number
): PageSectionInstance {
  return {
    id,
    type,
    registryKey,
    schemaVersion: 1,
    zone,
    order,
    variant: "default",
    props: {},
    evidenceRefs: []
  };
}
