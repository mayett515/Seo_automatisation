import { sql } from "drizzle-orm";
import {
  agentRunEventTypes,
  agentRunEvidenceRoles,
  agentRunEvidenceSourceKinds,
  agentRunStepKinds,
  agentRunStepStatuses,
  agentRunStatuses,
  agentWorkflowNames,
  jobStatuses,
  knowledgeLinkKinds,
  knowledgeModelUsePolicies,
  knowledgeSourceKinds,
  knowledgeTaskScopes,
  knowledgeVersionStatuses,
  opportunityClassifications,
  opportunityEvidenceReadiness,
  opportunityLanes,
  opportunityLifecycleStatuses,
  opportunityRankingMilestones,
  opportunityResearchStatuses,
  opportunityValueBands,
  rankingProofStatuses,
  reasoningTasks,
  serpSnapshotStatuses
} from "@localseo/contracts";
import type {
  PublicWebSearchItem,
  SerpArtifactRef,
  SerpEngineError,
  SerpFeature,
  SerpSearchResult
} from "@localseo/contracts";
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { timestamps } from "./common.js";
import { users } from "./identity.js";
import { areas, leads, projects, services } from "./projects.js";
export const jobStatusEnum = pgEnum("job_status", jobStatuses);
export const agentTaskEnum = pgEnum("agent_task", reasoningTasks);
export const agentRunStatusEnum = pgEnum("agent_run_status", agentRunStatuses);
export const agentWorkflowNameEnum = pgEnum("agent_workflow_name", agentWorkflowNames);
export const agentRunStepKindEnum = pgEnum("agent_run_step_kind", agentRunStepKinds);
export const agentRunStepStatusEnum = pgEnum("agent_run_step_status", agentRunStepStatuses);
export const agentRunEventTypeEnum = pgEnum("agent_run_event_type", agentRunEventTypes);
export const agentRunEvidenceSourceKindEnum = pgEnum("agent_run_evidence_source_kind", agentRunEvidenceSourceKinds);
export const agentRunEvidenceRoleEnum = pgEnum("agent_run_evidence_role", agentRunEvidenceRoles);
export const opportunityClassificationEnum = pgEnum("opportunity_classification", opportunityClassifications);
export const opportunityLifecycleStatusEnum = pgEnum("opportunity_lifecycle_status", opportunityLifecycleStatuses);
export const opportunityRankingMilestoneEnum = pgEnum("opportunity_ranking_milestone", opportunityRankingMilestones);
export const opportunityEvidenceReadinessEnum = pgEnum("opportunity_evidence_readiness", opportunityEvidenceReadiness);
export const opportunityValueBandEnum = pgEnum("opportunity_value_band", opportunityValueBands);
export const opportunityLaneEnum = pgEnum("opportunity_lane", opportunityLanes);
export const opportunityResearchStatusEnum = pgEnum("opportunity_research_status", opportunityResearchStatuses);
export const serpSnapshotStatusEnum = pgEnum("serp_snapshot_status", serpSnapshotStatuses);
export const rankingProofStatusEnum = pgEnum("ranking_proof_status", rankingProofStatuses);
export const knowledgeVersionStatusEnum = pgEnum("knowledge_version_status", knowledgeVersionStatuses);
export const knowledgeSourceKindEnum = pgEnum("knowledge_source_kind", knowledgeSourceKinds);
export const knowledgeModelUsePolicyEnum = pgEnum("knowledge_model_use_policy", knowledgeModelUsePolicies);
export const knowledgeLinkKindEnum = pgEnum("knowledge_link_kind", knowledgeLinkKinds);
export const knowledgeTaskScopeEnum = pgEnum("knowledge_task_scope", knowledgeTaskScopes);
export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    subjectId: uuid("subject_id"),
    task: agentTaskEnum("task").notNull(),
    status: agentRunStatusEnum("status").notNull().default("queued"),
    workflowName: agentWorkflowNameEnum("workflow_name"),
    workflowVersion: text("workflow_version"),
    constraintProfileVersion: text("constraint_profile_version"),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id),
    triggerSource: text("trigger_source"),
    parentRunId: uuid("parent_run_id").references((): AnyPgColumn => agentRuns.id),
    idempotencyKey: text("idempotency_key"),
    inputSha256: text("input_sha256"),
    outputSha256: text("output_sha256"),
    failureCode: text("failure_code"),
    provider: text("provider"),
    model: text("model"),
    inputRef: text("input_ref"),
    outputJson: jsonb("output_json").$type<Record<string, unknown>>(),
    usageJson: jsonb("usage_json").$type<Record<string, unknown>>(),
    diagnosticsJson: jsonb("diagnostics_json").$type<Record<string, unknown>>(),
    latencyMs: integer("latency_ms"),
    executionEpoch: integer("execution_epoch").default(0).notNull(),
    executionClaimToken: text("execution_claim_token"),
    executionRecoveryCount: integer("execution_recovery_count").default(0).notNull(),
    recoveryCount: integer("recovery_count").default(0).notNull(),
    lastRecoveryAt: timestamp("last_recovery_at", { withTimezone: true }),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    index("agent_runs_project_task_status_idx").on(table.projectId, table.task, table.status, table.createdAt),
    uniqueIndex("agent_runs_id_project_idx").on(table.id, table.projectId),
    index("agent_runs_project_task_subject_status_idx").on(
      table.projectId,
      table.task,
      table.subjectId,
      table.status,
      table.createdAt
    ),
    index("agent_runs_recovery_scan_idx")
      .on(table.task, table.status, table.updatedAt)
      .where(
        sql`${table.task} in ('page_brief_draft', 'section_text_generation', 'opportunity_scout') and ${table.status} in ('queued', 'running')`
      ),
    uniqueIndex("agent_runs_active_per_project_task_subject_idx")
      .on(table.projectId, table.task, table.subjectId)
      .where(sql`${table.status} in ('queued', 'running') and ${table.subjectId} is not null`),
    uniqueIndex("agent_runs_active_per_project_task_null_subject_idx")
      .on(table.projectId, table.task)
      .where(sql`${table.status} in ('queued', 'running') and ${table.subjectId} is null`),
    uniqueIndex("agent_runs_project_idempotency_idx")
      .on(table.projectId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    check(
      "agent_runs_workflow_identity_check",
      sql`(${table.workflowName} is null and ${table.workflowVersion} is null and ${table.constraintProfileVersion} is null and ${table.inputSha256} is null and ${table.outputSha256} is null) or (${table.workflowName} is not null and ${table.workflowVersion} is not null and ${table.constraintProfileVersion} is not null and ${table.inputSha256} is not null and ${table.inputSha256} ~ '^[0-9a-f]{64}$' and (${table.outputSha256} is null or ${table.outputSha256} ~ '^[0-9a-f]{64}$'))`
    ),
    check(
      "agent_runs_workflow_success_digest_check",
      sql`${table.workflowName} is null or ${table.status} <> 'succeeded' or ${table.outputSha256} is not null`
    ),
    check(
      "agent_runs_execution_epoch_check",
      sql`(${table.executionEpoch} = 0 and ${table.executionClaimToken} is null and ${table.executionRecoveryCount} = 0) or (${table.executionEpoch} > 0 and ${table.executionClaimToken} is not null and ${table.executionRecoveryCount} between 0 and ${table.recoveryCount})`
    )
  ]
);

export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id),
    areaId: uuid("area_id").references(() => areas.id),
    serviceId: uuid("service_id").references(() => services.id),
    classification: opportunityClassificationEnum("classification"),
    primaryKeyword: text("primary_keyword").notNull(),
    score: integer("score"),
    rankingMilestone: opportunityRankingMilestoneEnum("ranking_milestone"),
    evidenceReadiness: opportunityEvidenceReadinessEnum("evidence_readiness"),
    businessValue: opportunityValueBandEnum("business_value"),
    marketDifficulty: opportunityValueBandEnum("market_difficulty"),
    executionEffort: opportunityValueBandEnum("execution_effort"),
    lane: opportunityLaneEnum("lane"),
    policyVersion: text("policy_version"),
    researchMaterialDigest: text("research_material_digest"),
    candidateKey: text("candidate_key"),
    portfolioSelected: boolean("portfolio_selected").notNull().default(false),
    portfolioOrder: integer("portfolio_order"),
    status: opportunityLifecycleStatusEnum("status").default("new").notNull(),
    rowVersion: integer("row_version").default(0).notNull(),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id),
    statusReason: text("status_reason"),
    evidenceJson: jsonb("evidence_json").$type<Record<string, unknown>>(),
    ...timestamps
  },
  (table) => [
    check("opportunities_row_version_check", sql`${table.rowVersion} >= 0`),
    check(
      "opportunities_research_axes_check",
      sql`(${table.policyVersion} is null and ${table.rankingMilestone} is null and ${table.evidenceReadiness} is null and ${table.businessValue} is null and ${table.marketDifficulty} is null and ${table.executionEffort} is null and ${table.lane} is null and ${table.candidateKey} is null and ${table.researchMaterialDigest} is null) or (${table.policyVersion} is not null and ${table.rankingMilestone} is not null and ${table.evidenceReadiness} is not null and ${table.businessValue} is not null and ${table.marketDifficulty} is not null and ${table.executionEffort} is not null and ${table.lane} is not null and ${table.candidateKey} is not null and ${table.researchMaterialDigest} is not null and ${table.researchMaterialDigest} ~ '^[0-9a-f]{64}$')`
    ),
    check(
      "opportunities_portfolio_order_check",
      sql`(${table.portfolioSelected} = false and ${table.portfolioOrder} is null) or (${table.portfolioSelected} = true and ${table.portfolioOrder} between 1 and 8)`
    ),
    uniqueIndex("opportunities_project_candidate_key_idx")
      .on(table.projectId, table.candidateKey)
      .where(sql`${table.candidateKey} is not null and ${table.status} <> 'rejected'`),
    uniqueIndex("opportunities_run_portfolio_order_idx")
      .on(table.agentRunId, table.portfolioOrder)
      .where(sql`${table.agentRunId} is not null and ${table.portfolioOrder} is not null`)
  ]
);

export const rankingProofs = pgTable(
  "ranking_proofs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    query: text("query").notNull(),
    pageUrl: text("page_url").notNull(),
    rank: integer("rank").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    searchEngine: text("search_engine").notNull().default("google"),
    device: text("device").notNull().default("desktop"),
    locale: text("locale"),
    screenshotArtifactKey: text("screenshot_artifact_key"),
    notes: text("notes"),
    status: rankingProofStatusEnum("status").notNull().default("captured"),
    rowVersion: integer("row_version").notNull().default(0),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id),
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
    invalidatedByUserId: uuid("invalidated_by_user_id").references(() => users.id),
    invalidationReason: text("invalidation_reason"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    evidenceJson: jsonb("evidence_json").$type<Record<string, unknown>>(),
    ...timestamps
  },
  (table) => [
    index("ranking_proofs_project_status_captured_idx").on(table.projectId, table.status, table.capturedAt),
    index("ranking_proofs_project_query_idx").on(table.projectId, table.query),
    check("ranking_proofs_row_version_check", sql`${table.rowVersion} >= 0`),
    check(
      "ranking_proofs_lifecycle_evidence_check",
      sql`(${table.status} = 'captured' and ${table.reviewedAt} is null and ${table.reviewedByUserId} is null and ${table.invalidatedAt} is null and ${table.invalidatedByUserId} is null and ${table.invalidationReason} is null) or (${table.status} = 'reviewed' and ${table.reviewedAt} is not null and ${table.reviewedByUserId} is not null and ${table.invalidatedAt} is null and ${table.invalidatedByUserId} is null and ${table.invalidationReason} is null) or (${table.status} = 'invalidated' and ${table.reviewedAt} is not null and ${table.reviewedByUserId} is not null and ${table.invalidatedAt} is not null and ${table.invalidatedByUserId} is not null and ${table.invalidationReason} is not null)`
    )
  ]
);

export const serpSnapshots = pgTable(
  "serp_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id),
    status: serpSnapshotStatusEnum("status").notNull().default("captured"),
    query: text("query").notNull(),
    searchEngine: text("search_engine").notNull().default("google"),
    device: text("device").notNull().default("desktop"),
    locale: text("locale"),
    region: text("region"),
    cacheKey: text("cache_key").notNull(),
    provider: text("provider"),
    resultsJson: jsonb("results_json").$type<SerpSearchResult[]>().default([]).notNull(),
    serpFeaturesJson: jsonb("serp_features_json").$type<SerpFeature[]>().default([]).notNull(),
    engineErrorsJson: jsonb("engine_errors_json").$type<SerpEngineError[]>().default([]).notNull(),
    artifactRefsJson: jsonb("artifact_refs_json").$type<SerpArtifactRef[]>().default([]).notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    ...timestamps
  },
  (table) => [
    index("serp_snapshots_project_query_captured_idx").on(table.projectId, table.query, table.capturedAt),
    index("serp_snapshots_project_cache_idx").on(table.projectId, table.cacheKey),
    index("serp_snapshots_agent_run_idx").on(table.agentRunId)
  ]
);

export const projectKnowledgeDocuments = pgTable(
  "project_knowledge_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    documentKey: text("document_key").notNull(),
    currentApprovedVersionId: uuid("current_approved_version_id"),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    retiredByUserId: uuid("retired_by_user_id").references(() => users.id),
    retirementReason: text("retirement_reason"),
    ...timestamps
  },
  (table) => [
    uniqueIndex("project_knowledge_documents_project_key_idx").on(table.projectId, table.documentKey),
    uniqueIndex("project_knowledge_documents_id_project_idx").on(table.id, table.projectId),
    check("project_knowledge_documents_key_check", sql`${table.documentKey} ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'`),
    check(
      "project_knowledge_documents_retirement_check",
      sql`(${table.retiredAt} is null and ${table.retiredByUserId} is null and ${table.retirementReason} is null) or (${table.retiredAt} is not null and ${table.retiredByUserId} is not null and ${table.retirementReason} is not null and ${table.currentApprovedVersionId} is null)`
    )
  ]
);

export const projectKnowledgeVersions = pgTable(
  "project_knowledge_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => projectKnowledgeDocuments.id),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    bodyMarkdown: text("body_markdown").notNull(),
    status: knowledgeVersionStatusEnum("status").notNull().default("proposed"),
    sourceKind: knowledgeSourceKindEnum("source_kind").notNull(),
    modelUsePolicy: knowledgeModelUsePolicyEnum("model_use_policy").notNull().default("operator_only"),
    sourceId: uuid("source_id"),
    sourceAgentRunId: uuid("source_agent_run_id").references(() => agentRuns.id),
    contentSha256: text("content_sha256").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("project_knowledge_versions_document_version_idx").on(table.documentId, table.version),
    uniqueIndex("project_knowledge_versions_id_project_idx").on(table.id, table.projectId),
    index("project_knowledge_versions_project_status_idx").on(table.projectId, table.status, table.createdAt),
    index("project_knowledge_versions_simple_fts_idx").using(
      "gin",
      sql`to_tsvector('simple', ${table.title} || ' ' || ${table.bodyMarkdown})`
    ),
    check("project_knowledge_versions_version_check", sql`${table.version} > 0`),
    check("project_knowledge_versions_sha256_check", sql`${table.contentSha256} ~ '^[0-9a-f]{64}$'`),
    check(
      "project_knowledge_versions_source_check",
      sql`(${table.sourceKind} = 'agent' and ${table.sourceAgentRunId} is not null and ${table.createdByUserId} is null) or (${table.sourceKind} <> 'agent' and ${table.sourceAgentRunId} is null and ${table.createdByUserId} is not null)`
    ),
    check(
      "project_knowledge_versions_review_check",
      sql`(${table.status} = 'proposed' and ${table.reviewedByUserId} is null and ${table.reviewedAt} is null and ${table.rejectionReason} is null) or (${table.status} = 'approved' and ${table.reviewedByUserId} is not null and ${table.reviewedAt} is not null and ${table.rejectionReason} is null) or (${table.status} = 'rejected' and ${table.reviewedByUserId} is not null and ${table.reviewedAt} is not null and ${table.rejectionReason} is not null)`
    )
  ]
);

export const projectKnowledgeTaskScopes = pgTable(
  "project_knowledge_task_scopes",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    versionId: uuid("version_id")
      .notNull()
      .references(() => projectKnowledgeVersions.id, { onDelete: "cascade" }),
    taskScope: knowledgeTaskScopeEnum("task_scope").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    primaryKey({ columns: [table.versionId, table.taskScope] }),
    index("project_knowledge_scopes_project_idx").on(table.projectId, table.taskScope)
  ]
);

export const projectKnowledgeLinks = pgTable(
  "project_knowledge_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    fromVersionId: uuid("from_version_id")
      .notNull()
      .references(() => projectKnowledgeVersions.id),
    toVersionId: uuid("to_version_id")
      .notNull()
      .references(() => projectKnowledgeVersions.id),
    kind: knowledgeLinkKindEnum("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("project_knowledge_links_identity_idx").on(table.fromVersionId, table.toVersionId, table.kind),
    check("project_knowledge_links_not_self_check", sql`${table.fromVersionId} <> ${table.toVersionId}`)
  ]
);

export const publicWebSearchCaptures = pgTable(
  "public_web_search_captures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    agentRunId: uuid("agent_run_id")
      .notNull()
      .references(() => agentRuns.id),
    executionEpoch: integer("execution_epoch").notNull(),
    query: text("query").notNull(),
    provider: text("provider").notNull().default("duckduckgo_html"),
    requestedLocale: text("requested_locale").notNull(),
    requestedRegion: text("requested_region"),
    maxResults: integer("max_results").notNull().default(5),
    effectiveLocale: text("effective_locale").notNull(),
    observedLocale: text("observed_locale"),
    researchOrdinal: integer("research_ordinal").notNull(),
    round: integer("round").notNull(),
    status: text("status").notNull(),
    failureCode: text("failure_code"),
    resultsJson: jsonb("results_json").$type<PublicWebSearchItem[]>().default([]).notNull(),
    evidencePolicy: text("evidence_policy").notNull().default("research_support_only"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("public_web_search_captures_run_ordinal_idx").on(table.agentRunId, table.researchOrdinal),
    index("public_web_search_captures_project_captured_idx").on(table.projectId, table.capturedAt),
    check("public_web_search_captures_provider_check", sql`${table.provider} = 'duckduckgo_html'`),
    check("public_web_search_captures_ordinal_check", sql`${table.researchOrdinal} between 1 and 12`),
    check("public_web_search_captures_max_results_check", sql`${table.maxResults} between 1 and 5`),
    check("public_web_search_captures_round_check", sql`${table.round} between 1 and 2`),
    check(
      "public_web_search_captures_status_check",
      sql`(${table.status} = 'succeeded' and ${table.failureCode} is null) or (${table.status} = 'failed' and ${table.failureCode} in ('provider_timeout', 'provider_unavailable', 'provider_blocked', 'invalid_response', 'policy_denied'))`
    ),
    check("public_web_search_captures_evidence_policy_check", sql`${table.evidencePolicy} = 'research_support_only'`),
    foreignKey({
      columns: [table.agentRunId, table.projectId],
      foreignColumns: [agentRuns.id, agentRuns.projectId],
      name: "public_web_search_captures_run_project_fk"
    })
  ]
);

export const projectOpportunityResearchStates = pgTable(
  "project_opportunity_research_states",
  {
    projectId: uuid("project_id")
      .primaryKey()
      .references(() => projects.id),
    status: opportunityResearchStatusEnum("status").notNull().default("idle"),
    rowVersion: integer("row_version").notNull().default(0),
    materialDigest: text("material_digest"),
    materialDirty: boolean("material_dirty").notNull().default(false),
    lastSuccessfulDigest: text("last_successful_digest"),
    activeRunId: uuid("active_run_id").references(() => agentRuns.id),
    nextScheduledAt: timestamp("next_scheduled_at", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    pausedByUserId: uuid("paused_by_user_id").references(() => users.id),
    pauseReason: text("pause_reason"),
    portfolioShortfallsJson: jsonb("portfolio_shortfalls_json")
      .$type<{ defendAdvance: number; quickBuild: number; strategic: number }>()
      .default({ defendAdvance: 2, quickBuild: 4, strategic: 2 })
      .notNull(),
    ...timestamps
  },
  (table) => [
    index("project_opportunity_research_scan_idx").on(table.status, table.nextScheduledAt, table.updatedAt),
    check("project_opportunity_research_row_version_check", sql`${table.rowVersion} >= 0`),
    check(
      "project_opportunity_research_digest_check",
      sql`(${table.materialDigest} is null or ${table.materialDigest} ~ '^[0-9a-f]{64}$') and (${table.lastSuccessfulDigest} is null or ${table.lastSuccessfulDigest} ~ '^[0-9a-f]{64}$')`
    ),
    check(
      "project_opportunity_research_pause_check",
      sql`((${table.pausedAt} is null and ${table.pausedByUserId} is null and ${table.pauseReason} is null) or (${table.pausedAt} is not null and ${table.pausedByUserId} is not null and ${table.pauseReason} is not null)) and (${table.status} <> 'paused' or ${table.pausedAt} is not null)`
    ),
    check(
      "project_opportunity_research_active_run_check",
      sql`(${table.status} in ('queued', 'running') and ${table.activeRunId} is not null) or (${table.status} not in ('queued', 'running') and ${table.activeRunId} is null)`
    ),
    foreignKey({
      columns: [table.activeRunId, table.projectId],
      foreignColumns: [agentRuns.id, agentRuns.projectId],
      name: "project_opportunity_research_active_run_project_fk"
    })
  ]
);

export const agentRunSteps = pgTable(
  "agent_run_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    agentRunId: uuid("agent_run_id")
      .notNull()
      .references(() => agentRuns.id),
    stepKey: text("step_key").notNull(),
    stepKind: agentRunStepKindEnum("step_kind").notNull(),
    status: agentRunStepStatusEnum("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    executionEpoch: integer("execution_epoch").notNull().default(0),
    rowVersion: integer("row_version").notNull().default(0),
    agentRole: text("agent_role"),
    toolKey: text("tool_key"),
    provider: text("provider"),
    model: text("model"),
    inputRef: text("input_ref"),
    inputSha256: text("input_sha256"),
    outputRef: text("output_ref"),
    outputSha256: text("output_sha256"),
    outputCanonicalText: text("output_canonical_text"),
    outputJson: jsonb("output_json").$type<Record<string, unknown>>(),
    usageJson: jsonb("usage_json").$type<Record<string, unknown>>(),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    uniqueIndex("agent_run_steps_run_key_idx").on(table.agentRunId, table.stepKey),
    uniqueIndex("agent_run_steps_id_run_project_idx").on(table.id, table.agentRunId, table.projectId),
    index("agent_run_steps_run_status_idx").on(table.agentRunId, table.status, table.createdAt),
    check("agent_run_steps_attempt_check", sql`${table.attemptCount} between 0 and 20`),
    check("agent_run_steps_execution_epoch_check", sql`${table.executionEpoch} >= 0`),
    check("agent_run_steps_row_version_check", sql`${table.rowVersion} >= 0`),
    check(
      "agent_run_steps_identity_check",
      sql`(${table.stepKind} = 'agent' and ${table.agentRole} is not null and ${table.toolKey} is null) or (${table.stepKind} = 'tool' and ${table.toolKey} is not null and ${table.agentRole} is null) or (${table.stepKind} not in ('agent', 'tool') and ${table.agentRole} is null and ${table.toolKey} is null)`
    ),
    check(
      "agent_run_steps_terminal_evidence_check",
      sql`(${table.status} in ('pending', 'running') and ${table.completedAt} is null and ${table.failureCode} is null and ${table.failureMessage} is null and ${table.outputCanonicalText} is null) or (${table.status} = 'succeeded' and ${table.completedAt} is not null and ${table.failureCode} is null and ${table.failureMessage} is null and ${table.outputCanonicalText} is not null and ${table.outputSha256} is not null and ${table.outputSha256} ~ '^[0-9a-f]{64}$') or (${table.status} = 'failed' and ${table.completedAt} is not null and ${table.failureCode} is not null and ${table.failureMessage} is not null and ${table.outputCanonicalText} is null) or (${table.status} = 'skipped' and ${table.completedAt} is not null and ${table.failureCode} is null and ${table.failureMessage} is null and ${table.outputCanonicalText} is null)`
    ),
    foreignKey({
      columns: [table.agentRunId, table.projectId],
      foreignColumns: [agentRuns.id, agentRuns.projectId],
      name: "agent_run_steps_run_project_fk"
    })
  ]
);

export const agentRunEvents = pgTable(
  "agent_run_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    agentRunId: uuid("agent_run_id")
      .notNull()
      .references(() => agentRuns.id),
    agentRunStepId: uuid("agent_run_step_id").references(() => agentRunSteps.id),
    sequence: integer("sequence").generatedAlwaysAsIdentity(),
    eventKey: text("event_key").notNull(),
    eventType: agentRunEventTypeEnum("event_type").notNull(),
    executionEpoch: integer("execution_epoch").notNull().default(0),
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().default({}).notNull(),
    artifactRef: text("artifact_ref"),
    artifactSha256: text("artifact_sha256"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("agent_run_events_run_key_idx").on(table.agentRunId, table.eventKey),
    index("agent_run_events_run_sequence_idx").on(table.agentRunId, table.sequence),
    check("agent_run_events_execution_epoch_check", sql`${table.executionEpoch} >= 0`),
    check(
      "agent_run_events_artifact_check",
      sql`(${table.artifactRef} is null and ${table.artifactSha256} is null) or (${table.artifactRef} is not null and ${table.artifactSha256} is not null and ${table.artifactSha256} ~ '^[0-9a-f]{64}$')`
    ),
    foreignKey({
      columns: [table.agentRunId, table.projectId],
      foreignColumns: [agentRuns.id, agentRuns.projectId],
      name: "agent_run_events_run_project_fk"
    }),
    foreignKey({
      columns: [table.agentRunStepId, table.agentRunId, table.projectId],
      foreignColumns: [agentRunSteps.id, agentRunSteps.agentRunId, agentRunSteps.projectId],
      name: "agent_run_events_step_run_project_fk"
    })
  ]
);

export const agentRunEvidenceItems = pgTable(
  "agent_run_evidence_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    agentRunId: uuid("agent_run_id")
      .notNull()
      .references(() => agentRuns.id),
    evidenceKey: text("evidence_key").notNull(),
    sourceKind: agentRunEvidenceSourceKindEnum("source_kind").notNull(),
    sourceId: uuid("source_id").notNull(),
    sourceVersion: text("source_version").notNull(),
    executionEpoch: integer("execution_epoch").notNull().default(0),
    payloadSha256: text("payload_sha256").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    proofTier: text("proof_tier").notNull(),
    evidenceJson: jsonb("evidence_json").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("agent_run_evidence_run_key_idx").on(table.agentRunId, table.evidenceKey),
    uniqueIndex("agent_run_evidence_id_run_project_idx").on(table.id, table.agentRunId, table.projectId),
    index("agent_run_evidence_source_idx").on(table.projectId, table.sourceKind, table.sourceId),
    check("agent_run_evidence_execution_epoch_check", sql`${table.executionEpoch} > 0`),
    check("agent_run_evidence_sha256_check", sql`${table.payloadSha256} ~ '^[0-9a-f]{64}$'`),
    check(
      "agent_run_evidence_proof_tier_check",
      sql`${table.proofTier} in ('internal_signal', 'supporting_context', 'customer_safe_proof')`
    ),
    foreignKey({
      columns: [table.agentRunId, table.projectId],
      foreignColumns: [agentRuns.id, agentRuns.projectId],
      name: "agent_run_evidence_run_project_fk"
    })
  ]
);

export const agentRunStepEvidenceLinks = pgTable(
  "agent_run_step_evidence_links",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    agentRunId: uuid("agent_run_id")
      .notNull()
      .references(() => agentRuns.id),
    agentRunStepId: uuid("agent_run_step_id")
      .notNull()
      .references(() => agentRunSteps.id),
    evidenceItemId: uuid("evidence_item_id")
      .notNull()
      .references(() => agentRunEvidenceItems.id),
    role: agentRunEvidenceRoleEnum("role").notNull(),
    ordinal: integer("ordinal").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    primaryKey({ columns: [table.agentRunStepId, table.evidenceItemId, table.role] }),
    uniqueIndex("agent_run_step_evidence_order_idx").on(table.agentRunStepId, table.role, table.ordinal),
    check("agent_run_step_evidence_ordinal_check", sql`${table.ordinal} >= 0`),
    foreignKey({
      columns: [table.agentRunStepId, table.agentRunId, table.projectId],
      foreignColumns: [agentRunSteps.id, agentRunSteps.agentRunId, agentRunSteps.projectId],
      name: "agent_run_step_evidence_step_run_project_fk"
    }),
    foreignKey({
      columns: [table.evidenceItemId, table.agentRunId, table.projectId],
      foreignColumns: [agentRunEvidenceItems.id, agentRunEvidenceItems.agentRunId, agentRunEvidenceItems.projectId],
      name: "agent_run_step_evidence_item_run_project_fk"
    })
  ]
);
export const jobRuns = pgTable(
  "job_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id),
    leadId: uuid("lead_id").references(() => leads.id),
    externalJobId: text("external_job_id"),
    queueName: text("queue_name"),
    type: text("type").notNull(),
    status: jobStatusEnum("status").notNull().default("queued"),
    inputRef: text("input_ref"),
    actorType: text("actor_type").notNull().default("system"),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    triggerSource: text("trigger_source"),
    failureJson: jsonb("failure_json").$type<Record<string, unknown>>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [uniqueIndex("job_runs_external_queue_idx").on(table.externalJobId, table.queueName)]
);
