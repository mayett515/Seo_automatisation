export type LocalPageQaInput = {
  title?: string;
  metaDescription?: string;
  h1?: string;
  canonical?: string;
  hasJsonLd: boolean;
  hasAreaServed: boolean;
  hasInternalLinks: boolean;
  hasLocalFaq: boolean;
  hasVisibleCta: boolean;
  sitemapReady: boolean;
  uniquenessRationale?: string;
};

export type LocalPageQaResult = {
  passed: boolean;
  blockers: string[];
  warnings: string[];
};

export function evaluateLocalPageQa(input: LocalPageQaInput): LocalPageQaResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!input.title) blockers.push("missing_title");
  if (!input.metaDescription) blockers.push("missing_meta_description");
  if (!input.h1) blockers.push("missing_h1");
  if (!input.canonical) blockers.push("missing_canonical");
  if (!input.hasJsonLd) blockers.push("missing_json_ld");
  if (!input.hasAreaServed) blockers.push("missing_area_served");
  if (!input.hasInternalLinks) blockers.push("missing_internal_links");
  if (!input.uniquenessRationale) blockers.push("missing_uniqueness_rationale");
  if (!input.hasLocalFaq) warnings.push("missing_local_faq");
  if (!input.hasVisibleCta) warnings.push("missing_visible_cta");
  if (!input.sitemapReady) warnings.push("not_sitemap_ready");

  return {
    passed: blockers.length === 0,
    blockers,
    warnings
  };
}

export const customerReportMetricBans = ["impressions", "ctr", "average_position"] as const;
