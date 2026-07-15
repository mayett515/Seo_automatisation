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
