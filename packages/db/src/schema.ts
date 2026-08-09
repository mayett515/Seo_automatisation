import { relations, sql } from "drizzle-orm";
import {
  approvalStatuses,
  agentRunEventTypes,
  agentRunEvidenceRoles,
  agentRunEvidenceSourceKinds,
  agentRunStepKinds,
  agentRunStepStatuses,
  agentWorkflowNames,
  businessProfileStatuses,
  canonicalEntitySourceKinds,
  canonicalEntityStatuses,
  customerReportClaimKinds,
  customerReportEvidenceKinds,
  customerReportArtifactFormats,
  customerReportArtifactStatuses,
  customerReportEvidenceAlertStatuses,
  customerReportGenerationStatuses,
  customerReportKinds,
  customerReportLifecycleEventTypes,
  customerReportNarrativeModes,
  customerReportSections,
  customerReportStatuses,
  customerMembershipRoles,
  deploymentStatuses,
  agentRunStatuses,
  opportunityClassifications,
  opportunityLifecycleStatuses,
  gscConnectionStatuses,
  gscOpportunitySignalStatuses,
  gscOpportunitySignalTypes,
  gscSyncStatuses,
  jobStatuses,
  mediaAssetStatuses,
  knowledgeLinkKinds,
  knowledgeModelUsePolicies,
  knowledgeSourceKinds,
  knowledgeTaskScopes,
  knowledgeVersionStatuses,
  opportunityEvidenceReadiness,
  opportunityLanes,
  opportunityRankingMilestones,
  opportunityResearchStatuses,
  opportunityValueBands,
  providerOperationStatuses,
  pageVersionStatuses,
  reasoningTasks,
  releaseCheckResults,
  releaseCheckSeverities,
  releaseItemActions,
  releaseNoteAudiences,
  pageSectionNoteInstructionTypes,
  releasePlanStatuses,
  releaseVerificationStatuses,
  rankingProofStatuses,
  sectionCopySuggestionStatuses,
  serpSnapshotStatuses,
  technicalAuditFindingCategories,
  technicalAuditFindingSeverities,
  technicalAuditStatuses,
  websiteImportStatuses
} from "@localseo/contracts";
import type {
  CustomerReportClaim,
  CustomerReportEvidenceItem,
  CustomerReportHtmlRenderManifest,
  PageJson,
  PageProposalJson,
  PageSectionNoteFieldPath,
  SerpArtifactRef,
  SerpEngineError,
  SerpFeature,
  SerpSearchResult,
  ProjectBusinessProfileContent,
  PublicWebSearchItem
} from "@localseo/contracts";
import {
  type AnyPgColumn,
  boolean,
  check,
  doublePrecision,
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
export const businessProfileStatusEnum = pgEnum("business_profile_status", businessProfileStatuses);
export const canonicalEntityStatusEnum = pgEnum("canonical_entity_status", canonicalEntityStatuses);
export const canonicalEntitySourceKindEnum = pgEnum("canonical_entity_source_kind", canonicalEntitySourceKinds);
export const knowledgeVersionStatusEnum = pgEnum("knowledge_version_status", knowledgeVersionStatuses);
export const knowledgeSourceKindEnum = pgEnum("knowledge_source_kind", knowledgeSourceKinds);
export const knowledgeModelUsePolicyEnum = pgEnum("knowledge_model_use_policy", knowledgeModelUsePolicies);
export const knowledgeLinkKindEnum = pgEnum("knowledge_link_kind", knowledgeLinkKinds);
export const knowledgeTaskScopeEnum = pgEnum("knowledge_task_scope", knowledgeTaskScopes);
export const technicalAuditStatusEnum = pgEnum("technical_audit_status", technicalAuditStatuses);
export const technicalAuditFindingSeverityEnum = pgEnum(
  "technical_audit_finding_severity",
  technicalAuditFindingSeverities
);
export const technicalAuditFindingCategoryEnum = pgEnum(
  "technical_audit_finding_category",
  technicalAuditFindingCategories
);
export const releaseStatusEnum = pgEnum("release_status", releasePlanStatuses);
export const deploymentStatusEnum = pgEnum("deployment_status", deploymentStatuses);
export const providerOperationStatusEnum = pgEnum("provider_operation_status", providerOperationStatuses);
export const releaseVerificationStatusEnum = pgEnum("release_verification_status", releaseVerificationStatuses);
export const gscConnectionStatusEnum = pgEnum("gsc_connection_status", gscConnectionStatuses);
export const gscSyncStatusEnum = pgEnum("gsc_sync_status", gscSyncStatuses);
export const websiteImportStatusEnum = pgEnum("website_import_status", websiteImportStatuses);
export const gscOpportunitySignalTypeEnum = pgEnum("gsc_opportunity_signal_type", gscOpportunitySignalTypes);
export const gscOpportunitySignalStatusEnum = pgEnum("gsc_opportunity_signal_status", gscOpportunitySignalStatuses);
export const releaseNoteAudienceEnum = pgEnum("release_note_audience", releaseNoteAudiences);
export const releaseSeverityEnum = pgEnum("release_check_severity", releaseCheckSeverities);
export const releaseCheckResultEnum = pgEnum("release_check_result", releaseCheckResults);
export const releaseItemActionEnum = pgEnum("release_item_action", releaseItemActions);
export const pageVersionStatusEnum = pgEnum("page_version_status", pageVersionStatuses);
export const pageSectionNoteInstructionTypeEnum = pgEnum(
  "page_section_note_instruction_type",
  pageSectionNoteInstructionTypes
);
export const sectionCopySuggestionStatusEnum = pgEnum("section_copy_suggestion_status", sectionCopySuggestionStatuses);
export const mediaAssetStatusEnum = pgEnum("media_asset_status", mediaAssetStatuses);
export const approvalStatusEnum = pgEnum("approval_status", approvalStatuses);
export const customerMembershipRoleEnum = pgEnum("customer_membership_role", customerMembershipRoles);
export const customerReportKindEnum = pgEnum("customer_report_kind", customerReportKinds);
export const customerReportStatusEnum = pgEnum("customer_report_status", customerReportStatuses);
export const customerReportGenerationStatusEnum = pgEnum(
  "customer_report_generation_status",
  customerReportGenerationStatuses
);
export const customerReportNarrativeModeEnum = pgEnum("customer_report_narrative_mode", customerReportNarrativeModes);
export const customerReportClaimKindEnum = pgEnum("customer_report_claim_kind", customerReportClaimKinds);
export const customerReportSectionEnum = pgEnum("customer_report_section", customerReportSections);
export const customerReportEvidenceKindEnum = pgEnum("customer_report_evidence_kind", customerReportEvidenceKinds);
export const customerReportLifecycleEventTypeEnum = pgEnum(
  "customer_report_lifecycle_event_type",
  customerReportLifecycleEventTypes
);
export const customerReportArtifactStatusEnum = pgEnum(
  "customer_report_artifact_status",
  customerReportArtifactStatuses
);
export const customerReportArtifactFormatEnum = pgEnum(
  "customer_report_artifact_format",
  customerReportArtifactFormats
);
export const customerReportEvidenceAlertStatusEnum = pgEnum(
  "customer_report_evidence_alert_status",
  customerReportEvidenceAlertStatuses
);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull().default(""),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  ...timestamps
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...timestamps
  },
  (table) => [uniqueIndex("sessions_token_idx").on(table.token), index("sessions_user_idx").on(table.userId)]
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    ...timestamps
  },
  (table) => [
    uniqueIndex("accounts_provider_account_idx").on(table.providerId, table.accountId),
    index("accounts_user_idx").on(table.userId)
  ]
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)]
);

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  name: text("name").notNull(),
  ...timestamps
});

export const customerMemberships = pgTable(
  "customer_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: customerMembershipRoleEnum("role").notNull().default("viewer"),
    ...timestamps
  },
  (table) => [
    uniqueIndex("customer_memberships_customer_user_idx").on(table.customerId, table.userId),
    index("customer_memberships_user_idx").on(table.userId)
  ]
);

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  websiteUrl: text("website_url").notNull(),
  businessName: text("business_name"),
  services: jsonb("services").$type<string[]>().default([]).notNull(),
  targetAreas: jsonb("target_areas").$type<string[]>().default([]).notNull(),
  convertedCustomerId: uuid("converted_customer_id").references(() => customers.id),
  ...timestamps
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  ...timestamps
});

export const projectTrackingKeys = pgTable(
  "project_tracking_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    keyHash: text("key_hash").notNull(),
    allowedOrigins: jsonb("allowed_origins").$type<string[]>().default([]).notNull(),
    status: text("status").notNull().default("active"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    uniqueIndex("project_tracking_keys_hash_idx").on(table.keyHash),
    index("project_tracking_keys_project_status_idx").on(table.projectId, table.status)
  ]
);

export const mainWebsites = pgTable("main_websites", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  sourceUrl: text("source_url").notNull(),
  hostingSiteId: text("hosting_site_id"),
  ...timestamps
});

export const websiteImportRuns = pgTable(
  "website_import_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    mainWebsiteId: uuid("main_website_id").references(() => mainWebsites.id),
    sourceUrl: text("source_url").notNull(),
    status: websiteImportStatusEnum("status").notNull().default("queued"),
    artifactKey: text("artifact_key"),
    summaryJson: jsonb("summary_json").$type<Record<string, unknown>>(),
    failureJson: jsonb("failure_json").$type<Record<string, unknown>>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    index("website_import_runs_project_status_idx").on(table.projectId, table.status, table.createdAt),
    index("website_import_runs_main_website_idx").on(table.mainWebsiteId)
  ]
);

export const technicalAuditRuns = pgTable(
  "technical_audit_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    sourceUrl: text("source_url").notNull(),
    status: technicalAuditStatusEnum("status").notNull().default("queued"),
    artifactKey: text("artifact_key"),
    summaryJson: jsonb("summary_json").$type<Record<string, unknown>>(),
    failureJson: jsonb("failure_json").$type<Record<string, unknown>>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [index("technical_audit_runs_project_status_idx").on(table.projectId, table.status, table.createdAt)]
);

export const technicalAuditFindings = pgTable(
  "technical_audit_findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    auditRunId: uuid("audit_run_id")
      .notNull()
      .references(() => technicalAuditRuns.id, { onDelete: "cascade" }),
    checkKey: text("check_key").notNull(),
    category: technicalAuditFindingCategoryEnum("category").notNull(),
    severity: technicalAuditFindingSeverityEnum("severity").notNull(),
    route: text("route"),
    pageUrl: text("page_url"),
    message: text("message").notNull(),
    evidenceJson: jsonb("evidence_json").$type<Record<string, unknown>>().default({}).notNull(),
    ...timestamps
  },
  (table) => [
    index("technical_audit_findings_run_idx").on(table.auditRunId),
    index("technical_audit_findings_project_severity_idx").on(table.projectId, table.severity, table.createdAt)
  ]
);

export const domains = pgTable("domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  hostname: text("hostname").notNull(),
  isPrimary: boolean("is_primary").default(false).notNull(),
  ...timestamps
});

export const areas = pgTable(
  "areas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("city"),
    status: canonicalEntityStatusEnum("status").notNull().default("proposed"),
    sourceKind: canonicalEntitySourceKindEnum("source_kind").notNull().default("manual"),
    sourceId: uuid("source_id"),
    rowVersion: integer("row_version").notNull().default(0),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    confirmedByUserId: uuid("confirmed_by_user_id").references(() => users.id),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    retiredByUserId: uuid("retired_by_user_id").references(() => users.id),
    ...timestamps
  },
  (table) => [
    check("areas_row_version_check", sql`${table.rowVersion} >= 0`),
    uniqueIndex("areas_project_normalized_name_idx").on(table.projectId, sql`lower(${table.name})`)
  ]
);

export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    name: text("name").notNull(),
    status: canonicalEntityStatusEnum("status").notNull().default("proposed"),
    sourceKind: canonicalEntitySourceKindEnum("source_kind").notNull().default("manual"),
    sourceId: uuid("source_id"),
    rowVersion: integer("row_version").notNull().default(0),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    confirmedByUserId: uuid("confirmed_by_user_id").references(() => users.id),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    retiredByUserId: uuid("retired_by_user_id").references(() => users.id),
    ...timestamps
  },
  (table) => [
    check("services_row_version_check", sql`${table.rowVersion} >= 0`),
    uniqueIndex("services_project_normalized_name_idx").on(table.projectId, sql`lower(${table.name})`)
  ]
);

export const projectBusinessProfileRevisions = pgTable(
  "project_business_profile_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    revision: integer("revision").notNull(),
    profileJson: jsonb("profile_json").$type<ProjectBusinessProfileContent>().notNull(),
    profileSha256: text("profile_sha256").notNull(),
    sourceImportRunId: uuid("source_import_run_id").references(() => websiteImportRuns.id),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("project_business_profile_revisions_project_revision_idx").on(table.projectId, table.revision),
    uniqueIndex("project_business_profile_revisions_id_project_idx").on(table.id, table.projectId),
    check("project_business_profile_revisions_revision_check", sql`${table.revision} > 0`),
    check("project_business_profile_revisions_sha256_check", sql`${table.profileSha256} ~ '^[0-9a-f]{64}$'`)
  ]
);

export const projectBusinessProfiles = pgTable(
  "project_business_profiles",
  {
    projectId: uuid("project_id")
      .primaryKey()
      .references(() => projects.id),
    currentRevisionId: uuid("current_revision_id").references(() => projectBusinessProfileRevisions.id),
    status: businessProfileStatusEnum("status").notNull().default("draft"),
    rowVersion: integer("row_version").notNull().default(0),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    confirmedByUserId: uuid("confirmed_by_user_id").references(() => users.id),
    ...timestamps
  },
  (table) => [
    check("project_business_profiles_row_version_check", sql`${table.rowVersion} >= 0`),
    check(
      "project_business_profiles_confirmation_check",
      sql`(${table.status} = 'draft' and ${table.confirmedAt} is null and ${table.confirmedByUserId} is null) or (${table.status} = 'confirmed' and ${table.currentRevisionId} is not null and ${table.confirmedAt} is not null and ${table.confirmedByUserId} is not null)`
    )
  ]
);

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

export const pageProposals = pgTable(
  "page_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    opportunityId: uuid("opportunity_id").references(() => opportunities.id),
    route: text("route").notNull(),
    primaryKeyword: text("primary_keyword").notNull(),
    uniquenessRationale: text("uniqueness_rationale").notNull(),
    status: text("status").notNull().default("draft"),
    sitemapReady: boolean("sitemap_ready").default(false).notNull(),
    proposalJson: jsonb("proposal_json").$type<PageProposalJson>(),
    ...timestamps
  },
  (table) => [uniqueIndex("page_proposals_project_route_idx").on(table.projectId, table.route)]
);

export const pageVersions = pgTable(
  "page_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageProposalId: uuid("page_proposal_id")
      .notNull()
      .references(() => pageProposals.id),
    versionNumber: integer("version_number").notNull(),
    status: pageVersionStatusEnum("status").notNull().default("preview"),
    rowVersion: integer("row_version").default(0).notNull(),
    pageJson: jsonb("page_json").$type<PageJson>().notNull(),
    basedOnVersionId: uuid("based_on_version_id").references((): AnyPgColumn => pageVersions.id),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    uniqueIndex("page_versions_proposal_version_idx").on(table.pageProposalId, table.versionNumber),
    index("page_versions_based_on_version_idx").on(table.basedOnVersionId),
    check("page_versions_row_version_check", sql`${table.rowVersion} >= 0`)
  ]
);

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    kind: text("kind").notNull().default("image"),
    status: mediaAssetStatusEnum("status").notNull().default("pending_upload"),
    displayName: text("display_name").notNull(),
    claimedContentType: text("claimed_content_type").notNull(),
    expectedBytes: integer("expected_bytes").notNull(),
    expectedSha256: text("expected_sha256").notNull(),
    detectedContentType: text("detected_content_type"),
    sourceStorageKey: text("source_storage_key").notNull(),
    sourceBytes: integer("source_bytes"),
    width: integer("width"),
    height: integer("height"),
    checksumSha256: text("checksum_sha256"),
    processorVersion: text("processor_version"),
    requiredVariantKeys: text("required_variant_keys").array(),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    archivedByUserId: uuid("archived_by_user_id").references(() => users.id),
    recoveryCount: integer("recovery_count").default(0).notNull(),
    lastRecoveryAt: timestamp("last_recovery_at", { withTimezone: true }),
    storageCleanupAttemptCount: integer("storage_cleanup_attempt_count").default(0).notNull(),
    lastStorageCleanupAt: timestamp("last_storage_cleanup_at", { withTimezone: true }),
    storageCleanupClaimedAt: timestamp("storage_cleanup_claimed_at", { withTimezone: true }),
    storageCleanupCompletedAt: timestamp("storage_cleanup_completed_at", { withTimezone: true }),
    storageCleanupFailureCode: text("storage_cleanup_failure_code"),
    storageCleanupFailureMessage: text("storage_cleanup_failure_message"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    index("media_assets_project_status_created_idx").on(table.projectId, table.status, table.createdAt),
    index("media_assets_recovery_scan_idx")
      .on(table.status, table.updatedAt)
      .where(sql`${table.status} = 'processing'`),
    index("media_assets_ready_cleanup_scan_idx")
      .on(table.processedAt)
      .where(sql`${table.storageCleanupCompletedAt} is null and ${table.status} in ('ready', 'archived')`),
    index("media_assets_failed_cleanup_scan_idx")
      .on(table.updatedAt)
      .where(sql`${table.storageCleanupCompletedAt} is null and ${table.status} = 'failed'`)
  ]
);

export const mediaAssetVariants = pgTable(
  "media_asset_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mediaAssetId: uuid("media_asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    variantKey: text("variant_key").notNull(),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: integer("bytes").notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    ...timestamps
  },
  (table) => [
    uniqueIndex("media_asset_variants_asset_key_idx").on(table.mediaAssetId, table.variantKey),
    uniqueIndex("media_asset_variants_storage_key_idx").on(table.storageKey)
  ]
);

export const pageVersionMediaAssets = pgTable(
  "page_version_media_assets",
  {
    pageVersionId: uuid("page_version_id")
      .notNull()
      .references(() => pageVersions.id),
    mediaAssetId: uuid("media_asset_id")
      .notNull()
      .references(() => mediaAssets.id),
    ...timestamps
  },
  (table) => [
    uniqueIndex("page_version_media_assets_version_asset_idx").on(table.pageVersionId, table.mediaAssetId),
    index("page_version_media_assets_asset_idx").on(table.mediaAssetId)
  ]
);

export const pageSectionCopySuggestions = pgTable(
  "page_section_copy_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    pageVersionId: uuid("page_version_id")
      .notNull()
      .references(() => pageVersions.id),
    sectionId: text("section_id").notNull(),
    agentRunId: uuid("agent_run_id")
      .notNull()
      .references(() => agentRuns.id),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => users.id),
    status: sectionCopySuggestionStatusEnum("status").notNull().default("queued"),
    instruction: text("instruction"),
    suggestedProps: jsonb("suggested_props").$type<Record<string, unknown>>(),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    appliedPageVersionId: uuid("applied_page_version_id").references((): AnyPgColumn => pageVersions.id),
    appliedByUserId: uuid("applied_by_user_id").references(() => users.id),
    dismissedByUserId: uuid("dismissed_by_user_id").references(() => users.id),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    uniqueIndex("page_section_copy_suggestions_agent_run_idx").on(table.agentRunId),
    index("page_section_copy_suggestions_version_created_idx").on(table.pageVersionId, table.createdAt),
    uniqueIndex("page_section_copy_suggestions_active_idx")
      .on(table.pageVersionId, table.sectionId)
      .where(sql`${table.status} in ('queued', 'generating', 'ready')`)
  ]
);

export const componentTemplates = pgTable("component_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  schemaJson: jsonb("schema_json").$type<Record<string, unknown>>().notNull(),
  ...timestamps
});

export const componentInstances = pgTable("component_instances", {
  id: uuid("id").primaryKey().defaultRandom(),
  pageVersionId: uuid("page_version_id")
    .notNull()
    .references(() => pageVersions.id),
  componentTemplateId: uuid("component_template_id").references(() => componentTemplates.id),
  sortOrder: integer("sort_order").notNull(),
  propsJson: jsonb("props_json").$type<Record<string, unknown>>().notNull(),
  ...timestamps
});

export const componentNotes = pgTable("component_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  componentInstanceId: uuid("component_instance_id")
    .notNull()
    .references(() => componentInstances.id),
  authorUserId: uuid("author_user_id").references(() => users.id),
  instructionType: text("instruction_type").notNull(),
  note: text("note").notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  ...timestamps
});

export const pageSectionNotes = pgTable(
  "page_section_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageVersionId: uuid("page_version_id")
      .notNull()
      .references(() => pageVersions.id),
    sectionId: text("section_id").notNull(),
    fieldPath: jsonb("field_path")
      .$type<PageSectionNoteFieldPath>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    instructionType: pageSectionNoteInstructionTypeEnum("instruction_type").notNull().default("general"),
    note: text("note").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id),
    ...timestamps
  },
  (table) => [
    index("page_section_notes_version_section_idx").on(table.pageVersionId, table.sectionId),
    index("page_section_notes_version_resolved_idx").on(table.pageVersionId, table.resolvedAt)
  ]
);

export const approvals = pgTable("approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  pageVersionId: uuid("page_version_id").references(() => pageVersions.id),
  releasePlanId: uuid("release_plan_id").references(() => releasePlans.id),
  userId: uuid("user_id").references(() => users.id),
  status: approvalStatusEnum("status").notNull().default("pending"),
  decisionNote: text("decision_note"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  ...timestamps
});

export const releasePlans = pgTable("release_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  createdByAgentId: text("created_by_agent_id"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  status: releaseStatusEnum("status").notNull().default("draft"),
  summary: text("summary").notNull(),
  riskLevel: text("risk_level").notNull().default("low"),
  blockerCount: integer("blocker_count").default(0).notNull(),
  warningCount: integer("warning_count").default(0).notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  deployedAt: timestamp("deployed_at", { withTimezone: true }),
  ...timestamps
});

export const releasePlanItems = pgTable("release_plan_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  releasePlanId: uuid("release_plan_id")
    .notNull()
    .references(() => releasePlans.id),
  pageVersionId: uuid("page_version_id").references(() => pageVersions.id),
  targetUrl: text("target_url").notNull(),
  targetSubdomain: text("target_subdomain"),
  action: releaseItemActionEnum("action").notNull(),
  status: text("status").notNull().default("pending"),
  ...timestamps
});

export const releaseChecks = pgTable("release_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  releasePlanId: uuid("release_plan_id")
    .notNull()
    .references(() => releasePlans.id),
  scope: text("scope").notNull(),
  checkKey: text("check_key").notNull(),
  severity: releaseSeverityEnum("severity").notNull(),
  result: releaseCheckResultEnum("result").notNull(),
  message: text("message").notNull(),
  evidenceJson: jsonb("evidence_json").$type<Record<string, unknown>>(),
  ...timestamps
});

export const releaseNotes = pgTable("release_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  releasePlanId: uuid("release_plan_id")
    .notNull()
    .references(() => releasePlans.id),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  audience: releaseNoteAudienceEnum("audience").notNull().default("internal"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  ...timestamps
});

export const deployments = pgTable(
  "deployments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    releasePlanId: uuid("release_plan_id").references(() => releasePlans.id),
    deploymentKey: text("deployment_key").notNull(),
    provider: text("provider").notNull().default("netlify"),
    providerDeployId: text("provider_deploy_id"),
    providerOperationStatus: providerOperationStatusEnum("provider_operation_status").notNull().default("not_started"),
    liveUrl: text("live_url"),
    status: deploymentStatusEnum("status").notNull().default("pending"),
    verificationStatus: releaseVerificationStatusEnum("verification_status").notNull().default("not_started"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    evidenceJson: jsonb("evidence_json").$type<Record<string, unknown>>(),
    ...timestamps
  },
  (table) => [
    uniqueIndex("deployments_deployment_key_idx").on(table.deploymentKey),
    index("deployments_release_status_idx").on(table.releasePlanId, table.status)
  ]
);

export const releaseVerifications = pgTable(
  "release_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    releasePlanId: uuid("release_plan_id")
      .notNull()
      .references(() => releasePlans.id),
    deploymentId: uuid("deployment_id").references(() => deployments.id),
    status: releaseVerificationStatusEnum("status").notNull().default("not_started"),
    summary: text("summary").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
    evidenceJson: jsonb("evidence_json").$type<Record<string, unknown>>(),
    recoveryCount: integer("recovery_count").default(0).notNull(),
    lastRecoveryAt: timestamp("last_recovery_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    uniqueIndex("release_verifications_active_deployment_idx")
      .on(table.deploymentId)
      .where(sql`${table.status} = 'running'`),
    index("release_verifications_recovery_scan_idx")
      .on(table.status, table.updatedAt)
      .where(sql`${table.status} = 'running'`)
  ]
);

export const releaseVerificationChecks = pgTable(
  "release_verification_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    verificationId: uuid("verification_id")
      .notNull()
      .references(() => releaseVerifications.id, { onDelete: "cascade" }),
    checkKey: text("check_key").notNull(),
    scope: text("scope").notNull(),
    targetUrl: text("target_url"),
    severity: releaseSeverityEnum("severity").notNull(),
    result: releaseCheckResultEnum("result").notNull(),
    message: text("message").notNull(),
    expectedJson: jsonb("expected_json").$type<Record<string, unknown>>(),
    observedJson: jsonb("observed_json").$type<Record<string, unknown>>(),
    evidenceJson: jsonb("evidence_json").$type<Record<string, unknown>>(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps
  },
  (table) => [index("release_verification_checks_verification_idx").on(table.verificationId)]
);

export const rollbackPoints = pgTable(
  "rollback_points",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    releasePlanId: uuid("release_plan_id")
      .notNull()
      .references(() => releasePlans.id),
    deploymentId: uuid("deployment_id").references(() => deployments.id),
    artifactKey: text("artifact_key").notNull(),
    providerDeployId: text("provider_deploy_id"),
    liveUrl: text("live_url"),
    evidenceJson: jsonb("evidence_json").$type<Record<string, unknown>>(),
    ...timestamps
  },
  (table) => [
    uniqueIndex("rollback_points_release_source_idx").on(
      table.releasePlanId,
      table.deploymentId,
      table.providerDeployId
    )
  ]
);

export const gscConnections = pgTable(
  "gsc_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    propertyUrl: text("property_url"),
    status: gscConnectionStatusEnum("status").notNull().default("connection_required"),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    failureJson: jsonb("failure_json").$type<Record<string, unknown>>(),
    ...timestamps
  },
  (table) => [index("gsc_connections_project_created_idx").on(table.projectId, table.createdAt)]
);

export const gscSyncRuns = pgTable(
  "gsc_sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    connectionId: uuid("connection_id").references(() => gscConnections.id),
    propertyUrl: text("property_url").notNull(),
    dateFrom: text("date_from").notNull(),
    dateTo: text("date_to").notNull(),
    dimensions: jsonb("dimensions").$type<string[]>().default([]).notNull(),
    status: gscSyncStatusEnum("status").notNull().default("queued"),
    rowCount: integer("row_count").default(0).notNull(),
    failureJson: jsonb("failure_json").$type<Record<string, unknown>>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [index("gsc_sync_runs_project_status_completed_idx").on(table.projectId, table.status, table.completedAt)]
);

export const gscSearchAnalyticsRows = pgTable(
  "gsc_search_analytics_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    syncRunId: uuid("sync_run_id")
      .notNull()
      .references(() => gscSyncRuns.id),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    propertyUrl: text("property_url").notNull(),
    query: text("query").notNull(),
    pageUrl: text("page_url").notNull(),
    clicks: integer("clicks").default(0).notNull(),
    impressions: integer("impressions").default(0).notNull(),
    ctr: doublePrecision("ctr").default(0).notNull(),
    position: doublePrecision("position").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index("gsc_rows_sync_impressions_idx").on(table.syncRunId, table.impressions)]
);

export const gscOpportunitySignals = pgTable(
  "gsc_opportunity_signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    syncRunId: uuid("sync_run_id")
      .notNull()
      .references(() => gscSyncRuns.id),
    rowId: uuid("row_id").references(() => gscSearchAnalyticsRows.id),
    signalType: gscOpportunitySignalTypeEnum("signal_type").notNull(),
    status: gscOpportunitySignalStatusEnum("status").notNull().default("internal_radar"),
    query: text("query").notNull(),
    pageUrl: text("page_url").notNull(),
    evidenceJson: jsonb("evidence_json").$type<Record<string, unknown>>(),
    ...timestamps
  },
  (table) => [index("gsc_signals_sync_created_idx").on(table.syncRunId, table.createdAt)]
);

export const trackingEvents = pgTable("tracking_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  eventName: text("event_name").notNull(),
  route: text("route").notNull(),
  componentId: text("component_id"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const reportIssues = pgTable(
  "report_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    reportKind: customerReportKindEnum("report_kind").notNull(),
    period: text("period").notNull(),
    locale: text("locale").notNull(),
    timezone: text("timezone").notNull(),
    currentCandidateReportId: uuid("current_candidate_report_id").references((): AnyPgColumn => reports.id),
    currentPublishedReportId: uuid("current_published_report_id").references((): AnyPgColumn => reports.id),
    rowVersion: integer("row_version").default(0).notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    ...timestamps
  },
  (table) => [
    uniqueIndex("report_issues_identity_idx").on(
      table.projectId,
      table.reportKind,
      table.period,
      table.locale,
      table.timezone
    ),
    check("report_issues_period_check", sql`${table.period} ~ '^\\d{4}-(0[1-9]|1[0-2])$'`),
    check("report_issues_locale_check", sql`${table.locale} = 'de-DE'`),
    check("report_issues_timezone_check", sql`${table.timezone} = 'Europe/Berlin'`),
    check("report_issues_row_version_check", sql`${table.rowVersion} >= 0`)
  ]
);

export const reportGenerationRuns = pgTable(
  "report_generation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    reportIssueId: uuid("report_issue_id")
      .notNull()
      .references(() => reportIssues.id),
    status: customerReportGenerationStatusEnum("status").notNull().default("queued"),
    narrativeMode: customerReportNarrativeModeEnum("narrative_mode").notNull().default("fact_only"),
    idempotencyKey: uuid("idempotency_key").notNull(),
    queueJobId: text("queue_job_id").notNull(),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => users.id),
    baseIssueRowVersion: integer("base_issue_row_version").notNull(),
    baseCandidateReportId: uuid("base_candidate_report_id").references((): AnyPgColumn => reports.id),
    baseCandidateRowVersion: integer("base_candidate_row_version"),
    baseCandidateSnapshotSha256: text("base_candidate_snapshot_sha256"),
    correctionPredecessorReportId: uuid("correction_predecessor_report_id").references((): AnyPgColumn => reports.id),
    correctionReason: text("correction_reason"),
    resultReportId: uuid("result_report_id").references((): AnyPgColumn => reports.id),
    evidenceCutoffAt: timestamp("evidence_cutoff_at", { withTimezone: true }).notNull(),
    evidencePacketCanonicalText: text("evidence_packet_canonical_text"),
    evidencePacketSha256: text("evidence_packet_sha256"),
    assemblerVersion: text("assembler_version").notNull(),
    reportSchemaVersion: text("report_schema_version").notNull(),
    eligibilityPolicyVersion: text("eligibility_policy_version").notNull(),
    actionSelectionPolicyVersion: text("action_selection_policy_version").notNull(),
    customerSafetyPolicyVersion: text("customer_safety_policy_version").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    recoveryCount: integer("recovery_count").default(0).notNull(),
    lastRecoveryAt: timestamp("last_recovery_at", { withTimezone: true }),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    uniqueIndex("report_generation_runs_project_idempotency_idx").on(table.projectId, table.idempotencyKey),
    uniqueIndex("report_generation_runs_queue_job_idx").on(table.queueJobId),
    uniqueIndex("report_generation_runs_active_issue_idx")
      .on(table.reportIssueId)
      .where(sql`${table.status} in ('queued', 'assembling', 'narrative_running', 'validating')`),
    index("report_generation_runs_issue_created_idx").on(table.reportIssueId, table.createdAt),
    index("report_generation_runs_recovery_scan_idx")
      .on(table.status, table.updatedAt)
      .where(sql`${table.status} in ('queued', 'assembling', 'narrative_running', 'validating')`),
    check("report_generation_runs_base_issue_version_check", sql`${table.baseIssueRowVersion} >= 0`),
    check("report_generation_runs_attempt_count_check", sql`${table.attemptCount} >= 0`),
    check("report_generation_runs_recovery_count_check", sql`${table.recoveryCount} >= 0`),
    check(
      "report_generation_runs_base_candidate_check",
      sql`(${table.baseCandidateReportId} is null and ${table.baseCandidateRowVersion} is null and ${table.baseCandidateSnapshotSha256} is null) or (${table.baseCandidateReportId} is not null and ${table.baseCandidateRowVersion} is not null and ${table.baseCandidateSnapshotSha256} ~ '^[0-9a-f]{64}$')`
    ),
    check(
      "report_generation_runs_correction_check",
      sql`(${table.correctionPredecessorReportId} is null and ${table.correctionReason} is null) or (${table.correctionPredecessorReportId} is not null and ${table.correctionReason} is not null)`
    ),
    check(
      "report_generation_runs_evidence_packet_check",
      sql`(${table.evidencePacketCanonicalText} is null and ${table.evidencePacketSha256} is null) or (${table.evidencePacketCanonicalText} is not null and ${table.evidencePacketSha256} ~ '^[0-9a-f]{64}$')`
    ),
    check(
      "report_generation_runs_failure_check",
      sql`(${table.failureCode} is null and ${table.failureMessage} is null) or (${table.failureCode} is not null and ${table.failureMessage} is not null)`
    )
  ]
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    reportIssueId: uuid("report_issue_id")
      .notNull()
      .references(() => reportIssues.id),
    versionNumber: integer("version_number").notNull(),
    status: customerReportStatusEnum("status").notNull().default("draft"),
    snapshotCanonicalText: text("snapshot_canonical_text").notNull(),
    snapshotSha256: text("snapshot_sha256").notNull(),
    factProjectionSha256: text("fact_projection_sha256").notNull(),
    schemaVersion: text("schema_version").notNull(),
    assemblerVersion: text("assembler_version").notNull(),
    eligibilityPolicyVersion: text("eligibility_policy_version").notNull(),
    actionSelectionPolicyVersion: text("action_selection_policy_version").notNull(),
    narrativePolicyVersion: text("narrative_policy_version").notNull(),
    templateVersion: text("template_version").notNull(),
    narrativeMode: customerReportNarrativeModeEnum("narrative_mode").notNull(),
    sourceGenerationRunId: uuid("source_generation_run_id")
      .notNull()
      .references(() => reportGenerationRuns.id),
    sourceAgentRunId: uuid("source_agent_run_id").references(() => agentRuns.id),
    reviewedSnapshotSha256: text("reviewed_snapshot_sha256"),
    publishedArtifactId: uuid("published_artifact_id").references((): AnyPgColumn => reportArtifacts.id),
    supersedesReportId: uuid("supersedes_report_id").references((): AnyPgColumn => reports.id),
    correctionReason: text("correction_reason"),
    createdByActorType: text("created_by_actor_type").notNull().default("system"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    publishedByUserId: uuid("published_by_user_id").references(() => users.id),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    rowVersion: integer("row_version").default(0).notNull(),
    ...timestamps
  },
  (table) => [
    uniqueIndex("reports_issue_version_idx").on(table.reportIssueId, table.versionNumber),
    uniqueIndex("reports_id_project_idx").on(table.id, table.projectId),
    uniqueIndex("reports_open_candidate_issue_idx")
      .on(table.reportIssueId)
      .where(sql`${table.status} in ('draft', 'ready_for_review')`),
    uniqueIndex("reports_current_published_issue_idx")
      .on(table.reportIssueId)
      .where(sql`${table.status} = 'published'`),
    uniqueIndex("reports_correction_successor_idx")
      .on(table.supersedesReportId)
      .where(sql`${table.supersedesReportId} is not null`),
    index("reports_project_status_created_idx").on(table.projectId, table.status, table.createdAt),
    check("reports_version_number_check", sql`${table.versionNumber} > 0`),
    check("reports_row_version_check", sql`${table.rowVersion} >= 0`),
    check("reports_snapshot_sha256_check", sql`${table.snapshotSha256} ~ '^[0-9a-f]{64}$'`),
    check("reports_fact_projection_sha256_check", sql`${table.factProjectionSha256} ~ '^[0-9a-f]{64}$'`),
    check(
      "reports_narrative_provenance_shape_check",
      sql`(${table.narrativeMode} = 'fact_only' and ${table.sourceAgentRunId} is null) or (${table.narrativeMode} = 'bounded_ai' and ${table.sourceAgentRunId} is not null)`
    ),
    check(
      "reports_reviewed_snapshot_sha256_check",
      sql`${table.reviewedSnapshotSha256} is null or ${table.reviewedSnapshotSha256} ~ '^[0-9a-f]{64}$'`
    ),
    check("reports_actor_type_check", sql`${table.createdByActorType} in ('human', 'system')`),
    check(
      "reports_lifecycle_evidence_check",
      sql`(${table.status} = 'draft' and ${table.reviewedSnapshotSha256} is null and ${table.readyAt} is null and ${table.publishedArtifactId} is null and ${table.publishedAt} is null and ${table.supersededAt} is null) or (${table.status} = 'ready_for_review' and ${table.reviewedSnapshotSha256} = ${table.snapshotSha256} and ${table.readyAt} is not null and ${table.publishedArtifactId} is null and ${table.publishedAt} is null and ${table.supersededAt} is null) or (${table.status} = 'published' and ${table.reviewedSnapshotSha256} = ${table.snapshotSha256} and ${table.readyAt} is not null and ${table.publishedArtifactId} is not null and ${table.publishedAt} is not null and ${table.publishedByUserId} is not null and ${table.supersededAt} is null) or (${table.status} = 'superseded' and ${table.reviewedSnapshotSha256} = ${table.snapshotSha256} and ${table.readyAt} is not null and ${table.publishedArtifactId} is not null and ${table.publishedAt} is not null and ${table.publishedByUserId} is not null and ${table.supersededAt} is not null)`
    ),
    check(
      "reports_correction_identity_check",
      sql`(${table.supersedesReportId} is null and ${table.correctionReason} is null) or (${table.supersedesReportId} is not null and ${table.correctionReason} is not null)`
    )
  ]
);

export const reportArtifacts = pgTable(
  "report_artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    reportId: uuid("report_id").notNull(),
    format: customerReportArtifactFormatEnum("format").notNull().default("html"),
    status: customerReportArtifactStatusEnum("status").notNull().default("pending"),
    snapshotSha256: text("snapshot_sha256").notNull(),
    renderManifestJson: jsonb("render_manifest_json").$type<CustomerReportHtmlRenderManifest>().notNull(),
    renderManifestCanonicalText: text("render_manifest_canonical_text").notNull(),
    renderManifestSha256: text("render_manifest_sha256").notNull(),
    queueJobId: text("queue_job_id").notNull(),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id),
    requestId: uuid("request_id"),
    storageKey: text("storage_key"),
    artifactSha256: text("artifact_sha256"),
    byteSize: integer("byte_size"),
    attemptCount: integer("attempt_count").default(0).notNull(),
    recoveryCount: integer("recovery_count").default(0).notNull(),
    lastRecoveryAt: timestamp("last_recovery_at", { withTimezone: true }),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    stagedAt: timestamp("staged_at", { withTimezone: true }),
    expiredAt: timestamp("expired_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    foreignKey({
      columns: [table.reportId, table.projectId],
      foreignColumns: [reports.id, reports.projectId],
      name: "report_artifacts_report_project_fk"
    }),
    uniqueIndex("report_artifacts_identity_idx")
      .on(table.reportId, table.format, table.snapshotSha256, table.renderManifestSha256)
      .where(sql`${table.status} in ('pending', 'running', 'staged')`),
    uniqueIndex("report_artifacts_queue_job_idx").on(table.queueJobId),
    uniqueIndex("report_artifacts_project_request_idx")
      .on(table.projectId, table.requestId)
      .where(sql`${table.requestId} is not null`),
    index("report_artifacts_project_status_created_idx").on(table.projectId, table.status, table.createdAt),
    index("report_artifacts_recovery_scan_idx")
      .on(table.status, table.updatedAt)
      .where(sql`${table.status} in ('pending', 'running')`),
    check("report_artifacts_snapshot_sha256_check", sql`${table.snapshotSha256} ~ '^[0-9a-f]{64}$'`),
    check("report_artifacts_manifest_sha256_check", sql`${table.renderManifestSha256} ~ '^[0-9a-f]{64}$'`),
    check(
      "report_artifacts_artifact_sha256_check",
      sql`${table.artifactSha256} is null or ${table.artifactSha256} ~ '^[0-9a-f]{64}$'`
    ),
    check("report_artifacts_attempt_count_check", sql`${table.attemptCount} >= 0`),
    check("report_artifacts_recovery_count_check", sql`${table.recoveryCount} >= 0`),
    check("report_artifacts_byte_size_check", sql`${table.byteSize} is null or ${table.byteSize} >= 0`),
    check(
      "report_artifacts_request_actor_check",
      sql`(${table.requestId} is null and ${table.requestedByUserId} is null) or (${table.requestId} is not null and ${table.requestedByUserId} is not null)`
    ),
    check(
      "report_artifacts_terminal_evidence_check",
      sql`(${table.status} in ('pending', 'running') and ${table.storageKey} is null and ${table.artifactSha256} is null and ${table.byteSize} is null and ${table.failureCode} is null and ${table.failureMessage} is null and ${table.stagedAt} is null and ${table.expiredAt} is null) or (${table.status} = 'staged' and ${table.storageKey} is not null and ${table.artifactSha256} is not null and ${table.byteSize} is not null and ${table.failureCode} is null and ${table.failureMessage} is null and ${table.stagedAt} is not null and ${table.expiredAt} is null) or (${table.status} = 'failed' and ${table.storageKey} is null and ${table.artifactSha256} is null and ${table.byteSize} is null and ${table.failureCode} is not null and ${table.failureMessage} is not null and ${table.stagedAt} is null and ${table.expiredAt} is null) or (${table.status} = 'expired' and ${table.expiredAt} is not null)`
    )
  ]
);

export const reportClaims = pgTable(
  "report_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id").notNull(),
    projectId: uuid("project_id").notNull(),
    claimKey: text("claim_key").notNull(),
    claimKind: customerReportClaimKindEnum("claim_kind").notNull(),
    section: customerReportSectionEnum("section").notNull(),
    ordinal: integer("ordinal").notNull(),
    claimJson: jsonb("claim_json").$type<CustomerReportClaim>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    foreignKey({
      columns: [table.reportId, table.projectId],
      foreignColumns: [reports.id, reports.projectId],
      name: "report_claims_report_project_fk"
    }),
    uniqueIndex("report_claims_report_key_idx").on(table.reportId, table.claimKey),
    uniqueIndex("report_claims_report_ordinal_idx").on(table.reportId, table.ordinal),
    uniqueIndex("report_claims_id_report_project_idx").on(table.id, table.reportId, table.projectId),
    check("report_claims_ordinal_check", sql`${table.ordinal} >= 0`)
  ]
);

export const reportEvidenceItems = pgTable(
  "report_evidence_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id").notNull(),
    projectId: uuid("project_id").notNull(),
    evidenceKey: text("evidence_key").notNull(),
    sourceKind: customerReportEvidenceKindEnum("source_kind").notNull(),
    sourceId: uuid("source_id").notNull(),
    sourceVersion: text("source_version").notNull(),
    proofTier: text("proof_tier").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    selectedAtCutoff: timestamp("selected_at_cutoff", { withTimezone: true }).notNull(),
    payloadSha256: text("payload_sha256").notNull(),
    rankingProofId: uuid("ranking_proof_id").references(() => rankingProofs.id),
    pageVersionId: uuid("page_version_id").references(() => pageVersions.id),
    deploymentId: uuid("deployment_id").references(() => deployments.id),
    releaseVerificationId: uuid("release_verification_id").references(() => releaseVerifications.id),
    releaseVerificationCheckId: uuid("release_verification_check_id").references(() => releaseVerificationChecks.id),
    rollbackPointId: uuid("rollback_point_id").references(() => rollbackPoints.id),
    opportunityId: uuid("opportunity_id").references(() => opportunities.id),
    evidenceJson: jsonb("evidence_json").$type<CustomerReportEvidenceItem>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    foreignKey({
      columns: [table.reportId, table.projectId],
      foreignColumns: [reports.id, reports.projectId],
      name: "report_evidence_items_report_project_fk"
    }),
    uniqueIndex("report_evidence_items_report_key_idx").on(table.reportId, table.evidenceKey),
    uniqueIndex("report_evidence_items_id_report_project_idx").on(table.id, table.reportId, table.projectId),
    index("report_evidence_items_source_idx").on(table.sourceKind, table.sourceId),
    check("report_evidence_items_payload_sha256_check", sql`${table.payloadSha256} ~ '^[0-9a-f]{64}$'`),
    check(
      "report_evidence_items_proof_tier_check",
      sql`${table.proofTier} in ('customer_safe_proof', 'supporting_context')`
    ),
    check(
      "report_evidence_items_source_reference_check",
      sql`(${table.sourceKind} = 'ranking_proof' and ${table.rankingProofId} = ${table.sourceId} and ${table.pageVersionId} is null and ${table.deploymentId} is null and ${table.releaseVerificationId} is null and ${table.releaseVerificationCheckId} is null and ${table.rollbackPointId} is null and ${table.opportunityId} is null) or (${table.sourceKind} = 'page_version' and ${table.pageVersionId} = ${table.sourceId} and ${table.rankingProofId} is null and ${table.deploymentId} is null and ${table.releaseVerificationId} is null and ${table.releaseVerificationCheckId} is null and ${table.rollbackPointId} is null and ${table.opportunityId} is null) or (${table.sourceKind} = 'deployment' and ${table.deploymentId} = ${table.sourceId} and ${table.rankingProofId} is null and ${table.pageVersionId} is null and ${table.releaseVerificationId} is null and ${table.releaseVerificationCheckId} is null and ${table.rollbackPointId} is null and ${table.opportunityId} is null) or (${table.sourceKind} = 'release_verification' and ${table.releaseVerificationId} = ${table.sourceId} and ${table.rankingProofId} is null and ${table.pageVersionId} is null and ${table.deploymentId} is null and ${table.releaseVerificationCheckId} is null and ${table.rollbackPointId} is null and ${table.opportunityId} is null) or (${table.sourceKind} = 'release_verification_check' and ${table.releaseVerificationCheckId} = ${table.sourceId} and ${table.rankingProofId} is null and ${table.pageVersionId} is null and ${table.deploymentId} is null and ${table.rollbackPointId} is null and ${table.opportunityId} is null) or (${table.sourceKind} = 'rollback' and ${table.rollbackPointId} = ${table.sourceId} and ${table.rankingProofId} is null and ${table.pageVersionId} is null and ${table.deploymentId} is null and ${table.releaseVerificationId} is null and ${table.releaseVerificationCheckId} is null and ${table.opportunityId} is null) or (${table.sourceKind} = 'opportunity' and ${table.opportunityId} = ${table.sourceId} and ${table.rankingProofId} is null and ${table.pageVersionId} is null and ${table.deploymentId} is null and ${table.releaseVerificationId} is null and ${table.releaseVerificationCheckId} is null and ${table.rollbackPointId} is null)`
    )
  ]
);

export const reportEvidenceAlerts = pgTable(
  "report_evidence_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    reportId: uuid("report_id").notNull(),
    reportEvidenceItemId: uuid("report_evidence_item_id").notNull(),
    evidenceKey: text("evidence_key").notNull(),
    sourceKind: customerReportEvidenceKindEnum("source_kind").notNull(),
    sourceId: uuid("source_id").notNull(),
    alertKind: text("alert_kind").notNull().default("source_invalidated"),
    status: customerReportEvidenceAlertStatusEnum("status").notNull().default("open"),
    detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByReportId: uuid("resolved_by_report_id"),
    ...timestamps
  },
  (table) => [
    foreignKey({
      columns: [table.reportId, table.projectId],
      foreignColumns: [reports.id, reports.projectId],
      name: "report_evidence_alerts_report_project_fk"
    }),
    foreignKey({
      columns: [table.reportEvidenceItemId, table.reportId, table.projectId],
      foreignColumns: [reportEvidenceItems.id, reportEvidenceItems.reportId, reportEvidenceItems.projectId],
      name: "report_evidence_alerts_evidence_report_project_fk"
    }),
    foreignKey({
      columns: [table.resolvedByReportId, table.projectId],
      foreignColumns: [reports.id, reports.projectId],
      name: "report_evidence_alerts_resolution_report_project_fk"
    }),
    uniqueIndex("report_evidence_alerts_open_evidence_idx")
      .on(table.reportId, table.evidenceKey)
      .where(sql`${table.status} = 'open'`),
    index("report_evidence_alerts_project_status_idx").on(table.projectId, table.status, table.detectedAt),
    check("report_evidence_alerts_kind_check", sql`${table.alertKind} = 'source_invalidated'`),
    check(
      "report_evidence_alerts_resolution_check",
      sql`(${table.status} = 'open' and ${table.resolvedAt} is null and ${table.resolvedByReportId} is null) or (${table.status} = 'resolved' and ${table.resolvedAt} is not null and ${table.resolvedByReportId} is not null)`
    )
  ]
);

export const reportClaimEvidence = pgTable(
  "report_claim_evidence",
  {
    reportId: uuid("report_id").notNull(),
    projectId: uuid("project_id").notNull(),
    claimId: uuid("claim_id").notNull(),
    evidenceId: uuid("evidence_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    primaryKey({ columns: [table.claimId, table.evidenceId] }),
    foreignKey({
      columns: [table.claimId, table.reportId, table.projectId],
      foreignColumns: [reportClaims.id, reportClaims.reportId, reportClaims.projectId],
      name: "report_claim_evidence_claim_fk"
    }),
    foreignKey({
      columns: [table.evidenceId, table.reportId, table.projectId],
      foreignColumns: [reportEvidenceItems.id, reportEvidenceItems.reportId, reportEvidenceItems.projectId],
      name: "report_claim_evidence_evidence_fk"
    }),
    index("report_claim_evidence_report_idx").on(table.reportId)
  ]
);

export const reportLifecycleEvents = pgTable(
  "report_lifecycle_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    reportIssueId: uuid("report_issue_id")
      .notNull()
      .references(() => reportIssues.id),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id),
    generationRunId: uuid("generation_run_id").references(() => reportGenerationRuns.id),
    artifactId: uuid("artifact_id").references(() => reportArtifacts.id),
    eventType: customerReportLifecycleEventTypeEnum("event_type").notNull(),
    fromStatus: customerReportStatusEnum("from_status"),
    toStatus: customerReportStatusEnum("to_status").notNull(),
    actorType: text("actor_type").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    requestId: uuid("request_id").notNull(),
    snapshotSha256: text("snapshot_sha256").notNull(),
    decisionNote: text("decision_note"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("report_lifecycle_events_request_idx").on(
      table.projectId,
      table.requestId,
      table.eventType,
      table.reportId
    ),
    index("report_lifecycle_events_report_occurred_idx").on(table.reportId, table.occurredAt),
    check("report_lifecycle_events_snapshot_sha256_check", sql`${table.snapshotSha256} ~ '^[0-9a-f]{64}$'`),
    check("report_lifecycle_events_actor_type_check", sql`${table.actorType} in ('human', 'system')`),
    check(
      "report_lifecycle_events_human_actor_check",
      sql`(${table.eventType} = 'report_generated' and ${table.actorType} = 'system') or (${table.eventType} <> 'report_generated' and ${table.actorType} = 'human' and ${table.actorUserId} is not null)`
    )
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

export const projectRelations = relations(projects, ({ many, one }) => ({
  customer: one(customers, { fields: [projects.customerId], references: [customers.id] }),
  opportunities: many(opportunities),
  pageProposals: many(pageProposals),
  releasePlans: many(releasePlans),
  deployments: many(deployments),
  gscConnections: many(gscConnections),
  gscSyncRuns: many(gscSyncRuns),
  gscOpportunitySignals: many(gscOpportunitySignals),
  websiteImportRuns: many(websiteImportRuns),
  technicalAuditRuns: many(technicalAuditRuns),
  technicalAuditFindings: many(technicalAuditFindings),
  agentRuns: many(agentRuns),
  rankingProofs: many(rankingProofs),
  trackingKeys: many(projectTrackingKeys),
  reports: many(reports),
  mediaAssets: many(mediaAssets),
  businessProfileRevisions: many(projectBusinessProfileRevisions),
  knowledgeDocuments: many(projectKnowledgeDocuments),
  publicWebSearchCaptures: many(publicWebSearchCaptures),
  opportunityResearchStates: many(projectOpportunityResearchStates)
}));

export const mainWebsiteRelations = relations(mainWebsites, ({ many, one }) => ({
  project: one(projects, { fields: [mainWebsites.projectId], references: [projects.id] }),
  importRuns: many(websiteImportRuns)
}));

export const websiteImportRunRelations = relations(websiteImportRuns, ({ one }) => ({
  project: one(projects, { fields: [websiteImportRuns.projectId], references: [projects.id] }),
  mainWebsite: one(mainWebsites, { fields: [websiteImportRuns.mainWebsiteId], references: [mainWebsites.id] })
}));

export const technicalAuditRunRelations = relations(technicalAuditRuns, ({ many, one }) => ({
  project: one(projects, { fields: [technicalAuditRuns.projectId], references: [projects.id] }),
  findings: many(technicalAuditFindings)
}));

export const technicalAuditFindingRelations = relations(technicalAuditFindings, ({ one }) => ({
  project: one(projects, { fields: [technicalAuditFindings.projectId], references: [projects.id] }),
  auditRun: one(technicalAuditRuns, {
    fields: [technicalAuditFindings.auditRunId],
    references: [technicalAuditRuns.id]
  })
}));

export const userRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  ownedCustomers: many(customers),
  memberships: many(customerMemberships),
  createdMediaAssets: many(mediaAssets, { relationName: "mediaAssetCreator" }),
  archivedMediaAssets: many(mediaAssets, { relationName: "mediaAssetArchiver" })
}));

export const sessionRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] })
}));

export const accountRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] })
}));

export const customerRelations = relations(customers, ({ many, one }) => ({
  owner: one(users, { fields: [customers.ownerUserId], references: [users.id] }),
  memberships: many(customerMemberships),
  projects: many(projects)
}));

export const customerMembershipRelations = relations(customerMemberships, ({ one }) => ({
  customer: one(customers, { fields: [customerMemberships.customerId], references: [customers.id] }),
  user: one(users, { fields: [customerMemberships.userId], references: [users.id] })
}));

export const pageProposalRelations = relations(pageProposals, ({ many, one }) => ({
  project: one(projects, { fields: [pageProposals.projectId], references: [projects.id] }),
  versions: many(pageVersions)
}));

export const pageVersionRelations = relations(pageVersions, ({ many, one }) => ({
  proposal: one(pageProposals, { fields: [pageVersions.pageProposalId], references: [pageProposals.id] }),
  basedOn: one(pageVersions, {
    fields: [pageVersions.basedOnVersionId],
    references: [pageVersions.id],
    relationName: "pageVersionLineage"
  }),
  derivedVersions: many(pageVersions, { relationName: "pageVersionLineage" }),
  createdBy: one(users, { fields: [pageVersions.createdByUserId], references: [users.id] }),
  sectionNotes: many(pageSectionNotes),
  copySuggestions: many(pageSectionCopySuggestions, { relationName: "copySuggestionBaseVersion" }),
  appliedCopySuggestions: many(pageSectionCopySuggestions, { relationName: "copySuggestionAppliedVersion" }),
  mediaAssets: many(pageVersionMediaAssets)
}));

export const mediaAssetRelations = relations(mediaAssets, ({ many, one }) => ({
  project: one(projects, { fields: [mediaAssets.projectId], references: [projects.id] }),
  createdBy: one(users, {
    fields: [mediaAssets.createdByUserId],
    references: [users.id],
    relationName: "mediaAssetCreator"
  }),
  archivedBy: one(users, {
    fields: [mediaAssets.archivedByUserId],
    references: [users.id],
    relationName: "mediaAssetArchiver"
  }),
  variants: many(mediaAssetVariants),
  pageVersions: many(pageVersionMediaAssets)
}));

export const mediaAssetVariantRelations = relations(mediaAssetVariants, ({ one }) => ({
  mediaAsset: one(mediaAssets, {
    fields: [mediaAssetVariants.mediaAssetId],
    references: [mediaAssets.id]
  })
}));

export const pageVersionMediaAssetRelations = relations(pageVersionMediaAssets, ({ one }) => ({
  pageVersion: one(pageVersions, {
    fields: [pageVersionMediaAssets.pageVersionId],
    references: [pageVersions.id]
  }),
  mediaAsset: one(mediaAssets, {
    fields: [pageVersionMediaAssets.mediaAssetId],
    references: [mediaAssets.id]
  })
}));

export const pageSectionCopySuggestionRelations = relations(pageSectionCopySuggestions, ({ one }) => ({
  pageVersion: one(pageVersions, {
    fields: [pageSectionCopySuggestions.pageVersionId],
    references: [pageVersions.id],
    relationName: "copySuggestionBaseVersion"
  }),
  appliedPageVersion: one(pageVersions, {
    fields: [pageSectionCopySuggestions.appliedPageVersionId],
    references: [pageVersions.id],
    relationName: "copySuggestionAppliedVersion"
  }),
  agentRun: one(agentRuns, {
    fields: [pageSectionCopySuggestions.agentRunId],
    references: [agentRuns.id]
  })
}));

export const pageSectionNoteRelations = relations(pageSectionNotes, ({ one }) => ({
  pageVersion: one(pageVersions, { fields: [pageSectionNotes.pageVersionId], references: [pageVersions.id] }),
  createdBy: one(users, { fields: [pageSectionNotes.createdByUserId], references: [users.id] }),
  resolvedBy: one(users, { fields: [pageSectionNotes.resolvedByUserId], references: [users.id] })
}));

export const agentRunRelations = relations(agentRuns, ({ many, one }) => ({
  project: one(projects, { fields: [agentRuns.projectId], references: [projects.id] }),
  opportunities: many(opportunities),
  pageSectionCopySuggestions: many(pageSectionCopySuggestions),
  steps: many(agentRunSteps),
  events: many(agentRunEvents),
  evidenceItems: many(agentRunEvidenceItems),
  publicWebSearchCaptures: many(publicWebSearchCaptures)
}));

export const agentRunStepRelations = relations(agentRunSteps, ({ many, one }) => ({
  run: one(agentRuns, { fields: [agentRunSteps.agentRunId], references: [agentRuns.id] }),
  events: many(agentRunEvents),
  evidenceLinks: many(agentRunStepEvidenceLinks)
}));

export const agentRunEvidenceItemRelations = relations(agentRunEvidenceItems, ({ many, one }) => ({
  run: one(agentRuns, { fields: [agentRunEvidenceItems.agentRunId], references: [agentRuns.id] }),
  stepLinks: many(agentRunStepEvidenceLinks)
}));

export const projectKnowledgeDocumentRelations = relations(projectKnowledgeDocuments, ({ many, one }) => ({
  project: one(projects, { fields: [projectKnowledgeDocuments.projectId], references: [projects.id] }),
  versions: many(projectKnowledgeVersions)
}));

export const projectKnowledgeVersionRelations = relations(projectKnowledgeVersions, ({ many, one }) => ({
  document: one(projectKnowledgeDocuments, {
    fields: [projectKnowledgeVersions.documentId],
    references: [projectKnowledgeDocuments.id]
  }),
  scopes: many(projectKnowledgeTaskScopes),
  outgoingLinks: many(projectKnowledgeLinks, { relationName: "knowledgeLinkFrom" }),
  incomingLinks: many(projectKnowledgeLinks, { relationName: "knowledgeLinkTo" })
}));

export const opportunityRelations = relations(opportunities, ({ many, one }) => ({
  project: one(projects, { fields: [opportunities.projectId], references: [projects.id] }),
  agentRun: one(agentRuns, { fields: [opportunities.agentRunId], references: [agentRuns.id] }),
  decidedBy: one(users, { fields: [opportunities.decidedByUserId], references: [users.id] }),
  pageProposals: many(pageProposals)
}));

export const rankingProofRelations = relations(rankingProofs, ({ one }) => ({
  project: one(projects, { fields: [rankingProofs.projectId], references: [projects.id] }),
  createdBy: one(users, { fields: [rankingProofs.createdByUserId], references: [users.id] }),
  reviewedBy: one(users, { fields: [rankingProofs.reviewedByUserId], references: [users.id] }),
  invalidatedBy: one(users, { fields: [rankingProofs.invalidatedByUserId], references: [users.id] })
}));

export const releasePlanRelations = relations(releasePlans, ({ many, one }) => ({
  project: one(projects, { fields: [releasePlans.projectId], references: [projects.id] }),
  createdBy: one(users, { fields: [releasePlans.createdByUserId], references: [users.id] }),
  items: many(releasePlanItems),
  checks: many(releaseChecks),
  notes: many(releaseNotes),
  deployments: many(deployments),
  verifications: many(releaseVerifications),
  rollbackPoints: many(rollbackPoints)
}));

export const deploymentRelations = relations(deployments, ({ many, one }) => ({
  project: one(projects, { fields: [deployments.projectId], references: [projects.id] }),
  releasePlan: one(releasePlans, { fields: [deployments.releasePlanId], references: [releasePlans.id] }),
  verifications: many(releaseVerifications),
  rollbackPoints: many(rollbackPoints)
}));

export const releaseVerificationRelations = relations(releaseVerifications, ({ many, one }) => ({
  releasePlan: one(releasePlans, { fields: [releaseVerifications.releasePlanId], references: [releasePlans.id] }),
  deployment: one(deployments, { fields: [releaseVerifications.deploymentId], references: [deployments.id] }),
  checks: many(releaseVerificationChecks)
}));

export const releaseVerificationCheckRelations = relations(releaseVerificationChecks, ({ one }) => ({
  verification: one(releaseVerifications, {
    fields: [releaseVerificationChecks.verificationId],
    references: [releaseVerifications.id]
  })
}));

export const gscConnectionRelations = relations(gscConnections, ({ many, one }) => ({
  project: one(projects, { fields: [gscConnections.projectId], references: [projects.id] }),
  syncRuns: many(gscSyncRuns)
}));

export const gscSyncRunRelations = relations(gscSyncRuns, ({ many, one }) => ({
  project: one(projects, { fields: [gscSyncRuns.projectId], references: [projects.id] }),
  connection: one(gscConnections, { fields: [gscSyncRuns.connectionId], references: [gscConnections.id] }),
  rows: many(gscSearchAnalyticsRows),
  opportunitySignals: many(gscOpportunitySignals)
}));

export const gscSearchAnalyticsRowRelations = relations(gscSearchAnalyticsRows, ({ one, many }) => ({
  project: one(projects, { fields: [gscSearchAnalyticsRows.projectId], references: [projects.id] }),
  syncRun: one(gscSyncRuns, { fields: [gscSearchAnalyticsRows.syncRunId], references: [gscSyncRuns.id] }),
  opportunitySignals: many(gscOpportunitySignals)
}));

export const gscOpportunitySignalRelations = relations(gscOpportunitySignals, ({ one }) => ({
  project: one(projects, { fields: [gscOpportunitySignals.projectId], references: [projects.id] }),
  syncRun: one(gscSyncRuns, { fields: [gscOpportunitySignals.syncRunId], references: [gscSyncRuns.id] }),
  row: one(gscSearchAnalyticsRows, { fields: [gscOpportunitySignals.rowId], references: [gscSearchAnalyticsRows.id] })
}));
