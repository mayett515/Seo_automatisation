import { relations, sql } from "drizzle-orm";
import {
  approvalStatuses,
  customerMembershipRoles,
  deploymentStatuses,
  agentRunStatuses,
  opportunityClassifications,
  gscConnectionStatuses,
  gscOpportunitySignalStatuses,
  gscOpportunitySignalTypes,
  gscSyncStatuses,
  jobStatuses,
  providerOperationStatuses,
  reasoningTasks,
  releaseCheckResults,
  releaseCheckSeverities,
  releaseNoteAudiences,
  releasePlanStatuses,
  releaseVerificationStatuses,
  websiteImportStatuses
} from "@localseo/contracts";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

export const jobStatusEnum = pgEnum("job_status", jobStatuses);
export const agentTaskEnum = pgEnum("agent_task", reasoningTasks);
export const agentRunStatusEnum = pgEnum("agent_run_status", agentRunStatuses);
export const opportunityClassificationEnum = pgEnum("opportunity_classification", opportunityClassifications);
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
export const approvalStatusEnum = pgEnum("approval_status", approvalStatuses);
export const customerMembershipRoleEnum = pgEnum("customer_membership_role", customerMembershipRoles);

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

export const domains = pgTable("domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  hostname: text("hostname").notNull(),
  isPrimary: boolean("is_primary").default(false).notNull(),
  ...timestamps
});

export const areas = pgTable("areas", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("city"),
  ...timestamps
});

export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  name: text("name").notNull(),
  ...timestamps
});

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    task: agentTaskEnum("task").notNull(),
    status: agentRunStatusEnum("status").notNull().default("queued"),
    failureCode: text("failure_code"),
    provider: text("provider"),
    model: text("model"),
    inputRef: text("input_ref"),
    outputJson: jsonb("output_json").$type<Record<string, unknown>>(),
    usageJson: jsonb("usage_json").$type<Record<string, unknown>>(),
    diagnosticsJson: jsonb("diagnostics_json").$type<Record<string, unknown>>(),
    latencyMs: integer("latency_ms"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    index("agent_runs_project_task_status_idx").on(table.projectId, table.task, table.status, table.createdAt),
    uniqueIndex("agent_runs_active_per_project_task_idx")
      .on(table.projectId, table.task)
      .where(sql`${table.status} in ('queued', 'running')`)
  ]
);

export const opportunities = pgTable("opportunities", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  agentRunId: uuid("agent_run_id").references(() => agentRuns.id),
  areaId: uuid("area_id").references(() => areas.id),
  serviceId: uuid("service_id").references(() => services.id),
  classification: opportunityClassificationEnum("classification").notNull().default("internal_radar"),
  primaryKeyword: text("primary_keyword").notNull(),
  score: integer("score").default(0).notNull(),
  status: text("status").default("new").notNull(),
  evidenceJson: jsonb("evidence_json").$type<Record<string, unknown>>(),
  ...timestamps
});

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
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    evidenceJson: jsonb("evidence_json").$type<Record<string, unknown>>(),
    ...timestamps
  },
  (table) => [
    index("ranking_proofs_project_captured_idx").on(table.projectId, table.capturedAt),
    index("ranking_proofs_project_query_idx").on(table.projectId, table.query)
  ]
);

export const pageProposals = pgTable("page_proposals", {
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
  ...timestamps
});

export const pageVersions = pgTable("page_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  pageProposalId: uuid("page_proposal_id")
    .notNull()
    .references(() => pageProposals.id),
  versionNumber: integer("version_number").notNull(),
  status: text("status").notNull().default("preview"),
  pageJson: jsonb("page_json").$type<Record<string, unknown>>().notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  ...timestamps
});

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
  action: text("action").notNull(),
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

export const releaseVerifications = pgTable("release_verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  releasePlanId: uuid("release_plan_id")
    .notNull()
    .references(() => releasePlans.id),
  deploymentId: uuid("deployment_id").references(() => deployments.id),
  status: releaseVerificationStatusEnum("status").notNull().default("not_started"),
  summary: text("summary").notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
  evidenceJson: jsonb("evidence_json").$type<Record<string, unknown>>(),
  ...timestamps
});

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

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  title: text("title").notNull(),
  status: text("status").notNull().default("draft"),
  artifactKey: text("artifact_key"),
  ...timestamps
});

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
  agentRuns: many(agentRuns),
  rankingProofs: many(rankingProofs),
  trackingKeys: many(projectTrackingKeys),
  reports: many(reports)
}));

export const mainWebsiteRelations = relations(mainWebsites, ({ many, one }) => ({
  project: one(projects, { fields: [mainWebsites.projectId], references: [projects.id] }),
  importRuns: many(websiteImportRuns)
}));

export const websiteImportRunRelations = relations(websiteImportRuns, ({ one }) => ({
  project: one(projects, { fields: [websiteImportRuns.projectId], references: [projects.id] }),
  mainWebsite: one(mainWebsites, { fields: [websiteImportRuns.mainWebsiteId], references: [mainWebsites.id] })
}));

export const userRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  ownedCustomers: many(customers),
  memberships: many(customerMemberships)
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

export const agentRunRelations = relations(agentRuns, ({ many, one }) => ({
  project: one(projects, { fields: [agentRuns.projectId], references: [projects.id] }),
  opportunities: many(opportunities)
}));

export const opportunityRelations = relations(opportunities, ({ many, one }) => ({
  project: one(projects, { fields: [opportunities.projectId], references: [projects.id] }),
  agentRun: one(agentRuns, { fields: [opportunities.agentRunId], references: [agentRuns.id] }),
  pageProposals: many(pageProposals)
}));

export const rankingProofRelations = relations(rankingProofs, ({ one }) => ({
  project: one(projects, { fields: [rankingProofs.projectId], references: [projects.id] }),
  createdBy: one(users, { fields: [rankingProofs.createdByUserId], references: [users.id] })
}));

export const releasePlanRelations = relations(releasePlans, ({ many, one }) => ({
  project: one(projects, { fields: [releasePlans.projectId], references: [projects.id] }),
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
