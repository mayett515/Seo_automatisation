import {
  PageJsonSchema,
  PagePathSchema,
  type PageJson,
  type PageSectionType,
  type PageZone
} from "@localseo/contracts";
import { z } from "zod";

export type PageRegistrySeoCapabilities = {
  canProvideH1?: boolean;
  canProvideFaq?: boolean;
  canProvideAreaServed?: boolean;
  canProvideJsonLd?: boolean;
  canProvideInternalLinks?: boolean;
};

export type PageRegistryEntry = {
  type: PageSectionType;
  registryKey: string;
  schemaVersion: number;
  defaultZone: PageZone;
  allowedZones: readonly PageZone[];
  variants: readonly string[];
  defaultVariant: string;
  propsSchema: z.ZodType<unknown>;
  seoCapabilities?: PageRegistrySeoCapabilities;
};

export type PageRegistryEntrySummary = Omit<PageRegistryEntry, "propsSchema">;

export type PageRegistry = {
  entries: readonly PageRegistryEntry[];
  byKey: ReadonlyMap<string, PageRegistryEntry>;
};

export type PageRegistryIssueCode =
  | "invalid_page_json"
  | "unknown_registry_key"
  | "section_type_mismatch"
  | "schema_version_mismatch"
  | "illegal_zone"
  | "unknown_variant"
  | "invalid_props";

export type PageRegistryValidationIssue = {
  code: PageRegistryIssueCode;
  message: string;
  path: Array<string | number>;
  sectionIndex?: number;
  sectionId?: string;
  registryKey?: string;
};

export type PageRegistryValidationResult =
  | { success: true; pageJson: PageJson }
  | { success: false; issues: PageRegistryValidationIssue[] };

const textShort = z.string().trim().min(1).max(180);
const textMedium = z.string().trim().min(1).max(500);
const textLong = z.string().trim().min(1).max(1_500);

const linkSchema = z
  .object({
    label: textShort,
    href: PagePathSchema
  })
  .strict();

const faqItemSchema = z
  .object({
    question: textMedium,
    answer: textLong
  })
  .strict();

const areaSchema = z
  .object({
    name: textShort,
    route: PagePathSchema.optional()
  })
  .strict();

const benefitSchema = z
  .object({
    title: textShort,
    body: textLong
  })
  .strict();

export const pageRegistryEntries = [
  registryEntry({
    type: "Header",
    registryKey: "Header.default",
    schemaVersion: 1,
    defaultZone: "frame_top",
    allowedZones: ["frame_top"],
    variants: ["default", "compact"],
    defaultVariant: "default",
    propsSchema: z
      .object({
        brandName: textShort,
        navItems: z.array(linkSchema).max(8).default([]),
        phoneLabel: textShort.optional(),
        phoneHref: z.string().trim().min(1).max(80).optional()
      })
      .strict(),
    seoCapabilities: { canProvideInternalLinks: true }
  }),
  registryEntry({
    type: "Hero",
    registryKey: "Hero.default",
    schemaVersion: 1,
    defaultZone: "hero",
    allowedZones: ["hero"],
    variants: ["default", "split", "compact"],
    defaultVariant: "default",
    propsSchema: z
      .object({
        h1: textShort,
        lead: textLong,
        primaryCtaLabel: textShort.optional(),
        primaryCtaHref: PagePathSchema.optional(),
        trustLine: textMedium.optional()
      })
      .strict(),
    seoCapabilities: { canProvideH1: true }
  }),
  registryEntry({
    type: "ServiceIntro",
    registryKey: "ServiceIntro.default",
    schemaVersion: 1,
    defaultZone: "body_intro",
    allowedZones: ["body_intro", "body_main"],
    variants: ["default", "compact"],
    defaultVariant: "default",
    propsSchema: z
      .object({
        eyebrow: textShort.optional(),
        heading: textShort,
        body: textLong
      })
      .strict()
  }),
  registryEntry({
    type: "ServiceDescription",
    registryKey: "ServiceDescription.default",
    schemaVersion: 1,
    defaultZone: "body_main",
    allowedZones: ["body_main"],
    variants: ["default", "detailed"],
    defaultVariant: "default",
    propsSchema: z
      .object({
        heading: textShort,
        paragraphs: z.array(textLong).min(1).max(6)
      })
      .strict()
  }),
  registryEntry({
    type: "BenefitsGrid",
    registryKey: "BenefitsGrid.default",
    schemaVersion: 1,
    defaultZone: "body_main",
    allowedZones: ["body_main", "proof_media"],
    variants: ["default", "icons"],
    defaultVariant: "default",
    propsSchema: z
      .object({
        heading: textShort,
        benefits: z.array(benefitSchema).min(2).max(8)
      })
      .strict()
  }),
  registryEntry({
    type: "FAQ",
    registryKey: "FAQ.default",
    schemaVersion: 1,
    defaultZone: "body_late",
    allowedZones: ["body_late"],
    variants: ["default", "accordion"],
    defaultVariant: "default",
    propsSchema: z
      .object({
        heading: textShort.default("Haeufige Fragen"),
        items: z.array(faqItemSchema).min(1).max(12)
      })
      .strict(),
    seoCapabilities: { canProvideFaq: true, canProvideJsonLd: true }
  }),
  registryEntry({
    type: "ServiceAreaList",
    registryKey: "ServiceAreaList.default",
    schemaVersion: 1,
    defaultZone: "body_late",
    allowedZones: ["body_late"],
    variants: ["default", "columns"],
    defaultVariant: "default",
    propsSchema: z
      .object({
        heading: textShort,
        areas: z.array(areaSchema).min(1).max(40)
      })
      .strict(),
    seoCapabilities: { canProvideAreaServed: true, canProvideInternalLinks: true }
  }),
  registryEntry({
    type: "FinalCTA",
    registryKey: "FinalCTA.default",
    schemaVersion: 1,
    defaultZone: "cta_late",
    allowedZones: ["cta_late"],
    variants: ["default", "contact"],
    defaultVariant: "default",
    propsSchema: z
      .object({
        heading: textShort,
        body: textLong,
        ctaLabel: textShort,
        ctaHref: PagePathSchema
      })
      .strict()
  }),
  registryEntry({
    type: "Footer",
    registryKey: "Footer.default",
    schemaVersion: 1,
    defaultZone: "frame_bottom",
    allowedZones: ["frame_bottom"],
    variants: ["default", "compact"],
    defaultVariant: "default",
    propsSchema: z
      .object({
        businessName: textShort,
        legalLinks: z.array(linkSchema).max(6).default([])
      })
      .strict(),
    seoCapabilities: { canProvideInternalLinks: true }
  })
] as const satisfies readonly PageRegistryEntry[];

export const pageRegistry = createPageRegistry(pageRegistryEntries);
export const pageRegistrySummary = summarizePageRegistry(pageRegistry);

export function validatePageJsonAgainstRegistry(
  input: unknown,
  registry: PageRegistry = pageRegistry
): PageRegistryValidationResult {
  const parsed = PageJsonSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => ({
        code: "invalid_page_json",
        message: issue.message,
        path: toRegistryIssuePath(issue.path)
      }))
    };
  }

  const issues: PageRegistryValidationIssue[] = [];

  parsed.data.sections.forEach((section, sectionIndex) => {
    const entry = registry.byKey.get(section.registryKey);
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

    const propsResult = entry.propsSchema.safeParse(section.props);

    if (!propsResult.success) {
      for (const issue of propsResult.error.issues) {
        issues.push({
          ...baseIssue,
          code: "invalid_props",
          path: ["sections", sectionIndex, "props", ...toRegistryIssuePath(issue.path)],
          message: issue.message
        });
      }
    }
  });

  return issues.length > 0 ? { success: false, issues } : { success: true, pageJson: parsed.data };
}

export function getPageRegistryEntry(
  registryKey: string,
  registry: PageRegistry = pageRegistry
): PageRegistryEntry | undefined {
  return registry.byKey.get(registryKey);
}

export function summarizePageRegistry(registry: PageRegistry = pageRegistry): PageRegistryEntrySummary[] {
  return registry.entries.map((entry) => ({
    type: entry.type,
    registryKey: entry.registryKey,
    schemaVersion: entry.schemaVersion,
    defaultZone: entry.defaultZone,
    allowedZones: entry.allowedZones,
    variants: entry.variants,
    defaultVariant: entry.defaultVariant,
    seoCapabilities: entry.seoCapabilities
  }));
}

export function createPageRegistry(entries: readonly PageRegistryEntry[]): PageRegistry {
  const byKey = new Map<string, PageRegistryEntry>();

  for (const entry of entries) {
    if (byKey.has(entry.registryKey)) {
      throw new Error(`Duplicate page registry key '${entry.registryKey}'.`);
    }

    if (!entry.allowedZones.includes(entry.defaultZone)) {
      throw new Error(`Page registry key '${entry.registryKey}' defaultZone must be allowed.`);
    }

    if (!entry.variants.includes(entry.defaultVariant)) {
      throw new Error(`Page registry key '${entry.registryKey}' defaultVariant must be listed in variants.`);
    }

    byKey.set(entry.registryKey, entry);
  }

  return { entries: [...entries], byKey };
}

function registryEntry(entry: PageRegistryEntry): PageRegistryEntry {
  return entry;
}

function toRegistryIssuePath(path: readonly PropertyKey[]): Array<string | number> {
  return path.map((part) => (typeof part === "symbol" ? part.toString() : part));
}
