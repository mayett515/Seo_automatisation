import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid
} from "drizzle-orm/pg-core";

export const jobStatusEnum = pgEnum("job_status", [
  "queued",
  "running",
  "waiting_for_external",
  "waiting_for_approval",
  "completed",
  "failed",
  "cancelled",
  "retrying"
]);

export const releaseStatusEnum = pgEnum("release_status", [
  "draft",
  "ready",
  "ready_with_warnings",
  "blocked",
  "approved_for_deploy",
  "deploying",
  "live",
  "failed",
  "rolled_back"
]);

export const releaseSeverityEnum = pgEnum("release_check_severity", ["info", "warning", "blocker"]);
export const releaseCheckResultEnum = pgEnum("release_check_result", ["passed", "failed", "skipped"]);
export const approvalStatusEnum = pgEnum("approval_status", ["pending", "approved", "rejected", "held"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  ...timestamps
});

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  name: text("name").notNull(),
  ...timestamps
});

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
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  ...timestamps
});

export const mainWebsites = pgTable("main_websites", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  sourceUrl: text("source_url").notNull(),
  netlifySiteId: text("netlify_site_id"),
  ...timestamps
});

export const domains = pgTable("domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  hostname: text("hostname").notNull(),
  isPrimary: boolean("is_primary").default(false).notNull(),
  ...timestamps
});

export const areas = pgTable("areas", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("city"),
  ...timestamps
});

export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  name: text("name").notNull(),
  ...timestamps
});

export const opportunities = pgTable("opportunities", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  areaId: uuid("area_id").references(() => areas.id),
  serviceId: uuid("service_id").references(() => services.id),
  primaryKeyword: text("primary_keyword").notNull(),
  score: integer("score").default(0).notNull(),
  status: text("status").default("new").notNull(),
  evidenceJson: jsonb("evidence_json").$type<Record<string, unknown>>(),
  ...timestamps
});

export const pageProposals = pgTable("page_proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
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
  pageProposalId: uuid("page_proposal_id").notNull().references(() => pageProposals.id),
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
  pageVersionId: uuid("page_version_id").notNull().references(() => pageVersions.id),
  componentTemplateId: uuid("component_template_id").references(() => componentTemplates.id),
  sortOrder: integer("sort_order").notNull(),
  propsJson: jsonb("props_json").$type<Record<string, unknown>>().notNull(),
  ...timestamps
});

export const componentNotes = pgTable("component_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  componentInstanceId: uuid("component_instance_id").notNull().references(() => componentInstances.id),
  authorUserId: uuid("author_user_id").references(() => users.id),
  instructionType: text("instruction_type").notNull(),
  note: text("note").notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  ...timestamps
});

export const approvals = pgTable("approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  pageVersionId: uuid("page_version_id").notNull().references(() => pageVersions.id),
  userId: uuid("user_id").references(() => users.id),
  status: approvalStatusEnum("status").notNull().default("pending"),
  decisionNote: text("decision_note"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  ...timestamps
});

export const releasePlans = pgTable("release_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
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
  releasePlanId: uuid("release_plan_id").notNull().references(() => releasePlans.id),
  pageVersionId: uuid("page_version_id").references(() => pageVersions.id),
  targetUrl: text("target_url").notNull(),
  targetSubdomain: text("target_subdomain"),
  action: text("action").notNull(),
  status: text("status").notNull().default("pending"),
  ...timestamps
});

export const releaseChecks = pgTable("release_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  releasePlanId: uuid("release_plan_id").notNull().references(() => releasePlans.id),
  scope: text("scope").notNull(),
  checkKey: text("check_key").notNull(),
  severity: releaseSeverityEnum("severity").notNull(),
  result: releaseCheckResultEnum("result").notNull(),
  message: text("message").notNull(),
  evidenceJson: jsonb("evidence_json").$type<Record<string, unknown>>(),
  ...timestamps
});

export const deployments = pgTable("deployments", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  releasePlanId: uuid("release_plan_id").references(() => releasePlans.id),
  provider: text("provider").notNull().default("netlify"),
  providerDeployId: text("provider_deploy_id"),
  liveUrl: text("live_url"),
  status: text("status").notNull().default("pending"),
  ...timestamps
});

export const gscConnections = pgTable("gsc_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  propertyUrl: text("property_url").notNull(),
  encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
  ...timestamps
});

export const trackingEvents = pgTable("tracking_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  eventName: text("event_name").notNull(),
  route: text("route").notNull(),
  componentId: text("component_id"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  title: text("title").notNull(),
  status: text("status").notNull().default("draft"),
  artifactKey: text("artifact_key"),
  ...timestamps
});

export const jobRuns = pgTable("job_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id),
  leadId: uuid("lead_id").references(() => leads.id),
  type: text("type").notNull(),
  status: jobStatusEnum("status").notNull().default("queued"),
  inputRef: text("input_ref"),
  failureJson: jsonb("failure_json").$type<Record<string, unknown>>(),
  ...timestamps
});

export const projectRelations = relations(projects, ({ many, one }) => ({
  customer: one(customers, { fields: [projects.customerId], references: [customers.id] }),
  opportunities: many(opportunities),
  pageProposals: many(pageProposals),
  releasePlans: many(releasePlans),
  deployments: many(deployments),
  reports: many(reports)
}));

export const pageProposalRelations = relations(pageProposals, ({ many, one }) => ({
  project: one(projects, { fields: [pageProposals.projectId], references: [projects.id] }),
  versions: many(pageVersions)
}));

export const releasePlanRelations = relations(releasePlans, ({ many, one }) => ({
  project: one(projects, { fields: [releasePlans.projectId], references: [projects.id] }),
  items: many(releasePlanItems),
  checks: many(releaseChecks)
}));

