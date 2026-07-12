import type { PageSectionInstance, PageVersionDetail, PageVersionSummary } from "@localseo/contracts";
import type { PageRegistryEditorField } from "@localseo/page-registry";

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

export function normalizeEditorProps(
  value: Record<string, unknown>,
  fields: readonly PageRegistryEditorField[]
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const field of fields) {
    const fieldValue = value[field.key];

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
