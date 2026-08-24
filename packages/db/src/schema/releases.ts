import { sql } from "drizzle-orm";
import {
  approvalStatuses,
  deploymentStatuses,
  providerOperationStatuses,
  releaseCheckResults,
  releaseCheckSeverities,
  releaseItemActions,
  releaseNoteAudiences,
  releasePlanStatuses,
  releaseVerificationStatuses
} from "@localseo/contracts";
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./common.js";
import { users } from "./identity.js";
import { projects } from "./projects.js";
import { pageVersions } from "./pages.js";
export const releaseStatusEnum = pgEnum("release_status", releasePlanStatuses);
export const deploymentStatusEnum = pgEnum("deployment_status", deploymentStatuses);
export const providerOperationStatusEnum = pgEnum("provider_operation_status", providerOperationStatuses);
export const releaseVerificationStatusEnum = pgEnum("release_verification_status", releaseVerificationStatuses);
export const releaseNoteAudienceEnum = pgEnum("release_note_audience", releaseNoteAudiences);
export const releaseSeverityEnum = pgEnum("release_check_severity", releaseCheckSeverities);
export const releaseCheckResultEnum = pgEnum("release_check_result", releaseCheckResults);
export const releaseItemActionEnum = pgEnum("release_item_action", releaseItemActions);
export const approvalStatusEnum = pgEnum("approval_status", approvalStatuses);
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
