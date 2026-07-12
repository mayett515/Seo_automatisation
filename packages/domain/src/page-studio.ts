import {
  pageZones,
  type PageJson,
  type PageGeneration,
  type PageSectionInstance,
  type PageSectionType,
  type PageStudioEditCommand,
  type PageZone
} from "@localseo/contracts";

/**
 * Functional Core
 *
 * Purpose:
 * Decide which Page Studio outline actions are legal for an already parsed
 * PageJson document.
 *
 * May:
 * - inspect PageJson sections
 * - inspect registry summary metadata
 * - return typed decisions and transformed PageJson copies
 *
 * May NOT:
 * - validate section props with Zod
 * - render HTML/CSS
 * - access repositories, queues, providers, or UI frameworks
 */

export type PageStudioRegistryEntry = {
  type: PageSectionType;
  registryKey: string;
  schemaVersion: number;
  defaultZone: PageZone;
  allowedZones: readonly PageZone[];
  variants: readonly string[];
  defaultVariant: string;
};

export type PageStudioCompositionIssueCode =
  | "unknown_registry_key"
  | "section_type_mismatch"
  | "schema_version_mismatch"
  | "illegal_zone"
  | "unknown_variant"
  | "missing_required_section"
  | "duplicate_singleton_section"
  | "duplicate_section_order"
  | "non_contiguous_section_order"
  | "illegal_section_order";

export type PageStudioCompositionIssue = {
  code: PageStudioCompositionIssueCode;
  message: string;
  path: Array<string | number>;
  sectionIndex?: number;
  sectionId?: string;
  registryKey?: string;
};

export type PageStudioCompositionResult = { success: true } | { success: false; issues: PageStudioCompositionIssue[] };

export type PageStudioPublishReadiness = { kind: "ready" } | { kind: "blocked"; issues: PageStudioCompositionIssue[] };

export type PageStudioMoveDirection = "up" | "down";

export type PageStudioDecisionDenyReason =
  | "section_not_found"
  | "section_locked"
  | "no_adjacent_section"
  | "unknown_registry_key"
  | "section_type_mismatch"
  | "schema_version_mismatch"
  | "illegal_zone"
  | "unknown_variant"
  | "would_break_composition";

export type PageStudioActionDecision =
  | { kind: "allow" }
  | { kind: "noop"; reason: "already_selected" }
  | { kind: "deny"; reason: PageStudioDecisionDenyReason; issues?: PageStudioCompositionIssue[] };

export type PageStudioMutationResult =
  | { success: true; pageJson: PageJson }
  | { success: false; decision: Exclude<PageStudioActionDecision, { kind: "allow" }> };

export type SectionCopySuggestionAttributionDecision =
  | { kind: "agent"; generation: PageGeneration }
  | { kind: "human_modified"; generation: PageGeneration };

export type PageStudioReplacementSection = Pick<
  PageSectionInstance,
  "type" | "registryKey" | "schemaVersion" | "zone" | "variant" | "props"
> &
  Partial<Pick<PageSectionInstance, "evidenceRefs" | "generation">>;

type IndexedSection = {
  section: PageSectionInstance;
  sectionIndex: number;
};

const requiredSectionTypes = ["Header", "Hero", "FinalCTA", "Footer"] as const satisfies readonly PageSectionType[];
const singletonSectionTypes = new Set<PageSectionType>(requiredSectionTypes);
const lockedSectionTypes = new Set<PageSectionType>(requiredSectionTypes);
const zoneRank = new Map<PageZone, number>(pageZones.map((zone, index) => [zone, index]));

export function validatePageStudioComposition(
  pageJson: PageJson,
  registryEntries: readonly PageStudioRegistryEntry[] = []
): PageStudioCompositionResult {
  const issues: PageStudioCompositionIssue[] = [];
  const ordered = orderedSections(pageJson);

  addRegistrySummaryIssues(pageJson, registryEntries, issues);
  addOrderNumberIssues(ordered, issues);
  addRequiredSectionIssues(pageJson, issues);
  addLayoutOrderIssues(ordered, issues);

  return issues.length > 0 ? { success: false, issues } : { success: true };
}

export function decidePageStudioPublishReadiness(
  pageJson: PageJson,
  registryEntries: readonly PageStudioRegistryEntry[] = []
): PageStudioPublishReadiness {
  const composition = validatePageStudioComposition(pageJson, registryEntries);
  return composition.success ? { kind: "ready" } : { kind: "blocked", issues: composition.issues };
}

export function decideMovePageSection(input: {
  pageJson: PageJson;
  sectionId: string;
  direction: PageStudioMoveDirection;
  registryEntries?: readonly PageStudioRegistryEntry[];
}): PageStudioActionDecision {
  const ordered = orderedSections(input.pageJson);
  const currentIndex = ordered.findIndex((entry) => entry.section.id === input.sectionId);
  const current = ordered[currentIndex];

  if (!current) {
    return { kind: "deny", reason: "section_not_found" };
  }

  if (lockedSectionTypes.has(current.section.type)) {
    return { kind: "deny", reason: "section_locked" };
  }

  const adjacentIndex = input.direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (adjacentIndex < 0 || adjacentIndex >= ordered.length) {
    return { kind: "deny", reason: "no_adjacent_section" };
  }

  const candidate = swapOrderedSections(ordered, currentIndex, adjacentIndex);
  const candidatePage = pageJsonWithOrderedSections(input.pageJson, candidate);
  const composition = validatePageStudioComposition(candidatePage, input.registryEntries);

  if (!composition.success) {
    return { kind: "deny", reason: "would_break_composition", issues: composition.issues };
  }

  return { kind: "allow" };
}

export function movePageSection(input: {
  pageJson: PageJson;
  sectionId: string;
  direction: PageStudioMoveDirection;
  registryEntries?: readonly PageStudioRegistryEntry[];
}): PageStudioMutationResult {
  const decision = decideMovePageSection(input);

  if (decision.kind !== "allow") {
    return { success: false, decision };
  }

  const ordered = orderedSections(input.pageJson);
  const currentIndex = ordered.findIndex((entry) => entry.section.id === input.sectionId);
  const adjacentIndex = input.direction === "up" ? currentIndex - 1 : currentIndex + 1;
  return {
    success: true,
    pageJson: pageJsonWithOrderedSections(input.pageJson, swapOrderedSections(ordered, currentIndex, adjacentIndex))
  };
}

export function decideSwitchPageSectionVariant(input: {
  pageJson: PageJson;
  sectionId: string;
  variant: string;
  registryEntries: readonly PageStudioRegistryEntry[];
}): PageStudioActionDecision {
  const section = findSection(input.pageJson, input.sectionId)?.section;

  if (!section) {
    return { kind: "deny", reason: "section_not_found" };
  }

  const entryDecision = decideSectionRegistryEntry(section, input.registryEntries);

  if (entryDecision.kind === "deny") {
    return entryDecision;
  }

  if (!entryDecision.entry.variants.includes(input.variant)) {
    return { kind: "deny", reason: "unknown_variant" };
  }

  if (section.variant === input.variant) {
    return { kind: "noop", reason: "already_selected" };
  }

  return { kind: "allow" };
}

export function switchPageSectionVariant(input: {
  pageJson: PageJson;
  sectionId: string;
  variant: string;
  registryEntries: readonly PageStudioRegistryEntry[];
}): PageStudioMutationResult {
  const decision = decideSwitchPageSectionVariant(input);

  if (decision.kind !== "allow") {
    return { success: false, decision };
  }

  return {
    success: true,
    pageJson: updateSection(input.pageJson, input.sectionId, (section) => ({
      ...section,
      variant: input.variant
    }))
  };
}

export function updatePageSectionProps(input: {
  pageJson: PageJson;
  sectionId: string;
  props: PageSectionInstance["props"];
}): PageStudioMutationResult {
  if (!findSection(input.pageJson, input.sectionId)) {
    return { success: false, decision: { kind: "deny", reason: "section_not_found" } };
  }

  return {
    success: true,
    pageJson: updateSection(input.pageJson, input.sectionId, (section) => ({
      ...section,
      props: input.props
    }))
  };
}

export function applyPageStudioEditCommand(input: {
  pageJson: PageJson;
  command: PageStudioEditCommand;
  generation: PageGeneration;
  registryEntries: readonly PageStudioRegistryEntry[];
}): PageStudioMutationResult {
  const mutation = applyPageStudioMutation(input);

  if (!mutation.success) {
    return mutation;
  }

  return {
    success: true,
    pageJson: {
      ...mutation.pageJson,
      generation: input.generation,
      sections: mutation.pageJson.sections.map((section) =>
        section.id === input.command.sectionId
          ? {
              ...section,
              generation: input.generation
            }
          : section
      )
    }
  };
}

export function decideSectionCopySuggestionAttribution(input: {
  agentRunId: string;
  suggestedProps: Record<string, unknown>;
  submittedProps: Record<string, unknown>;
}): SectionCopySuggestionAttributionDecision {
  if (jsonValuesEqual(input.suggestedProps, input.submittedProps)) {
    return {
      kind: "agent",
      generation: {
        source: "agent",
        agentRunId: input.agentRunId,
        reason: "page_studio:section_text_generation"
      }
    };
  }

  return {
    kind: "human_modified",
    generation: {
      source: "human",
      reason: "page_studio:section_text_generation_modified"
    }
  };
}

export function decideReplacePageSection(input: {
  pageJson: PageJson;
  sectionId: string;
  replacement: PageStudioReplacementSection;
  registryEntries: readonly PageStudioRegistryEntry[];
}): PageStudioActionDecision {
  const current = findSection(input.pageJson, input.sectionId)?.section;

  if (!current) {
    return { kind: "deny", reason: "section_not_found" };
  }

  if (lockedSectionTypes.has(current.type)) {
    return { kind: "deny", reason: "section_locked" };
  }

  const entryDecision = decideReplacementRegistryEntry(input.replacement, input.registryEntries);

  if (entryDecision.kind === "deny") {
    return entryDecision;
  }

  const candidatePage = replacePageSectionUnchecked(input.pageJson, input.sectionId, input.replacement);
  const composition = validatePageStudioComposition(candidatePage, input.registryEntries);

  if (!composition.success) {
    return { kind: "deny", reason: "would_break_composition", issues: composition.issues };
  }

  return { kind: "allow" };
}

export function replacePageSection(input: {
  pageJson: PageJson;
  sectionId: string;
  replacement: PageStudioReplacementSection;
  registryEntries: readonly PageStudioRegistryEntry[];
}): PageStudioMutationResult {
  const decision = decideReplacePageSection(input);

  if (decision.kind !== "allow") {
    return { success: false, decision };
  }

  return {
    success: true,
    pageJson: replacePageSectionUnchecked(input.pageJson, input.sectionId, input.replacement)
  };
}

export function getPageStudioSectionCapabilities(input: {
  pageJson: PageJson;
  sectionId: string;
  registryEntries: readonly PageStudioRegistryEntry[];
}):
  | {
      found: true;
      canMove: boolean;
      canDelete: boolean;
      canSwitchVariant: boolean;
      allowedMoveZones: readonly PageZone[];
      variants: readonly string[];
    }
  | { found: false } {
  const section = findSection(input.pageJson, input.sectionId)?.section;

  if (!section) {
    return { found: false };
  }

  const entry = findRegistryEntry(input.registryEntries, section.registryKey);

  return {
    found: true,
    canMove: !lockedSectionTypes.has(section.type),
    canDelete: !singletonSectionTypes.has(section.type),
    canSwitchVariant: (entry?.variants.length ?? 0) > 1,
    allowedMoveZones: entry?.allowedZones ?? [section.zone],
    variants: entry?.variants ?? [section.variant]
  };
}

function addRegistrySummaryIssues(
  pageJson: PageJson,
  registryEntries: readonly PageStudioRegistryEntry[],
  issues: PageStudioCompositionIssue[]
): void {
  if (registryEntries.length === 0) {
    return;
  }

  const registry = toRegistryMap(registryEntries);

  pageJson.sections.forEach((section, sectionIndex) => {
    const entry = registry.get(section.registryKey);
    const baseIssue = {
      sectionIndex,
      sectionId: section.id,
      registryKey: section.registryKey
    };

    if (!entry) {
      issues.push({
        ...baseIssue,
        code: "unknown_registry_key",
        path: ["sections", sectionIndex, "registryKey"],
        message: `Unknown page registry key '${section.registryKey}'.`
      });
      return;
    }

    if (entry.type !== section.type) {
      issues.push({
        ...baseIssue,
        code: "section_type_mismatch",
        path: ["sections", sectionIndex, "type"],
        message: `Section '${section.id}' uses type '${section.type}' but registry key '${section.registryKey}' belongs to '${entry.type}'.`
      });
    }

    if (entry.schemaVersion !== section.schemaVersion) {
      issues.push({
        ...baseIssue,
        code: "schema_version_mismatch",
        path: ["sections", sectionIndex, "schemaVersion"],
        message: `Section '${section.id}' uses schemaVersion ${section.schemaVersion}; registry key '${section.registryKey}' expects ${entry.schemaVersion}.`
      });
    }

    if (!entry.allowedZones.includes(section.zone)) {
      issues.push({
        ...baseIssue,
        code: "illegal_zone",
        path: ["sections", sectionIndex, "zone"],
        message: `Section '${section.id}' cannot render in zone '${section.zone}'.`
      });
    }

    if (!entry.variants.includes(section.variant)) {
      issues.push({
        ...baseIssue,
        code: "unknown_variant",
        path: ["sections", sectionIndex, "variant"],
        message: `Section '${section.id}' uses unknown variant '${section.variant}' for registry key '${section.registryKey}'.`
      });
    }
  });
}

function applyPageStudioMutation(input: {
  pageJson: PageJson;
  command: PageStudioEditCommand;
  registryEntries: readonly PageStudioRegistryEntry[];
}): PageStudioMutationResult {
  switch (input.command.type) {
    case "update_section_props":
      return updatePageSectionProps({
        pageJson: input.pageJson,
        sectionId: input.command.sectionId,
        props: input.command.props
      });
    case "move_section":
      return movePageSection({
        pageJson: input.pageJson,
        sectionId: input.command.sectionId,
        direction: input.command.direction,
        registryEntries: input.registryEntries
      });
    case "switch_section_variant":
      return switchPageSectionVariant({
        pageJson: input.pageJson,
        sectionId: input.command.sectionId,
        variant: input.command.variant,
        registryEntries: input.registryEntries
      });
    case "replace_section":
      return replacePageSectionFromCommand({
        pageJson: input.pageJson,
        sectionId: input.command.sectionId,
        registryKey: input.command.registryKey,
        variant: input.command.variant,
        props: input.command.props,
        registryEntries: input.registryEntries
      });
  }
}

function replacePageSectionFromCommand(input: {
  pageJson: PageJson;
  sectionId: string;
  registryKey: string;
  variant: string;
  props: Record<string, unknown>;
  registryEntries: readonly PageStudioRegistryEntry[];
}): PageStudioMutationResult {
  const current = findSection(input.pageJson, input.sectionId)?.section;
  if (!current) {
    return { success: false, decision: { kind: "deny", reason: "section_not_found" } };
  }

  const entry = findRegistryEntry(input.registryEntries, input.registryKey);
  if (!entry) {
    return { success: false, decision: { kind: "deny", reason: "unknown_registry_key" } };
  }

  if (entry.registryKey === current.registryKey) {
    return { success: false, decision: { kind: "noop", reason: "already_selected" } };
  }

  return replacePageSection({
    pageJson: input.pageJson,
    sectionId: input.sectionId,
    replacement: {
      type: entry.type,
      registryKey: entry.registryKey,
      schemaVersion: entry.schemaVersion,
      zone: current.zone,
      variant: input.variant,
      props: input.props
    },
    registryEntries: input.registryEntries
  });
}

function addOrderNumberIssues(ordered: readonly IndexedSection[], issues: PageStudioCompositionIssue[]): void {
  const orderCounts = new Map<number, number>();

  for (const entry of ordered) {
    orderCounts.set(entry.section.order, (orderCounts.get(entry.section.order) ?? 0) + 1);
  }

  for (const [order, count] of orderCounts) {
    if (count > 1) {
      issues.push({
        code: "duplicate_section_order",
        path: ["sections"],
        message: `Page contains ${count} sections with order ${order}.`
      });
    }
  }

  const hasContiguousOrder = ordered.every((entry, index) => entry.section.order === index);

  if (!hasContiguousOrder) {
    issues.push({
      code: "non_contiguous_section_order",
      path: ["sections"],
      message: "Page sections must use contiguous zero-based order values."
    });
  }
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

  if (!isRecord(left) || !isRecord(right)) {
    return false;
  }

  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && jsonValuesEqual(left[key], right[key]))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addRequiredSectionIssues(pageJson: PageJson, issues: PageStudioCompositionIssue[]): void {
  for (const type of requiredSectionTypes) {
    const matches = pageJson.sections.filter((section) => section.type === type);

    if (matches.length === 0) {
      issues.push({
        code: "missing_required_section",
        path: ["sections"],
        message: `Page Studio pages require one ${type} section.`
      });
    }

    if (matches.length > 1) {
      for (const duplicate of matches.slice(1)) {
        const sectionIndex = pageJson.sections.findIndex((section) => section.id === duplicate.id);
        issues.push({
          code: "duplicate_singleton_section",
          path: ["sections", sectionIndex],
          sectionIndex,
          sectionId: duplicate.id,
          registryKey: duplicate.registryKey,
          message: `Page Studio pages allow only one ${type} section.`
        });
      }
    }
  }
}

function addLayoutOrderIssues(ordered: readonly IndexedSection[], issues: PageStudioCompositionIssue[]): void {
  const typeIndex = (type: PageSectionType): number => ordered.findIndex((entry) => entry.section.type === type);
  const headerIndex = typeIndex("Header");
  const heroIndex = typeIndex("Hero");
  const finalCtaIndex = typeIndex("FinalCTA");
  const footerIndex = typeIndex("Footer");

  if (headerIndex >= 0 && headerIndex !== 0) {
    addIllegalOrderIssue(ordered[headerIndex], issues, "Header must be the first Page Studio section.");
  }

  if (headerIndex >= 0 && heroIndex >= 0 && heroIndex !== headerIndex + 1) {
    addIllegalOrderIssue(ordered[heroIndex], issues, "Hero must be locked first after Header.");
  }

  if (footerIndex >= 0 && footerIndex !== ordered.length - 1) {
    addIllegalOrderIssue(ordered[footerIndex], issues, "Footer must be the final Page Studio section.");
  }

  if (finalCtaIndex >= 0 && footerIndex >= 0 && finalCtaIndex !== footerIndex - 1) {
    addIllegalOrderIssue(ordered[finalCtaIndex], issues, "FinalCTA must be locked immediately before Footer for MVP.");
  }

  if (heroIndex >= 0 && finalCtaIndex >= 0 && finalCtaIndex <= heroIndex) {
    addIllegalOrderIssue(ordered[finalCtaIndex], issues, "FinalCTA must render after Hero.");
  }

  let previousRank = -1;

  for (const entry of ordered) {
    const rank = zoneRank.get(entry.section.zone) ?? Number.MAX_SAFE_INTEGER;

    if (rank < previousRank) {
      addIllegalOrderIssue(entry, issues, `Section '${entry.section.id}' is ordered before an earlier layout zone.`);
    }

    previousRank = Math.max(previousRank, rank);
  }
}

function addIllegalOrderIssue(
  entry: IndexedSection | undefined,
  issues: PageStudioCompositionIssue[],
  message: string
): void {
  if (!entry) {
    return;
  }

  issues.push({
    code: "illegal_section_order",
    path: ["sections", entry.sectionIndex, "order"],
    sectionIndex: entry.sectionIndex,
    sectionId: entry.section.id,
    registryKey: entry.section.registryKey,
    message
  });
}

function decideSectionRegistryEntry(
  section: PageSectionInstance,
  registryEntries: readonly PageStudioRegistryEntry[]
): { kind: "allow"; entry: PageStudioRegistryEntry } | { kind: "deny"; reason: PageStudioDecisionDenyReason } {
  const entry = findRegistryEntry(registryEntries, section.registryKey);

  if (!entry) {
    return { kind: "deny", reason: "unknown_registry_key" };
  }

  if (entry.type !== section.type) {
    return { kind: "deny", reason: "section_type_mismatch" };
  }

  if (entry.schemaVersion !== section.schemaVersion) {
    return { kind: "deny", reason: "schema_version_mismatch" };
  }

  if (!entry.allowedZones.includes(section.zone)) {
    return { kind: "deny", reason: "illegal_zone" };
  }

  return { kind: "allow", entry };
}

function decideReplacementRegistryEntry(
  replacement: PageStudioReplacementSection,
  registryEntries: readonly PageStudioRegistryEntry[]
): { kind: "allow"; entry: PageStudioRegistryEntry } | { kind: "deny"; reason: PageStudioDecisionDenyReason } {
  const entry = findRegistryEntry(registryEntries, replacement.registryKey);

  if (!entry) {
    return { kind: "deny", reason: "unknown_registry_key" };
  }

  if (entry.type !== replacement.type) {
    return { kind: "deny", reason: "section_type_mismatch" };
  }

  if (entry.schemaVersion !== replacement.schemaVersion) {
    return { kind: "deny", reason: "schema_version_mismatch" };
  }

  if (!entry.allowedZones.includes(replacement.zone)) {
    return { kind: "deny", reason: "illegal_zone" };
  }

  if (!entry.variants.includes(replacement.variant)) {
    return { kind: "deny", reason: "unknown_variant" };
  }

  return { kind: "allow", entry };
}

function replacePageSectionUnchecked(
  pageJson: PageJson,
  sectionId: string,
  replacement: PageStudioReplacementSection
): PageJson {
  return updateSection(pageJson, sectionId, (section) => ({
    ...section,
    type: replacement.type,
    registryKey: replacement.registryKey,
    schemaVersion: replacement.schemaVersion,
    zone: replacement.zone,
    variant: replacement.variant,
    props: replacement.props,
    evidenceRefs: replacement.evidenceRefs ?? [],
    ...(replacement.generation ? { generation: replacement.generation } : { generation: undefined })
  }));
}

function updateSection(
  pageJson: PageJson,
  sectionId: string,
  update: (section: PageSectionInstance) => PageSectionInstance
): PageJson {
  return {
    ...pageJson,
    sections: pageJson.sections.map((section) => (section.id === sectionId ? update(section) : section))
  };
}

function pageJsonWithOrderedSections(pageJson: PageJson, ordered: readonly IndexedSection[]): PageJson {
  return {
    ...pageJson,
    sections: ordered.map((entry, index) => ({
      ...entry.section,
      order: index
    }))
  };
}

function swapOrderedSections(
  ordered: readonly IndexedSection[],
  leftIndex: number,
  rightIndex: number
): IndexedSection[] {
  return ordered.map((entry, index) => {
    if (index === leftIndex) {
      return ordered[rightIndex] ?? entry;
    }

    if (index === rightIndex) {
      return ordered[leftIndex] ?? entry;
    }

    return entry;
  });
}

function orderedSections(pageJson: PageJson): IndexedSection[] {
  return pageJson.sections
    .map((section, sectionIndex) => ({ section, sectionIndex }))
    .sort((left, right) => left.section.order - right.section.order || left.sectionIndex - right.sectionIndex);
}

function findSection(pageJson: PageJson, sectionId: string): IndexedSection | undefined {
  return pageJson.sections
    .map((section, sectionIndex) => ({ section, sectionIndex }))
    .find((entry) => entry.section.id === sectionId);
}

function findRegistryEntry(
  registryEntries: readonly PageStudioRegistryEntry[],
  registryKey: string
): PageStudioRegistryEntry | undefined {
  return registryEntries.find((entry) => entry.registryKey === registryKey);
}

function toRegistryMap(
  registryEntries: readonly PageStudioRegistryEntry[]
): ReadonlyMap<string, PageStudioRegistryEntry> {
  return new Map(registryEntries.map((entry) => [entry.registryKey, entry]));
}
