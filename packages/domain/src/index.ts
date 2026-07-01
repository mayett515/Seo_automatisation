import type {
  ApprovedReleaseArtifact,
  ApprovedReleaseArtifactPage,
  ReleaseCheck,
  ReleasePlan,
  ReleaseVerificationStatus,
  WebsiteImportRun
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

export type RollbackPublishedDeployStatus = "pending" | "deploying" | "ready" | "failed" | "rolled_back" | "unknown";

export type RollbackReconciliationDecision =
  | { kind: "completed"; publishedProviderDeployId: string }
  | { kind: "still_pending"; reason: "provider_not_ready" | "published_identity_not_available" }
  | { kind: "manual_required"; reason: "provider_failed" | "published_identity_mismatch" };

export function classifyRollbackReconciliation(input: {
  intendedProviderDeployId: string;
  targetProviderDeployId: string;
  publishedProviderDeployId?: string;
  publishedStatus?: RollbackPublishedDeployStatus;
}): RollbackReconciliationDecision {
  if (!input.publishedProviderDeployId || !input.publishedStatus || input.publishedStatus === "unknown") {
    return { kind: "still_pending", reason: "published_identity_not_available" };
  }

  if (input.publishedStatus === "failed" || input.publishedStatus === "rolled_back") {
    return { kind: "manual_required", reason: "provider_failed" };
  }

  if (input.publishedProviderDeployId === input.targetProviderDeployId) {
    return { kind: "still_pending", reason: "provider_not_ready" };
  }

  if (input.publishedProviderDeployId !== input.intendedProviderDeployId) {
    return { kind: "manual_required", reason: "published_identity_mismatch" };
  }

  if (input.publishedStatus === "ready") {
    return { kind: "completed", publishedProviderDeployId: input.publishedProviderDeployId };
  }

  return { kind: "still_pending", reason: "provider_not_ready" };
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

export type WebsiteImportFacts = NonNullable<WebsiteImportRun["facts"]>;

export type WebsiteImportEvidencePageInput = {
  route: string;
  title?: string;
  metaDescription?: string;
  h1?: string;
  schemaTypes?: readonly string[];
  visibleTextSummary?: string;
};

export type WebsiteImportEvidenceInput = {
  sourceUrl: string;
  pages: readonly WebsiteImportEvidencePageInput[];
};

type ImportFactAccumulator = {
  value: string;
  sourceRoutes: Set<string>;
  routeEvidence: boolean;
  textEvidence: boolean;
};

const knownServiceTerms = [
  { label: "Dachreinigung", tokens: ["dachreinigung"] },
  { label: "Dachrinnenreinigung", tokens: ["dachrinnenreinigung"] },
  { label: "Flachdachsanierung", tokens: ["flachdachsanierung"] },
  { label: "Gebaeudereinigung", tokens: ["gebaeudereinigung", "gebaudereinigung"] },
  { label: "Hausmeisterservice", tokens: ["hausmeisterservice"] },
  { label: "Entruempelung", tokens: ["entruempelung", "entrumpelung"] },
  { label: "Winterdienst", tokens: ["winterdienst"] },
  { label: "Fensterreinigung", tokens: ["fensterreinigung"] },
  { label: "Treppenhausreinigung", tokens: ["treppenhausreinigung"] },
  { label: "Gartenpflege", tokens: ["gartenpflege"] },
  { label: "Renovierung", tokens: ["renovierung"] },
  { label: "Reinigung", tokens: ["reinigung"] }
] as const;

const areaStopWords = new Set([
  "dach",
  "dachreinigung",
  "dachrinnenreinigung",
  "flachdachsanierung",
  "gebaeudereinigung",
  "gebaudereinigung",
  "hausmeisterservice",
  "entruempelung",
  "entrumpelung",
  "winterdienst",
  "fensterreinigung",
  "treppenhausreinigung",
  "gartenpflege",
  "renovierung",
  "reinigung",
  "service",
  "leistungen",
  "kontakt",
  "ueber",
  "uber"
]);

export function deriveWebsiteImportFacts(input: WebsiteImportEvidenceInput): WebsiteImportFacts {
  const brand = deriveBrandFact(input);
  const services = deriveServiceFacts(input.pages);
  const areas = deriveAreaFacts(input.pages);

  return {
    ...(brand ? { brand } : {}),
    services,
    areas
  };
}

function deriveBrandFact(input: WebsiteImportEvidenceInput): WebsiteImportFacts["brand"] {
  const homepage = input.pages.find((page) => page.route === "/" || page.route === "") ?? input.pages[0];

  if (!homepage) {
    return undefined;
  }

  const candidate = brandCandidateFromPage(homepage);

  if (!candidate) {
    return undefined;
  }

  return {
    name: candidate,
    confidence: homepage.route === "/" || homepage.route === "" ? "medium" : "low",
    sourceRoutes: [homepage.route]
  };
}

function deriveServiceFacts(pages: readonly WebsiteImportEvidencePageInput[]): WebsiteImportFacts["services"] {
  const facts = new Map<string, ImportFactAccumulator>();

  for (const page of pages) {
    const routeText = normalizeEvidenceText(page.route);
    const pageText = normalizeEvidenceText(
      [page.title, page.metaDescription, page.h1, page.visibleTextSummary].join(" ")
    );

    for (const service of knownServiceTerms) {
      const routeEvidence = service.tokens.some((token) => routeText.includes(token));
      const textEvidence = service.tokens.some((token) => pageText.includes(token));

      if (routeEvidence || textEvidence) {
        recordImportFact(facts, service.label, page.route, {
          routeEvidence,
          textEvidence
        });
      }
    }
  }

  return importFactsFromMap(facts, 6);
}

function deriveAreaFacts(pages: readonly WebsiteImportEvidencePageInput[]): WebsiteImportFacts["areas"] {
  const facts = new Map<string, ImportFactAccumulator>();

  for (const page of pages) {
    for (const area of areasFromRoute(page.route)) {
      recordImportFact(facts, area, page.route, {
        routeEvidence: true,
        textEvidence: false
      });
    }

    for (const area of areasFromText([page.title, page.metaDescription, page.h1].join(" "))) {
      recordImportFact(facts, area, page.route, {
        routeEvidence: false,
        textEvidence: true
      });
    }
  }

  return importFactsFromMap(facts, 8);
}

function brandCandidateFromPage(page: WebsiteImportEvidencePageInput): string | undefined {
  const value = page.title ?? page.h1;

  if (!value) {
    return undefined;
  }

  const [candidate] = value.split(/\s+[|-]\s+/u);
  const normalized = candidate?.trim();
  return normalized && normalized.length >= 2 ? normalized.slice(0, 80) : undefined;
}

function areasFromRoute(route: string): string[] {
  const routeWords = normalizeEvidenceText(route)
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);
  const candidates = routeWords.filter((word) => word.length >= 3 && !areaStopWords.has(word));
  return candidates.map(titleCaseSlug).filter((candidate) => candidate.length >= 3);
}

function areasFromText(text: string): string[] {
  const candidates = new Set<string>();
  const pattern = /\b(?:in|bei|um|fuer|fur)\s+([A-Z][\p{L}-]{2,}(?:\s+[A-Z][\p{L}-]{2,})?)/gu;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    const candidate = match[1]?.trim();

    if (candidate && !areaStopWords.has(normalizeEvidenceText(candidate))) {
      candidates.add(candidate.slice(0, 80));
    }
  }

  return [...candidates];
}

function recordImportFact(
  facts: Map<string, ImportFactAccumulator>,
  value: string,
  sourceRoute: string,
  evidence: { routeEvidence: boolean; textEvidence: boolean }
): void {
  const key = normalizeEvidenceText(value);
  const existing =
    facts.get(key) ??
    ({
      value,
      sourceRoutes: new Set<string>(),
      routeEvidence: false,
      textEvidence: false
    } satisfies ImportFactAccumulator);

  existing.sourceRoutes.add(sourceRoute);
  existing.routeEvidence = existing.routeEvidence || evidence.routeEvidence;
  existing.textEvidence = existing.textEvidence || evidence.textEvidence;
  facts.set(key, existing);
}

function importFactsFromMap(
  facts: Map<string, ImportFactAccumulator>,
  limit: number
): Array<{ value: string; confidence: "low" | "medium" | "high"; sourceRoutes: string[] }> {
  return [...facts.values()]
    .sort((left, right) => right.sourceRoutes.size - left.sourceRoutes.size || left.value.localeCompare(right.value))
    .slice(0, limit)
    .map((fact) => ({
      value: fact.value,
      confidence: confidenceForFact(fact),
      sourceRoutes: [...fact.sourceRoutes].sort()
    }));
}

function confidenceForFact(fact: ImportFactAccumulator): "low" | "medium" | "high" {
  if (fact.routeEvidence && fact.textEvidence) {
    return "high";
  }

  if (fact.sourceRoutes.size > 1 || fact.routeEvidence || fact.textEvidence) {
    return "medium";
  }

  return "low";
}

function normalizeEvidenceText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .toLowerCase();
}

function titleCaseSlug(value: string): string {
  return value
    .split(/[-_\s]+/u)
    .filter(Boolean)
    .map((segment) => `${segment.slice(0, 1).toUpperCase()}${segment.slice(1)}`)
    .join(" ");
}
