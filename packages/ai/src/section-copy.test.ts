import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSectionCopyEvidencePacket,
  buildSectionCopyPrompt,
  evaluateSectionCopyRevision,
  sectionCopyEvidencePacketLimits
} from "./index.js";

void describe("section copy reasoning boundary", () => {
  void it("builds a bounded prompt that keeps application and production authority outside AI", () => {
    const prompt = buildSectionCopyPrompt();

    assert.match(prompt, /one pinned Page Studio section/u);
    assert.match(prompt, /never edit PageJson/u);
    assert.match(prompt, /operator explicitly reviews and applies/u);
    assert.match(prompt, /Do not invent metrics/u);
    assert.match(prompt, /allowedCopyFields/u);
  });

  void it("caps and deterministically orders section context", () => {
    const packet = buildSectionCopyEvidencePacket({
      projectId: "project-1",
      runId: "run-1",
      suggestionId: "suggestion-1",
      pageVersionId: "version-1",
      generatedAt: "2026-07-12T12:00:00.000Z",
      pageContext: {
        route: "/dachreinigung-muenchen/",
        pageType: "service_area_page",
        target: {
          service: "Dachreinigung",
          location: "Muenchen",
          primaryKeyword: "dachreinigung muenchen",
          secondaryKeywords: []
        },
        seo: { title: "Dachreinigung Muenchen", metaDescription: "Dachreinigung vor Ort." }
      },
      currentSection: {
        id: "hero-1",
        type: "Hero",
        registryKey: "Hero.default",
        schemaVersion: 1,
        zone: "hero",
        variant: "default",
        props: { h1: "Dachreinigung Muenchen", lead: "Bestehende Einleitung." },
        evidenceRefs: []
      },
      surroundingSections: Array.from({ length: 8 }, (_, index) => ({
        id: `section-${index}`,
        type: "ServiceIntro" as const,
        registryKey: "ServiceIntro.default",
        order: 8 - index,
        props: { heading: `Heading ${index}` }
      })),
      allowedCopyFields: ["lead", "h1", "h1"]
    });

    assert.deepEqual(packet.allowedCopyFields, ["h1", "lead"]);
    assert.equal(packet.surroundingSections.length, sectionCopyEvidencePacketLimits.surroundingSections);
    assert.deepEqual(
      packet.surroundingSections.map((section) => section.order),
      [1, 2, 3, 4]
    );
  });

  void it("merges only allowed copy fields while preserving protected props", () => {
    const result = evaluateSectionCopyRevision({
      output: {
        schemaVersion: 1,
        sectionId: "hero-1",
        suggestedFields: { h1: "Dachreinigung in Muenchen" }
      },
      sectionId: "hero-1",
      currentProps: {
        h1: "Dachreinigung Muenchen",
        lead: "Bestehende Einleitung.",
        primaryCtaHref: "/kontakt/"
      },
      allowedCopyFields: ["h1", "lead"]
    });

    assert.deepEqual(result, {
      ok: true,
      changedFieldKeys: ["h1"],
      suggestedProps: {
        h1: "Dachreinigung in Muenchen",
        lead: "Bestehende Einleitung.",
        primaryCtaHref: "/kontakt/"
      }
    });
  });

  void it("rejects section drift, protected fields, markup, and no-op output", () => {
    const base = {
      sectionId: "hero-1",
      currentProps: { h1: "Dachreinigung Muenchen", primaryCtaHref: "/kontakt/" },
      allowedCopyFields: ["h1"]
    } as const;

    const wrongSection = evaluateSectionCopyRevision({
      ...base,
      output: { schemaVersion: 1, sectionId: "other", suggestedFields: { h1: "Neue Headline" } }
    });
    const protectedField = evaluateSectionCopyRevision({
      ...base,
      output: { schemaVersion: 1, sectionId: "hero-1", suggestedFields: { primaryCtaHref: "/neu/" } }
    });
    const markup = evaluateSectionCopyRevision({
      ...base,
      output: { schemaVersion: 1, sectionId: "hero-1", suggestedFields: { h1: "<strong>Headline</strong>" } }
    });
    const noChange = evaluateSectionCopyRevision({
      ...base,
      output: { schemaVersion: 1, sectionId: "hero-1", suggestedFields: { h1: "Dachreinigung Muenchen" } }
    });

    assert.equal(wrongSection.ok, false);
    assert.equal(!wrongSection.ok && wrongSection.failure.gateId, "section_scope");
    assert.equal(protectedField.ok, false);
    assert.equal(!protectedField.ok && protectedField.failure.gateId, "field_scope");
    assert.equal(markup.ok, false);
    assert.equal(!markup.ok && markup.failure.gateId, "markup_safety");
    assert.equal(noChange.ok, false);
    assert.equal(!noChange.ok && noChange.failure.gateId, "no_change");
  });
});
