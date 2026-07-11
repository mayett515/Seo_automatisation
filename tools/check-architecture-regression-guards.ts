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
  ".ai-project-rules/15-architecture-regression-guards.md",
  'rule_budget: "guard-exception"',
  "rule-routing",
  "rule 15 must declare its intentional guard-exception rule budget"
);

requireIncludes(
  ".ai-project-rules/15-architecture-regression-guards.md",
  'anti_regression_mode: "hybrid-boundary"',
  "rule-routing",
  "rule 15 must declare its intentional hybrid anti-regression mode"
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
  "continues loading the other lane when one candidate query fails",
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
  "pageVersionIds: z.array(z.string().min(1)).min(1)",
  "page-release-planning",
  "Release-plan creation requests must include at least one page version id"
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
  'row.pageVersionStatus !== "approved" || !row.pageVersionApprovedAt',
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
