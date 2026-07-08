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
  'source: "release_verify_worker"',
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
