import { sql } from "drizzle-orm";
import {
  mediaAssetStatuses,
  pageSectionNoteInstructionTypes,
  pageVersionStatuses,
  sectionCopySuggestionStatuses
} from "@localseo/contracts";
import type { PageJson, PageProposalJson, PageSectionNoteFieldPath } from "@localseo/contracts";
import {
  type AnyPgColumn,
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
import { agentRuns, opportunities } from "./opportunities.js";
import { timestamps } from "./common.js";
import { users } from "./identity.js";
import { projects } from "./projects.js";
export const pageVersionStatusEnum = pgEnum("page_version_status", pageVersionStatuses);
export const pageSectionNoteInstructionTypeEnum = pgEnum(
  "page_section_note_instruction_type",
  pageSectionNoteInstructionTypes
);
export const sectionCopySuggestionStatusEnum = pgEnum("section_copy_suggestion_status", sectionCopySuggestionStatuses);
export const mediaAssetStatusEnum = pgEnum("media_asset_status", mediaAssetStatuses);
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
