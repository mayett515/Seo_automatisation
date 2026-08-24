import {
  gscConnectionStatuses,
  gscOpportunitySignalStatuses,
  gscOpportunitySignalTypes,
  gscSyncStatuses
} from "@localseo/contracts";
import { doublePrecision, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./common.js";
import { projects } from "./projects.js";
export const gscConnectionStatusEnum = pgEnum("gsc_connection_status", gscConnectionStatuses);
export const gscSyncStatusEnum = pgEnum("gsc_sync_status", gscSyncStatuses);
export const gscOpportunitySignalTypeEnum = pgEnum("gsc_opportunity_signal_type", gscOpportunitySignalTypes);
export const gscOpportunitySignalStatusEnum = pgEnum("gsc_opportunity_signal_status", gscOpportunitySignalStatuses);
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
