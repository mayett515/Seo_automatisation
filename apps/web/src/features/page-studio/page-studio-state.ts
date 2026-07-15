import type {
  PageJson,
  PageSectionInstance,
  PageVersionDetail,
  PageVersionSummary,
  SectionCopySuggestion
} from "@localseo/contracts";
import { decideReplacePageSection } from "@localseo/domain";
import type { PageRegistryEditorField, PageRegistryEntrySummary } from "@localseo/page-registry";

export function latestVersionForProposal(
  selected: Pick<PageVersionSummary, "pageProposalId">,
  versions: readonly PageVersionSummary[]
): PageVersionSummary | undefined {
  return versions
    .filter((version) => version.pageProposalId === selected.pageProposalId)
    .reduce<
      PageVersionSummary | undefined
    >((latest, version) => (!latest || version.versionNumber > latest.versionNumber ? version : latest), undefined);
}

export function pageVersionAncestors(
  selected: Pick<PageVersionSummary, "id" | "basedOnVersionId">,
  versions: readonly PageVersionSummary[]
): PageVersionSummary[] {
  const byId = new Map(versions.map((version) => [version.id, version]));
  const ancestors: PageVersionSummary[] = [];
  const visited = new Set<string>([selected.id]);
  let nextId = selected.basedOnVersionId;

  while (nextId && !visited.has(nextId) && ancestors.length < 500) {
    visited.add(nextId);
    const version = byId.get(nextId);
    if (!version) {
      break;
    }

    ancestors.push(version);
    nextId = version.basedOnVersionId;
  }

  return ancestors;
}

export function orderedPageSections(pageVersion: PageVersionDetail): PageSectionInstance[] {
  return pageVersion.pageJson.sections
    .map((section, index) => ({ section, index }))
    .sort((left, right) => left.section.order - right.section.order || left.index - right.index)
    .map(({ section }) => section);
}

export function latestCopySuggestionForSection(
  sectionId: string,
  suggestions: readonly SectionCopySuggestion[]
): SectionCopySuggestion | undefined {
  return suggestions
    .filter((suggestion) => suggestion.sectionId === sectionId)
    .reduce<SectionCopySuggestion | undefined>((latest, suggestion) => {
      if (!latest) {
        return suggestion;
      }

      return Date.parse(suggestion.createdAt) > Date.parse(latest.createdAt) ? suggestion : latest;
    }, undefined);
}

export function normalizeEditorProps(
  value: Record<string, unknown>,
  fields: readonly PageRegistryEditorField[]
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const field of fields) {
    const fieldValue = value[field.key];

    if (field.control === "asset") {
      normalized[field.key] = fieldValue;
      continue;
    }

    if (field.control !== "list") {
      if (field.optional && typeof fieldValue === "string" && fieldValue.trim().length === 0) {
        continue;
      }

      normalized[field.key] = typeof fieldValue === "string" ? fieldValue.trim() : fieldValue;
      continue;
    }

    const items = Array.isArray(fieldValue) ? fieldValue : [];
    normalized[field.key] = items.map((item) => normalizeListItem(item, field.optionalItemKeys ?? []));
  }

  return normalized;
}

export function createEmptyEditorProps(fields: readonly PageRegistryEditorField[]): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field) => [
      field.key,
      field.control === "list"
        ? Array.from({ length: field.minItems ?? 0 }, () => cloneEditorValue(field.itemTemplate))
        : field.control === "asset"
          ? undefined
          : ""
    ])
  );
}

export function legalReplacementEntries(
  pageJson: PageJson,
  sectionId: string,
  registryEntries: readonly PageRegistryEntrySummary[]
): PageRegistryEntrySummary[] {
  const current = pageJson.sections.find((section) => section.id === sectionId);
  if (!current) {
    return [];
  }

  return registryEntries.filter((entry) => {
    if (entry.registryKey === current.registryKey) {
      return false;
    }

    return (
      decideReplacePageSection({
        pageJson,
        sectionId,
        replacement: {
          type: entry.type,
          registryKey: entry.registryKey,
          schemaVersion: entry.schemaVersion,
          zone: current.zone,
          variant: entry.defaultVariant,
          props: {}
        },
        registryEntries
      }).kind === "allow"
    );
  });
}

function normalizeListItem(item: unknown, optionalKeys: readonly string[]): unknown {
  if (typeof item === "string") {
    return item.trim();
  }

  if (!isRecord(item)) {
    return item;
  }

  return Object.fromEntries(
    Object.entries(item).flatMap(([key, value]) => {
      if (optionalKeys.includes(key) && typeof value === "string" && value.trim().length === 0) {
        return [];
      }

      return [[key, typeof value === "string" ? value.trim() : value]];
    })
  );
}

export function cloneEditorValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneEditorValue);
  }

  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneEditorValue(item)]));
  }

  return value;
}

export function editorListItemValue(value: unknown, template: string | Readonly<Record<string, string>>): unknown {
  if (typeof template === "string") {
    return typeof value === "string" ? value : template;
  }

  const clonedTemplate = cloneEditorValue(template);
  if (!isRecord(clonedTemplate)) {
    return value;
  }

  return isRecord(value) ? { ...clonedTemplate, ...value } : clonedTemplate;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
