import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PageVersionSummary } from "@localseo/contracts";
import {
  editorListItemValue,
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
