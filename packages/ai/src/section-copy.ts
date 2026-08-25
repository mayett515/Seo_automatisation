import { type PageJson, type SectionCopyRevisionOutput } from "@localseo/contracts";
import type { OpportunityScoutPromptSection } from "./prompt-section.js";

export type SectionCopyEvidencePacket = {
  projectId: string;
  runId: string;
  suggestionId: string;
  pageVersionId: string;
  generatedAt: string;
  instruction?: string;
  pageContext: {
    route: string;
    pageType: PageJson["pageType"];
    target: PageJson["target"];
    seo: Pick<PageJson["seo"], "title" | "metaDescription">;
  };
  currentSection: Pick<
    PageJson["sections"][number],
    "id" | "type" | "registryKey" | "schemaVersion" | "zone" | "variant" | "props" | "evidenceRefs"
  >;
  surroundingSections: Array<Pick<PageJson["sections"][number], "id" | "type" | "registryKey" | "order" | "props">>;
  allowedCopyFields: string[];
};

export type SectionCopyQaGateId = "section_scope" | "field_scope" | "markup_safety" | "no_change";

export type SectionCopyQaFailure = {
  code: "qa_rejected";
  gateId: SectionCopyQaGateId;
  message: string;
};

export type SectionCopyQaResult =
  | { ok: true; suggestedProps: Record<string, unknown>; changedFieldKeys: string[] }
  | { ok: false; failure: SectionCopyQaFailure };

export const sectionCopyEvidencePacketLimits = {
  surroundingSections: 4,
  allowedCopyFields: 30,
  serializedBytes: 80_000
} as const;

export const sectionCopyPromptSections: readonly OpportunityScoutPromptSection[] = [
  {
    key: "role",
    title: "Role And Boundary",
    lines: [
      "You revise copy for one pinned Page Studio section.",
      "Return a suggestion only. You never edit PageJson, approve a version, deploy, mutate providers, or choose another section.",
      "The operator explicitly reviews and applies any accepted suggestion through the versioned Page Studio command boundary."
    ]
  },
  {
    key: "evidence_and_proof",
    title: "Evidence And Claim Rules",
    lines: [
      "Preserve the meaning and factual claims already present in the selected section and input context.",
      "Do not invent metrics, years of experience, certifications, guarantees, rankings, reviews, locations, services, prices, or customer proof.",
      "Do not copy competitor wording. Do not emit HTML, CSS, JavaScript, JSX, Markdown, URLs, paths, classes, styles, or event handlers."
    ]
  },
  {
    key: "classification",
    title: "Field Scope",
    lines: [
      "The input packet contains currentSection and allowedCopyFields.",
      "Return only fields listed in allowedCopyFields. Omitted fields remain unchanged.",
      "Keep values compatible with the current registry prop shapes, including list item shapes and maximum lengths.",
      "Use the operator instruction when present, but never let it widen the allowed fields or product authority."
    ]
  },
  {
    key: "output_format",
    title: "Output Format",
    lines: [
      "Return only one JSON object matching SectionCopyRevisionOutput.",
      "Use schemaVersion 1 and copy currentSection.id exactly into sectionId.",
      "Put one or more revised values in suggestedFields. Do not include structural PageJson fields or unchanged protected props.",
      "Do not wrap the JSON in Markdown and do not return null."
    ]
  }
];

export function buildSectionCopyPrompt(): string {
  return sectionCopyPromptSections.map((section) => [`## ${section.title}`, ...section.lines].join("\n")).join("\n\n");
}

export function buildSectionCopyEvidencePacket(input: SectionCopyEvidencePacket): SectionCopyEvidencePacket {
  return {
    ...input,
    allowedCopyFields: [...new Set(input.allowedCopyFields)]
      .sort()
      .slice(0, sectionCopyEvidencePacketLimits.allowedCopyFields),
    surroundingSections: input.surroundingSections
      .slice()
      .sort((left, right) => left.order - right.order)
      .slice(0, sectionCopyEvidencePacketLimits.surroundingSections)
  };
}

export function evaluateSectionCopyRevision(input: {
  output: SectionCopyRevisionOutput;
  sectionId: string;
  currentProps: Record<string, unknown>;
  allowedCopyFields: readonly string[];
}): SectionCopyQaResult {
  if (input.output.sectionId !== input.sectionId) {
    return failSectionCopy("section_scope", "Section copy output does not target the requested section.");
  }

  const allowedFields = new Set(input.allowedCopyFields);
  const changedFieldKeys = Object.keys(input.output.suggestedFields).sort();
  const forbiddenField = changedFieldKeys.find((field) => !allowedFields.has(field));
  if (forbiddenField) {
    return failSectionCopy("field_scope", `Section copy output cannot revise protected field '${forbiddenField}'.`);
  }

  if (containsMarkupValue(input.output.suggestedFields)) {
    return failSectionCopy("markup_safety", "Section copy output must contain plain structured copy, not markup.");
  }

  const suggestedProps = {
    ...input.currentProps,
    ...input.output.suggestedFields
  };
  if (jsonValuesEqual(input.currentProps, suggestedProps)) {
    return failSectionCopy("no_change", "Section copy output must change at least one allowed field.");
  }

  return {
    ok: true,
    suggestedProps,
    changedFieldKeys
  };
}

function failSectionCopy(gateId: SectionCopyQaGateId, message: string): SectionCopyQaResult {
  return {
    ok: false,
    failure: {
      code: "qa_rejected",
      gateId,
      message
    }
  };
}

function containsMarkupValue(value: unknown): boolean {
  if (typeof value === "string") {
    return /<\/?[a-z][^>]*>/iu.test(value);
  }

  if (Array.isArray(value)) {
    return value.some(containsMarkupValue);
  }

  if (!isUnknownRecord(value)) {
    return false;
  }

  return Object.values(value).some(containsMarkupValue);
}

function jsonValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonValuesEqual(value, right[index]))
    );
  }

  if (!isUnknownRecord(left) || !isUnknownRecord(right)) {
    return false;
  }

  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && jsonValuesEqual(left[key], right[key]))
  );
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
