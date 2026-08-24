import { sql } from "drizzle-orm";
import { businessProfileStatuses, canonicalEntitySourceKinds, canonicalEntityStatuses } from "@localseo/contracts";
import type { ProjectBusinessProfileContent } from "@localseo/contracts";
import {
  boolean,
  check,
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
import { timestamps } from "./common.js";
import { customers, users } from "./identity.js";
import { websiteImportRuns } from "./website-import.js";
export const businessProfileStatusEnum = pgEnum("business_profile_status", businessProfileStatuses);
export const canonicalEntityStatusEnum = pgEnum("canonical_entity_status", canonicalEntityStatuses);
export const canonicalEntitySourceKindEnum = pgEnum("canonical_entity_source_kind", canonicalEntitySourceKinds);
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
