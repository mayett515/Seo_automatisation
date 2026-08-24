import {
  technicalAuditFindingCategories,
  technicalAuditFindingSeverities,
  technicalAuditStatuses,
  websiteImportStatuses
} from "@localseo/contracts";
import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./common.js";
import { mainWebsites, projects } from "./projects.js";
export const technicalAuditStatusEnum = pgEnum("technical_audit_status", technicalAuditStatuses);
export const technicalAuditFindingSeverityEnum = pgEnum(
  "technical_audit_finding_severity",
  technicalAuditFindingSeverities
);
export const technicalAuditFindingCategoryEnum = pgEnum(
  "technical_audit_finding_category",
  technicalAuditFindingCategories
);
export const websiteImportStatusEnum = pgEnum("website_import_status", websiteImportStatuses);
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
