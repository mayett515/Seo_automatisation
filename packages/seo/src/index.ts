import { ReleaseCheckSchema, type ReleaseCheck } from "@localseo/contracts";

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

export type ReleasePreflightPageEvidence = {
  pageVersionId: string | null;
  targetUrl: string;
  approvedAt: Date | null;
  pageJson: Record<string, unknown> | null;
  sitemapReady: boolean;
  uniquenessRationale: string | null;
};

export type ReleasePreflightEvidence = {
  pages: ReleasePreflightPageEvidence[];
  rollbackPointCount: number;
  priorSuccessfulDeploymentCount: number;
  usableTrackingKeyCount: number;
};

export function buildReleasePreflightChecks(evidence: ReleasePreflightEvidence): ReleaseCheck[] {
  const missingApproval = evidence.pages.filter((page) => !page.pageVersionId || !page.approvedAt);
  const missingNoindex = evidence.pages.filter((page) => !hasNoindexEvidence(page.pageJson));
  const pageQaResults = evidence.pages.map((page) => ({
    pageVersionId: page.pageVersionId,
    targetUrl: page.targetUrl,
    result: evaluateLocalPageQa(toLocalPageQaInput(page))
  }));
  const qaBlockers = pageQaResults.flatMap((page) =>
    page.result.blockers.map((blocker) => ({
      pageVersionId: page.pageVersionId,
      targetUrl: page.targetUrl,
      blocker
    }))
  );
  const qaWarnings = pageQaResults.flatMap((page) =>
    page.result.warnings.map((warning) => ({
      pageVersionId: page.pageVersionId,
      targetUrl: page.targetUrl,
      warning
    }))
  );
  const pageCount = evidence.pages.length;

  return [
    ReleaseCheckSchema.parse({
      checkKey: "approval_check",
      scope: "page",
      severity: "blocker",
      result: pageCount > 0 && missingApproval.length === 0 ? "passed" : "failed",
      message:
        pageCount > 0 && missingApproval.length === 0
          ? "Every release item references an approved page version."
          : "Every release item must reference an approved page version before deploy approval.",
      evidence: {
        pageCount,
        missingApprovalCount: missingApproval.length,
        missingApprovalPageVersionIds: missingApproval.map((page) => page.pageVersionId ?? "missing_page_version")
      }
    }),
    ReleaseCheckSchema.parse({
      checkKey: "staging_noindex_check",
      scope: "domain",
      severity: "blocker",
      result: pageCount > 0 && missingNoindex.length === 0 ? "passed" : "failed",
      message:
        pageCount > 0 && missingNoindex.length === 0
          ? "Every preview page carries noindex evidence."
          : "Every preview page must carry noindex evidence before deploy approval.",
      evidence: {
        pageCount,
        missingNoindexCount: missingNoindex.length,
        missingNoindexTargets: missingNoindex.map((page) => page.targetUrl)
      }
    }),
    ReleaseCheckSchema.parse({
      checkKey: "local_seo_page_quality_gate",
      scope: "page",
      severity: "blocker",
      result: pageCount > 0 && qaBlockers.length === 0 ? "passed" : "failed",
      message:
        pageCount > 0 && qaBlockers.length === 0
          ? "Local SEO page quality gate has no blockers."
          : "Local SEO page quality gate has blockers that must be resolved before deploy approval.",
      evidence: {
        pageCount,
        blockerCount: qaBlockers.length,
        blockers: qaBlockers
      }
    }),
    ReleaseCheckSchema.parse({
      checkKey: "rollback_point_ready",
      scope: "project",
      severity: "blocker",
      result: hasRollbackEvidence(evidence) ? "passed" : "failed",
      message:
        evidence.rollbackPointCount > 0
          ? "Rollback point artifact is available."
          : evidence.priorSuccessfulDeploymentCount === 0
            ? "First deploy has no prior live deployment to snapshot."
            : "A rollback point artifact must exist before deploy approval.",
      evidence: {
        rollbackPointCount: evidence.rollbackPointCount,
        priorSuccessfulDeploymentCount: evidence.priorSuccessfulDeploymentCount
      }
    }),
    ReleaseCheckSchema.parse({
      checkKey: "local_seo_page_quality_warning",
      scope: "page",
      severity: "warning",
      result: qaWarnings.length === 0 ? "passed" : "failed",
      message:
        qaWarnings.length === 0
          ? "Local SEO page quality gate has no warnings."
          : "Local SEO page quality gate has warnings to review before deploy.",
      evidence: {
        pageCount,
        warningCount: qaWarnings.length,
        warnings: qaWarnings
      }
    }),
    ReleaseCheckSchema.parse({
      checkKey: "tracking_key_ready",
      scope: "tracking",
      severity: "warning",
      result: evidence.usableTrackingKeyCount > 0 ? "passed" : "failed",
      message:
        evidence.usableTrackingKeyCount > 0
          ? "At least one active project tracking key has allowed origins."
          : "No active project tracking key with allowed origins exists; post-deploy tracking verification may be incomplete.",
      evidence: {
        usableTrackingKeyCount: evidence.usableTrackingKeyCount
      }
    })
  ];
}

function hasRollbackEvidence(
  evidence: Pick<ReleasePreflightEvidence, "rollbackPointCount" | "priorSuccessfulDeploymentCount">
): boolean {
  return evidence.rollbackPointCount > 0 || evidence.priorSuccessfulDeploymentCount === 0;
}

function toLocalPageQaInput(page: ReleasePreflightPageEvidence): LocalPageQaInput {
  const pageJson = asRecord(page.pageJson);
  const seo = asRecord(pageJson.seo);
  const meta = asRecord(pageJson.meta);

  return {
    title: firstString([pageJson, seo, meta], ["title", "metaTitle"]),
    metaDescription: firstString([pageJson, seo, meta], ["metaDescription", "description"]),
    h1: firstString([pageJson], ["h1", "headline"]),
    canonical: firstString([pageJson, seo], ["canonical", "canonicalUrl"]),
    hasJsonLd: booleanFlag(pageJson, ["hasJsonLd", "jsonLdReady"]) || hasAnyValue(pageJson, ["jsonLd", "schemaJson"]),
    hasAreaServed: booleanFlag(pageJson, ["hasAreaServed", "areaServedReady"]) || hasAnyValue(pageJson, ["areaServed"]),
    hasInternalLinks:
      booleanFlag(pageJson, ["hasInternalLinks"]) ||
      (Array.isArray(pageJson.internalLinks) && pageJson.internalLinks.length > 0),
    hasLocalFaq: booleanFlag(pageJson, ["hasLocalFaq"]) || hasAnyValue(pageJson, ["localFaq", "faq"]),
    hasVisibleCta: booleanFlag(pageJson, ["hasVisibleCta", "visibleCta"]) || hasAnyValue(pageJson, ["cta"]),
    sitemapReady: page.sitemapReady || booleanFlag(pageJson, ["sitemapReady"]),
    uniquenessRationale: page.uniquenessRationale ?? firstString([pageJson], ["uniquenessRationale"])
  };
}

function hasNoindexEvidence(pageJson: Record<string, unknown> | null): boolean {
  const value = asRecord(pageJson);
  const seo = asRecord(value.seo);
  const meta = asRecord(value.meta);
  const robots = [
    firstString([value], ["robots", "previewRobots"]),
    firstString([seo], ["robots", "previewRobots"]),
    firstString([meta], ["robots", "content"])
  ]
    .filter((item): item is string => Boolean(item))
    .join(",");

  return (
    booleanFlag(value, ["noindex", "previewNoindex", "stagingNoindex"]) || robots.toLowerCase().includes("noindex")
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function firstString(records: Record<string, unknown>[], keys: string[]): string | undefined {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];

      if (typeof value === "string" && value.trim().length > 0) {
        return value;
      }
    }
  }

  return undefined;
}

function booleanFlag(record: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => record[key] === true);
}

function hasAnyValue(record: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => {
    const value = record[key];

    if (Array.isArray(value)) {
      return value.length > 0;
    }

    return Boolean(value);
  });
}

export const customerReportMetricBans = ["impressions", "ctr", "average_position", "averagePosition"] as const;

export function assertCustomerReportPayloadSafe(payload: unknown): void {
  const bannedPath = findBannedMetricPath(payload);

  if (bannedPath) {
    throw new Error(`Customer report payload includes banned metric: ${bannedPath}`);
  }
}

function findBannedMetricPath(value: unknown, path: string[] = []): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const bannedPath = findBannedMetricPath(value[index], [...path, String(index)]);

      if (bannedPath) {
        return bannedPath;
      }
    }

    return undefined;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (customerReportMetricBans.includes(key as (typeof customerReportMetricBans)[number])) {
      return [...path, key].join(".");
    }

    const bannedPath = findBannedMetricPath(nestedValue, [...path, key]);

    if (bannedPath) {
      return bannedPath;
    }
  }

  return undefined;
}
