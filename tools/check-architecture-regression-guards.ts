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

function requireRegex(path: string, pattern: RegExp, category: string, message: string): void {
  if (!pattern.test(read(path))) {
    failures.push({ category, message: `${path}: ${message}` });
  }
}

function requireNotRegex(path: string, pattern: RegExp, category: string, message: string): void {
  if (pattern.test(read(path))) {
    failures.push({ category, message: `${path}: ${message}` });
  }
}

function requireOrderedIncludes(
  path: string,
  earlierText: string,
  laterText: string,
  category: string,
  message: string
): void {
  const source = read(path);
  const earlierIndex = source.indexOf(earlierText);
  const laterIndex = source.indexOf(laterText, earlierIndex + earlierText.length);
  if (earlierIndex < 0 || laterIndex < 0) {
    failures.push({ category, message: `${path}: ${message}` });
  }
}

function requireLatestMigrationDefinitionIncludes(
  functionName: string,
  text: string,
  category: string,
  message: string
): void {
  const migrationDirectory = "packages/db/migrations";
  const definitionMarker = `CREATE OR REPLACE FUNCTION ${functionName}(`;
  const journal = JSON.parse(read(`${migrationDirectory}/meta/_journal.json`)) as {
    entries: Array<{ idx: number; tag: string }>;
  };
  let latestDefinition: { path: string; source: string } | undefined;

  for (const entry of [...journal.entries].sort((left, right) => left.idx - right.idx)) {
    const path = `${migrationDirectory}/${entry.tag}.sql`;
    const migration = read(path);
    let definitionStart = migration.indexOf(definitionMarker);
    while (definitionStart >= 0) {
      const afterMarker = migration.slice(definitionStart);
      const delimiterMatch = /\bAS\s+(\$[A-Za-z0-9_]*\$)/u.exec(afterMarker);
      if (!delimiterMatch) break;
      const delimiter = delimiterMatch[1];
      if (!delimiter) break;
      const bodyStart = definitionStart + delimiterMatch.index + delimiterMatch[0].length;
      const bodyEnd = migration.indexOf(delimiter, bodyStart);
      if (bodyEnd < 0) break;
      latestDefinition = {
        path,
        source: migration.slice(definitionStart, bodyEnd + delimiter.length)
      };
      definitionStart = migration.indexOf(definitionMarker, bodyEnd + delimiter.length);
    }
  }

  if (!latestDefinition || !latestDefinition.source.includes(text)) {
    failures.push({
      category,
      message: `${latestDefinition?.path ?? migrationDirectory}: ${message}`
    });
  }
}

requireIncludes(
  ".ai-project-rules/00-system-index.md",
  ".ai-project-rules/15-architecture-regression-guards.md",
  "rule-routing",
  "regression guard shard must be routed from the project rules index"
);

requireIncludes(
  ".ai-project-rules/15-architecture-regression-guards.md",
  'rule_budget: "guard-exception"',
  "rule-routing",
  "rule 15 must declare its intentional guard-exception rule budget"
);

requireIncludes(
  "tools/check-text-health.ts",
  "assertRuleDependencyGraphAcyclic();",
  "rule-system-cohesion",
  "local hidden-rule dependencies must resolve and remain acyclic"
);

requireIncludes(
  ".ai-project-rules/15-architecture-regression-guards.md",
  'anti_regression_mode: "hybrid-boundary"',
  "rule-routing",
  "rule 15 must declare its intentional hybrid anti-regression mode"
);

// These anchors intentionally make the frozen upstream-authored reference schema a check dependency.
requireIncludes(
  ".ai-rules/90-schema-generation-spec.md",
  "normal-domain review threshold, not an automatic ceiling",
  "rule-budget-policy",
  "the frozen reference schema must treat 15 rules as a review threshold rather than a hard ceiling"
);

requireIncludes(
  ".ai-rules/90-schema-generation-spec.md",
  "DO NOT split a cohesive rule file solely because it exceeds the default review threshold",
  "rule-budget-policy",
  "schema generation must not force count-only horizontal splits"
);

requireIncludes(
  ".ai-rules/90-schema-generation-spec.md",
  'rule_budget: "cohesion-retained"',
  "rule-budget-policy",
  "retained cohesive domains above the threshold must expose an auditable rationale marker"
);

requireNotIncludes(
  ".ai-rules/90-schema-generation-spec.md",
  "DO NOT exceed the default 15-rule budget",
  "rule-budget-policy",
  "the superseded hard normal-domain ceiling must not return"
);

requireNotIncludes(
  ".ai-rules/91-template-domain.md",
  "DO NOT exceed the rule ceiling",
  "rule-budget-policy",
  "the frozen reference template must not reintroduce a hard rule ceiling"
);

requireIncludes(
  ".ai-rules/91-template-domain.md",
  "DO NOT split, delete, or combine rules solely to force the generated file below the default 15-rule review threshold",
  "rule-budget-policy",
  "the frozen reference template must preserve the adaptive threshold policy"
);

requireIncludes(
  ".ai-project-rules/00-system-index.md",
  "THEN you MUST load and comply with: `.ai-project-rules/14A-module-cohesion-and-capability-extraction.md`.",
  "rule-routing",
  "the module cohesion shard must be routed from the project rules index"
);

requireNotIncludes(
  ".ai-project-rules/14A-module-cohesion-and-capability-extraction.md",
  "<routing-logic>",
  "rule-routing",
  "rule 14A must stay a terminal leaf without its own router"
);

requireNotIncludes(
  ".ai-project-rules/14-architecture-direction.md",
  "DO NOT introduce microservices before the modular monolith boundaries are proven insufficient",
  "rule-routing",
  "the modular-monolith topology rule must live only in rule 14A after the horizontal split"
);

requireNotIncludes(
  ".ai-project-rules/14A-module-cohesion-and-capability-extraction.md",
  "DO NOT hand-maintain duplicate shared enums",
  "rule-routing",
  "shared type and payload truth must stay in architecture direction rather than module decomposition"
);

requireIncludes(
  ".ai-project-rules/14A-module-cohesion-and-capability-extraction.md",
  "Build a modular monolith first:",
  "module-cohesion",
  "the modular-monolith topology rule must survive the horizontal split"
);

requireIncludes(
  ".ai-project-rules/14A-module-cohesion-and-capability-extraction.md",
  "Use DDD-lite bounded contexts:",
  "module-cohesion",
  "the bounded-context ownership rule must survive the horizontal split"
);

requireIncludes(
  ".ai-project-rules/14-architecture-direction.md",
  "DO NOT hand-maintain duplicate shared enums",
  "architecture-direction",
  "the shared-truth ownership rule must remain beside its architecture trigger gate"
);

requireIncludes(
  ".ai-project-rules/14-architecture-direction.md",
  'rule_budget: "cohesion-retained"',
  "architecture-direction",
  "the retained architecture shard must expose its explicit cohesion review decision"
);

requireIncludes(
  ".ai-project-rules/14A-module-cohesion-and-capability-extraction.md",
  "DO NOT introduce microservices before the modular monolith boundaries are proven insufficient",
  "module-cohesion",
  "the premature-microservices ban must survive the horizontal split"
);

requireIncludes(
  ".ai-project-rules/14A-module-cohesion-and-capability-extraction.md",
  "DO NOT split a Nest module solely because a review called it large or counted its lines",
  "module-cohesion",
  "module cohesion must not regress into a line-count split rule"
);

requireIncludes(
  ".ai-project-rules/14A-module-cohesion-and-capability-extraction.md",
  "Keep the module's public entrypoint stable across an extraction",
  "module-cohesion",
  "capability extraction must preserve the stable facade contract"
);

requireIncludes(
  ".ai-project-rules/14A-module-cohesion-and-capability-extraction.md",
  "in exactly one internal owner per bounded context",
  "module-cohesion",
  "shared canonicalization, transaction ordering, and lock order must keep one internal owner"
);

requireIncludes(
  ".ai-project-rules/14A-module-cohesion-and-capability-extraction.md",
  "do not split automatically",
  "module-cohesion",
  "ownership differences must trigger evidence collection rather than a forced split"
);

requireIncludes(
  ".ai-project-rules/14A-module-cohesion-and-capability-extraction.md",
  "eligibility alone does not choose the outcome",
  "module-cohesion",
  "extraction eligibility must remain necessary rather than automatically sufficient"
);

requireIncludes(
  ".ai-project-rules/14A-module-cohesion-and-capability-extraction.md",
  "IF ownership evidence is complete but extraction eligibility or a material cohesion benefit is not demonstrated:",
  "module-cohesion",
  "complete evidence must still permit an honest keep-cohesive decision"
);

requireIncludes(
  ".ai-project-rules/14A-module-cohesion-and-capability-extraction.md",
  "`keep_cohesive`, `extract_capability`, or `defer_pending_evidence`",
  "module-cohesion",
  "module-cohesion reviews must expose all three legitimate outcomes"
);

requireIncludes(
  ".ai-project-rules/14A-module-cohesion-and-capability-extraction.md",
  "IF reviewing a completed extraction:",
  "module-cohesion",
  "module extraction must have a soft post-change audit path"
);

requireIncludes(
  ".ai-project-rules/14A-module-cohesion-and-capability-extraction.md",
  "IF reviewing a decision that kept the existing boundary:",
  "module-cohesion",
  "post-change review must support successful keep-cohesive and deferred outcomes"
);

for (const [branch, message] of [
  [
    "IF two or more of actor/permission, transaction root, lifecycle authority, external dependency set, or change cadence differ inside one module:\nTHEN mark the smaller side as an extraction candidate and document the differing ownership evidence; do not split automatically.",
    "ownership differences must create a candidate without forcing extraction"
  ],
  [
    "IF an extraction candidate is independently nameable, owns real policy, errors, and tests, and can preserve one owner for shared persistence and lock-order invariants:\nTHEN mark it eligible for extraction; eligibility alone does not choose the outcome.",
    "eligibility must remain necessary rather than automatically sufficient"
  ],
  [
    "IF an eligible extraction candidate materially improves cohesion, navigation, test isolation, or change isolation without increasing coordination cost:\nTHEN choose `extract_capability` and extract it behind the existing public entrypoint.",
    "extraction must require a demonstrated material cohesion benefit"
  ],
  [
    "IF ownership evidence is complete but extraction eligibility or a material cohesion benefit is not demonstrated:\nTHEN choose `keep_cohesive` and leave the current boundary unchanged.",
    "complete evidence must support an honest keep-cohesive outcome"
  ],
  [
    "IF ownership evidence is incomplete:\nTHEN choose `defer_pending_evidence` and leave the current boundary unchanged until the missing evidence is available.",
    "incomplete evidence must defer rather than force a boundary change"
  ],
  [
    "IF reviewing a completed extraction:\nTHEN verify the stable facade, one internal invariant owner, absence of pass-through capabilities, behavior tests, and moved regression guards.",
    "completed extractions must receive the full post-change audit"
  ],
  [
    "IF reviewing a decision that kept the existing boundary:\nTHEN verify the `keep_cohesive` or `defer_pending_evidence` rationale and treat `keep_cohesive` as a valid successful audit result.",
    "kept boundaries must have their own successful post-change audit"
  ]
] as const) {
  requireIncludes(
    ".ai-project-rules/14A-module-cohesion-and-capability-extraction.md",
    branch,
    "module-cohesion",
    message
  );
}

requireIncludes(
  ".ai-project-rules/00-system-index.md",
  "shared enum/event/payload ownership, source-of-truth placement",
  "rule-routing",
  "shared contract ownership must route directly to architecture direction"
);

requireIncludes(
  ".ai-project-rules/00-system-index.md",
  "IF the task touches architecture style, layering, Clean Architecture dependency direction, Hexagonal ports/adapters, composition roots, agent authority, shared enum/event/payload ownership, source-of-truth placement, or where logic belongs:\nTHEN you MUST load and comply with: `.ai-project-rules/14-architecture-direction.md`.",
  "rule-routing",
  "the complete shared-contract ownership condition must route to rule 14"
);

requireNotIncludes(
  ".ai-project-rules/02-stack-and-boundaries.md",
  "IF a shared request, response, event, or job payload type is created:",
  "rule-routing",
  "stack guidance must not duplicate architecture-direction source-of-truth decisions"
);

requireNotIncludes(
  ".ai-project-rules/02-stack-and-boundaries.md",
  "Did I run the source-of-truth check for shared non-trivial types?",
  "rule-routing",
  "stack guidance must not reclaim source-of-truth verification ownership"
);

requireIncludes(
  "AGENTS.md",
  "Generic TypeScript rule authoring is owned upstream by the pack master",
  "rule-authority",
  "the root adapter must name the pack repository as the upstream authoring authority"
);

requireIncludes(
  "AGENTS.md",
  "`.ai-rules/` is a frozen reference copy of the retired TypeScript rule bundle",
  "rule-authority",
  "the root adapter must identify the retired bundle as frozen reference, not active canon"
);

requireIncludes(
  "AGENTS.md",
  "update the pack first, then sync the host layers",
  "rule-authority",
  "generic TypeScript policy changes must originate in the pack before host-layer sync"
);

requireIncludes(
  "AGENTS.md",
  "## Shared native layer",
  "native-layer",
  "the root adapter must document the shared Cursor/Codex native layer"
);

requireIncludes(
  "AGENTS.md",
  "## Archive (retired rule bundles)",
  "native-layer",
  "the root adapter must document how archived bundles are accessed on demand"
);

requireIncludes(
  "AGENTS.md",
  "4+ meaningful variants",
  "native-layer",
  "the library policy must keep the concrete ts-pattern threshold, not a vague paraphrase"
);

requireIncludes(
  "AGENTS.md",
  ".exhaustive()",
  "native-layer",
  "the library policy must require exhaustive matching on closed unions"
);

requireIncludes(
  ".agents/skills/anti-regression/SKILL.md",
  "name: anti-regression",
  "native-layer",
  "the shared skill layer must remain present at the repository root"
);

requireIncludes(
  ".cursor/hooks.json",
  '"failClosed": true',
  "native-layer",
  "the Cursor pre-tool protection hook must remain fail-closed"
);

requireIncludes(
  "packages/db/src/page-version-project-scope.ts",
  "export function pageVersionProjectScope",
  "tenancy-scope",
  "the page-version tenant guard must keep its single named owner in packages/db"
);

for (const scopedFile of [
  "apps/api/src/modules/pages.module.ts",
  "apps/api/src/modules/releases.module.ts",
  "apps/api/src/modules/reports/report-aggregate-store.ts",
  "apps/api/src/preview-media.ts",
  "apps/worker/src/handlers/customer-report.ts",
  "apps/worker/src/handlers/release-verification.ts",
  "apps/worker/src/handlers/section-copy-suggestion.ts",
  "packages/db/src/media-manifest.ts"
]) {
  requireNotIncludes(
    scopedFile,
    "innerJoin(pageProposals, eq(pageVersions.pageProposalId, pageProposals.id))",
    "tenancy-scope",
    "page-version project scoping must go through pageVersionProjectScope, not a hand-written join"
  );
}

requireIncludes(
  ".agents/skills/mermaid-diagrams/SKILL.md",
  "name: mermaid-diagrams",
  "native-layer",
  "the mermaid-diagrams skill replaced the archived diagram bundle and must remain"
);

requireIncludes(
  ".agents/skills/inspiration-pass/SKILL.md",
  "name: inspiration-pass",
  "native-layer",
  "the inspiration-pass skill replaced the archived stealer bundle and must remain"
);

requireIncludes(
  ".agents/skills/inspiration-pass/SKILL.md",
  "Architecture-decision domain scan",
  "native-layer",
  "the inspiration-pass skill must keep the domain scan lifted from the archived bundle"
);

requireIncludes(
  "apps/api/AGENTS.md",
  "Consume state nonces atomically",
  "native-layer",
  "the OAuth nonce-atomicity lift must remain in the API invariants"
);

requireIncludes(
  "apps/api/AGENTS.md",
  "Access tokens stay short-lived and in memory",
  "native-layer",
  "the in-memory access-token lift must remain in the API invariants"
);

requireIncludes(
  "apps/worker/AGENTS.md",
  "rediss://",
  "native-layer",
  "the rediss TLS lift must remain in the worker invariants"
);

requireIncludes(
  ".cursor/hooks/pre-tool-policy.mjs",
  "archive/ is read-only history",
  "native-layer",
  "the Cursor hook must carry the archive deny rule, not merely mention the word"
);

requireIncludes(
  ".claude/hooks/protect-paths.mjs",
  "archive/ is read-only history",
  "native-layer",
  "the Claude hook must carry the repo-specific archive deny rule"
);

requireIncludes(
  ".claude/settings.json",
  "protect-paths.mjs",
  "native-layer",
  "the Claude settings must register the protected-path hook"
);

requireIncludes(
  "archive/MIGRATION-LEDGER.md",
  'The blanket "covered" was overclaimed',
  "native-layer",
  "the ledger must keep the concrete overclaim correction, not only an Amendments heading"
);

requireNotIncludes(
  ".ai-project-rules/14-architecture-direction.md",
  "archive/.ai-stealer-rules",
  "native-layer",
  "living rules must not declare archived files as dependencies or scan targets"
);

requireNotIncludes(
  ".ai-project-rules/14A-module-cohesion-and-capability-extraction.md",
  "archive/.ai-nest-rules",
  "native-layer",
  "living rules must not declare archived files as dependencies"
);

requireIncludes(
  "apps/worker/AGENTS.md",
  "Durable intent, run, and reservation rows written before enqueue",
  "native-layer",
  "the corrected durable-row wording must not regress to an absolute ban"
);

requireIncludes(
  "apps/api/AGENTS.md",
  "reverse proxy/edge, never to the Node process",
  "native-layer",
  "the fastify edge-ownership lift must remain in the API invariants"
);

// These are explicit reviewed decisions, not a dynamic rule-count gate.
for (const [path, budget] of [
  [".ai-rules/02E-functional-library-selection.md", "cohesion-retained"],
  [".ai-project-rules/04-deployment-agent.md", "cohesion-retained"],
  [".ai-project-rules/06-backend-workers-mastra.md", "cohesion-retained"],
  [".ai-project-rules/07-tracking-privacy-observability.md", "cohesion-retained"],
  [".ai-project-rules/10-seo-verification-gsc.md", "cohesion-retained"],
  [".ai-project-rules/12-local-seo-page-quality-gate.md", "guard-exception"],
  [".ai-project-rules/13-seo-opportunity-planning.md", "cohesion-retained"]
] as const) {
  requireIncludes(
    path,
    `rule_budget: "${budget}"`,
    "reviewed-rule-budget",
    `${path} must retain its explicit cohesion-review classification`
  );
}

for (const [path, rationale] of [
  [".ai-rules/02E-functional-library-selection.md", "the alternatives must be compared in one adoption decision"],
  [".ai-project-rules/04-deployment-agent.md", "are one release state machine"],
  [".ai-project-rules/06-backend-workers-mastra.md", "form one authority handoff"],
  [".ai-project-rules/07-tracking-privacy-observability.md", "are one event-data lifecycle"],
  [".ai-project-rules/10-seo-verification-gsc.md", "jointly decide indexing, monitoring, and report eligibility"],
  [".ai-project-rules/12-local-seo-page-quality-gate.md", "This 38-rule file is an intentional guard exception"],
  [".ai-project-rules/13-seo-opportunity-planning.md", "form one proof-escalation decision"],
  [
    ".ai-project-rules/14-architecture-direction.md",
    "shared type and payload truth must stay beside its source-of-truth trigger gate"
  ]
] as const) {
  requireIncludes(
    path,
    rationale,
    "reviewed-rule-budget",
    `${path} must retain its file-specific cohesion-review rationale`
  );
}

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
  "deployablePageVersionStatuses",
  "deploy-artifact-approval",
  "deploy artifact guard must use the named approved/release-candidate lifecycle status set"
);

requireIncludes(
  "apps/worker/src/handlers/deploy.ts",
  '"release_candidate"',
  "deploy-artifact-approval",
  "deploy artifact guard must accept release-candidate page versions after deploy approval"
);

requireIncludes(
  "packages/db/src/release-lifecycle.ts",
  "demoteReleaseCandidatePageVersionsForPlan",
  "deploy-artifact-approval",
  "Release lifecycle helper must restore stranded release-candidate page versions"
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

requireNotIncludes(
  "apps/api/src/modules/releases.module.ts",
  ".submitSitemap(",
  "worker-owned-release-verification",
  "POST /verify must not submit sitemaps inline; release verification worker owns GSC handoff"
);

requireNotIncludes(
  "apps/api/src/modules/releases.module.ts",
  ".verifyRelease(",
  "worker-owned-release-verification",
  "POST /verify must not run release verification inline; release verification worker owns execution"
);

requireIncludes(
  "apps/worker/src/handlers/release-verification.ts",
  'releaseVerificationWorkerEvidenceSource = "release_verify_worker"',
  "worker-owned-release-verification",
  "release verification worker must own persisted verification provenance"
);

requireIncludes(
  "packages/db/src/schema.ts",
  "release_verifications_active_deployment_idx",
  "worker-owned-release-verification",
  "release verification must keep a Postgres one-active-run guard per deployment"
);

requireNotIncludes(
  "apps/worker/src/handlers/deploy.ts",
  "const releaseLiveProjectableDeploymentStatusValues = rollbackSourceDeploymentStatusValues",
  "release-live-truth",
  "provider_succeeded must not participate in release-live projection"
);

requireNotRegex(
  "apps/worker/src/handlers/deploy.ts",
  /async markProviderSucceeded[\s\S]*?releasePlans[\s\S]*?status: "live"[\s\S]*?async markProviderPending/u,
  "release-live-truth",
  "provider success must not write releasePlans.status = live"
);

requireNotIncludes(
  "packages/adapters/src/netlify-site-hosting.ts",
  "renderApprovedReleaseArtifact",
  "page-registry-renderer-boundary",
  "provider adapters must upload rendered static artifacts, not render PageJson"
);

requireNotIncludes(
  "packages/adapters/src/netlify-site-hosting.ts",
  "@localseo/page-registry",
  "page-registry-renderer-boundary",
  "provider adapters must not import page-registry renderer code"
);

requireIncludes(
  "apps/worker/src/handlers/deploy.ts",
  "buildStaticSiteArtifactKey",
  "page-registry-renderer-boundary",
  "deploy worker must hand provider adapters a rendered static-site artifact"
);

requireIncludes(
  "packages/seo/src/index.ts",
  "derivePageRegistrySeoFacts",
  "page-registry-renderer-boundary",
  "release preflight must use registry-derived typed PageJson facts"
);

requireIncludes(
  "packages/seo/src/index.ts",
  "validatePageJsonAgainstRegistry",
  "page-registry-renderer-boundary",
  "release preflight must validate PageJson against the registry before deriving facts"
);

requireIncludes(
  "packages/seo/src/index.ts",
  "release_action_materialization_check",
  "page-registry-renderer-boundary",
  "release preflight must block actions that do not yet materialize to rendered files or directive artifacts"
);

requireIncludes(
  "packages/contracts/src/index.ts",
  '"class"',
  "page-json-safety-boundary",
  "PageJson safety scan must reject literal class keys, not only className"
);

requireIncludes(
  "packages/page-registry/src/index.ts",
  "renderPagePreviewArtifact",
  "page-registry-renderer-boundary",
  "preview rendering must live in page-registry and share the static renderer core"
);

requireIncludes(
  "packages/page-registry/src/index.test.ts",
  "byte-identical to the deploy artifact",
  "page-registry-renderer-boundary",
  "preview rendering must have a deploy parity test"
);

requireIncludes(
  "packages/db/migrations/0026_page_version_immutability.sql",
  "page_versions_prevent_immutable_update",
  "page-version-immutability",
  "approved page version immutability must be enforced by a database trigger"
);

requireIncludes(
  "packages/db/migrations/0026_page_version_immutability.sql",
  "OLD.page_json IS DISTINCT FROM NEW.page_json",
  "page-version-immutability",
  "approved page version immutability must block in-place PageJson changes"
);

requireIncludes(
  "packages/db/migrations/0027_page_version_freeze_completion.sql",
  "page_versions_immutable_status_requires_approved_at",
  "page-version-immutability",
  "immutable page version statuses must require approval evidence on insert and update"
);

requireIncludes(
  "packages/db/migrations/0027_page_version_freeze_completion.sql",
  "page_versions_prevent_immutable_delete",
  "page-version-immutability",
  "immutable page version rows must not be deleted"
);

requireIncludes(
  "packages/db/migrations/0033_hot_scarecrow.sql",
  "page_versions_validate_lineage",
  "page-studio-versioning",
  "Page Studio versions must keep DB-enforced lineage"
);

requireIncludes(
  "packages/db/migrations/0033_hot_scarecrow.sql",
  'derived."version_number" = base."version_number" + 1',
  "page-studio-versioning",
  "existing derived page versions must be backfilled to direct lineage before the trigger becomes authoritative"
);

requireIncludes(
  "packages/db/migrations/0033_hot_scarecrow.sql",
  "base_version_number <> NEW.version_number - 1",
  "page-studio-versioning",
  "derived Page Studio versions must reference their immediate predecessor"
);

requireIncludes(
  "packages/db/migrations/0033_hot_scarecrow.sql",
  "OLD.based_on_version_id IS DISTINCT FROM NEW.based_on_version_id",
  "page-studio-versioning",
  "page versions must keep lineage evidence append-only"
);

requireIncludes(
  "packages/db/migrations/0033_hot_scarecrow.sql",
  "OLD.created_by_user_id IS DISTINCT FROM NEW.created_by_user_id",
  "page-studio-versioning",
  "page versions must keep editor actor evidence append-only"
);

requireIncludes(
  "packages/db/migrations/0033_hot_scarecrow.sql",
  "Page version structure and provenance are append-only",
  "page-studio-versioning",
  "preview and immutable page versions must create a new row for structural edits"
);

requireIncludes(
  "packages/domain/src/work-recovery.ts",
  "classifyWorkRecovery",
  "db-before-queue-recovery",
  "DB-before-queue recovery policy must stay encoded as a pure domain classifier"
);

requireIncludes(
  "packages/domain/src/work-recovery.ts",
  "reconcile_provider",
  "db-before-queue-recovery",
  "provider mutation uncertainty must route to provider reconciliation instead of generic re-enqueue"
);

requireIncludes(
  "packages/domain/src/work-recovery.ts",
  "artifactWritesAreIdempotent",
  "db-before-queue-recovery",
  "artifact capture recovery must keep explicit idempotency input before re-enqueue"
);

requireIncludes(
  "packages/domain/src/work-recovery.test.ts",
  "routes provider mutation uncertainty to provider reconciliation instead of re-enqueue",
  "db-before-queue-recovery",
  "recovery tests must prove provider mutation uncertainty does not generic re-enqueue"
);

requireIncludes(
  "apps/worker/src/work-recovery.ts",
  "classifyWorkRecovery",
  "db-before-queue-recovery",
  "the recovery scanner must remain a procedural shell around the pure domain classifier"
);

requireIncludes(
  "apps/worker/src/work-recovery.ts",
  'triggerSource: "work_recovery"',
  "db-before-queue-recovery",
  "recovered queue attempts must write explicit system recovery audit evidence"
);

requireIncludes(
  "apps/worker/src/work-recovery.ts",
  "eq(agentRuns.recoveryCount, candidate.recoveryCount)",
  "db-before-queue-recovery",
  "Page Proposal recovery claims must be guarded against competing scanners"
);

requireIncludes(
  "apps/worker/src/work-recovery.ts",
  "eq(releaseVerifications.recoveryCount, candidate.recoveryCount)",
  "db-before-queue-recovery",
  "release-verification recovery claims must be guarded against competing scanners"
);

requireNotRegex(
  "apps/worker/src/work-recovery.ts",
  /queueName:\s*["'](?:deploy|rollback)["']/u,
  "db-before-queue-recovery",
  "generic stale-work recovery must not register provider-mutation deploy or rollback queues"
);

requireIncludes(
  "apps/worker/src/work-recovery.integration.ts",
  "allows only one of two recovery scanners to claim the same stale run",
  "db-before-queue-recovery",
  "DB integration must prove competing recovery scanners cannot duplicate enqueue"
);

requireIncludes(
  "apps/worker/src/work-recovery.integration.ts",
  "records warning evidence and execution_failed after release verification recovery is exhausted",
  "db-before-queue-recovery",
  "DB integration must prove bounded release-verification exhaustion becomes visible product truth"
);

requireIncludes(
  "apps/worker/src/work-recovery.test.ts",
  "continues loading the other lanes when one candidate query fails",
  "db-before-queue-recovery",
  "a recovery candidate query failure in one lane must not suppress another registered lane"
);

requireIncludes(
  "apps/worker/src/work-recovery.integration.ts",
  "fails a Page Proposal after bounded recovery is exhausted",
  "db-before-queue-recovery",
  "DB integration must prove bounded Page Proposal exhaustion becomes visible product truth"
);

requireIncludes(
  "apps/worker/src/work-recovery.integration.ts",
  "uses completed job-run audit when BullMQ retention removed the transport job",
  "db-before-queue-recovery",
  "DB integration must prove audit fallback preserves completed-transport inconsistency detection"
);

requireIncludes(
  "apps/worker/src/work-recovery.integration.ts",
  "coalesces when transport becomes active after the recovery claim",
  "db-before-queue-recovery",
  "DB integration must prove a late active transport observation suppresses duplicate recovery enqueue"
);

requireIncludes(
  "packages/db/migrations/0032_low_boom_boom.sql",
  'ADD COLUMN "recovery_count"',
  "db-before-queue-recovery",
  "durable workflow rows must store bounded recovery counts"
);

requireIncludes(
  "apps/worker/src/reasoning-policy.ts",
  "policyForReasoningTask",
  "agent-constraint-policy",
  "worker agent tasks must use named reasoning policy profiles instead of inline ad hoc tool grants"
);

requireIncludes(
  "apps/worker/src/reasoning-policy.test.ts",
  "fails closed for reasoning tasks without a named policy profile",
  "agent-constraint-policy",
  "reasoning policy tests must prove unprofiled tasks fail closed"
);

requireIncludes(
  "docs/architecture/decisions/0022-agentic-runtime-and-evidence-ledger.md",
  "Status: Accepted",
  "agentic-runtime-evidence-ledger",
  "ADR 0022 must remain an accepted architecture boundary before live Mastra tools ship"
);

requireIncludes(
  "docs/architecture/decisions/0022-agentic-runtime-and-evidence-ledger.md",
  "Keep Three Truth Layers Separate",
  "agentic-runtime-evidence-ledger",
  "SEO source, agent execution, and product result truth must remain separate"
);

requireIncludes(
  "docs/architecture/decisions/0022-agentic-runtime-and-evidence-ledger.md",
  "Mastra Storage And Observability Are Operational Data",
  "agentic-runtime-evidence-ledger",
  "Mastra runtime storage and telemetry must not become product authority"
);

requireIncludes(
  ".ai-project-rules/15-architecture-regression-guards.md",
  "Only a PostgreSQL recovery claimant may ask Mastra to resume or restart a product workflow run.",
  "agentic-runtime-evidence-ledger",
  "product recovery must remain PostgreSQL-owned when Mastra restart support is added"
);

requireIncludes(
  "docs/architecture/agent-first-mvp-roadmap.md",
  "Status: ADR 0022 Slices 1-7 implemented; credentialed provider calibration and optional redacted telemetry remain operational follow-ups.",
  "agentic-runtime-evidence-ledger",
  "the roadmap must distinguish the shipped Opportunity Research vertical from operational follow-ups"
);

requireLatestMigrationDefinitionIncludes(
  "enforce_agent_run_step_write",
  "Agent run step retry must advance to the current execution epoch",
  "agentic-runtime-evidence-ledger",
  "the latest agent-step trigger must keep lifecycle, tenancy, and execution ownership database-enforced"
);

requireIncludes(
  "packages/db/src/agent-ledger.ts",
  "await lockActiveWorkflowRun(tx, input.projectId, input.runId, input.expectedExecutionEpoch);",
  "agentic-runtime-evidence-ledger",
  "ledger child writes must lock the durable parent run and verify its execution epoch"
);

requireLatestMigrationDefinitionIncludes(
  "require_agent_workflow_lifecycle_event",
  "Workflow execution takeover must resolve prior-epoch running steps",
  "agentic-runtime-evidence-ledger",
  "execution takeover must not leave a prior owner represented as running"
);

requireIncludes(
  "packages/db/src/opportunity-research-execution.ts",
  "Recovered delivery no longer owns the current recovery generation.",
  "opportunity-research-recovery",
  "recovered deliveries must prove their exact PostgreSQL recovery generation"
);

requireIncludes(
  "packages/db/src/opportunity-research-execution.ts",
  'audit.type !== "opportunity_research"',
  "opportunity-research-recovery",
  "every workflow delivery must prove its purpose-named durable queue audit"
);

requireIncludes(
  "packages/contracts/src/opportunity-research.ts",
  "OpportunityResearchEnqueueDataSchema.extend({ jobRunId: UuidSchema })",
  "opportunity-research-recovery",
  "worker-deliverable Opportunity Research data must carry the queue producer's durable audit id"
);

requireIncludes(
  "packages/contracts/src/opportunity-research.test.ts",
  "separates pre-audit enqueue data from worker-deliverable job identity",
  "opportunity-research-recovery",
  "contract coverage must reject transport jobs whose durable audit id was never injected"
);

requireIncludes(
  "packages/db/src/opportunity-research-execution.ts",
  "Opportunity Research requires the exact canonical workflow step set.",
  "agentic-runtime-evidence-ledger",
  "Mastra success cannot become product truth without the exact PostgreSQL workflow ledger"
);

requireIncludes(
  "packages/contracts/src/opportunity-research.ts",
  'toolKey: "public_web_search_follow_up"',
  "agentic-runtime-evidence-ledger",
  "the canonical Opportunity Research checkpoint set must pin its exact agent and tool identities"
);

requireLatestMigrationDefinitionIncludes(
  "require_agent_workflow_lifecycle_event",
  "step.\"agent_role\" = 'ResearchAgent'",
  "agentic-runtime-evidence-ledger",
  "the database success gate must reject canonical step keys executed by the wrong actor or tool"
);

requireOrderedIncludes(
  "packages/db/src/agent-ledger.ts",
  "for (const evidence of evidenceSources) {\n      await lockAgentEvidenceSource(tx, input.projectId, input.runId, evidence);\n    }",
  "const run = await lockActiveWorkflowRun(tx, input.projectId, input.runId, input.expectedExecutionEpoch);",
  "agentic-runtime-evidence-ledger",
  "step completion must lock selected evidence sources before the parent run"
);

requireIncludes(
  "packages/db/migrations/0050_loving_vapor.sql",
  "agent_run_evidence_00_source_lock_order",
  "agentic-runtime-evidence-ledger",
  "direct evidence inserts must enter the source-before-parent database lock order"
);

requireLatestMigrationDefinitionIncludes(
  "lock_agent_run_evidence_source_before_parent",
  "PERFORM assert_agent_evidence_source_current(",
  "agentic-runtime-evidence-ledger",
  "the latest evidence source pre-lock must delegate to the installed current-source authority"
);

requireLatestMigrationDefinitionIncludes(
  "assert_agent_evidence_source_current",
  "FOR SHARE OF version, document",
  "agentic-runtime-evidence-ledger",
  "the installed source authority must lock joined mutable source identities"
);

requireOrderedIncludes(
  "packages/db/src/agent-ledger.ts",
  "await lockAgentEvidenceSource(tx, input.projectId, input.runId, input.evidence);",
  "await lockActiveWorkflowRun(tx, input.projectId, input.runId, input.expectedExecutionEpoch);",
  "agentic-runtime-evidence-ledger",
  "standalone evidence binding must lock the source before the parent run"
);

requireIncludes(
  "apps/worker/src/agent-ledger.integration.ts",
  "locks an evidence source before the workflow run to prevent the recovery lock cycle",
  "agentic-runtime-evidence-ledger",
  "real PostgreSQL coverage must prove the source-before-run evidence lock order"
);

requireIncludes(
  "packages/db/src/opportunity-research-execution.ts",
  "researchPlan.executionEpoch > followUpCapture.executionEpoch",
  "agentic-runtime-evidence-ledger",
  "durable workflow checkpoints must preserve canonical dependency order across recovery epochs"
);

requireIncludes(
  "packages/db/src/opportunity-research-material.ts",
  "evidencePacketSha256,\n    initialQueries",
  "opportunity-research-policy",
  "material identity must bind the exact server-owned packet and initial discovery queries"
);

requireLatestMigrationDefinitionIncludes(
  "require_agent_workflow_lifecycle_event",
  "Succeeded Opportunity Research run requires the exact completed workflow ledger",
  "agentic-runtime-evidence-ledger",
  "the latest lifecycle trigger must reject product success over a partial workflow ledger"
);

requireLatestMigrationDefinitionIncludes(
  "enforce_agent_run_step_evidence_link",
  "durable evidence no newer than the current execution epoch",
  "agentic-runtime-evidence-ledger",
  "recovery may reuse immutable evidence checkpoints but cannot link future or stale-owner writes"
);

requireLatestMigrationDefinitionIncludes(
  "require_research_opportunity_source_truth",
  "Research opportunity must match exact succeeded strategy output truth",
  "opportunity-research-policy",
  "research opportunities must project exact strategy output rather than merely citing a real run id"
);

requireLatestMigrationDefinitionIncludes(
  "require_research_opportunity_source_truth",
  "Research opportunity citations must match strategy evidence ledger truth",
  "opportunity-research-policy",
  "research opportunity citations must resolve through the succeeded strategy ledger"
);

requireIncludes(
  "packages/db/migrations/0050_loving_vapor.sql",
  "opportunities_prevent_research_delete",
  "opportunity-research-policy",
  "research opportunity product truth must not be erasable through direct SQL"
);

requireIncludes(
  "packages/db/migrations/0050_loving_vapor.sql",
  "project_opportunity_research_states_require_consistency",
  "agentic-runtime-evidence-ledger",
  "research state and active workflow truth must remain a deferred database invariant"
);

requireIncludes(
  "packages/db/src/schema.ts",
  'executionEpoch: integer("execution_epoch").notNull().default(0)',
  "agentic-runtime-evidence-ledger",
  "workflow events and evidence must retain durable execution ownership fields"
);

requireIncludes(
  "apps/worker/src/agent-ledger.integration.ts",
  "reuses immutable succeeded checkpoints across a recovery execution epoch",
  "opportunity-research-recovery",
  "integration coverage must prove recovery preserves valid completed workflow checkpoints"
);

requireIncludes(
  "apps/worker/src/agent-ledger.integration.ts",
  "rejects same-project research opportunities absent from succeeded strategy output",
  "opportunity-research-policy",
  "integration coverage must reject fabricated product rows even when source ids are same-project"
);

requireIncludes(
  "apps/api/src/modules/project-context.module.ts",
  'sourceKind === "agent"',
  "project-knowledge-authority",
  "public API knowledge admission must keep agent-authored records in the worker-owned proposal path"
);

requireIncludes(
  "packages/contracts/src/index.ts",
  'expectedStatus: z.literal("captured")',
  "ranking-proof-authority",
  "ranking proof review must remain expected-state and revision bound"
);

requireIncludes(
  "packages/db/src/opportunity-research-material.ts",
  "loadOpportunityResearchMaterial",
  "opportunity-research-policy",
  "research admission and execution must share one durable material resolver"
);

requireIncludes(
  "packages/domain/src/opportunity-research.ts",
  "prepareOpportunityPortfolio",
  "opportunity-research-policy",
  "project-wide and same-run dedupe must happen before deterministic portfolio allocation"
);

requireIncludes(
  "packages/domain/src/opportunity-research.test.ts",
  "removes project-wide and same-run duplicates before allocating the 2/4/2 portfolio",
  "opportunity-research-policy",
  "portfolio tests must prove duplicate removal happens before lane allocation"
);

requireIncludes(
  "docs/architecture/decisions/0022-agentic-runtime-and-evidence-ledger.md",
  "The existing OpenCode Go adapter is removed only after equivalent direct-DeepSeek tests and a credentialed smoke pass succeed.",
  "agentic-runtime-evidence-ledger",
  "direct DeepSeek replacement must preserve parity and smoke evidence before removing the current adapter"
);

requireIncludes(
  "docs/architecture/decisions/0022-agentic-runtime-and-evidence-ledger.md",
  "A generic `runAnyWorkflow(name, payload)` port is forbidden.",
  "agentic-runtime-evidence-ledger",
  "the first Mastra runtime must stay behind a purpose-named product workflow port"
);

requireIncludes(
  "packages/ai/src/opportunity-research.ts",
  "createOpportunityResearchWorkflowRuntime",
  "opportunity-research-runtime",
  "Mastra workflow storage composition must remain behind the purpose-named AI runtime factory"
);

requireIncludes(
  "packages/ai/src/opportunity-research.ts",
  "schemaName: opportunityResearchMastraSchemaName",
  "opportunity-research-runtime",
  "Mastra workflow storage must remain isolated in its dedicated PostgreSQL schema"
);

requireIncludes(
  "packages/ai/src/opportunity-research.test.ts",
  'assert.equal(opportunityResearchMastraSchemaName, "mastra_workflows")',
  "opportunity-research-runtime",
  "the dedicated Mastra workflow schema identity must remain test-pinned"
);

requireIncludes(
  "apps/worker/src/main.ts",
  "assertProductionWorkerEnv(env);",
  "opportunity-research-runtime",
  "production workers must fail closed before registering Opportunity Research work"
);

requireIncludes(
  "packages/config/src/index.test.ts",
  "fails closed across production worker transport, product truth, and Opportunity Research",
  "opportunity-research-runtime",
  "production composition tests must cover database, Redis, DeepSeek, Mastra storage, and public search"
);

requireOrderedIncludes(
  "packages/ai/src/opportunity-research.ts",
  ".then(researchPlanStep)",
  ".then(followUpCaptureStep)",
  "opportunity-research-runtime",
  "model-derived follow-up plans must be persisted before a separate capture step consumes them"
);

requireOrderedIncludes(
  "packages/ai/src/opportunity-research.ts",
  ".then(followUpCaptureStep)",
  ".then(strategyStep)",
  "opportunity-research-runtime",
  "the persisted follow-up capture must feed the final strategy step"
);

requireIncludes(
  "packages/ai/src/opportunity-research.test.ts",
  "replays the persisted follow-up plan instead of accepting a changed model plan after a crash",
  "opportunity-research-runtime",
  "workflow tests must prove crash recovery cannot replace the persisted follow-up plan"
);

requireIncludes(
  "packages/ai/src/opportunity-research.test.ts",
  "does not disclose provider response bodies through runtime errors",
  "opportunity-research-disclosure",
  "provider failures must stay redacted at the model boundary"
);

requireNotIncludes(
  "apps/api/package.json",
  '"drizzle-orm"',
  "database-query-ownership",
  "the API must consume the database package query DSL instead of installing a second ORM identity"
);

requireNotIncludes(
  "apps/worker/package.json",
  '"drizzle-orm"',
  "database-query-ownership",
  "the worker must consume the database package query DSL instead of installing a second ORM identity"
);

requireLatestMigrationDefinitionIncludes(
  "require_agent_workflow_lifecycle_event",
  "IF NEW.\"workflow_name\" = 'opportunity_research' THEN",
  "agentic-runtime-evidence-ledger",
  "the latest workflow-event trigger must verify Opportunity Research product identity"
);

requireIncludes(
  "packages/contracts/src/opportunity-research.ts",
  'evidencePolicy: z.literal("research_support_only")',
  "public-web-search-policy",
  "public discovery captures must remain research support rather than ranking proof"
);

requireLatestMigrationDefinitionIncludes(
  "assert_agent_evidence_source_current",
  "Agent evidence source is no longer current and admissible",
  "agentic-runtime-evidence-ledger",
  "the installed evidence authority must re-derive current source truth before evidence admission"
);

requireIncludes(
  "apps/worker/src/agent-ledger.integration.ts",
  "research.source-version-drift",
  "agentic-runtime-evidence-ledger",
  "integration coverage must reject evidence after durable source-version drift"
);

requireIncludes(
  "apps/worker/src/agent-ledger.integration.ts",
  "fences stale recovered deliveries by recovery generation and execution epoch",
  "opportunity-research-recovery",
  "integration coverage must fence stale recovery generations and execution owners"
);

requireIncludes(
  "apps/worker/src/agent-ledger.integration.ts",
  "reclaims prior-epoch running steps when a genuine transport retry takes execution ownership",
  "opportunity-research-recovery",
  "transport retry coverage must prove prior-epoch running steps become durable terminal truth"
);

requireIncludes(
  "apps/worker/src/agent-ledger.integration.ts",
  "rejects a stale provider response before capture persistence and binds current request identity",
  "public-web-search-policy",
  "public search responses must be fenced after the provider call and before evidence persistence"
);

requireIncludes(
  "apps/worker/src/work-recovery.integration.ts",
  'workflowName: "opportunity_research"',
  "opportunity-research-recovery",
  "recovery integration coverage must include the Opportunity Research workflow lane"
);

requireIncludes(
  "apps/worker/src/opportunity-research-scheduler.integration.ts",
  "serializes competing scanners so only one run and one queue write win",
  "opportunity-research-scheduler",
  "competing Opportunity Research schedulers must be covered by a real database race"
);

requireIncludes(
  "apps/web/src/screens/opportunity-research-panel.tsx",
  "Research timeline",
  "opportunity-research-operator-ui",
  "the operator workflow must retain bounded research timeline visibility"
);

requireIncludes(
  "apps/web/src/screens/opportunity-research-panel.tsx",
  "<span>Research run</span>",
  "opportunity-research-operator-ui",
  "operators must be able to inspect bounded historical Opportunity Research runs"
);

requireIncludes(
  "apps/web/e2e/opportunity-research.spec.ts",
  "operates Opportunity Research from source truth without mobile overflow",
  "opportunity-research-operator-ui",
  "browser coverage must retain source-bound commands and mobile layout verification"
);

requireIncludes(
  "apps/web/e2e/opportunity-research.spec.ts",
  "await page.setViewportSize({ width: 768, height: 900 });",
  "opportunity-research-operator-ui",
  "browser coverage must retain tablet-width overflow verification"
);

requireIncludes(
  "apps/api/src/modules/opportunity-research.integration.ts",
  "admits one revision-bound rerun and replays its idempotency key without duplicate transport",
  "opportunity-research-api",
  "API integration coverage must prove idempotent rerun admission before transport"
);

requireIncludes(
  "apps/api/src/modules/opportunity-research.integration.ts",
  "terminalizes run and research-state truth when queue transport rejects admission",
  "opportunity-research-api",
  "API integration coverage must prove queue failure cannot leave active research truth"
);

requireIncludes(
  "apps/api/src/modules/opportunity-research.integration.ts",
  "returns only the project-scoped bounded workflow timeline",
  "opportunity-research-disclosure",
  "API integration coverage must prove event payloads and provider failure messages stay private"
);

requireIncludes(
  "apps/api/src/modules/opportunity-research.integration.ts",
  "projects persisted research candidates and their exact evidence citations into the Explorer",
  "opportunity-research-disclosure",
  "Explorer projection must remain citation-backed without exposing raw workflow evidence"
);

requireIncludes(
  "apps/api/src/modules/opportunities.module.ts",
  "eq(opportunities.status, input.expectedStatus)",
  "opportunity-research-decision-cas",
  "operator decisions must remain expected-status bound at the SQL write boundary"
);

requireIncludes(
  "apps/api/src/modules/opportunities.module.ts",
  "eq(opportunities.rowVersion, input.expectedRowVersion)",
  "opportunity-research-decision-cas",
  "operator decisions must remain expected-revision bound at the SQL write boundary"
);

requireIncludes(
  "apps/worker/src/handlers/opportunity-research.test.ts",
  "derives a stable run-scoped UUID from canonical candidate content",
  "opportunity-research-policy",
  "candidate identity must remain deterministic before same-run deduplication"
);

requireOrderedIncludes(
  "packages/db/src/agent-ledger.ts",
  "await lockAgentLedgerProject(tx, input.projectId);",
  "for (const evidence of evidenceSources) {\n      await lockAgentEvidenceSource(tx, input.projectId, input.runId, evidence);\n    }",
  "agentic-runtime-evidence-ledger",
  "step completion must enter the project-before-source-before-run lock order"
);

requireOrderedIncludes(
  "packages/db/migrations/0050_loving_vapor.sql",
  'PERFORM "id" FROM "projects" WHERE "id" = NEW."project_id" FOR UPDATE;',
  'CASE NEW."source_kind"::text',
  "agentic-runtime-evidence-ledger",
  "direct evidence inserts must lock the owning project before a selected source"
);

requireIncludes(
  "packages/db/src/schema.ts",
  'outputCanonicalText: text("output_canonical_text")',
  "agentic-runtime-evidence-ledger",
  "succeeded checkpoints must retain their exact canonical output bytes"
);

requireLatestMigrationDefinitionIncludes(
  "enforce_agent_run_step_canonical_output",
  "sha256(convert_to(NEW.\"output_canonical_text\", 'UTF8'))",
  "agentic-runtime-evidence-ledger",
  "the latest checkpoint trigger must verify SHA-256 over the stored canonical UTF-8 bytes"
);

requireIncludes(
  "apps/worker/src/agent-ledger.integration.ts",
  "rejects checkpoint canonical-byte and digest corruption before workflow completion",
  "agentic-runtime-evidence-ledger",
  "real PostgreSQL coverage must reject canonical checkpoint byte and digest corruption"
);

requireIncludes(
  "packages/db/src/schema.ts",
  'executionRecoveryCount: integer("execution_recovery_count").default(0).notNull()',
  "opportunity-research-recovery",
  "workflow execution ownership must retain its exact recovery generation"
);

requireIncludes(
  "packages/db/src/schema.ts",
  'lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true })',
  "opportunity-research-recovery",
  "running Opportunity Research executions must retain durable heartbeat truth"
);

requireLatestMigrationDefinitionIncludes(
  "enforce_agent_run_workflow_identity",
  "Workflow heartbeat must monotonically renew the current running execution",
  "opportunity-research-recovery",
  "the latest workflow trigger must constrain heartbeat writes to the current owner"
);

requireLatestMigrationDefinitionIncludes(
  "require_opportunity_research_execution_generation",
  "executionRecoveryCount",
  "opportunity-research-recovery",
  "execution takeover must bind its durable event to the exact recovery generation"
);

requireIncludes(
  "packages/config/src/index.ts",
  "Opportunity Research heartbeat must run at least three times inside the stale-work window.",
  "opportunity-research-recovery",
  "configuration must leave multiple heartbeat opportunities inside the recovery window"
);

requireOrderedIncludes(
  "apps/worker/src/handlers/opportunity-research.ts",
  "return await withOpportunityResearchHeartbeat({",
  "renewOpportunityResearchExecutionHeartbeat(dbHandle.db, {",
  "opportunity-research-recovery",
  "provider and persistence work must remain inside exact-owner heartbeat renewal"
);

requireRegex(
  "apps/worker/src/work-recovery.ts",
  /async function loadOpportunityResearchRecoveryCandidates[\s\S]*?lte\(opportunityResearchLivenessAt, sql`\$\{staleBefore\.toISOString\(\)\}::timestamptz`\)[\s\S]*?orderBy\(asc\(opportunityResearchLivenessAt\)\)/u,
  "opportunity-research-recovery",
  "Opportunity Research candidate loading must use heartbeat-aware liveness"
);

requireIncludes(
  "apps/worker/src/work-recovery.ts",
  "`${candidate.id}:recovery:${claimed.recoveryCount}`",
  "opportunity-research-recovery",
  "each recovery reservation must receive a distinct purpose-bound durable audit identity"
);

requireIncludes(
  "apps/worker/src/work-recovery.integration.ts",
  "does not recover a running Opportunity Research execution with a fresh heartbeat",
  "opportunity-research-recovery",
  "real PostgreSQL coverage must keep a fresh execution out of recovery"
);

requireIncludes(
  "apps/worker/src/work-recovery.integration.ts",
  "keeps a late original delivery claimable when recovery discovers active transport after its claim",
  "opportunity-research-recovery",
  "post-claim transport discovery must not strand the still-owning original delivery"
);

requireIncludes(
  "apps/worker/src/agent-ledger.integration.ts",
  "renews only the exact current Opportunity Research execution heartbeat",
  "opportunity-research-recovery",
  "heartbeat integration coverage must reject stale execution identity"
);

requireIncludes(
  "apps/worker/src/agent-ledger.integration.ts",
  "rejects direct prior-epoch workflow events after execution takeover",
  "opportunity-research-recovery",
  "direct SQL events must not append facts under a prior execution epoch"
);

requireIncludes(
  "packages/db/src/opportunity-research-material.ts",
  'eq(projectKnowledgeVersions.modelUsePolicy, "model_allowed")',
  "project-knowledge-authority",
  "only explicitly model-allowed current knowledge may enter a production model packet"
);

requireLatestMigrationDefinitionIncludes(
  "enforce_project_knowledge_document_pointer",
  "Knowledge retirement actor must have approval authority in the project",
  "project-knowledge-authority",
  "knowledge retirement must remain actor-authorized and database-enforced"
);

requireIncludes(
  "apps/api/src/modules/project-context.integration.ts",
  "admits only explicitly model-allowed knowledge and retires it without deleting history",
  "project-knowledge-authority",
  "knowledge integration coverage must prove model-use opt-in and non-destructive retirement"
);

requireOrderedIncludes(
  "packages/ai/src/opportunity-research.ts",
  "for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1)",
  "assertOpportunityResearchModelEgressSafe(input.input);",
  "opportunity-research-disclosure",
  "obvious secret-like material must be rechecked inside every model request attempt"
);

requireIncludes(
  "packages/ai/src/opportunity-research.test.ts",
  "blocks obvious secret-like material before any model request",
  "opportunity-research-disclosure",
  "model-egress coverage must prove blocked input causes zero provider requests"
);

requireOrderedIncludes(
  "packages/ai/src/opportunity-research.ts",
  "assertOpportunityResearchModelEgressSafe(input.input);",
  "await this.options.beforeProviderAttempt?.(input.providerIdentity);",
  "opportunity-research-disclosure",
  "static disclosure checks must precede the durable-material recheck on every provider attempt"
);

requireIncludes(
  "packages/ai/src/opportunity-research.test.ts",
  "revalidates current material before every provider retry",
  "opportunity-research-disclosure",
  "provider retries must rerun the durable-material egress guard"
);

requireIncludes(
  "apps/worker/src/handlers.ts",
  "beforeProviderAttempt: db ? createOpportunityResearchProviderAttemptGuard(db) : undefined",
  "opportunity-research-disclosure",
  "the production DeepSeek adapter must wire the durable-material guard"
);

requireLatestMigrationDefinitionIncludes(
  "enforce_project_knowledge_version_write",
  "Knowledge creation actor must have write authority in the project",
  "project-knowledge-authority",
  "knowledge creation must reject actors without project write authority at the database boundary"
);

requireLatestMigrationDefinitionIncludes(
  "enforce_project_knowledge_version_write",
  "Knowledge review actor must have approval authority in the project",
  "project-knowledge-authority",
  "knowledge review must reject actors without project approval authority at the database boundary"
);

requireLatestMigrationDefinitionIncludes(
  "enforce_ranking_proof_write",
  "Ranking proof actor must have evidence authority in the project",
  "ranking-proof-authority",
  "ranking-proof capture and lifecycle evidence must remain project-authorized in PostgreSQL"
);

requireIncludes(
  "apps/api/src/modules/project-context.integration.ts",
  "rejects knowledge creation and review actors without project authority at the database boundary",
  "project-knowledge-authority",
  "real PostgreSQL coverage must reject unauthorized knowledge actors"
);

requireIncludes(
  "apps/api/src/modules/opportunities.integration.ts",
  "rejects ranking-proof actors without project evidence authority at the database boundary",
  "ranking-proof-authority",
  "real PostgreSQL coverage must reject unauthorized ranking-proof actors"
);

requireLatestMigrationDefinitionIncludes(
  "enforce_agent_run_step_write",
  "Parent-terminalized pending steps must bind failure evidence to the current execution epoch",
  "opportunity-research-recovery",
  "pending workflow steps must not emit epoch-zero failure evidence under a claimed parent execution"
);

requireIncludes(
  "apps/worker/src/agent-ledger.integration.ts",
  "terminalizedPendingStep?.executionEpoch, 1",
  "opportunity-research-recovery",
  "real PostgreSQL coverage must bind pending-step terminalization to the parent execution epoch"
);

requireIncludes(
  "apps/worker/src/work-recovery.ts",
  "loadReusableOpportunityResearchRecoveryClaim",
  "opportunity-research-recovery",
  "a committed pre-enqueue recovery reservation must be reused instead of consuming another generation"
);

requireIncludes(
  "apps/worker/src/work-recovery.integration.ts",
  "reuses a committed Opportunity Research recovery claim after a pre-enqueue crash",
  "opportunity-research-recovery",
  "real PostgreSQL coverage must prove recovery-claim crash convergence"
);

requireIncludes(
  "apps/worker/src/work-recovery.integration.ts",
  "fails Opportunity Research when a recovery transport completed without product truth",
  "opportunity-research-recovery",
  "purpose-bound recovery audits must expose completed transport without terminal product truth"
);

requireIncludes(
  "packages/db/src/agent-ledger.ts",
  "Agent evidence source is no longer current and admissible.",
  "agentic-runtime-evidence-ledger",
  "evidence replay must recheck current durable source state under the source lock"
);

requireIncludes(
  "apps/worker/src/agent-ledger.integration.ts",
  "rejects rebinding immutable evidence after its durable source becomes ineligible",
  "agentic-runtime-evidence-ledger",
  "real PostgreSQL coverage must reject stale evidence rebinding"
);

requireRegex(
  "apps/worker/src/handlers/opportunity-research.ts",
  /error instanceof OpportunityResearchRuntimeError && error\.code === "model_egress_blocked"[\s\S]*?needsResearch: false/u,
  "opportunity-research-disclosure",
  "unchanged secret-like material must fail visibly without scheduling a same-digest rerun loop"
);

requireIncludes(
  "packages/ai/src/opportunity-research.ts",
  "fixtureCorpusSha256: opportunityResearchPromotionFixtureCorpusSha256",
  "opportunity-research-promotion",
  "credentialed promotion evidence must bind the exact deterministic fixture corpus"
);

requireIncludes(
  "packages/ai/src/opportunity-research.test.ts",
  "JSON.stringify(opportunityResearchPromotionFixtureCorpus)",
  "opportunity-research-promotion",
  "promotion-manifest tests must recompute the exact fixture-corpus digest"
);

requireIncludes(
  "packages/contracts/src/opportunity-research.ts",
  "evidenceKey: buildPublicWebSearchCaptureEvidenceKey(capture.id)",
  "opportunity-research-citations",
  "every model-visible public-search capture must expose its exact server-derived evidence key"
);

requireIncludes(
  "apps/worker/src/handlers/opportunity-research.ts",
  "evidenceKey: capture.evidenceKey",
  "opportunity-research-citations",
  "public-search ledger binding must use the same capture evidence key shown to the model"
);

requireIncludes(
  "packages/ai/src/opportunity-research.test.ts",
  "buildPublicWebSearchCaptureEvidenceKey(firstCapture.id)",
  "opportunity-research-citations",
  "Mastra workflow tests must prove public-search evidence keys reach the model boundary"
);

requireIncludes(
  "packages/contracts/src/opportunity-research.ts",
  "links: z.array(ProjectKnowledgeLinkInputSchema).max(50).optional()",
  "project-knowledge-provenance",
  "knowledge creation must accept bounded typed provenance links"
);

requireIncludes(
  "apps/api/src/modules/project-context.module.ts",
  "await tx.insert(projectKnowledgeLinks).values(",
  "project-knowledge-provenance",
  "typed knowledge links must persist while their source version is still proposed"
);

requireIncludes(
  "apps/api/src/modules/project-context.integration.ts",
  "assert.deepEqual(linked.links",
  "project-knowledge-provenance",
  "real-PostgreSQL coverage must prove creation-time knowledge provenance survives rehydration"
);

requireIncludes(
  "apps/api/src/modules/opportunity-research.module.ts",
  "materialDigest: replay.inputSha256",
  "opportunity-research-admission",
  "exact idempotency replay must return the admitted material digest instead of mutable current material"
);

requireIncludes(
  "apps/api/src/modules/opportunity-research.integration.ts",
  "does not project an active legacy scout run as Opportunity Research",
  "opportunity-research-admission",
  "task-level mutual exclusion must not fabricate V2 workflow metadata for a legacy scout run"
);

requireIncludes(
  "apps/worker/src/handlers/opportunity-research.test.ts",
  "for (const fixture of opportunityResearchPromotionFixtureCorpus.cases)",
  "opportunity-research-promotion",
  "worker QA must execute the exact corpus bound by the promotion manifest"
);

requireLatestMigrationDefinitionIncludes(
  "assert_agent_evidence_source_current",
  "version.\"model_use_policy\" = 'model_allowed'",
  "agentic-runtime-evidence-ledger",
  "the installed evidence authority must reject operator-only knowledge at every binding boundary"
);

requireLatestMigrationDefinitionIncludes(
  "enforce_agent_run_step_evidence_link",
  "PERFORM assert_agent_evidence_source_current(",
  "agentic-runtime-evidence-ledger",
  "step-evidence links must revalidate current source truth before binding"
);

requireLatestMigrationDefinitionIncludes(
  "enforce_research_opportunity_lifecycle_truth",
  "Research opportunity brief_created truth requires a durable same-project page proposal",
  "opportunity-research-lifecycle",
  "research opportunity lifecycle projection must remain database-backed by page-proposal truth"
);

requireLatestMigrationDefinitionIncludes(
  "enforce_project_business_profile_write",
  "A changed business profile revision must return to draft review",
  "project-context-authority",
  "a replacement business-profile revision must not inherit stale confirmation evidence"
);

requireLatestMigrationDefinitionIncludes(
  "enforce_canonical_business_entity_write",
  "OLD.\"status\"::text = 'proposed' AND NEW.\"status\"::text = 'confirmed'",
  "project-context-authority",
  "canonical entity transitions without modeled actor evidence must remain fail-closed"
);

requireIncludes(
  "packages/db/src/opportunity-research-execution.ts",
  "state.pausedAt || input.suppressAutomaticRetry ? null",
  "opportunity-research-recovery",
  "unchanged deterministic failures must suppress automatic same-material scheduling"
);

requireIncludes(
  "apps/worker/src/work-recovery.ts",
  'recordRecoveryExhausted: reason !== "transport_completed_without_product_truth"',
  "opportunity-research-recovery",
  "transport inconsistency must not fabricate recovery-exhaustion evidence"
);

requireIncludes(
  "packages/config/src/index.ts",
  'deepSeekBaseUrl.hostname !== "api.deepseek.com"',
  "opportunity-research-provider",
  "production DeepSeek traffic must remain pinned to the official provider origin"
);

requireIncludes(
  "packages/config/src/index.ts",
  "DEEPSEEK_MAX_RESPONSE_BYTES",
  "opportunity-research-provider",
  "DeepSeek response buffering must stay explicitly bounded by configuration"
);

requireOrderedIncludes(
  "apps/worker/src/handlers/opportunity-research.ts",
  "controller.abort(error);",
  "rejectLease(error);",
  "opportunity-research-recovery",
  "lease loss must abort provider work before the worker reports lost ownership"
);

requireIncludes(
  "packages/ai/src/opportunity-research.test.ts",
  "rejects an oversized provider response before decoding structured output",
  "opportunity-research-provider",
  "provider tests must prove oversized responses fail before structured decoding"
);

requireIncludes(
  "packages/ai/src/opportunity-research.test.ts",
  "aborts an in-flight provider request without retrying after execution ownership is lost",
  "opportunity-research-recovery",
  "provider tests must prove lease-loss cancellation prevents retry and detached spend"
);

requireNotRegex(
  "packages/contracts/src/index.ts",
  /export const RankingProofSchema = z\.object\(\{[\s\S]*?screenshotArtifactKey/u,
  "ranking-proof-disclosure",
  "ranking-proof responses must not disclose private screenshot artifact keys"
);

requireNotRegex(
  "packages/contracts/src/index.ts",
  /export const CreateRankingProofRequestSchema = z[\s\S]*?screenshotArtifactKey/u,
  "ranking-proof-disclosure",
  "ranking-proof commands must not accept caller-selected private screenshot locators"
);

requireNotIncludes(
  "apps/api/src/modules/projects.module.ts",
  "artifactKey: row.artifactKey",
  "opportunity-research-disclosure",
  "website-import responses must not disclose private storage locators"
);

requireIncludes(
  "packages/ai/src/opportunity-scout.test.ts",
  'packet.rankingProofs.some((proof) => "screenshotArtifactKey" in proof)',
  "opportunity-research-disclosure",
  "legacy model packets must prove private artifact locators are stripped"
);

requireIncludes(
  "packages/contracts/src/opportunity-research.ts",
  "new TextEncoder().encode(value).byteLength <= 50_000",
  "project-knowledge-authority",
  "knowledge Markdown must enforce its storage budget over UTF-8 bytes rather than code units"
);

requireIncludes(
  "apps/web/src/screens/opportunity-explorer.tsx",
  "key={`${opportunity.id}:${opportunity.rowVersion}`}",
  "opportunity-research-operator-ui",
  "opportunity decision forms must reset when durable target truth advances"
);

requireIncludes(
  "tools/check-text-health.ts",
  "inlineDependencies.matchAll",
  "rule-system-cohesion",
  "hidden-rule dependency checks must include inline YAML dependency arrays"
);

requireIncludes(
  ".ai-project-rules/05-frontend-tanstack.md",
  "pre-authored, versioned scene definitions with typed allowlisted data slots",
  "explanatory-visuals",
  "explanatory motion must remain a reviewed scene catalog rather than generated presentation code"
);

requireIncludes(
  ".ai-project-rules/05-frontend-tanstack.md",
  "DO NOT generate customer-facing SVG, canvas commands, CSS keyframes, or explanatory layout dynamically from model prose at runtime",
  "explanatory-visuals",
  "models must not generate executable customer-facing animation or drawing programs"
);

requireIncludes(
  "apps/worker/src/handlers/opportunity-scout.ts",
  'policyForReasoningTask("opportunity_scout")',
  "agent-constraint-policy",
  "Opportunity Scout must keep using its named read/analyze-only policy profile"
);

requireIncludes(
  "apps/worker/src/handlers/page-proposal.ts",
  'policyForReasoningTask("page_brief_draft")',
  "page-proposal-worker",
  "Page Proposal worker must use the named ADR 0019 policy profile"
);

requireIncludes(
  "apps/worker/src/handlers/page-proposal.ts",
  "PageProposalJsonSchema.safeParse",
  "page-proposal-worker",
  "Page Proposal worker must parse model output through PageProposalJsonSchema before use"
);

requireIncludes(
  "apps/worker/src/handlers/page-proposal.ts",
  "attributePageProposalGeneration(parsedOutput.data, input.data.runId)",
  "page-proposal-worker",
  "Page Proposal generation provenance must come from the durable worker run, not model claims"
);

requireIncludes(
  "apps/worker/src/handlers/page-proposal.ts",
  "evaluatePageProposalOutput",
  "page-proposal-worker",
  "Page Proposal worker must run deterministic page proposal QA before persistence"
);

requireIncludes(
  "apps/worker/src/handlers/page-proposal.ts",
  "validatePageJsonAgainstRegistry",
  "page-proposal-worker",
  "Page Proposal worker must validate generated PageJson against the registry allow-list"
);

requireIncludes(
  "apps/worker/src/handlers/page-proposal.ts",
  "decidePageStudioPublishReadiness",
  "page-proposal-worker",
  "Page Proposal worker must run Page Studio composition/publish-readiness checks"
);

requireIncludes(
  "apps/worker/src/handlers/page-proposal.ts",
  "renderPagePreviewFile",
  "page-proposal-worker",
  "Page Proposal worker must prove generated PageJson renders through the shared preview renderer"
);

requireIncludes(
  "apps/worker/src/handlers/page-proposal.ts",
  'status: "draft"',
  "page-proposal-worker",
  "Page Proposal worker may persist draft proposals only, not approved proposals"
);

requireIncludes(
  "apps/worker/src/handlers/page-proposal.ts",
  'status: "preview"',
  "page-proposal-worker",
  "Page Proposal worker may persist preview page versions only, not approved page versions"
);

requireIncludes(
  "apps/worker/src/handlers/page-proposal.ts",
  'ne(opportunities.status, "rejected")',
  "page-proposal-worker",
  "Page Proposal worker must not overwrite rejected opportunities during success persistence"
);

requireIncludes(
  "apps/api/src/modules/pages.module.ts",
  "jobId: runId",
  "page-proposal-worker",
  "Page Proposal enqueue path must use the durable agent run id as the BullMQ job id"
);

requireIncludes(
  "apps/api/src/modules/pages.module.ts",
  'queueName: "page-generation"',
  "page-proposal-worker",
  "Page Proposal enqueue path must route through the page-generation queue"
);

requireIncludes(
  "apps/api/src/modules/pages.module.ts",
  "eq(agentRuns.subjectId, opportunityId)",
  "page-proposal-worker",
  "Page Proposal active-run guard must be scoped to the opportunity subject"
);

requireIncludes(
  "packages/contracts/src/index.ts",
  "expectedOpportunity: OpportunityTargetRevisionSchema",
  "page-proposal-target-cas",
  "Page Proposal requests must carry one strict expected opportunity revision"
);

requireIncludes(
  "packages/db/migrations/0045_opportunity-target-revision.sql",
  'CREATE TRIGGER "opportunities_row_version_guard"',
  "page-proposal-target-cas",
  "Opportunity revisions must remain database-managed"
);

requireIncludes(
  "packages/db/migrations/0045_opportunity-target-revision.sql",
  'BEFORE INSERT OR UPDATE ON "opportunities"',
  "page-proposal-target-cas",
  "Opportunity revisions must remain database-owned from initial insertion onward"
);

requireIncludes(
  "apps/api/src/modules/pages.module.ts",
  "await lockAndLoadPageProposalTarget(tx, projectId, input.opportunityId);",
  "page-proposal-target-cas",
  "Page Proposal admission must lock the target before checking its expected state"
);

requireIncludes(
  "apps/api/src/modules/pages.module.ts",
  "assertPageProposalTargetAdmission(input.expectedOpportunity, opportunity);",
  "page-proposal-target-cas",
  "Page Proposal admission must compare the current target with the client-frozen expectation"
);

requireIncludes(
  "apps/api/src/modules/pages.integration.ts",
  "rejects page proposal admission when a concurrent lifecycle change wins the opportunity lock",
  "page-proposal-target-cas",
  "PostgreSQL integration must prove a lifecycle winner makes Page Proposal admission stale"
);

requireIncludes(
  "apps/web/src/screens/opportunity-explorer.tsx",
  "rowVersion: opportunity.rowVersion",
  "page-proposal-target-cas",
  "The Explorer must submit the displayed durable opportunity revision"
);

requireOrderedIncludes(
  "apps/worker/src/handlers/page-proposal.ts",
  'SELECT "id" FROM "opportunities"',
  ".update(agentRuns)",
  "page-proposal-target-cas",
  "Page Proposal worker success must lock the target before updating agent-run truth"
);

requireIncludes(
  "apps/api/src/modules/pages.integration.ts",
  "rejects a stale target before writing queue-unavailable dry-run audit truth",
  "page-proposal-target-cas",
  "Queue-unavailable Page Proposal audit must still reject stale target truth"
);

requireIncludes(
  "apps/worker/src/handlers/page-proposal.integration.ts",
  "locks the opportunity before the agent run during success persistence",
  "page-proposal-target-cas",
  "Worker integration must prove structural target-before-run lock ordering"
);

requireIncludes(
  "apps/api/src/modules/opportunities.integration.ts",
  "keeps opportunity row versions database-owned on insert and update",
  "page-proposal-target-cas",
  "PostgreSQL integration must reject opportunity revision forgery"
);

requireIncludes(
  "apps/api/src/modules/pages.module.ts",
  "const exhaustiveReason: never = decision.reason;",
  "page-proposal-target-cas",
  "Page Proposal target denial reasons must remain exhaustively mapped"
);

requireIncludes(
  "packages/db/src/schema.ts",
  "agent_runs_active_per_project_task_subject_idx",
  "page-proposal-worker",
  "Page Proposal active-run DB guard must support subject-scoped agent runs"
);

requireIncludes(
  "packages/db/src/schema.ts",
  "page_proposals_project_route_idx",
  "page-proposal-worker",
  "Page Proposal routes must stay DB-unique per project"
);

requireIncludes(
  "packages/ai/src/index.ts",
  "canonicalPageProposalOutputExample",
  "page-proposal-real-provider-smoke",
  "real Page Proposal prompts must retain a contract-valid registry-prop example"
);

requireIncludes(
  "apps/worker/src/handlers/page-proposal.integration.ts",
  "persists an OpenCode Go Page Proposal response with worker-owned generation provenance",
  "page-proposal-real-provider-smoke",
  "DB integration must prove the real adapter boundary preserves policy, gates, and draft-only persistence"
);

requireIncludes(
  "apps/worker/src/page-proposal-example.test.ts",
  "canonical Page Proposal example remains registry-valid, composition-ready, and previewable",
  "page-proposal-real-provider-smoke",
  "the canonical prompt example must stay pinned to registry, composition, and renderer truth without a database"
);

requireIncludes(
  "tools/page-proposal-smoke.ts",
  "assertOpenCodeGoSmokeConfiguration",
  "page-proposal-real-provider-smoke",
  "the Page Proposal smoke runner must reject mock or not-configured adapter execution"
);

requireIncludes(
  "tools/scout-smoke.ts",
  "assertRealOpportunityScoutReasoningRun(run)",
  "page-proposal-real-provider-smoke",
  "the shared smoke refactor must keep durable provider verification on Opportunity Scout runs"
);

requireIncludes(
  "tools/page-proposal-smoke.ts",
  "CreatePageProposalRunRequestSchema.parse",
  "page-proposal-real-provider-smoke",
  "the Page Proposal smoke runner must queue through the contract-parsed public API boundary"
);

requireIncludes(
  "tools/page-proposal-smoke.ts",
  "baselineProposalIds",
  "page-proposal-real-provider-smoke",
  "smoke product-row checks must distinguish rows created during the current run from pre-existing fixture residue"
);

requireIncludes(
  "tools/page-proposal-smoke.ts",
  "--require-succeeded",
  "page-proposal-real-provider-smoke",
  "credentialed calibration can require a successful terminal run through an explicit CLI gate"
);

requireIncludes(
  "tools/seed-page-proposal-fixture.ts",
  "Refusing to reset Page Proposal smoke state because the fixture has an immutable page version.",
  "page-proposal-real-provider-smoke",
  "smoke fixture reset must not delete approved or otherwise frozen page versions"
);

requireIncludes(
  "package.json",
  "tsc -p tools/tsconfig.json --noEmit",
  "page-proposal-real-provider-smoke",
  "operational smoke tools must remain inside the repository typecheck gate"
);

requireIncludes(
  "package.json",
  'tsx --test \\"tools/**/*.test.ts\\"',
  "page-proposal-real-provider-smoke",
  "operational smoke-tool tests must remain inside the repository test gate"
);

requireIncludes(
  "tools/reasoning-smoke-support.test.ts",
  "real-provider smoke configuration fails closed and redacts loaded secrets",
  "page-proposal-real-provider-smoke",
  "smoke tooling tests must prove explicit provider selection and secret redaction"
);

requireIncludes(
  "apps/web/src/screens/opportunity-explorer.tsx",
  "PageProposalQueueResponseSchema",
  "page-proposal-ui",
  "Page Proposal UI must parse queue responses through the shared contract"
);

requireIncludes(
  "apps/web/src/screens/opportunity-explorer.tsx",
  '"/pages/proposals/runs"',
  "page-proposal-ui",
  "Page Proposal UI must trigger durable API queue work instead of calling worker/model code directly"
);

requireIncludes(
  "apps/web/src/screens/opportunity-explorer.tsx",
  "agent-runs?task=page_brief_draft",
  "page-proposal-ui",
  "Page Proposal UI must read status from the subject-scoped page_brief_draft run list"
);

requireIncludes(
  "apps/api/src/auth/permissions/project-permissions.ts",
  '"page:approve"',
  "page-version-approval",
  "Page version approval must have an explicit project permission"
);

requireIncludes(
  "packages/contracts/src/index.ts",
  "PageStudioEditCommandSchema",
  "page-studio-versioning",
  "Page Studio editing must accept only named structured edit commands"
);

requireIncludes(
  "packages/contracts/src/index.ts",
  'type: z.literal("replace_section")',
  "page-studio-section-replacement",
  "section replacement must remain a named strict Page Studio command"
);

requireIncludes(
  "packages/domain/src/page-studio.ts",
  'case "replace_section"',
  "page-studio-section-replacement",
  "section replacement must derive structure through pure domain command behavior"
);

requireIncludes(
  "packages/page-registry/src/index.ts",
  "control must match its prop schema",
  "page-studio-section-replacement",
  "registry editor control kinds must fail fast when they drift from prop schemas"
);

requireIncludes(
  "packages/page-registry/src/index.test.ts",
  "fails fast when editor control types drift from registry prop schemas",
  "page-studio-section-replacement",
  "Page Registry tests must pin editor control-kind alignment"
);

requireIncludes(
  "packages/domain/src/page-studio.test.ts",
  "derives controlled replacement structure from the registry and preserves the section slot",
  "page-studio-section-replacement",
  "domain tests must prove replacement structure is server-derived and slot-stable"
);

requireIncludes(
  "apps/api/src/modules/pages.integration.ts",
  "replaces a flexible section through registry-derived structure without mutating its base",
  "page-studio-section-replacement",
  "DB integration must prove controlled replacement creates an append-only preview"
);

requireIncludes(
  "apps/api/src/modules/pages.integration.ts",
  "rejects invalid props, illegal movement, and illegal replacement without creating a version",
  "page-studio-section-replacement",
  "DB integration must prove illegal replacement leaves product rows unchanged"
);

requireIncludes(
  "apps/web/src/features/page-studio/page-studio-state.ts",
  "legalReplacementEntries",
  "page-studio-section-replacement",
  "replacement choices must derive from the pure domain legality decision"
);

requireIncludes(
  "apps/web/src/features/page-studio/page-studio-editor.tsx",
  "Create replacement version",
  "page-studio-section-replacement",
  "staged replacement must require one explicit version-creation command"
);

requireIncludes(
  "apps/web/src/features/page-studio/page-studio-state.test.ts",
  "offers only domain-approved replacements for the selected section slot",
  "page-studio-section-replacement",
  "web state tests must pin legal replacement filtering"
);

requireIncludes(
  "apps/web/e2e/page-studio-replacement.spec.ts",
  "stages controlled section replacement before creating one next version",
  "page-studio-section-replacement",
  "browser coverage must prove replacement staging does not persist before explicit confirmation"
);

requireIncludes(
  "packages/contracts/src/index.ts",
  "SectionCopyRevisionOutputSchema",
  "page-studio-section-copy",
  "section copy output must remain a strict bounded contract"
);

requireIncludes(
  "packages/contracts/src/index.ts",
  'value.suggestionId && value.command.type !== "update_section_props"',
  "page-studio-section-copy",
  "AI suggestion application must reuse the structured props command only"
);

requireIncludes(
  "packages/page-registry/src/index.ts",
  "getPageRegistryAiCopyFieldKeys",
  "page-studio-section-copy",
  "Page Registry metadata must own the exact AI-copy field allow-list"
);

requireIncludes(
  "packages/domain/src/page-studio.ts",
  "decideSectionCopySuggestionAttribution",
  "page-studio-section-copy",
  "exact and operator-modified suggestion application must derive provenance in the domain"
);

requireIncludes(
  "apps/worker/src/reasoning-policy.ts",
  "section_text_generation",
  "page-studio-section-copy",
  "section text generation must have a named fail-closed policy profile"
);

requireIncludes(
  "apps/worker/src/handlers/section-copy-suggestion.ts",
  "evaluateSectionCopyRevision",
  "page-studio-section-copy",
  "section copy output must pass deterministic scope and field QA before readiness"
);

requireIncludes(
  "apps/api/src/modules/pages.module.ts",
  '@Post(":pageVersionId/copy-suggestions")',
  "page-studio-section-copy",
  "section copy generation must enter through the durable API queue boundary"
);

requireIncludes(
  "apps/api/src/modules/pages.module.ts",
  "decideSectionCopySuggestionAttribution",
  "page-studio-section-copy",
  "suggestion provenance must be decided inside the existing edit transaction"
);

requireIncludes(
  "packages/db/migrations/0034_section_copy_suggestions.sql",
  "page_section_copy_suggestions_active_idx",
  "page-studio-section-copy",
  "the database must allow only one unresolved suggestion per page-version section"
);

requireIncludes(
  "apps/api/src/modules/pages.integration.ts",
  "applies an unchanged AI suggestion as agent provenance in the existing N+1 transaction",
  "page-studio-section-copy",
  "DB integration must prove exact suggestion application creates one agent-attributed version"
);

requireIncludes(
  "apps/api/src/modules/pages.integration.ts",
  "returns an explicit section copy dry-run without phantom product rows",
  "page-studio-section-copy",
  "unconfigured section-copy transport must remain an honest dry-run without product rows"
);

requireIncludes(
  "apps/api/src/modules/pages.module.ts",
  'suggestionId: "dry-run"',
  "page-studio-section-copy",
  "section-copy dry-run audit data must not pretend to reference a durable suggestion"
);

requireIncludes(
  "apps/api/src/modules/pages.integration.ts",
  "records human provenance when the operator modifies a suggestion before applying",
  "page-studio-section-copy",
  "DB integration must prove operator-modified suggestions cannot retain agent provenance"
);

requireIncludes(
  "apps/worker/src/handlers/section-copy-suggestion.integration.ts",
  "persists a validated suggestion without creating a page version",
  "page-studio-section-copy",
  "worker integration must prove generation stops at ready suggestion truth"
);

requireIncludes(
  "apps/worker/src/work-recovery.integration.ts",
  "fails both run and suggestion after bounded section copy recovery is exhausted",
  "page-studio-section-copy",
  "bounded recovery exhaustion must terminalize both section-copy rows visibly"
);

requireIncludes(
  "apps/web/src/screens/pages.tsx",
  "CreateSectionCopySuggestionRequestSchema.parse",
  "page-studio-section-copy",
  "Page Studio must parse copy requests and queue through the API"
);

requireIncludes(
  "apps/web/e2e/page-studio-replacement.spec.ts",
  "queues, reviews, and explicitly applies a section copy suggestion",
  "page-studio-section-copy",
  "browser coverage must prove AI copy never creates a version before explicit apply"
);

requireIncludes(
  "packages/contracts/src/index.ts",
  'z.literal("operator_cancelled")',
  "page-studio-section-copy",
  "operator cancellation must remain visible in durable run failure truth"
);

requireIncludes(
  "apps/api/src/modules/pages.module.ts",
  "lockAgentRunForSectionCopyCancellation",
  "page-studio-section-copy",
  "section-copy cancellation must preserve worker-compatible run-before-suggestion lock ordering"
);

requireIncludes(
  "apps/api/src/modules/pages.integration.ts",
  "cancels generating section copy work and terminalizes its run",
  "page-studio-section-copy",
  "DB integration must prove active cancellation frees the section without resurrection"
);

requireIncludes(
  "apps/worker/src/handlers/section-copy-suggestion.integration.ts",
  "does not resurrect an operator-cancelled suggestion",
  "page-studio-section-copy",
  "worker retries must not revive operator-cancelled section-copy work"
);

requireIncludes(
  "apps/worker/src/handlers/section-copy-suggestion.integration.ts",
  "preserves operator cancellation when an in-flight provider fails late",
  "page-studio-section-copy",
  "late provider results must not overwrite operator cancellation truth"
);

requireIncludes(
  "apps/web/src/features/page-studio/page-studio-editor.tsx",
  "Cancel revision",
  "page-studio-section-copy",
  "operators must be able to cancel queued or generating section-copy work"
);

requireIncludes(
  "packages/domain/src/page-studio.ts",
  "applyPageStudioEditCommand",
  "page-studio-versioning",
  "Page Studio edits must pass through pure domain command behavior"
);

requireIncludes(
  "apps/api/src/auth/permissions/project-permissions.ts",
  '"page:edit"',
  "page-studio-versioning",
  "Page Studio editing must have an explicit project permission"
);

requireIncludes(
  "apps/api/src/modules/pages.module.ts",
  '@RequireProjectPermission("page:edit")',
  "page-studio-versioning",
  "Page Studio edit endpoint must require explicit edit permission"
);

requireIncludes(
  "apps/api/src/modules/pages.module.ts",
  "lockPageProposalForVersioning",
  "page-studio-versioning",
  "Page Studio edit and review paths must serialize on the page proposal"
);

requireIncludes(
  "apps/api/src/modules/pages.module.ts",
  "Page Studio edits must use the latest page version as their base.",
  "page-studio-versioning",
  "Page Studio edits must reject stale base versions"
);

requireIncludes(
  "apps/api/src/modules/pages.module.ts",
  "Only the latest page version can be reviewed.",
  "page-studio-versioning",
  "page review must reject stale page versions after a newer edit exists"
);

requireIncludes(
  "apps/api/src/modules/pages.integration.ts",
  "allows only one concurrent edit to derive from the same latest base",
  "page-studio-versioning",
  "DB integration must prove concurrent same-base edits create at most one version"
);

requireIncludes(
  "apps/api/src/modules/pages.integration.ts",
  "branches from an approved immutable version while preserving the approved artifact",
  "page-studio-versioning",
  "DB integration must prove edits branch from frozen artifacts instead of mutating them"
);

requireIncludes(
  "apps/api/src/modules/pages.integration.ts",
  "makes a concurrently waiting review stale when the edit holds the proposal lock first",
  "page-studio-versioning",
  "DB integration must prove edit-first serialization makes a concurrent review stale"
);

requireIncludes(
  "apps/api/src/modules/pages.integration.ts",
  "branches from the newly approved base when review holds the proposal lock first",
  "page-studio-versioning",
  "DB integration must prove review-first serialization permits a new preview branch"
);

requireIncludes(
  "packages/page-registry/src/index.ts",
  "editor fields must match its prop schema",
  "page-studio-ui",
  "Page Registry editor metadata must fail fast when it drifts from registry prop keys"
);

requireIncludes(
  "apps/web/src/features/page-studio/page-studio-editor.tsx",
  "decideMovePageSection",
  "page-studio-ui",
  "Page Studio movement controls must derive legality from the pure domain decision"
);

requireIncludes(
  "apps/web/src/features/page-studio/page-studio-editor.tsx",
  "validatePageSectionProps",
  "page-studio-ui",
  "Page Studio prop forms must use registry-owned validation before the API remains authoritative"
);

requireIncludes(
  "apps/web/src/screens/pages.tsx",
  "EditPageVersionRequestSchema.parse",
  "page-studio-ui",
  "Page Studio UI must parse explicit edit requests through the shared contract"
);

requireIncludes(
  "apps/web/src/screens/pages.tsx",
  "PageVersionEditResponseSchema",
  "page-studio-ui",
  "Page Studio UI must parse created-version responses through the shared contract"
);

requireIncludes(
  "apps/web/src/screens/pages.tsx",
  "Earlier version blockers",
  "page-studio-ui",
  "Page review must surface unresolved predecessor blockers as historical context"
);

requireIncludes(
  "apps/web/src/screens/pages.tsx",
  "useQueries",
  "page-studio-ui",
  "Page review predecessor-note loading must stay query-owned rather than local server state"
);

requireIncludes(
  "apps/api/src/modules/pages.module.ts",
  '@RequireProjectPermission("page:approve")',
  "page-version-approval",
  "Page version review endpoint must require explicit page approval permission"
);

requireIncludes(
  "apps/api/src/modules/pages.module.ts",
  "countOpenApprovalBlockers",
  "page-version-approval",
  "Page version approval must check unresolved approval_blocker notes before approving"
);

requireIncludes(
  "apps/api/src/modules/pages.module.ts",
  "FOR UPDATE",
  "page-version-approval",
  "Page version approval must lock the page version row before counting approval_blocker notes"
);

requireIncludes(
  "packages/db/migrations/0030_page_section_note_approval_blocker_lock.sql",
  "page_section_notes_prevent_unreviewable_approval_blocker",
  "page-version-approval",
  "Open approval_blocker notes must be DB-guarded against non-reviewable page versions"
);

requireIncludes(
  "packages/db/migrations/0030_page_section_note_approval_blocker_lock.sql",
  "FOR UPDATE",
  "page-version-approval",
  "Approval blocker note trigger must lock the parent page version row"
);

requireIncludes(
  "apps/api/src/modules/pages.module.ts",
  ".insert(approvals)",
  "page-version-approval",
  "Page version review must persist a durable approval audit row"
);

requireIncludes(
  "apps/api/src/modules/pages.integration.ts",
  "blocks approval while approval blocker notes are open",
  "page-version-approval",
  "Pages integration tests must prove unresolved approval_blocker notes block approval"
);

requireIncludes(
  "apps/api/src/modules/pages.integration.ts",
  "does not approve when an approval_blocker insert is concurrently open",
  "page-version-approval",
  "Pages integration tests must prove approval cannot race concurrent approval_blocker creation"
);

requireIncludes(
  "apps/web/src/screens/pages.tsx",
  "ReviewPageVersionRequestSchema",
  "page-version-approval",
  "Page preview UI must parse page version review requests through the shared contract"
);

requireIncludes(
  "apps/web/src/screens/pages.tsx",
  "}/review",
  "page-version-approval",
  "Page preview UI must post review decisions through the API review endpoint"
);

requireIncludes(
  "packages/contracts/src/index.ts",
  "pageVersions: z.array(ReleasePlanPageVersionTargetSchema).min(1).max(50)",
  "release-plan-target-cas",
  "Release-plan creation requests must carry a bounded set of strict page-version targets"
);

requireIncludes(
  "packages/contracts/src/index.ts",
  "expected: PageVersionTargetRevisionSchema",
  "release-plan-target-cas",
  "Every release-plan target must carry its displayed page-version revision"
);

requireIncludes(
  "packages/db/migrations/0046_page-version-target-revision.sql",
  'CREATE TRIGGER "page_versions_row_version_guard"',
  "release-plan-target-cas",
  "Page-version revisions must remain database-managed"
);

requireIncludes(
  "packages/db/migrations/0046_page-version-target-revision.sql",
  'BEFORE INSERT OR UPDATE ON "page_versions"',
  "release-plan-target-cas",
  "Page-version revisions must remain database-owned from initial insertion onward"
);

requireOrderedIncludes(
  "apps/api/src/modules/releases.module.ts",
  "FOR UPDATE OF pv",
  "decideReleasePlanTargetAdmission({",
  "release-plan-target-cas",
  "Release-plan creation must lock page-version targets before deciding expected-state admission"
);

requireIncludes(
  "apps/web/src/screens/pages.tsx",
  "rowVersion: version.data.rowVersion",
  "release-plan-target-cas",
  "Page preview must submit the displayed durable page-version revision"
);

requireIncludes(
  "apps/api/src/modules/releases.integration.ts",
  "rejects release planning when a concurrent page-version transition wins the target lock",
  "release-plan-target-cas",
  "PostgreSQL integration must prove a lifecycle winner makes release planning stale"
);

requireIncludes(
  "apps/api/src/modules/releases.integration.ts",
  "keeps page-version revisions database-managed",
  "release-plan-target-cas",
  "PostgreSQL integration must reject page-version revision forgery"
);

requireIncludes(
  "packages/domain/src/index.ts",
  "decideReleasePlanTargetAdmission",
  "release-plan-target-cas",
  "Release-plan target admission must remain a pure domain decision"
);

requireOrderedIncludes(
  "packages/db/src/release-lifecycle.ts",
  'ORDER BY pv."id"',
  "FOR UPDATE OF pv",
  "release-page-version-lock-order",
  "Shared release-candidate demotion must lock page versions in ascending id order"
);

requireIncludes(
  "apps/api/src/modules/releases.module.ts",
  "pageVersionId: target.pageVersionId.toLowerCase()",
  "release-page-version-lock-order",
  "Release planning must canonicalize request UUIDs before JavaScript lock ordering"
);

requireIncludes(
  "apps/api/src/modules/releases.module.ts",
  "].sort();\n\n      if (releasePageVersionIds.length > 0)",
  "release-page-version-lock-order",
  "Deploy approval must sort release page-version ids before locking them"
);

requireOrderedIncludes(
  "apps/api/src/modules/releases.module.ts",
  "for (const pageVersionId of releasePageVersionIds)",
  ".update(pageVersions)",
  "release-page-version-lock-order",
  "Deploy approval must pre-lock sorted page-version targets before lifecycle projection"
);

requireIncludes(
  "apps/api/src/modules/releases.integration.ts",
  "locks release-candidate demotion in ascending page-version order",
  "release-page-version-lock-order",
  "PostgreSQL integration must prove deterministic multi-page demotion lock ordering"
);

requireIncludes(
  "apps/api/src/modules/releases.integration.ts",
  "normalizes uppercase page-version ids before deterministic release locking",
  "release-page-version-lock-order",
  "PostgreSQL integration must accept contract-valid uppercase UUIDs through canonical lock ordering"
);

requireIncludes(
  "packages/contracts/src/index.ts",
  "normalizePotentiallyDangerousUrl",
  "page-json-safety",
  "PageJson safety scans must normalize control characters before checking dangerous URL schemes"
);

requireIncludes(
  "packages/contracts/src/index.ts",
  "Page paths must not be protocol-relative URLs.",
  "page-json-safety",
  "Page paths must not allow protocol-relative off-site URLs"
);

requireIncludes(
  "docs/architecture/decisions/0020-project-scoped-media-asset-pipeline.md",
  "PageMediaReference",
  "media-asset-boundary",
  "ADR 0020 must keep the PageJson media reference explicit and opaque"
);

requireIncludes(
  "docs/architecture/decisions/0020-project-scoped-media-asset-pipeline.md",
  "The reference must not include a URL, object-storage key, provider name",
  "media-asset-boundary",
  "ADR 0020 must forbid provider/storage locators in PageJson media references"
);

requireIncludes(
  "docs/architecture/decisions/0020-project-scoped-media-asset-pipeline.md",
  "`StaticSiteFile` is binary-safe",
  "media-asset-boundary",
  "ADR 0020 must record the implemented binary artifact boundary"
);

requireIncludes(
  ".ai-project-rules/15-architecture-regression-guards.md",
  "Project-scoped media asset boundary",
  "media-asset-boundary",
  "Rule 15 must pin the accepted media asset boundary"
);

requireIncludes(
  ".ai-project-rules/15-architecture-regression-guards.md",
  "Preview and deploy must use the same project-scoped media-manifest resolver",
  "media-asset-boundary",
  "Rule 15 must preserve preview/deploy media manifest parity"
);

requireIncludes(
  ".ai-project-rules/15-architecture-regression-guards.md",
  "Short-lived upload grants must bind an expected checksum",
  "media-asset-boundary",
  "Rule 15 must preserve checksum binding across presigned upload and worker processing"
);

requireIncludes(
  ".ai-project-rules/15-architecture-regression-guards.md",
  "Ready asset manifests, processor versions, and derivative bytes are immutable",
  "media-asset-boundary",
  "Rule 15 must prevent approved pages from changing through in-place media reprocessing"
);

requireIncludes(
  ".ai-project-rules/15-architecture-regression-guards.md",
  'Sandboxed preview media keeps sandbox="" and uses the document-to-assets capability chain',
  "media-asset-boundary",
  "Rule 15 must preserve empty-sandbox preview auth without changing rendered asset paths"
);

requireIncludes(
  ".ai-project-rules/15-architecture-regression-guards.md",
  "Provider file digests and uploads must use the same decoded bytes",
  "media-asset-boundary",
  "Rule 15 must prevent base64 text digests from diverging from uploaded file bytes"
);

requireIncludes(
  ".ai-project-rules/15-architecture-regression-guards.md",
  "Ready status requires the exact DB-checked derivative key set",
  "media-asset-boundary",
  "Rule 15 must prevent partial derivative manifests from becoming ready"
);

requireIncludes(
  "packages/page-registry/src/index.ts",
  "Header phoneHref must be a tel: or mailto: link.",
  "page-json-safety",
  "Header phoneHref must be constrained to safe contact link schemes"
);

requireIncludes(
  "packages/page-registry/src/index.ts",
  "function orderedSections(pageJson: PageJson)",
  "page-registry-renderer",
  "Static page rendering must render sections by PageJson order rather than raw array position"
);

requireIncludes(
  "apps/api/src/modules/releases.module.ts",
  "hasApprovalEvidence: Boolean(row.pageVersionApprovedAt)",
  "page-release-planning",
  "Release-plan creation must require approved page versions with approval evidence"
);

requireIncludes(
  "apps/api/src/modules/releases.module.ts",
  "createdByUserId",
  "page-release-planning",
  "Release-plan creation must persist actor evidence"
);

requireIncludes(
  "apps/api/src/modules/releases.integration.ts",
  "rejects release plan creation without persisted actor evidence",
  "page-release-planning",
  "Release-plan integration tests must reject plan creation without persisted actor evidence"
);

requireNotIncludes(
  "apps/api/src/modules/releases.module.ts",
  "local-scaffold-user",
  "page-release-planning",
  "Release deploy approval must not fall back to a scaffold user"
);

requireIncludes(
  "apps/api/src/modules/releases.integration.ts",
  "creates a draft release plan from approved page versions",
  "page-release-planning",
  "Release-plan integration tests must prove approved page versions can create draft plans"
);

requireIncludes(
  "apps/api/src/modules/releases.integration.ts",
  "already in an active release plan",
  "page-release-planning",
  "Release-plan integration tests must prevent duplicate active planning for the same page version"
);

requireIncludes(
  "apps/api/src/modules/releases.module.ts",
  "FOR UPDATE OF pv",
  "page-release-planning",
  "Release-plan creation must lock requested page versions before checking active plan membership"
);

requireIncludes(
  "apps/api/src/modules/releases.module.ts",
  "releasePlanId/cancel",
  "page-release-planning",
  "Release planning API must expose a cancel path for not-yet-deployed plans"
);

requireIncludes(
  "apps/web/src/screens/release-detail.tsx",
  "/cancel",
  "page-release-planning",
  "Release detail UI must expose the durable cancel path for abandoned plans"
);

requireIncludes(
  "apps/api/src/modules/releases.integration.ts",
  "rejects release plan creation for preview page versions",
  "page-release-planning",
  "Release-plan integration tests must reject unapproved page versions"
);

requireIncludes(
  "apps/web/src/screens/pages.tsx",
  "CreateReleasePlanRequestSchema",
  "page-release-planning",
  "Page preview UI must parse release-plan creation requests through the shared contract"
);

requireIncludes(
  "apps/web/src/screens/pages.tsx",
  "CreatePageSectionNoteRequestSchema.parse",
  "page-version-approval",
  "Page section-note UI must parse create-note requests through the shared contract"
);

requireIncludes(
  "apps/web/src/screens/pages.tsx",
  '"/releases/plan"',
  "page-release-planning",
  "Page preview UI must create release plans through the durable release planning API"
);

requireIncludes(
  "apps/web/src/screens/release-detail.tsx",
  "}/preflight",
  "page-release-planning",
  "Release detail UI must run release preflight through the durable release API"
);

requireIncludes(
  "apps/web/src/screens/release-detail.tsx",
  "ReleasePreflightResponseSchema",
  "page-release-planning",
  "Release detail UI must parse release preflight responses through the shared contract"
);

requireIncludes(
  "apps/web/src/screens/release-detail.tsx",
  "}/approve-deploy",
  "page-release-planning",
  "Release detail UI must save deploy approval through the durable release API"
);

requireIncludes(
  "apps/web/src/screens/release-detail.tsx",
  "ReleaseDeployApprovalResponseSchema",
  "page-release-planning",
  "Release detail UI must parse deploy approval responses through the shared contract"
);

requireIncludes(
  "apps/web/src/screens/release-detail.tsx",
  "}/deploy",
  "page-release-planning",
  "Release detail UI must enqueue deploy through the durable release API"
);

requireIncludes(
  "apps/web/src/screens/release-detail.tsx",
  "QueueJobSchema",
  "page-release-planning",
  "Release detail UI must parse deploy queue responses through the shared queue contract"
);

requireIncludes(
  "apps/api/src/modules/releases.integration.ts",
  "requires fresh deploy approval after preflight is rerun",
  "page-release-planning",
  "Release integration tests must prove rerunning preflight invalidates current deploy approval"
);

requireIncludes(
  "apps/api/src/modules/releases.module.ts",
  "preflightableReleasePlanStatuses",
  "release-transition-cas",
  "Release preflight must use an explicit expected-status set"
);

requireIncludes(
  "apps/api/src/modules/releases.module.ts",
  "const plan = await lockReleasePlan(tx, projectId, releasePlanId);",
  "release-transition-cas",
  "Release deploy approval must lock and re-read the release plan inside its transaction"
);

requireIncludes(
  "apps/api/src/modules/releases.integration.ts",
  "rejects deploy approval when a concurrent terminal transition wins the plan lock",
  "release-transition-cas",
  "Release integration must prove a stale approval cannot overwrite a concurrent terminal transition"
);

requireIncludes(
  "apps/api/src/modules/releases.integration.ts",
  "does not let preflight resurrect a terminal release plan",
  "release-transition-cas",
  "Release integration must prove preflight cannot revive terminal plan truth"
);

requireIncludes(
  "apps/api/src/modules/releases.integration.ts",
  "does not let deploy enqueue revive a concurrently terminal release plan",
  "release-transition-cas",
  "Release integration must prove post-enqueue projection cannot revive terminal plan truth"
);

requireIncludes(
  "apps/worker/src/handlers/deploy.ts",
  "inArray(releasePlans.status, deployStartingReleasePlanStatuses)",
  "release-transition-cas",
  "Deploy worker ledger start must compare-and-set the release plan lifecycle"
);

requireIncludes(
  "apps/worker/src/handlers/deploy.integration.ts",
  "does not let deployment ledger start revive a terminal release plan",
  "release-transition-cas",
  "Deploy integration must prove stale worker context cannot revive terminal plan truth"
);

requireIncludes(
  "apps/worker/src/handlers/deploy.ts",
  "inArray(releasePlans.status, releaseLiveProjectionPlanStatuses)",
  "release-transition-cas",
  "Verified deploy replay must compare-and-set live projection against current plan truth"
);

requireIncludes(
  "apps/worker/src/handlers/deploy.integration.ts",
  "does not let verified deploy replay revive a rolled-back release plan",
  "release-transition-cas",
  "Deploy integration must prove verified replay cannot revive rolled-back plan truth"
);

requireIncludes(
  "apps/worker/src/handlers/deploy.ts",
  "decideProviderDeployAction",
  "deploy-provider-operation-state",
  "Deploy worker must decide provider-deploy handling in one pure owner, not per call site"
);

requireOrderedIncludes(
  "apps/worker/src/handlers/deploy.ts",
  'return { kind: "manual_reconciliation" };',
  'return { kind: "reconcile_provider_deploy" };',
  "deploy-provider-operation-state",
  "ADR 0009 manual reconciliation must outrank a recorded providerDeployId in the deploy decision"
);

requireIncludes(
  "apps/worker/src/handlers/deploy.test.ts",
  "stops when start returns a manual reconciliation row that already carries a provider deploy id",
  "deploy-provider-operation-state",
  "Deploy tests must pin that a manual row with a provider deploy id never reconciles against the provider"
);

requireIncludes(
  "apps/worker/src/handlers/release-verification.ts",
  "verificationProjectableDeploymentStatuses",
  "release-transition-cas",
  "Verification projection must compare-and-set deployment lifecycle truth"
);

requireIncludes(
  "apps/worker/src/handlers/release-verification.integration.ts",
  "does not let late healthy verification overwrite a concurrent rollback",
  "release-transition-cas",
  "Verification integration must prove rollback truth wins over a late healthy result"
);

requireIncludes(
  "packages/domain/src/index.ts",
  "activeRollbackOperationStatuses",
  "release-transition-cas",
  "ADR 0013 active rollback operation vocabulary must have one pure domain owner"
);

requireIncludes(
  "packages/domain/src/index.test.ts",
  "recognizes the shared active status vocabulary in both persisted evidence shapes",
  "release-transition-cas",
  "Domain tests must pin active rollback recognition across both persisted evidence shapes"
);

requireIncludes(
  "apps/worker/src/handlers/release-verification.ts",
  "hasActiveRollbackOperationEvidence(row.evidenceJson)",
  "release-transition-cas",
  "Verification projection must reuse the shared active rollback evidence predicate"
);

requireIncludes(
  "apps/worker/src/handlers/release-verification.integration.ts",
  "does not project healthy verification while rollback restore is in flight",
  "release-transition-cas",
  "Verification integration must prove active restore ownership blocks lifecycle projection"
);

requireIncludes(
  "apps/worker/src/handlers/release-verification.ts",
  'not(eq(deployments.providerOperationStatus, "manual_reconciliation_required"))',
  "release-transition-cas",
  "Manual reconciliation provider truth must suppress release verification lifecycle projection"
);

requireIncludes(
  "apps/worker/src/handlers/release-verification.ts",
  "lifecycleProjection",
  "release-transition-cas",
  "Terminal verification audit must record whether lifecycle projection applied or was suppressed"
);

requireIncludes(
  "apps/worker/src/handlers/release-verification.integration.ts",
  "does not project healthy verification during manual rollback reconciliation",
  "release-transition-cas",
  "Verification integration must prove manual reconciliation cannot be projected live"
);

requireIncludes(
  "apps/worker/src/handlers/rollback.ts",
  "Release plan changed before rollback intent could be persisted",
  "release-transition-cas",
  "Rollback intent must compare-and-set current plan truth before provider mutation"
);

requireIncludes(
  "apps/worker/src/handlers/rollback.integration.ts",
  "does not record rollback intent or call the provider when plan truth changes after context load",
  "release-transition-cas",
  "Rollback integration must prove stale plan context loses before provider restore"
);

requireIncludes(
  "apps/api/src/modules/releases.module.ts",
  'status: "release_candidate"',
  "page-version-lifecycle",
  "Release deploy approval must project included approved page versions to release_candidate"
);

requireIncludes(
  "apps/api/src/modules/releases.integration.ts",
  "records actor evidence when approving release deploy",
  "page-version-lifecycle",
  "Release integration tests must cover deploy-approval page-version lifecycle projection"
);

requireIncludes(
  "apps/worker/src/handlers/release-verification.ts",
  'status: "released"',
  "page-version-lifecycle",
  "Live verification must project included page versions to released"
);

requireIncludes(
  "apps/worker/src/handlers/release-verification.ts",
  'status: "superseded"',
  "page-version-lifecycle",
  "Live verification must supersede older released page versions for the same proposal"
);

requireIncludes(
  "apps/worker/src/handlers/release-verification.integration.ts",
  "supersedes older released page versions for the same proposal",
  "page-version-lifecycle",
  "Release verification integration tests must prove older released page versions are superseded"
);

requireIncludes(
  "apps/worker/src/handlers/deploy.integration.ts",
  "deploys release-candidate page versions produced by deploy approval",
  "page-version-lifecycle",
  "Deploy integration tests must prove release-candidate page versions remain deployable"
);

requireIncludes(
  "apps/api/src/modules/releases.integration.ts",
  "cancels pending release plans and restores candidate page versions for replanning",
  "page-version-lifecycle",
  "Release integration tests must prove cancel restores release-candidate versions for replanning"
);

requireIncludes(
  "apps/api/src/modules/releases.module.ts",
  "release_plan_cancelled",
  "page-version-lifecycle",
  "Release cancellation must persist actor audit evidence"
);

requireIncludes(
  "apps/api/src/modules/releases.integration.ts",
  "release_plan_cancelled",
  "page-version-lifecycle",
  "Release integration tests must prove cancellation audit evidence is persisted"
);

requireIncludes(
  "apps/worker/src/handlers/deploy.integration.ts",
  "demotes release-candidate page versions when deploy fails",
  "page-version-lifecycle",
  "Deploy integration tests must prove failed deploys restore release candidates"
);

requireIncludes(
  "apps/worker/src/handlers/rollback.integration.ts",
  'pageVersion?.status, "approved"',
  "page-version-lifecycle",
  "Rollback integration tests must prove rolled-back plans restore release candidates"
);

requireIncludes(
  ".ai-project-rules/04-deployment-agent.md",
  "require a fresh deploy approval",
  "page-release-planning",
  "Deployment-agent rules must document re-preflight requiring fresh deploy approval"
);

requireIncludes(
  "packages/contracts/src/index.ts",
  "CreateMediaUploadIntentRequestSchema",
  "media-asset-boundary",
  "Media upload intent must stay behind the strict shared contract"
);

requireIncludes(
  "packages/contracts/src/index.ts",
  "PageMediaReferenceSchema",
  "media-asset-boundary",
  "Future PageJson media placement must use the opaque contracts-owned reference shape"
);

requireIncludes(
  "packages/adapters/src/index.ts",
  "export interface MediaAssetStoragePort",
  "media-asset-boundary",
  "Untrusted binary media must use a purpose-named storage port instead of widening JSON storage consumers"
);

requireIncludes(
  "apps/api/src/modules/media.module.ts",
  'isQueueConfigured("media-processing")',
  "media-asset-boundary",
  "Media upload intent must fail closed before persistence when processing transport is unavailable"
);

requireIncludes(
  "apps/api/src/media-storage.module.ts",
  "Production media storage requires S3_BUCKET",
  "media-asset-boundary",
  "Production API composition must not fall back to filesystem media storage"
);

requireIncludes(
  "apps/worker/src/handlers.ts",
  "Production worker storage requires S3_BUCKET",
  "media-asset-boundary",
  "Production workers must not fall back to filesystem media storage"
);

requireIncludes(
  "packages/adapters/src/s3-object-storage.ts",
  '"x-amz-checksum-sha256"',
  "media-asset-boundary",
  "S3 upload grants must ask S3 to verify the source checksum"
);

requireIncludes(
  "packages/adapters/src/s3-object-storage.ts",
  "ChecksumSHA256: sha256HexToBase64(input.sha256)",
  "media-asset-boundary",
  "S3 derivative writes must bind the checksum of the uploaded bytes"
);

requireIncludes(
  "apps/api/src/modules/media.module.ts",
  "jobId: assetId",
  "media-asset-boundary",
  "Media upload completion must enqueue deterministic processing by asset id"
);

requireNotRegex(
  "apps/api/src/modules/media.module.ts",
  /pageVersions|pageProposals|releasePlans|deployments/u,
  "media-asset-boundary",
  "Media upload/completion must not create page, release, or deploy product truth"
);

requireIncludes(
  "apps/worker/src/handlers/media-processing.ts",
  "sourceSha256 !== asset.expectedSha256",
  "media-asset-boundary",
  "Media worker must recompute and verify the persisted source checksum"
);

requireIncludes(
  "apps/worker/src/handlers/media-processing.ts",
  ".webp({ quality: 82, effort: 4, smartSubsample: true })",
  "media-asset-boundary",
  "Media worker must pin the versioned deterministic WebP recipe"
);

requireIncludes(
  "packages/db/migrations/0035_media_assets.sql",
  "ready media asset requires the exact persisted derivative set",
  "media-asset-boundary",
  "Postgres must reject partial media readiness"
);

requireIncludes(
  "packages/db/migrations/0035_media_assets.sql",
  "ready media asset variants are immutable",
  "media-asset-boundary",
  "Postgres must freeze derivative rows after readiness"
);

requireIncludes(
  "packages/db/migrations/0035_media_assets.sql",
  "ready or archived media assets cannot be hard-deleted",
  "media-asset-boundary",
  "Postgres must prevent deletion of frozen media asset history"
);

requireIncludes(
  "apps/worker/src/handlers/media-processing.integration.ts",
  "ready or archived media assets cannot be hard-deleted",
  "media-asset-boundary",
  "Media integration must prove frozen asset rows cannot be deleted"
);

requireIncludes(
  "apps/worker/src/work-recovery.ts",
  'kind: "media_processing"',
  "media-asset-boundary",
  "Stale processing assets must use the bounded artifact-capture recovery lane"
);

requireIncludes(
  "apps/worker/src/handlers/media-processing.integration.ts",
  "promotes verified source bytes to an exact immutable ready derivative set",
  "media-asset-boundary",
  "Media worker integration must prove exact immutable ready derivatives"
);

requireIncludes(
  "apps/worker/src/work-recovery.integration.ts",
  "marks stale media processing failed after bounded recovery is exhausted",
  "media-asset-boundary",
  "Media recovery integration must prove bounded exhaustion becomes visible product truth"
);

requireIncludes(
  "apps/worker/src/work-recovery.integration.ts",
  "expires abandoned pending media upload intents after the bounded retention window",
  "media-asset-boundary",
  "Media recovery integration must prove abandoned upload intent quota is eventually released"
);

requireIncludes(
  "packages/adapters/src/index.ts",
  "export interface MediaAssetCleanupStoragePort",
  "media-storage-cleanup",
  "Physical cleanup must use its own bounded private-storage capability instead of widening JSON storage"
);

requireIncludes(
  "apps/worker/src/media-storage-cleanup.ts",
  "storageCleanupAttemptCount: sql<number>",
  "media-storage-cleanup",
  "Cleanup must durably claim a bounded attempt before private-storage mutation"
);

requireIncludes(
  "apps/worker/src/media-storage-cleanup.ts",
  "noPageVersionReferences()",
  "media-storage-cleanup",
  "Failed media cleanup must retain bytes while relational page-version evidence references the asset"
);

requireIncludes(
  "apps/worker/src/media-storage-cleanup.ts",
  'if (claim.scope === "failed_asset_objects")',
  "media-storage-cleanup",
  "Ready and archived cleanup must not select immutable derivative prefixes"
);

requireIncludes(
  "apps/worker/src/media-storage-cleanup.ts",
  "claim.sourceStorageKey !== expectedSourceKey",
  "media-storage-cleanup",
  "Cleanup must reject persisted source keys outside the server-derived quarantine boundary"
);

requireIncludes(
  "packages/db/migrations/0036_media_storage_cleanup.sql",
  "media_assets_storage_cleanup_evidence_check",
  "media-storage-cleanup",
  "Postgres must constrain durable cleanup completion and failure evidence"
);

requireIncludes(
  "apps/worker/src/media-storage-cleanup.integration.ts",
  "deletes a ready asset quarantine source while retaining immutable derivatives",
  "media-storage-cleanup",
  "Integration coverage must prove source cleanup cannot remove ready derivatives"
);

requireIncludes(
  "apps/worker/src/media-storage-cleanup.integration.ts",
  "does not clean a failed asset while page-version retention evidence references it",
  "media-storage-cleanup",
  "Integration coverage must prove relational reference evidence blocks failed-object cleanup"
);

requireIncludes(
  "apps/worker/src/media-storage-cleanup.integration.ts",
  "allows only one of two cleanup scanners to own a fresh asset claim",
  "media-storage-cleanup",
  "Integration coverage must prove competing cleanup scanners cannot duplicate ownership"
);

requireIncludes(
  "apps/worker/src/media-storage-cleanup.integration.ts",
  "terminalizes a stale final cleanup claim without issuing an unbounded delete",
  "media-storage-cleanup",
  "Integration coverage must prove a crash after the final claim converges to durable exhaustion"
);

requireIncludes(
  "apps/worker/src/media-storage-cleanup.integration.ts",
  "retries a stale claim idempotently after the quarantine source is already absent",
  "media-storage-cleanup",
  "Integration coverage must prove a crash after object deletion converges through idempotent retry"
);

requireNotIncludes(
  "docs/architecture/agent-first-mvp-roadmap.md",
  "idempotent quarantine/derivative byte-retention cleanup beyond 24-hour pending-intent expiration",
  "media-storage-cleanup",
  "The roadmap must not describe shipped physical media cleanup as deferred"
);

requireIncludes(
  "packages/contracts/src/index.ts",
  'z.discriminatedUnion("encoding"',
  "media-renderer-parity",
  "Static site files must use an explicit UTF-8/base64 encoding discriminator"
);

requireIncludes(
  "packages/contracts/src/index.ts",
  "STATIC_SITE_ARTIFACT_MAX_DECODED_BYTES = 50 * 1024 * 1024",
  "media-renderer-parity",
  "Static artifacts must enforce the accepted decoded-byte budget"
);

requireIncludes(
  "packages/contracts/src/page-json.test.ts",
  "requires explicit encoding and measures decoded bytes",
  "media-renderer-parity",
  "Contract tests must pin explicit static-file encoding and decoded-byte accounting"
);

requireIncludes(
  "packages/adapters/src/netlify-site-hosting.ts",
  "artifact.files.map(decodeStaticSiteFile)",
  "media-renderer-parity",
  "Netlify handoff must decode each artifact file before digest and upload"
);

requireIncludes(
  "packages/adapters/src/netlify-site-hosting.test.ts",
  "hashes and uploads decoded base64 bytes instead of transport text",
  "media-renderer-parity",
  "Netlify tests must prove byte digest/upload parity for base64 files"
);

requireNotRegex(
  "packages/adapters/src/netlify-site-hosting.ts",
  /@localseo\/(?:db|page-registry)/u,
  "media-renderer-parity",
  "The hosting adapter must not resolve media, query the database, or render PageJson"
);

requireIncludes(
  "packages/db/src/media-manifest.ts",
  "loadResolvedPageVersionMediaVariants",
  "media-renderer-parity",
  "Preview and deploy must share one project-scoped media-manifest resolver"
);

requireIncludes(
  "apps/api/src/modules/pages.module.ts",
  "loadPreviewMediaManifest",
  "media-renderer-parity",
  "Preview must resolve the immutable media projection through the shared manifest boundary"
);

requireIncludes(
  "apps/worker/src/handlers/deploy.ts",
  "loadResolvedPageVersionMediaVariants",
  "media-renderer-parity",
  "Deploy must resolve the same immutable media projection before artifact construction"
);

requireIncludes(
  "apps/worker/src/handlers/deploy.ts",
  "buildReleaseMediaFiles",
  "media-renderer-parity",
  "Deploy must verify and embed projected derivative bytes before provider handoff"
);

requireIncludes(
  "apps/worker/src/handlers/deploy.integration.ts",
  "embeds projected immutable media bytes in the persisted static artifact",
  "media-renderer-parity",
  "Deploy integration must prove media bytes are persisted in the self-contained artifact"
);

requireIncludes(
  "apps/api/src/preview-capability.ts",
  '"SameSite=None"',
  "media-preview-capability",
  "Preview capabilities must remain cross-site capable for opaque sandboxed subresources"
);

requireNotIncludes(
  "apps/api/src/preview-capability.ts",
  "SameSite=Lax",
  "media-preview-capability",
  "Local preview capability cookies must not be blocked by the iframe's opaque site-for-cookies"
);

requireIncludes(
  "apps/api/src/modules/pages.module.ts",
  'path: "/assets"',
  "media-preview-capability",
  "The preview document must scope its asset capability to the asset route"
);

requireIncludes(
  "apps/api/src/modules/pages.module.ts",
  "previewPageVersionDocument",
  "media-preview-capability",
  "Preview HTML must be served through the capability-authorized document boundary"
);

requireIncludes(
  "apps/api/src/modules/media.module.ts",
  "readPreviewAsset",
  "media-preview-capability",
  "Preview asset bytes must pass capability, manifest, and byte-integrity checks"
);

requireIncludes(
  "apps/api/src/modules/media.integration.ts",
  "serves only bytes authorized by the signed page-version manifest",
  "media-preview-capability",
  "Media integration must reject paths outside the signed preview manifest"
);

requireIncludes(
  "apps/api/src/modules/pages.integration.ts",
  "serves editor preview through metadata and signed document capabilities",
  "media-preview-capability",
  "Pages integration must prove metadata-to-document capability delivery"
);

requireIncludes(
  "apps/web/src/screens/pages.tsx",
  'sandbox=""',
  "media-preview-capability",
  "Page Studio preview must preserve the empty iframe sandbox"
);

requireIncludes(
  "apps/web/src/screens/pages.tsx",
  "preview.data.documentPath",
  "media-preview-capability",
  "Page Studio preview must load the capability-authorized document URL"
);

requireNotIncludes(
  "apps/web/src/screens/pages.tsx",
  "srcDoc=",
  "media-preview-capability",
  "Page Studio must not return to inline preview HTML transport"
);

requireIncludes(
  "apps/web/e2e/preview-capability-cookie.spec.ts",
  "sandboxed preview sends the partitioned asset capability from its opaque origin",
  "media-preview-capability",
  "Browser coverage must prove the document-to-assets cookie chain from sandboxed preview"
);

requireIncludes(
  "docs/architecture/decisions/0020-project-scoped-media-asset-pipeline.md",
  "PageJson references become renderer selection truth",
  "media-asset-boundary",
  "Slice 3 must cross-check PageJson media references against projection and manifest truth"
);

requireIncludes(
  "packages/page-registry/src/index.ts",
  'registryKey: "ImageText.default"',
  "page-studio-media-placement",
  "The first media placement must remain a registry-owned section rather than a raw PageJson escape hatch"
);

requireIncludes(
  "packages/page-registry/src/index.ts",
  'control: "asset"',
  "page-studio-media-placement",
  "Media selection must remain an explicit registry editor control"
);

requireIncludes(
  "packages/page-registry/src/index.ts",
  "collectPageMediaAssetIds",
  "page-studio-media-placement",
  "PageJson media references must have one registry-owned collector used by persistence and rendering gates"
);

requireIncludes(
  "packages/db/src/media-manifest.ts",
  "persistPageVersionMediaAssetProjection",
  "page-studio-media-placement",
  "Page-version creation must maintain the exact relational media projection transactionally"
);

requireIncludes(
  "apps/api/src/modules/pages.module.ts",
  "await persistPageVersionMediaAssetProjection(tx",
  "page-studio-media-placement",
  "Page Studio edits must persist media projection evidence in the N+1 transaction"
);

requireIncludes(
  "apps/api/src/modules/pages.integration.ts",
  "projects selected media exactly and retains archived assets only through version lineage",
  "page-studio-media-placement",
  "DB coverage must pin ready-only selection, exact projection, and inherited archived retention"
);

requireIncludes(
  "apps/api/src/modules/releases.integration.ts",
  "rejects release planning when PageJson and the immutable media projection differ",
  "page-studio-media-placement",
  "Release planning must fail closed when PageJson and projection evidence drift"
);

requireIncludes(
  "apps/api/src/modules/releases.integration.ts",
  "persists a preflight blocker when media projection evidence drifts after planning",
  "page-studio-media-placement",
  "Release preflight must persist blocker evidence for post-plan media drift"
);

requireIncludes(
  "apps/worker/src/handlers/page-proposal.ts",
  'gateId: "media_selection"',
  "page-studio-media-placement",
  "Page Proposal AI must not select project media without an operator-owned command"
);

requireIncludes(
  "apps/worker/src/handlers/section-copy-suggestion.integration.ts",
  "validates copy on a media-backed page without changing media truth",
  "page-studio-media-placement",
  "Section-copy validation must preserve existing media truth without gaining a media persistence path"
);

requireIncludes(
  "apps/web/src/features/page-studio/media-upload.ts",
  "CreateMediaUploadIntentRequestSchema.parse",
  "page-studio-media-placement",
  "Page Studio media upload requests must cross the shared contract boundary"
);

requireIncludes(
  "apps/web/e2e/page-studio-replacement.spec.ts",
  "uploads and stages project media before one explicit ImageText version command",
  "page-studio-media-placement",
  "Browser coverage must prove upload and selection remain staging until explicit version creation"
);

requireNotIncludes(
  "docs/architecture/agent-first-mvp-roadmap.md",
  "Page Studio media controls remain",
  "page-studio-media-placement",
  "The roadmap must not describe shipped Page Studio media controls as deferred"
);

requireNotIncludes(
  "README.md",
  'Page Studio is planned as "WordPress but safer and easier"',
  "roadmap-current-status",
  "The root status document must not describe shipped Page Studio as planned"
);

requireNotIncludes(
  "README.md",
  "The next product frontier is the Page Registry/PageJson lane",
  "roadmap-current-status",
  "The root status document must not point at the completed Page Registry lane as next"
);

requireNotIncludes(
  "docs/architecture/agent-first-mvp-roadmap.md",
  "Prefer a future `page_section_notes` table",
  "roadmap-current-status",
  "The roadmap must not describe the implemented page-section-note store as future"
);

requireIncludes(
  "docs/architecture/agent-first-mvp-roadmap.md",
  "Status: first report vertical plus optional bounded narrative implemented; architecture checkpoint accepted by",
  "roadmap-current-status",
  "The roadmap must name the implemented first Report and Next Action vertical"
);

requireIncludes(
  "docs/architecture/decisions/0021-digest-bound-customer-report-publication.md",
  "Status: Accepted",
  "customer-report-boundary",
  "The customer-report snapshot/publication/action boundary must remain an accepted ADR"
);

requireIncludes(
  "docs/architecture/decisions/0021-digest-bound-customer-report-publication.md",
  "The first vertical proof ends after the report UI slice.",
  "customer-report-boundary",
  "The deterministic fact-only publication path must precede optional AI, command actions, and PDF"
);

requireIncludes(
  ".ai-project-rules/11-reporting-anti-regression.md",
  "DO NOT rebuild a published report from current operational rows",
  "customer-report-boundary",
  "Published customer-report history must remain snapshot-owned"
);

requireIncludes(
  ".ai-project-rules/11-reporting-anti-regression.md",
  "DO NOT let a report Next Action bypass Page Studio, approval, release, deploy, verification, or rollback gates",
  "customer-report-boundary",
  "Report actions must preserve every existing controlled workflow gate"
);

requireIncludes(
  ".ai-project-rules/15-architecture-regression-guards.md",
  "The deterministic fact-only publication path must ship before AI prose",
  "customer-report-boundary",
  "The architecture rule must keep optional report capabilities off the core publication critical path"
);

requireIncludes(
  "packages/domain/package.json",
  '"canonicalize": "3.0.0"',
  "customer-report-foundation",
  "Customer-report canonicalization must stay pinned to the reviewed RFC 8785 implementation"
);

requireIncludes(
  "packages/contracts/src/report.ts",
  "CustomerReportSnapshotSchema",
  "customer-report-foundation",
  "Customer-report snapshot truth must cross one dedicated strict shared contract"
);

requireIncludes(
  "packages/domain/src/report.ts",
  "canonicalizeCustomerReportSnapshot",
  "customer-report-foundation",
  "Customer-report snapshots must use the domain-owned canonical ordering boundary"
);

requireIncludes(
  "packages/domain/src/report.ts",
  "rankingMilestoneForRank",
  "customer-report-foundation",
  "Customer-safe ranking milestones must remain deterministic rather than narrative-owned"
);

requireIncludes(
  "packages/contracts/src/report.ts",
  'reportStatus: z.literal("draft")',
  "customer-report-foundation",
  "ReportGenerated must continue to mean validated draft truth rather than publication"
);

requireIncludes(
  "packages/contracts/src/report.ts",
  'consentStatus: z.literal("accepted")',
  "customer-report-foundation",
  "CustomerApprovedNextAction must remain human-consent truth rather than downstream completion"
);

requireNotIncludes(
  "packages/contracts/src/report.ts",
  "command_offer",
  "customer-report-foundation",
  "Consequential report commands must remain deferred until target workflows expose CAS boundaries"
);

requireIncludes(
  "apps/api/src/auth/permissions/project-permissions.ts",
  '"report:correct"',
  "customer-report-foundation",
  "Report correction must remain an explicit authority distinct from generic project access"
);

requireIncludes(
  "packages/contracts/src/report.test.ts",
  "rejects banned GSC diagnostics and arbitrary customer-facing fields",
  "customer-report-foundation",
  "Contract coverage must pin banned diagnostics out of customer report payloads"
);

requireIncludes(
  "packages/domain/src/report.test.ts",
  "produces identical canonical text for shuffled semantic arrays",
  "customer-report-foundation",
  "Canonicalization coverage must pin semantic array ordering"
);

requireIncludes(
  "packages/contracts/src/report.ts",
  "Rollback correction verification must occur after the rollback.",
  "customer-report-foundation",
  "Rollback correction claims must require genuinely subsequent verification"
);

requireIncludes(
  "packages/domain/src/report.ts",
  "evidence.deploymentId === claim.deploymentId",
  "customer-report-foundation",
  "Rollback correction verification evidence must belong to the rolled-back deployment"
);

requireIncludes(
  "packages/contracts/src/report.test.ts",
  "rejects cross-project and cutoff-mismatched snapshot evidence",
  "customer-report-foundation",
  "Snapshot contracts must close project and cutoff substitution before persistence"
);

requireIncludes(
  "packages/db/src/schema.ts",
  'uniqueIndex("report_generation_runs_active_issue_idx")',
  "customer-report-aggregate",
  "Postgres must own one active generation per stable report issue"
);

requireIncludes(
  "packages/db/src/schema.ts",
  'uniqueIndex("reports_open_candidate_issue_idx")',
  "customer-report-aggregate",
  "Postgres must own one open draft or ready candidate per report issue"
);

requireIncludes(
  "packages/db/migrations/0037_customer_report_aggregate.sql",
  "Report issue updates must increment row_version exactly once.",
  "customer-report-aggregate",
  "The stable report issue lock must expose an exact optimistic version boundary"
);

requireIncludes(
  "packages/db/migrations/0037_customer_report_aggregate.sql",
  "Reviewed and published report semantics are immutable.",
  "customer-report-aggregate",
  "Reviewed report snapshot and provenance truth must remain frozen at the database boundary"
);

requireIncludes(
  "packages/db/migrations/0037_customer_report_aggregate.sql",
  "Report publication and supersession are not enabled by the aggregate foundation migration.",
  "customer-report-aggregate",
  "The aggregate foundation must not accidentally expose publication before reviewed artifacts and actor binding"
);

requireIncludes(
  "apps/api/src/modules/reports/report-aggregate-store.ts",
  "canonicalizeCustomerReportFactProjection(snapshot.factProjection)",
  "customer-report-aggregate",
  "Snapshot admission must recompute rather than trust the embedded fact-projection digest"
);

requireIncludes(
  "apps/api/src/modules/reports/reports.service.ts",
  "return this.generation.admitGeneration(...args);",
  "customer-report-module-boundaries",
  "The stable ReportsService facade must delegate report generation to its focused capability"
);

requireIncludes(
  "apps/api/src/modules/reports/reports.service.ts",
  "return this.review.submitForReview(...args);",
  "customer-report-module-boundaries",
  "The stable ReportsService facade must delegate review and artifact lifecycle to its focused capability"
);

requireIncludes(
  "apps/api/src/modules/reports/reports.service.ts",
  "return this.publication.publish(...args);",
  "customer-report-module-boundaries",
  "The stable ReportsService facade must delegate publication and correction to its focused capability"
);

requireNotIncludes(
  "apps/api/src/modules/reports.module.ts",
  ".transaction(",
  "customer-report-module-boundaries",
  "The Nest report transport/composition module must not regain aggregate transaction ownership"
);

requireNotIncludes(
  "apps/api/src/modules/reports.module.ts",
  "DatabaseService",
  "customer-report-module-boundaries",
  "The Nest report transport/composition module must not regain direct database ownership"
);

requireNotIncludes(
  "apps/api/src/modules/reports.module.ts",
  'from "@localseo/db"',
  "customer-report-module-boundaries",
  "The Nest report transport/composition module must not import report persistence tables"
);

requireNotIncludes(
  "apps/api/src/modules/reports.module.ts",
  'from "drizzle-orm"',
  "customer-report-module-boundaries",
  "The Nest report transport/composition module must not regain query construction"
);

requireIncludes(
  "apps/api/src/modules/reports/report-aggregate-store.ts",
  "decideCustomerReportSnapshotEligibility(snapshot)",
  "customer-report-aggregate",
  "Every admitted snapshot must compose claim-level deterministic eligibility"
);

requireIncludes(
  "apps/api/src/modules/reports/report-generation.capability.ts",
  "Report generation idempotency key belongs to another request.",
  "customer-report-aggregate",
  "Report generation idempotency must remain bound to the original actor, cutoff, mode, and issue"
);

requireIncludes(
  "apps/api/src/modules/reports/report-aggregate-store.ts",
  "evidenceProjectionReferencesMatch(row, item)",
  "customer-report-aggregate",
  "Normalized report evidence references must remain exact projections of canonical evidence"
);

requireIncludes(
  "apps/api/src/modules/reports/report-aggregate-store.ts",
  "Customer report evidence source relationship was missing, mismatched, or belonged to another project.",
  "customer-report-aggregate",
  "Nested verification, deployment, and rollback evidence relationships must remain project coherent"
);

requireIncludes(
  "packages/db/src/schema.ts",
  '"report_evidence_items_proof_tier_check"',
  "customer-report-aggregate",
  "Customer report proof tiers must remain bounded at the database boundary"
);

requireIncludes(
  "packages/db/migrations/0037_customer_report_aggregate.sql",
  "Report generation base candidate must belong to the same issue and project.",
  "customer-report-aggregate",
  "Generation admission references must remain tenant- and issue-coherent"
);

requireIncludes(
  "packages/db/migrations/0037_customer_report_aggregate.sql",
  "Report normalized provenance must match the exact canonical snapshot before review.",
  "customer-report-aggregate",
  "Review promotion must reject count-preserving canonical projection substitution"
);

requireIncludes(
  "packages/db/migrations/0037_customer_report_aggregate.sql",
  "ReportGenerated lifecycle evidence must bind its succeeded generation run.",
  "customer-report-aggregate",
  "Report lifecycle evidence must describe the exact durable transition"
);

requireIncludes(
  "packages/contracts/src/report.ts",
  "CustomerReportDecisionNoteSchema = reportText(2_000)",
  "customer-report-aggregate",
  "Report review notes must share the bounded Unicode and control policy"
);

requireIncludes(
  "apps/api/src/modules/reports/report-aggregate-store.ts",
  'SELECT "id" FROM "report_issues"',
  "customer-report-aggregate",
  "Generation and review must serialize on the stable report issue row"
);

requireIncludes(
  "apps/api/src/modules/reports/report-publication.capability.ts",
  "async publish",
  "customer-report-publication",
  "Digest-bound report publication must remain an explicit authenticated service boundary"
);

requireIncludes(
  "packages/domain/src/report.test.ts",
  "keeps canonical identity under generated semantic-array permutations",
  "customer-report-aggregate",
  "Canonical report persistence must be preceded by property-based ordering coverage"
);

requireIncludes(
  "packages/contracts/src/report.ts",
  'schemaVersion: z.literal("customer_report_evidence_packet.v1")',
  "customer-report-generation",
  "Fact-only generation must cross one strict bounded server-owned evidence packet"
);

requireIncludes(
  "apps/api/src/modules/reports.module.ts",
  '@RequireProjectPermission("report:generate")',
  "customer-report-generation",
  "Report generation must remain an authenticated permissioned command"
);

requireIncludes(
  "apps/api/src/queue-producer.ts",
  'report: new Queue("report"',
  "customer-report-generation",
  "Report admission must use the registered durable report queue"
);

requireIncludes(
  "apps/worker/src/handlers/customer-report.ts",
  "canonicalizeCustomerReportSourcePayload(payload)",
  "customer-report-generation",
  "Every selected report source must remain bound to canonical payload bytes"
);

requireIncludes(
  "apps/worker/src/handlers/customer-report.ts",
  "Customer report evidence changed before draft persistence.",
  "customer-report-generation",
  "Generation completion must re-select and compare the evidence packet before persistence"
);

requireIncludes(
  "apps/worker/src/handlers/customer-report.ts",
  ".innerJoin(deployments, eq(rollbackPoints.releasePlanId, deployments.releasePlanId))",
  "customer-report-generation",
  "Rollback report evidence must resolve the rolled-back target by release-plan ownership"
);

requireIncludes(
  "apps/worker/src/handlers/customer-report.ts",
  "if (!parsed.success || !rollbackPoint.deploymentId) {\n    return undefined;",
  "customer-report-generation",
  "Incomplete rollback execution evidence must not fail the whole monthly report"
);

requireIncludes(
  "packages/contracts/src/report.ts",
  "Action ${action.actionKey} does not target its supporting release evidence.",
  "customer-report-generation",
  "Release-review navigation must remain bound to frozen supporting evidence"
);

requireLatestMigrationDefinitionIncludes(
  "enforce_report_write",
  'ORDER BY "evidence_key" COLLATE "C"',
  "customer-report-generation",
  "The latest report trigger definition must keep database review ordering aligned with canonical code-unit ordering"
);

requireLatestMigrationDefinitionIncludes(
  "enforce_report_write",
  'ORDER BY evidence."evidence_key" COLLATE "C"',
  "customer-report-generation",
  "The latest report trigger definition must keep claim-evidence link ordering aligned with canonical code-unit ordering"
);

requireIncludes(
  "apps/worker/src/handlers/customer-report.ts",
  ".orderBy(asc(pageVersions.pageProposalId), desc(pageVersions.versionNumber), asc(pageVersions.id))",
  "customer-report-generation",
  "Latest page-version selection must retain valid PostgreSQL DISTINCT ON ordering"
);

requireIncludes(
  "apps/worker/src/handlers/customer-report.ts",
  ".selectDistinctOn([releaseVerifications.deploymentId]",
  "customer-report-generation",
  "Only the latest terminal verification per deployment may own report health"
);

requireIncludes(
  "apps/worker/src/handlers/customer-report.ts",
  'not(eq(releaseVerificationChecks.scope, "gsc"))',
  "customer-report-generation",
  "GSC-scoped release checks must remain outside customer report warning selection"
);

requireIncludes(
  "apps/worker/src/handlers/customer-report.ts",
  "customerSafeReleaseWarningForCheck(row.checkKey, row.scope)",
  "customer-report-generation",
  "Customer report warnings must use the closed server-owned copy catalog"
);

requireNotIncludes(
  "apps/worker/src/handlers/customer-report.ts",
  "gscSearchAnalyticsRows",
  "customer-report-generation",
  "GSC diagnostics must not enter customer-safe report fact selection"
);

requireIncludes(
  "apps/api/src/modules/reports/report-generation.capability.ts",
  "assertSnapshotMatchesEvidencePacket(run, prepared.snapshot)",
  "customer-report-generation",
  "Internal draft completion must remain bound to the persisted deterministic evidence packet"
);

requireIncludes(
  "packages/contracts/src/report.ts",
  "enqueuedByRequest: z.boolean()",
  "customer-report-generation",
  "Generation responses must not present pre-existing durable work as a request-local enqueue"
);

requireIncludes(
  "apps/worker/src/handlers/customer-report.test.ts",
  "keeps the maximum selected evidence below the report claim cap",
  "customer-report-generation",
  "Evidence selection limits must remain below the claim contract cap"
);

requireIncludes(
  "apps/worker/src/work-recovery.ts",
  "queueName: reportQueueName",
  "customer-report-generation",
  "Bounded recovery must re-enqueue report generation on its dedicated queue"
);

requireIncludes(
  "packages/db/src/schema.ts",
  'index("report_generation_runs_recovery_scan_idx")',
  "customer-report-generation",
  "Active report generation must remain discoverable by the bounded recovery scanner"
);

requireIncludes(
  "apps/worker/src/handlers/customer-report.integration.ts",
  "assembles and persists a bounded fact-only report from durable customer-safe sources",
  "customer-report-generation",
  "DB coverage must prove deterministic report assembly and persistence without AI"
);

requireIncludes(
  "apps/worker/src/handlers/customer-report.integration.ts",
  "coalesces duplicate worker delivery into one draft and one lifecycle event",
  "customer-report-generation",
  "Duplicate report worker delivery must remain idempotent"
);

requireIncludes(
  "apps/worker/src/work-recovery.integration.ts",
  "re-enqueues stale fact-only report generation with the same run id",
  "customer-report-generation",
  "DB coverage must pin deterministic same-run report recovery"
);

requireIncludes(
  "apps/worker/src/work-recovery.integration.ts",
  "fails fact-only report generation after bounded recovery is exhausted",
  "customer-report-generation",
  "Report recovery exhaustion must remain visible durable failure"
);

requireIncludes(
  "apps/worker/src/work-recovery.integration.ts",
  "fails report product truth when transport completed without terminal persistence",
  "customer-report-generation",
  "Completed transport without report product truth must fail visibly"
);

requireIncludes(
  "packages/contracts/src/report.ts",
  'schemaVersion: z.literal("customer_report_narrative_draft.v1")',
  "customer-report-narrative",
  "Model-owned report narrative output must remain a narrow slot-key and text contract"
);

requireIncludes(
  "packages/ai/src/report-narrative.ts",
  "evaluateCustomerReportNarrative",
  "customer-report-narrative",
  "Bounded report narrative must cross deterministic QA before attribution"
);

requireIncludes(
  "packages/ai/src/report-narrative.ts",
  "factTokenPattern",
  "customer-report-narrative",
  "AI narrative must not carry customer-facing factual tokens"
);

requireIncludes(
  "apps/worker/src/reasoning-policy.ts",
  'allowedToolCategories: ["read_evidence", "analyze", "draft_content"]',
  "customer-report-narrative",
  "Report narrative must retain its named non-mutating ADR 0019 policy"
);

requireIncludes(
  "apps/worker/src/handlers/customer-report.ts",
  "let snapshot = factOnlySnapshot",
  "customer-report-narrative",
  "Deterministic fact truth must remain the default outcome before optional narrative"
);

requireIncludes(
  "apps/worker/src/handlers/customer-report.ts",
  'policyForReasoningTask("report_narrative")',
  "customer-report-narrative",
  "The report narrative provider call must consume the named task policy"
);

requireIncludes(
  "apps/api/src/modules/reports/report-generation.capability.ts",
  "Internal report draft persistence accepts fact-only snapshots only.",
  "customer-report-narrative",
  "The internal API harness must not become a second bounded-narrative persistence path"
);

requireIncludes(
  "packages/db/migrations/0043_customer-report-narrative-provenance.sql",
  "Bounded-AI report narrative must match its succeeded report-scoped agent run.",
  "customer-report-narrative",
  "Postgres must bind bounded narrative to exact succeeded attributed agent output"
);

requireIncludes(
  "packages/db/migrations/0043_customer-report-narrative-provenance.sql",
  "Succeeded report narrative agent runs are immutable audit evidence.",
  "customer-report-narrative",
  "Succeeded report narrative output must remain immutable audit evidence"
);

requireIncludes(
  "apps/worker/src/handlers/customer-report.integration.ts",
  "persists only attributed bounded narrative from a report-scoped agent run",
  "customer-report-narrative",
  "DB coverage must prove exact report-scoped narrative provenance"
);

requireIncludes(
  "apps/worker/src/handlers/customer-report.integration.ts",
  "keeps QA-rejected narrative out of report truth",
  "customer-report-narrative",
  "DB coverage must prove unsafe provider prose degrades to fact-only truth"
);

requireIncludes(
  "apps/worker/src/work-recovery.integration.ts",
  "terminalizes report narrative audit when parent recovery is exhausted",
  "customer-report-narrative",
  "Report recovery must terminalize active narrative audit with its parent"
);

requireIncludes(
  "apps/worker/src/handlers/customer-report-html.ts",
  "Customer report narrative contains a slot outside the deterministic section layout.",
  "customer-report-narrative",
  "The renderer must fail closed on narrative outside server-owned layout slots"
);

requireIncludes(
  "packages/contracts/src/report.ts",
  'schemaVersion: z.literal("customer_report_html_manifest.v1")',
  "customer-report-html-artifact",
  "Reviewed HTML must cross one strict digest-bound render manifest"
);

requireIncludes(
  "packages/db/migrations/0040_customer-report-html-artifacts.sql",
  'CREATE CONSTRAINT TRIGGER "report_artifacts_review_binding_guard"',
  "customer-report-html-artifact",
  "Active report artifacts must be committed with exact reviewed report truth"
);

requireLatestMigrationDefinitionIncludes(
  "enforce_report_artifact_write",
  "customer_report_html_renderer.v2",
  "customer-report-html-artifact",
  "The latest artifact trigger must pin the current renderer version that owns new immutable bytes"
);

requireLatestMigrationDefinitionIncludes(
  "enforce_report_artifact_write",
  "customer_report_stylesheet.v2",
  "customer-report-html-artifact",
  "The latest artifact trigger must pin the current stylesheet version that owns new immutable bytes"
);

requireLatestMigrationDefinitionIncludes(
  "enforce_report_artifact_write",
  "New report artifacts require the current renderer and stylesheet versions",
  "customer-report-html-artifact",
  "Historical renderer identities may transition, but new artifacts must use the current byte identity"
);

requireIncludes(
  "apps/worker/src/handlers/customer-report-html.integration.ts",
  "installs the current renderer identity without stranding historical artifact transitions",
  "customer-report-html-artifact",
  "PostgreSQL coverage must inspect the installed renderer-version transition boundary"
);

requireIncludes(
  "packages/db/migrations/0040_customer-report-html-artifacts.sql",
  "Reviewed report artifacts must be expired before requesting changes",
  "customer-report-html-artifact",
  "Request-changes must expire active and staged derivatives before reopening semantics"
);

requireIncludes(
  "apps/api/src/modules/reports/report-review.capability.ts",
  ".insert(reportArtifacts)",
  "customer-report-html-artifact",
  "Submit-for-review must create durable artifact truth before queue transport"
);

requireIncludes(
  "apps/api/src/modules/reports.module.ts",
  'jobName: "customer_report_html_render"',
  "customer-report-html-artifact",
  "Reviewed HTML must use its dedicated deterministic report job"
);

requireIncludes(
  "packages/contracts/src/index.ts",
  '"report_artifact",',
  "customer-report-html-artifact",
  "Report artifact audit rows must use the declared shared job-type vocabulary"
);

requireIncludes(
  "apps/worker/src/handlers/customer-report-html.ts",
  "canonicalizeCustomerReportSnapshot(snapshot)",
  "customer-report-html-artifact",
  "The renderer must recompute the canonical reviewed snapshot digest"
);

requireIncludes(
  "apps/worker/src/handlers/customer-report-html.ts",
  "putImmutableArtifact",
  "customer-report-html-artifact",
  "Reviewed HTML bytes must use the purpose-named immutable storage boundary"
);

requireIncludes(
  "apps/worker/src/handlers/customer-report-html.ts",
  "formatReportDate(claim.handedOffAt, manifest)",
  "customer-report-html-artifact",
  "Customer-facing proof dates must use the pinned render-manifest timezone"
);

requireIncludes(
  "apps/worker/src/handlers/customer-report-html.ts",
  "renderInline(content.body)",
  "customer-report-html-artifact",
  "Claim bodies must cross the renderer-owned escaping boundary"
);

requireIncludes(
  "packages/adapters/src/file-system-object-storage.ts",
  'flag: "wx"',
  "customer-report-html-artifact",
  "Filesystem artifact writes must remain create-if-absent"
);

requireIncludes(
  "packages/adapters/src/s3-object-storage.ts",
  'IfNoneMatch: "*"',
  "customer-report-html-artifact",
  "S3 artifact writes must remain create-if-absent"
);

requireIncludes(
  "apps/worker/src/work-recovery.ts",
  'jobName: "customer_report_html_render"',
  "customer-report-html-artifact",
  "Bounded artifact recovery must reuse the deterministic render job"
);

requireIncludes(
  "apps/worker/src/handlers/customer-report-html.integration.ts",
  "lets request-changes expire the artifact while rendering and prevents late attachment",
  "customer-report-html-artifact",
  "DB coverage must pin request-changes ownership over late rendering"
);

requireIncludes(
  "apps/worker/src/handlers/customer-report-html.integration.ts",
  "re-enqueues stale HTML rendering with the same artifact id",
  "customer-report-html-artifact",
  "Artifact recovery must retain one durable artifact identity"
);

requireIncludes(
  "apps/worker/src/handlers/customer-report-html.integration.ts",
  "fails visible HTML artifact truth after bounded recovery exhaustion",
  "customer-report-html-artifact",
  "Artifact recovery exhaustion must remain visible product truth"
);

requireIncludes(
  "packages/db/migrations/0041_customer-report-publication.sql",
  "Report publication requires one exact staged immutable artifact.",
  "customer-report-publication",
  "Postgres must bind publication to one exact staged immutable artifact"
);

requireIncludes(
  "packages/db/migrations/0041_customer-report-publication.sql",
  "Report correction generation must bind the current published report.",
  "customer-report-publication",
  "Correction generation must retain its admitted predecessor at the database boundary"
);

requireIncludes(
  "packages/db/migrations/0041_customer-report-publication.sql",
  "Published lifecycle evidence must bind one exact human decision and artifact.",
  "customer-report-publication",
  "Publication events must retain exact actor and artifact evidence"
);

requireIncludes(
  "apps/api/src/modules/reports/report-publication.capability.ts",
  "lockCustomerReportEvidenceSources(tx, snapshot)",
  "customer-report-publication",
  "Publication must lock the bounded source set before aggregate rows"
);

requireIncludes(
  "apps/api/src/modules/reports/report-aggregate-store.ts",
  "Release writers pin rv -> checks -> rollback -> deployment -> page version.",
  "customer-report-publication",
  "Publication source locking must remain compatible with verification and rollback writers"
);

requireIncludes(
  "apps/api/src/modules/reports/report-aggregate-store.ts",
  'row.status !== "reviewed"',
  "customer-report-publication",
  "Ranking-proof invalidation-first publication blocking depends on current reviewed source truth"
);

requireIncludes(
  "apps/api/src/modules/reports/report-publication.capability.ts",
  "verifyImmutableArtifactBytes(requireArtifactReader(this.artifactReader), initialArtifact)",
  "customer-report-publication",
  "Publication must verify selected immutable artifact bytes before committing truth"
);

requireIncludes(
  "apps/api/src/modules/opportunities.module.ts",
  "FOR UPDATE OF r",
  "customer-report-publication",
  "Ranking-proof invalidation must serialize with affected published reports"
);

requireIncludes(
  "apps/api/src/modules/reports/report-publication.capability.ts",
  '.set({ status: "resolved", resolvedAt: now, resolvedByReportId: published.id, updatedAt: now })',
  "customer-report-publication",
  "Correction publication must resolve predecessor source alerts transactionally"
);

requireIncludes(
  "apps/api/src/modules/reports/report-review.capability.ts",
  'throw new ConflictException("Only a failed report artifact can be retried with a new request id.")',
  "customer-report-publication",
  "Artifact retry must create new work only after durable failure"
);

requireIncludes(
  "apps/worker/src/handlers/customer-report.ts",
  "supersedesReportId: run.correctionPredecessorReportId",
  "customer-report-publication",
  "Worker draft persistence must preserve admitted correction lineage"
);

requireIncludes(
  "apps/api/src/modules/reports.integration.ts",
  "publishes one exact staged artifact and reads only the immutable snapshot",
  "customer-report-publication",
  "DB coverage must pin exact artifact publication and snapshot-owned reads"
);

requireIncludes(
  "apps/api/src/modules/reports.integration.ts",
  "blocks invalidated ranking evidence before publication",
  "customer-report-publication",
  "DB coverage must pin invalidation-first publication rejection"
);

requireIncludes(
  "apps/api/src/modules/reports.integration.ts",
  "resolves an invalidated published ranking alert only through a correction",
  "customer-report-publication",
  "DB coverage must pin correction-only alert resolution"
);

requireIncludes(
  "apps/api/src/modules/reports.integration.ts",
  "terminalizes a generation admitted before publication and then admits the required correction",
  "customer-report-publication",
  "Publication must not prevent an older active generation from terminalizing as stale"
);

requireIncludes(
  "packages/contracts/src/report.ts",
  "CustomerReportWorkspaceResponseSchema",
  "customer-report-ui",
  "The operator report workspace must cross one strict bounded shared contract"
);

requireIncludes(
  "apps/api/src/modules/reports.module.ts",
  '@Get("workspace")\n  @RequireProjectPermission("report:review")',
  "customer-report-ui",
  "Draft report workspace reads must remain separate from viewer-readable publication history"
);

requireIncludes(
  "apps/api/src/modules/reports/report-review.capability.ts",
  "return verifyImmutableArtifactBytes(requireArtifactReader(this.artifactReader), row.artifact);",
  "customer-report-ui",
  "Reviewed candidate documents must re-verify immutable artifact bytes"
);

requireIncludes(
  "apps/api/src/modules/reports/report-publication.capability.ts",
  "return verifyImmutableArtifactBytes(requireArtifactReader(this.artifactReader), artifact);",
  "customer-report-ui",
  "Published report documents must re-verify immutable artifact bytes"
);

requireIncludes(
  "apps/web/src/screens/reports.tsx",
  "CustomerReportReviewResponseSchema",
  "customer-report-ui",
  "Report review mutations must parse the shared digest-bound response"
);

requireIncludes(
  "apps/web/src/screens/reports.tsx",
  "CustomerReportPublicationResponseSchema",
  "customer-report-ui",
  "Report publication mutations must parse the shared digest-bound response"
);

requireIncludes(
  "apps/web/src/screens/reports.tsx",
  'sandbox=""',
  "customer-report-ui",
  "Reviewed and published report artifacts must remain sandboxed in the operator UI"
);

requireIncludes(
  "apps/web/src/screens/reports.tsx",
  'to="/projects/$projectId/opportunities"',
  "customer-report-ui",
  "Opportunity report actions must remain navigation into the existing workflow"
);

requireIncludes(
  "apps/web/src/screens/reports.tsx",
  'to="/projects/$projectId/pages/$pageId/preview"',
  "customer-report-ui",
  "Page report actions must remain navigation into Page Studio review"
);

requireIncludes(
  "apps/web/src/screens/reports.tsx",
  'to="/projects/$projectId/releases/$releasePlanId"',
  "customer-report-ui",
  "Release report actions must remain navigation into release review"
);

requireIncludes(
  "apps/web/e2e/customer-report.spec.ts",
  "reviews and publishes one immutable customer report without mobile overflow",
  "customer-report-ui",
  "Browser coverage must pin explicit review, immutable artifact display, publication, and mobile containment"
);

requireIncludes(
  "apps/api/src/modules/reports.module.ts",
  "requireReportDocumentCapability(cookieHeader, { projectId, reportId, artifactId }",
  "customer-report-ui",
  "Sandboxed report document routes must authorize the exact immutable artifact through a signed capability"
);

requireIncludes(
  "apps/api/src/report-document-capability.ts",
  '"SameSite=None"',
  "customer-report-ui",
  "Report document capabilities must survive cross-site opaque-origin iframe navigation"
);

requireIncludes(
  "apps/api/src/report-document-capability.ts",
  '"Partitioned"',
  "customer-report-ui",
  "Report document capabilities must remain partitioned to the operator top-level site"
);

requireIncludes(
  "apps/web/e2e/report-document-capability.spec.ts",
  "sandboxed report document sends its partitioned capability on a real cross-site request",
  "customer-report-ui",
  "Real-network browser coverage must prove the sandboxed report document receives its capability"
);

requireIncludes(
  "apps/api/src/modules/reports.integration.ts",
  "keeps the live report review trigger pinned to locale-independent ordering",
  "customer-report-aggregate",
  "PostgreSQL coverage must inspect the installed report trigger after all migrations"
);

requireIncludes(
  "apps/api/src/modules/reports.integration.ts",
  "serializes the first report generation empty-set race on one stable issue",
  "customer-report-aggregate",
  "A real-PostgreSQL test must pin first-generation empty-set serialization"
);

requireIncludes(
  "apps/api/src/modules/reports.integration.ts",
  "allows only one legal winner when review races regeneration completion",
  "customer-report-aggregate",
  "A real-PostgreSQL test must pin report review versus regeneration concurrency"
);

requireNotIncludes(
  "docs/architecture/app-blueprint.md",
  "approved service-location opportunity",
  "opportunity-page-handoff",
  "Page Proposal handoff must not invent an opportunity-approval state that the product does not persist"
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
