import { ReleaseCheckSchema, type PageJson, type ReleaseCheck, type ReleaseItemAction } from "@localseo/contracts";
import {
  derivePageRegistrySeoFacts,
  resolveRenderedRobots,
  validatePageJsonAgainstRegistry
} from "@localseo/page-registry";

export type LocalPageQaInput = {
  invalidPageJson?: boolean;
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

  if (input.invalidPageJson) blockers.push("invalid_page_json");
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
  action: ReleaseItemAction;
  pageVersionId: string | null;
  targetUrl: string;
  approvedAt: Date | null;
  pageJson: unknown;
  mediaManifestValid: boolean;
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
  const renderablePages = evidence.pages.filter(isRenderableReleasePage);
  const missingApproval = renderablePages.filter((page) => !page.pageVersionId || !page.approvedAt);
  const invalidMediaManifests = renderablePages.filter((page) => !page.mediaManifestValid);
  const missingNoindex = renderablePages.filter((page) => !hasNoindexEvidence(page.pageJson));
  const unresolvedLiveRobots = evidence.pages.filter((page) => !hasResolvedRobotsForAction(page.action));
  const unmaterializedActions = evidence.pages.filter((page) => !hasMaterializedReleaseAction(page.action));
  const pageQaResults = renderablePages.map((page) => ({
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
  const releaseItemCount = evidence.pages.length;
  const pageCount = renderablePages.length;

  return [
    ReleaseCheckSchema.parse({
      checkKey: "approval_check",
      scope: "page",
      severity: "blocker",
      result: releaseItemCount > 0 && missingApproval.length === 0 ? "passed" : "failed",
      message:
        releaseItemCount > 0 && missingApproval.length === 0
          ? "Every renderable release item references an approved page version."
          : "Every create/update release item must reference an approved page version before deploy approval.",
      evidence: {
        pageCount,
        releaseItemCount,
        missingApprovalCount: missingApproval.length,
        missingApprovalPageVersionIds: missingApproval.map((page) => page.pageVersionId ?? "missing_page_version")
      }
    }),
    ReleaseCheckSchema.parse({
      checkKey: "media_manifest_check",
      scope: "page",
      severity: "blocker",
      result: releaseItemCount > 0 && invalidMediaManifests.length === 0 ? "passed" : "failed",
      message:
        releaseItemCount > 0 && invalidMediaManifests.length === 0
          ? "Every renderable release item has an exact, available immutable media manifest."
          : "Every create/update page must resolve its exact PageJson media references before deploy approval.",
      evidence: {
        pageCount,
        invalidMediaManifestCount: invalidMediaManifests.length,
        invalidMediaPageVersionIds: invalidMediaManifests.map((page) => page.pageVersionId ?? "missing_page_version")
      }
    }),
    ReleaseCheckSchema.parse({
      checkKey: "staging_noindex_check",
      scope: "domain",
      severity: "blocker",
      result: releaseItemCount > 0 && missingNoindex.length === 0 ? "passed" : "failed",
      message:
        releaseItemCount > 0 && missingNoindex.length === 0
          ? "Every preview page carries noindex evidence."
          : "Every create/update preview page must carry noindex evidence before deploy approval.",
      evidence: {
        pageCount,
        missingNoindexCount: missingNoindex.length,
        missingNoindexTargets: missingNoindex.map((page) => page.targetUrl)
      }
    }),
    ReleaseCheckSchema.parse({
      checkKey: "resolved_robots_check",
      scope: "domain",
      severity: "blocker",
      result: releaseItemCount > 0 && unresolvedLiveRobots.length === 0 ? "passed" : "failed",
      message:
        releaseItemCount > 0 && unresolvedLiveRobots.length === 0
          ? "Release actions resolve to deterministic robots directives."
          : "Every release action must resolve to a deterministic robots directive or a non-rendering operation.",
      evidence: {
        releaseItemCount,
        resolvedRobots: evidence.pages.map((page) => ({
          action: page.action,
          targetUrl: page.targetUrl,
          robots: resolveRenderedRobots(page.action) ?? null
        })),
        unresolvedTargets: unresolvedLiveRobots.map((page) => page.targetUrl)
      }
    }),
    ReleaseCheckSchema.parse({
      checkKey: "release_action_materialization_check",
      scope: "domain",
      severity: "blocker",
      result: releaseItemCount > 0 && unmaterializedActions.length === 0 ? "passed" : "failed",
      message:
        releaseItemCount > 0 && unmaterializedActions.length === 0
          ? "Every release action materializes to a rendered page artifact."
          : "Non-rendering release actions require directive artifact support before deploy approval.",
      evidence: {
        releaseItemCount,
        unmaterializedActionCount: unmaterializedActions.length,
        unmaterializedTargets: unmaterializedActions.map((page) => ({
          action: page.action,
          targetUrl: page.targetUrl
        }))
      }
    }),
    ReleaseCheckSchema.parse({
      checkKey: "local_seo_page_quality_gate",
      scope: "page",
      severity: "blocker",
      result: releaseItemCount > 0 && qaBlockers.length === 0 ? "passed" : "failed",
      message:
        releaseItemCount > 0 && qaBlockers.length === 0
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
  const pageJson = parsePageJson(page.pageJson);

  if (!pageJson) {
    return {
      invalidPageJson: true,
      hasJsonLd: false,
      hasAreaServed: false,
      hasInternalLinks: false,
      hasLocalFaq: false,
      hasVisibleCta: false,
      sitemapReady: false
    };
  }

  const facts = derivePageRegistrySeoFacts(pageJson);

  return {
    title: facts.title,
    metaDescription: facts.metaDescription,
    h1: facts.h1,
    canonical: facts.canonicalPath,
    hasJsonLd: facts.hasJsonLd,
    hasAreaServed: facts.hasAreaServed,
    hasInternalLinks: facts.hasInternalLinks,
    hasLocalFaq: facts.hasLocalFaq,
    hasVisibleCta: facts.hasVisibleCta,
    sitemapReady: page.sitemapReady || facts.sitemapReady,
    uniquenessRationale: page.uniquenessRationale ?? facts.uniquenessRationale
  };
}

function hasNoindexEvidence(pageJson: unknown): boolean {
  const parsed = parsePageJson(pageJson);
  return parsed ? derivePageRegistrySeoFacts(parsed).robotsIntent === "noindex" : false;
}

function isRenderableReleasePage(page: ReleasePreflightPageEvidence): boolean {
  return page.action === "create" || page.action === "update";
}

function hasResolvedRobotsForAction(action: ReleaseItemAction): boolean {
  return action === "redirect" || action === "remove" || resolveRenderedRobots(action) !== undefined;
}

function hasMaterializedReleaseAction(action: ReleaseItemAction): boolean {
  return action === "create" || action === "update";
}

function parsePageJson(input: unknown): PageJson | undefined {
  const validation = validatePageJsonAgainstRegistry(input);
  return validation.success ? validation.pageJson : undefined;
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
