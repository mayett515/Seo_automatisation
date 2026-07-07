import {
  type ApprovedReleaseArtifact,
  type ApprovedReleaseArtifactPage,
  PageJsonSchema,
  PagePathSchema,
  StaticSiteArtifactSchema,
  type PageJson,
  type PageSectionType,
  type PageZone,
  type ReleaseItemAction,
  type StaticSiteArtifact,
  type StaticSiteFile
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

export type PageRegistrySeoFacts = {
  title: string;
  metaDescription: string;
  h1?: string;
  canonicalPath: string;
  robotsIntent: "index" | "noindex";
  hasJsonLd: boolean;
  hasAreaServed: boolean;
  hasInternalLinks: boolean;
  hasLocalFaq: boolean;
  hasVisibleCta: boolean;
  sitemapReady: boolean;
  uniquenessRationale?: string;
  internalLinks: readonly string[];
};

type RenderableArtifactPage = ApprovedReleaseArtifactPage & {
  pageJson: NonNullable<ApprovedReleaseArtifactPage["pageJson"]>;
};

export function derivePageRegistrySeoFacts(pageJson: PageJson): PageRegistrySeoFacts {
  const internalLinks = collectInternalLinks(pageJson);

  return {
    title: pageJson.seo.title,
    metaDescription: pageJson.seo.metaDescription,
    h1: firstSectionString(pageJson, ["h1", "headline", "title"]),
    canonicalPath: pageJson.seo.canonicalPath,
    robotsIntent: pageJson.seo.robots,
    hasJsonLd: pageJson.seo.jsonLd.length > 0,
    hasAreaServed: pageJson.sections.some(
      (section) => section.type === "ServiceAreaList" && arrayProp(section.props, "areas").length > 0
    ),
    hasInternalLinks: internalLinks.length > 0,
    hasLocalFaq: pageJson.sections.some(
      (section) => section.type === "FAQ" && arrayProp(section.props, "items").length > 0
    ),
    hasVisibleCta: pageJson.sections.some((section) => {
      const props = asRecord(section.props);
      return (
        stringProp(props, "primaryCtaHref") !== undefined ||
        stringProp(props, "ctaHref") !== undefined ||
        stringProp(props, "phoneHref") !== undefined
      );
    }),
    sitemapReady: pageJson.seo.sitemapReady,
    uniquenessRationale: pageJson.uniquenessRationale,
    internalLinks
  };
}

export function resolveRenderedRobots(action: ReleaseItemAction): "index" | "noindex" | undefined {
  if (action === "create" || action === "update") {
    return "index";
  }

  if (action === "noindex") {
    return "noindex";
  }

  return undefined;
}

export function renderApprovedReleaseArtifact(
  artifact: ApprovedReleaseArtifact,
  registry: PageRegistry = pageRegistry
): StaticSiteArtifact {
  return StaticSiteArtifactSchema.parse({
    files: artifact.pages.filter(isRenderableArtifactPage).map((page) => renderStaticSiteFile(page, registry))
  });
}

export function targetUrlToHtmlPath(targetUrl: string): string {
  const url =
    targetUrl.startsWith("http://") || targetUrl.startsWith("https://")
      ? new URL(targetUrl)
      : new URL(targetUrl.startsWith("/") ? targetUrl : `/${targetUrl}`, "https://example.test");
  const pathname = url.pathname === "" ? "/" : url.pathname;

  if (pathname.endsWith("/")) {
    return `${pathname}index.html`;
  }

  return /\.[a-z0-9]+$/iu.test(pathname) ? pathname : `${pathname}/index.html`;
}

function renderStaticSiteFile(page: RenderableArtifactPage, registry: PageRegistry): StaticSiteFile {
  const validation = validatePageJsonAgainstRegistry(page.pageJson, registry);

  if (!validation.success) {
    throw new Error(
      `Cannot render PageJson for release item '${page.releasePlanItemId}': ${validation.issues
        .map((issue) => issue.code)
        .join(", ")}`
    );
  }

  return {
    path: targetUrlToHtmlPath(page.targetUrl),
    body: renderPageHtml(page, validation.pageJson),
    contentType: "text/html; charset=utf-8"
  };
}

function isRenderableArtifactPage(page: ApprovedReleaseArtifactPage): page is RenderableArtifactPage {
  return (page.action === "create" || page.action === "update") && page.pageJson !== null;
}

function renderPageHtml(page: RenderableArtifactPage, pageJson: PageJson): string {
  const facts = derivePageRegistrySeoFacts(pageJson);
  const canonical = resolveCanonicalUrl(facts.canonicalPath, page.targetUrl);
  const robots = resolveRenderedRobots(page.action) ?? facts.robotsIntent;
  const jsonLdScript = renderJsonLdScript(pageJson.seo.jsonLd);

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(facts.title)}</title>
  <meta name="description" content="${escapeHtml(facts.metaDescription)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta name="robots" content="${escapeHtml(robots)}">
${jsonLdScript ? `  ${jsonLdScript}\n` : ""}  <style>${customerPageCss}</style>
</head>
<body>
  <main class="ls-page" data-page-type="${escapeHtml(pageJson.pageType)}">
${pageJson.sections.map(renderSection).join("\n")}
  </main>
</body>
</html>`;
}

function renderSection(section: PageJson["sections"][number]): string {
  const attrs = `class="ls-section ${sectionClass(section.type)}" data-section="${escapeHtml(section.registryKey)}" data-section-id="${escapeHtml(section.id)}" data-zone="${escapeHtml(section.zone)}" data-variant="${escapeHtml(section.variant)}"`;

  if (section.registryKey === "Header.default") {
    const props = asRecord(section.props);
    const navItems = arrayProp(props, "navItems")
      .map((item) => asRecord(item))
      .map((item) => linkHtml(stringProp(item, "href"), stringProp(item, "label")))
      .filter(Boolean)
      .join("");
    const phoneHref = stringProp(props, "phoneHref");
    const phoneLabel = stringProp(props, "phoneLabel");

    return `    <header ${attrs}>
      <div class="ls-container ls-cluster">
        <strong class="ls-brand">${escapeHtml(stringProp(props, "brandName") ?? "")}</strong>
        <nav class="ls-nav" aria-label="Hauptnavigation">${navItems}</nav>
        ${phoneHref && phoneLabel ? `<a class="ls-button" href="${escapeHtml(phoneHref)}">${escapeHtml(phoneLabel)}</a>` : ""}
      </div>
    </header>`;
  }

  if (section.registryKey === "Hero.default") {
    const props = asRecord(section.props);
    const ctaHref = stringProp(props, "primaryCtaHref");
    const ctaLabel = stringProp(props, "primaryCtaLabel");

    return `    <section ${attrs}>
      <div class="ls-container ls-stack">
        <h1>${escapeHtml(stringProp(props, "h1") ?? "")}</h1>
        <p class="ls-lead">${escapeHtml(stringProp(props, "lead") ?? "")}</p>
        ${stringProp(props, "trustLine") ? `<p class="ls-trust">${escapeHtml(stringProp(props, "trustLine") ?? "")}</p>` : ""}
        ${ctaHref && ctaLabel ? `<a class="ls-button ls-button-primary" href="${escapeHtml(ctaHref)}">${escapeHtml(ctaLabel)}</a>` : ""}
      </div>
    </section>`;
  }

  if (section.registryKey === "ServiceIntro.default") {
    const props = asRecord(section.props);

    return `    <section ${attrs}>
      <div class="ls-container ls-stack">
        ${stringProp(props, "eyebrow") ? `<p class="ls-eyebrow">${escapeHtml(stringProp(props, "eyebrow") ?? "")}</p>` : ""}
        <h2>${escapeHtml(stringProp(props, "heading") ?? "")}</h2>
        <p>${escapeHtml(stringProp(props, "body") ?? "")}</p>
      </div>
    </section>`;
  }

  if (section.registryKey === "ServiceDescription.default") {
    const props = asRecord(section.props);
    const paragraphs = stringArrayProp(props, "paragraphs")
      .map((item) => `<p>${escapeHtml(item)}</p>`)
      .join("");

    return `    <section ${attrs}>
      <div class="ls-container ls-stack">
        <h2>${escapeHtml(stringProp(props, "heading") ?? "")}</h2>
        ${paragraphs}
      </div>
    </section>`;
  }

  if (section.registryKey === "BenefitsGrid.default") {
    const props = asRecord(section.props);
    const benefits = arrayProp(props, "benefits")
      .map((item) => asRecord(item))
      .map(
        (item) => `<article class="ls-card">
          <h3>${escapeHtml(stringProp(item, "title") ?? "")}</h3>
          <p>${escapeHtml(stringProp(item, "body") ?? "")}</p>
        </article>`
      )
      .join("");

    return `    <section ${attrs}>
      <div class="ls-container ls-stack">
        <h2>${escapeHtml(stringProp(props, "heading") ?? "")}</h2>
        <div class="ls-grid">${benefits}</div>
      </div>
    </section>`;
  }

  if (section.registryKey === "FAQ.default") {
    const props = asRecord(section.props);
    const items = arrayProp(props, "items")
      .map((item) => asRecord(item))
      .map(
        (item) => `<details>
          <summary>${escapeHtml(stringProp(item, "question") ?? "")}</summary>
          <p>${escapeHtml(stringProp(item, "answer") ?? "")}</p>
        </details>`
      )
      .join("");

    return `    <section ${attrs}>
      <div class="ls-container ls-stack">
        <h2>${escapeHtml(stringProp(props, "heading") ?? "Haeufige Fragen")}</h2>
        <div class="ls-stack">${items}</div>
      </div>
    </section>`;
  }

  if (section.registryKey === "ServiceAreaList.default") {
    const props = asRecord(section.props);
    const areas = arrayProp(props, "areas")
      .map((item) => asRecord(item))
      .map((item) => {
        const name = stringProp(item, "name") ?? "";
        const route = stringProp(item, "route");
        return `<li>${route ? `<a href="${escapeHtml(route)}">${escapeHtml(name)}</a>` : escapeHtml(name)}</li>`;
      })
      .join("");

    return `    <section ${attrs}>
      <div class="ls-container ls-stack">
        <h2>${escapeHtml(stringProp(props, "heading") ?? "")}</h2>
        <ul class="ls-area-list">${areas}</ul>
      </div>
    </section>`;
  }

  if (section.registryKey === "FinalCTA.default") {
    const props = asRecord(section.props);

    return `    <section ${attrs}>
      <div class="ls-container ls-stack">
        <h2>${escapeHtml(stringProp(props, "heading") ?? "")}</h2>
        <p>${escapeHtml(stringProp(props, "body") ?? "")}</p>
        <a class="ls-button ls-button-primary" href="${escapeHtml(stringProp(props, "ctaHref") ?? "/")}">${escapeHtml(
          stringProp(props, "ctaLabel") ?? "Anfragen"
        )}</a>
      </div>
    </section>`;
  }

  const props = asRecord(section.props);
  const legalLinks = arrayProp(props, "legalLinks")
    .map((item) => asRecord(item))
    .map((item) => linkHtml(stringProp(item, "href"), stringProp(item, "label")))
    .filter(Boolean)
    .join("");

  return `    <footer ${attrs}>
      <div class="ls-container ls-cluster">
        <span>${escapeHtml(stringProp(props, "businessName") ?? "")}</span>
        <nav aria-label="Rechtliches">${legalLinks}</nav>
      </div>
    </footer>`;
}

function linkHtml(href: string | undefined, label: string | undefined): string {
  return href && label ? `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>` : "";
}

function sectionClass(type: PageSectionType): string {
  return `ls-section-${type.replace(/[A-Z]/gu, (letter, offset) => `${offset > 0 ? "-" : ""}${letter.toLowerCase()}`)}`;
}

function collectInternalLinks(pageJson: PageJson): string[] {
  const links = new Set<string>(pageJson.internalLinks);

  for (const section of pageJson.sections) {
    collectInternalLinksFromValue(section.props, links);
  }

  return [...links].sort();
}

function collectInternalLinksFromValue(value: unknown, links: Set<string>): void {
  if (typeof value === "string") {
    if (value.startsWith("/")) {
      links.add(value);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectInternalLinksFromValue(item, links));
    return;
  }

  const record = asRecord(value);

  for (const nested of Object.values(record)) {
    collectInternalLinksFromValue(nested, links);
  }
}

function firstSectionString(pageJson: PageJson, keys: readonly string[]): string | undefined {
  for (const section of pageJson.sections) {
    const props = asRecord(section.props);

    for (const key of keys) {
      const value = stringProp(props, key);

      if (value) {
        return value;
      }
    }
  }

  return undefined;
}

function renderJsonLdScript(values: readonly Record<string, unknown>[]): string | undefined {
  if (values.length === 0) {
    return undefined;
  }

  return `<script type="application/ld+json">${escapeScriptJson(JSON.stringify(values.length === 1 ? (values[0] ?? {}) : values))}</script>`;
}

function resolveCanonicalUrl(canonicalPath: string, targetUrl: string): string {
  if (targetUrl.startsWith("http://") || targetUrl.startsWith("https://")) {
    const url = new URL(targetUrl);
    url.pathname = canonicalPath;
    url.search = "";
    url.hash = "";
    return url.toString();
  }

  return canonicalPath;
}

function stringProp(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function stringArrayProp(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function arrayProp(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function escapeScriptJson(value: string): string {
  return value.replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const customerPageCss = `@layer reset, tokens, base, primitives, components, sections;
@layer reset {
  *, *::before, *::after { box-sizing: border-box; }
  body, h1, h2, h3, p, ul { margin: 0; }
  body { min-height: 100vh; }
  img, svg { display: block; max-width: 100%; }
}
@layer tokens {
  :root {
    --ls-color-bg: #fbfaf7;
    --ls-color-surface: #ffffff;
    --ls-color-text: #1c2430;
    --ls-color-muted: #596575;
    --ls-color-border: #d9ded7;
    --ls-color-primary: #0f6b4f;
    --ls-color-primary-strong: #0a4d39;
    --ls-color-accent: #f2c14e;
    --ls-shadow-card: 0 14px 38px rgba(28, 36, 48, 0.11);
    --ls-radius: 8px;
    --ls-page-gutter: clamp(18px, 4vw, 56px);
    --ls-section-gap: clamp(48px, 7vw, 96px);
    --ls-container: 1120px;
  }
}
@layer base {
  body {
    background: var(--ls-color-bg);
    color: var(--ls-color-text);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 17px;
    line-height: 1.62;
  }
  a { color: inherit; }
  h1, h2, h3 { line-height: 1.12; font-weight: 760; }
  h1 { font-size: clamp(2.2rem, 6vw, 4.8rem); max-width: 12ch; }
  h2 { font-size: clamp(1.75rem, 3.2vw, 3rem); max-width: 18ch; }
  h3 { font-size: 1.15rem; }
  p { max-width: 68ch; }
}
@layer primitives {
  .ls-page { overflow-x: clip; }
  .ls-container { width: min(100% - (var(--ls-page-gutter) * 2), var(--ls-container)); margin-inline: auto; }
  .ls-stack { display: flex; flex-direction: column; gap: clamp(16px, 2.5vw, 28px); }
  .ls-cluster { display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
  .ls-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr)); gap: 18px; }
  .ls-card { background: var(--ls-color-surface); border: 1px solid var(--ls-color-border); border-radius: var(--ls-radius); padding: clamp(18px, 2.5vw, 28px); box-shadow: var(--ls-shadow-card); }
  .ls-button { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 18px; border-radius: 6px; font-weight: 700; text-decoration: none; }
  .ls-button-primary { background: var(--ls-color-primary); color: #fff; }
}
@layer components {
  .ls-brand { font-size: 1.05rem; }
  .ls-nav { display: flex; gap: 16px; flex-wrap: wrap; color: var(--ls-color-muted); }
  .ls-lead { font-size: clamp(1.1rem, 2.2vw, 1.45rem); color: var(--ls-color-muted); }
  .ls-trust, .ls-eyebrow { color: var(--ls-color-primary); font-weight: 700; }
  details { background: var(--ls-color-surface); border: 1px solid var(--ls-color-border); border-radius: var(--ls-radius); padding: 18px; }
  summary { cursor: pointer; font-weight: 700; }
  .ls-area-list { columns: 2; padding-left: 1.2rem; }
}
@layer sections {
  .ls-section { padding-block: var(--ls-section-gap); }
  .ls-section-header, .ls-section-footer { padding-block: 22px; background: var(--ls-color-surface); border-block: 1px solid var(--ls-color-border); }
  .ls-section-hero { min-height: 68vh; display: grid; align-items: center; background: linear-gradient(135deg, #f7f2e8 0%, #eef6f1 100%); }
  .ls-section-final-c-t-a { background: var(--ls-color-primary-strong); color: #fff; }
  .ls-section-final-c-t-a p { color: rgba(255, 255, 255, 0.82); }
}
@media (max-width: 720px) {
  .ls-nav { width: 100%; }
  .ls-area-list { columns: 1; }
}`;

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
