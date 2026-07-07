import { readFileSync } from "node:fs";

type GuardResult = {
  category: string;
  message: string;
};

const failures: GuardResult[] = [];
const warnings: GuardResult[] = [];

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function requireIncludes(path: string, text: string, category: string, message: string): void {
  if (!read(path).includes(text)) {
    failures.push({ category, message: `${path}: ${message}` });
  }
}

function requireNotIncludes(path: string, text: string, category: string, message: string): void {
  if (read(path).includes(text)) {
    failures.push({ category, message: `${path}: ${message}` });
  }
}

function warnIfIncludes(path: string, text: string, category: string, message: string): void {
  if (read(path).includes(text)) {
    warnings.push({ category, message: `${path}: ${message}` });
  }
}

function warnIfRegex(path: string, pattern: RegExp, category: string, message: string): void {
  if (pattern.test(read(path))) {
    warnings.push({ category, message: `${path}: ${message}` });
  }
}

function requireRegex(path: string, pattern: RegExp, category: string, message: string): void {
  if (!pattern.test(read(path))) {
    failures.push({ category, message: `${path}: ${message}` });
  }
}

requireIncludes(
  ".ai-project-rules/00-system-index.md",
  ".ai-project-rules/15-architecture-regression-guards.md",
  "rule-routing",
  "regression guard shard must be routed from the project rules index"
);

requireIncludes(
  "docs/architecture/decisions/0010-http-verification-and-release-status-projection.md",
  'Do not project `releasePlans.status = "live"` from `deployments.status = "provider_succeeded"`',
  "release-live-truth",
  "ADR 0010 must explicitly guard against provider_success -> release live projection"
);

requireIncludes(
  "apps/worker/src/handlers/opportunity-scout.ts",
  "const { score, ...evidenceJson } = brief;",
  "strict-persisted-json",
  "Opportunity Scout must strip derived score before writing evidenceJson"
);

requireNotIncludes(
  "apps/worker/src/handlers/opportunity-scout.ts",
  "evidenceJson: brief",
  "strict-persisted-json",
  "Opportunity Scout must not persist scored briefs as strict evidenceJson"
);

requireIncludes(
  "apps/worker/src/handlers/opportunity-scout.integration.ts",
  "OpportunityBriefSchema.safeParse(rows[0]?.evidenceJson)",
  "strict-persisted-json",
  "worker integration must assert persisted opportunity evidence parses through OpportunityBriefSchema"
);

requireIncludes(
  "apps/worker/src/handlers/opportunity-scout.integration.ts",
  '"score" in rawEvidenceJson',
  "strict-persisted-json",
  "worker integration must assert score is not embedded in opportunity evidenceJson"
);

requireIncludes(
  "apps/worker/src/handlers/deploy.ts",
  "assertDeployableReleaseArtifactItem",
  "deploy-artifact-approval",
  "deploy artifacts must run the approval guard before artifact build"
);

requireIncludes(
  "apps/worker/src/handlers/deploy.ts",
  'item.pageVersionStatus !== "approved"',
  "deploy-artifact-approval",
  "deploy artifact guard must require approved page versions"
);

requireIncludes(
  "apps/worker/src/handlers/deploy.ts",
  "!item.pageVersionApprovedAt",
  "deploy-artifact-approval",
  "deploy artifact guard must require approval timestamp evidence"
);

requireIncludes(
  "apps/worker/src/handlers/deploy.ts",
  "!item.pageJson",
  "deploy-artifact-approval",
  "deploy artifact guard must require pageJson for page-version-backed actions"
);

requireRegex(
  "apps/worker/src/handlers/deploy.test.ts",
  /fails closed when a deploy artifact item is missing a page version/u,
  "deploy-artifact-approval",
  "deploy tests must cover missing page version"
);

requireRegex(
  "apps/worker/src/handlers/deploy.test.ts",
  /fails closed when a deploy artifact item references an unapproved page version/u,
  "deploy-artifact-approval",
  "deploy tests must cover unapproved page version"
);

requireRegex(
  "apps/worker/src/handlers/deploy.test.ts",
  /fails closed when a deploy artifact item lacks approval evidence/u,
  "deploy-artifact-approval",
  "deploy tests must cover missing approvedAt evidence"
);

warnIfIncludes(
  "apps/api/src/modules/releases.module.ts",
  ".submitSitemap(",
  "known-open-provider-mutation",
  "GSC sitemap submission is still inline in POST /verify; planned fix is worker-owned verification"
);

warnIfIncludes(
  "apps/worker/src/handlers/deploy.ts",
  "const releaseLiveProjectableDeploymentStatusValues = rollbackSourceDeploymentStatusValues",
  "known-open-release-live-truth",
  "provider_succeeded still participates in release-live projection; planned fix is verification-only live projection"
);

warnIfRegex(
  "apps/worker/src/handlers/deploy.ts",
  /async markProviderSucceeded[\s\S]*?releasePlans[\s\S]*?status: "live"/u,
  "known-open-release-live-truth",
  "provider success still writes releasePlans.status = live; planned fix is verification-only live projection"
);

if (warnings.length > 0) {
  console.warn("Architecture regression guard warnings:");
  for (const warning of warnings) {
    console.warn(`- [${warning.category}] ${warning.message}`);
  }
}

if (failures.length > 0) {
  console.error("Architecture regression guard check failed:");
  for (const failure of failures) {
    console.error(`- [${failure.category}] ${failure.message}`);
  }
  process.exit(1);
}

console.log("Architecture regression guard check passed.");
