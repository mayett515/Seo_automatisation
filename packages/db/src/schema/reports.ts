import { sql } from "drizzle-orm";
import {
  customerReportArtifactFormats,
  customerReportArtifactStatuses,
  customerReportClaimKinds,
  customerReportEvidenceAlertStatuses,
  customerReportEvidenceKinds,
  customerReportGenerationStatuses,
  customerReportKinds,
  customerReportLifecycleEventTypes,
  customerReportNarrativeModes,
  customerReportSections,
  customerReportStatuses
} from "@localseo/contracts";
import type {
  CustomerReportClaim,
  CustomerReportEvidenceItem,
  CustomerReportHtmlRenderManifest
} from "@localseo/contracts";
import {
  type AnyPgColumn,
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
import { agentRuns, opportunities, rankingProofs } from "./opportunities.js";
import { users } from "./identity.js";
import { projects } from "./projects.js";
import { pageVersions } from "./pages.js";
import { deployments, releaseVerificationChecks, releaseVerifications, rollbackPoints } from "./releases.js";
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
