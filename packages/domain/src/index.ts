import type {
  ApprovedReleaseArtifact,
  ApprovedReleaseArtifactPage,
  ReleaseCheck,
  ReleasePlan,
  ReleaseVerificationStatus
} from "@localseo/contracts";

export type DeployDecision =
  | { kind: "blocked"; blockerCount: number; warnings: ReleaseCheck[] }
  | { kind: "ready"; warnings: ReleaseCheck[] }
  | { kind: "ready_with_warnings"; warnings: ReleaseCheck[] };

export function decideReleaseReadiness(checks: ReleaseCheck[]): DeployDecision {
  const blockers = checks.filter((check) => check.severity === "blocker" && check.result === "failed");
  const warnings = checks.filter((check) => check.severity === "warning" && check.result === "failed");

  if (blockers.length > 0) {
    return { kind: "blocked", blockerCount: blockers.length, warnings };
  }

  if (warnings.length > 0) {
    return { kind: "ready_with_warnings", warnings };
  }

  return { kind: "ready", warnings: [] };
}

export function canDeployRelease(plan: ReleasePlan, checks: ReleaseCheck[]): boolean {
  const readiness = decideReleaseReadiness(checks);
  return plan.status === "approved_for_deploy" && readiness.kind !== "blocked";
}

export function buildReleaseDeploymentKey(releasePlanId: string): string {
  return `release_plan:${releasePlanId}`;
}

export function decideReleaseVerificationStatus(checks: ReleaseCheck[]): ReleaseVerificationStatus {
  const failedBlockers = checks.filter((check) => check.severity === "blocker" && check.result === "failed");
  const failedWarnings = checks.filter((check) => check.severity === "warning" && check.result === "failed");

  if (failedBlockers.length > 0) {
    return "rollback_recommended";
  }

  if (failedWarnings.length > 0) {
    return "live_with_warnings";
  }

  return "live_healthy";
}

export type StaticSiteFile = {
  path: string;
  body: string;
  contentType: string;
};

export type StaticSiteArtifact = {
  files: StaticSiteFile[];
};

export function renderApprovedReleaseArtifact(artifact: ApprovedReleaseArtifact): StaticSiteArtifact {
  return {
    files: artifact.pages.map((page) => ({
      path: targetUrlToHtmlPath(page.targetUrl),
      body: renderPageHtml(page),
      contentType: "text/html; charset=utf-8"
    }))
  };
}

function renderPageHtml(page: ApprovedReleaseArtifactPage): string {
  const record = page.pageJson;
  const title = pickString(record, ["title", "metaTitle", "seoTitle", "h1"]) ?? page.targetUrl;
  const description = pickString(record, ["description", "metaDescription", "summary"]) ?? "";
  const heading = pickString(record, ["h1", "headline", "title"]) ?? title;
  const body = pickString(record, ["body", "content", "copy"]) ?? JSON.stringify(record, null, 2);
  const canonical = pickString(record, ["canonical", "canonicalUrl"]);
  const robots = pickString(record, ["robots"]);
  const jsonLdScript = renderJsonLdScript(record.jsonLd);

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
${canonical ? `  <link rel="canonical" href="${escapeHtml(canonical)}">\n` : ""}${robots ? `  <meta name="robots" content="${escapeHtml(robots)}">\n` : ""}${jsonLdScript ? `  ${jsonLdScript}\n` : ""}</head>
<body>
  <main>
    <h1>${escapeHtml(heading)}</h1>
    <pre>${escapeHtml(body)}</pre>
  </main>
</body>
</html>`;
}

function targetUrlToHtmlPath(targetUrl: string): string {
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

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function renderJsonLdScript(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }

  const json = typeof value === "string" ? value : JSON.stringify(value);

  if (!json || json.trim().length === 0) {
    return undefined;
  }

  return `<script type="application/ld+json">${escapeScriptJson(json)}</script>`;
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

export type LocalRouteStrategy = "local_page" | "subdomain" | "backlog";

export function chooseLocalRouteStrategy(input: {
  marketSize: "small" | "medium" | "large";
  contentDepth: "thin" | "adequate" | "strong";
  hasUniqueLocalProof: boolean;
}): LocalRouteStrategy {
  if (!input.hasUniqueLocalProof || input.contentDepth === "thin") {
    return "backlog";
  }

  if (input.marketSize === "large" && input.contentDepth === "strong") {
    return "subdomain";
  }

  return "local_page";
}

export type RankingProofTier = "customer_proof" | "internal_roadmap" | "internal_radar";

export function classifyRankingProof(input: {
  isTop10: boolean;
  isTop5: boolean;
  isTop3: boolean;
  isPositionOne: boolean;
}): RankingProofTier {
  if (input.isTop10 || input.isTop5 || input.isTop3 || input.isPositionOne) {
    return "customer_proof";
  }

  return "internal_radar";
}
