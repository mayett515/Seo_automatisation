DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "reports" LIMIT 1) THEN
    RAISE EXCEPTION 'Cannot replace the skeletal reports table while legacy report rows exist.';
  END IF;
END;
$$;--> statement-breakpoint
DROP TABLE "reports";--> statement-breakpoint
CREATE TYPE "public"."customer_report_claim_kind" AS ENUM('ranking_result', 'page_delivery', 'provider_handoff', 'live_health', 'release_warning', 'rollback_correction', 'future_opportunity');--> statement-breakpoint
CREATE TYPE "public"."customer_report_evidence_kind" AS ENUM('ranking_proof', 'page_version', 'deployment', 'release_verification', 'release_verification_check', 'rollback', 'opportunity');--> statement-breakpoint
CREATE TYPE "public"."customer_report_generation_status" AS ENUM('queued', 'assembling', 'narrative_running', 'validating', 'succeeded', 'failed', 'cancelled', 'stale');--> statement-breakpoint
CREATE TYPE "public"."customer_report_kind" AS ENUM('monthly_seo_progress');--> statement-breakpoint
CREATE TYPE "public"."customer_report_lifecycle_event_type" AS ENUM('report_generated', 'submitted_for_review', 'changes_requested', 'published', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."customer_report_narrative_mode" AS ENUM('fact_only', 'bounded_ai');--> statement-breakpoint
CREATE TYPE "public"."customer_report_section" AS ENUM('ranking_results', 'page_delivery', 'live_health', 'warnings', 'rollback_corrections', 'future_opportunities');--> statement-breakpoint
CREATE TYPE "public"."customer_report_status" AS ENUM('draft', 'ready_for_review', 'published', 'superseded');--> statement-breakpoint
CREATE TABLE "report_claim_evidence" (
	"report_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_claim_evidence_claim_id_evidence_id_pk" PRIMARY KEY("claim_id","evidence_id")
);
--> statement-breakpoint
CREATE TABLE "report_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"claim_key" text NOT NULL,
	"claim_kind" "customer_report_claim_kind" NOT NULL,
	"section" "customer_report_section" NOT NULL,
	"ordinal" integer NOT NULL,
	"claim_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_claims_ordinal_check" CHECK ("report_claims"."ordinal" >= 0)
);
--> statement-breakpoint
CREATE TABLE "report_evidence_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"evidence_key" text NOT NULL,
	"source_kind" "customer_report_evidence_kind" NOT NULL,
	"source_id" uuid NOT NULL,
	"source_version" text NOT NULL,
	"proof_tier" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"selected_at_cutoff" timestamp with time zone NOT NULL,
	"payload_sha256" text NOT NULL,
	"ranking_proof_id" uuid,
	"page_version_id" uuid,
	"deployment_id" uuid,
	"release_verification_id" uuid,
	"release_verification_check_id" uuid,
	"rollback_point_id" uuid,
	"opportunity_id" uuid,
	"evidence_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_evidence_items_payload_sha256_check" CHECK ("report_evidence_items"."payload_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "report_evidence_items_proof_tier_check" CHECK ("report_evidence_items"."proof_tier" in ('customer_safe_proof', 'supporting_context')),
	CONSTRAINT "report_evidence_items_source_reference_check" CHECK (("report_evidence_items"."source_kind" = 'ranking_proof' and "report_evidence_items"."ranking_proof_id" = "report_evidence_items"."source_id" and "report_evidence_items"."page_version_id" is null and "report_evidence_items"."deployment_id" is null and "report_evidence_items"."release_verification_id" is null and "report_evidence_items"."release_verification_check_id" is null and "report_evidence_items"."rollback_point_id" is null and "report_evidence_items"."opportunity_id" is null) or ("report_evidence_items"."source_kind" = 'page_version' and "report_evidence_items"."page_version_id" = "report_evidence_items"."source_id" and "report_evidence_items"."ranking_proof_id" is null and "report_evidence_items"."deployment_id" is null and "report_evidence_items"."release_verification_id" is null and "report_evidence_items"."release_verification_check_id" is null and "report_evidence_items"."rollback_point_id" is null and "report_evidence_items"."opportunity_id" is null) or ("report_evidence_items"."source_kind" = 'deployment' and "report_evidence_items"."deployment_id" = "report_evidence_items"."source_id" and "report_evidence_items"."ranking_proof_id" is null and "report_evidence_items"."page_version_id" is null and "report_evidence_items"."release_verification_id" is null and "report_evidence_items"."release_verification_check_id" is null and "report_evidence_items"."rollback_point_id" is null and "report_evidence_items"."opportunity_id" is null) or ("report_evidence_items"."source_kind" = 'release_verification' and "report_evidence_items"."release_verification_id" = "report_evidence_items"."source_id" and "report_evidence_items"."ranking_proof_id" is null and "report_evidence_items"."page_version_id" is null and "report_evidence_items"."deployment_id" is null and "report_evidence_items"."release_verification_check_id" is null and "report_evidence_items"."rollback_point_id" is null and "report_evidence_items"."opportunity_id" is null) or ("report_evidence_items"."source_kind" = 'release_verification_check' and "report_evidence_items"."release_verification_check_id" = "report_evidence_items"."source_id" and "report_evidence_items"."ranking_proof_id" is null and "report_evidence_items"."page_version_id" is null and "report_evidence_items"."deployment_id" is null and "report_evidence_items"."rollback_point_id" is null and "report_evidence_items"."opportunity_id" is null) or ("report_evidence_items"."source_kind" = 'rollback' and "report_evidence_items"."rollback_point_id" = "report_evidence_items"."source_id" and "report_evidence_items"."ranking_proof_id" is null and "report_evidence_items"."page_version_id" is null and "report_evidence_items"."deployment_id" is null and "report_evidence_items"."release_verification_id" is null and "report_evidence_items"."release_verification_check_id" is null and "report_evidence_items"."opportunity_id" is null) or ("report_evidence_items"."source_kind" = 'opportunity' and "report_evidence_items"."opportunity_id" = "report_evidence_items"."source_id" and "report_evidence_items"."ranking_proof_id" is null and "report_evidence_items"."page_version_id" is null and "report_evidence_items"."deployment_id" is null and "report_evidence_items"."release_verification_id" is null and "report_evidence_items"."release_verification_check_id" is null and "report_evidence_items"."rollback_point_id" is null))
);
--> statement-breakpoint
CREATE TABLE "report_generation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"report_issue_id" uuid NOT NULL,
	"status" "customer_report_generation_status" DEFAULT 'queued' NOT NULL,
	"narrative_mode" "customer_report_narrative_mode" DEFAULT 'fact_only' NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"queue_job_id" text NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"base_issue_row_version" integer NOT NULL,
	"base_candidate_report_id" uuid,
	"base_candidate_row_version" integer,
	"base_candidate_snapshot_sha256" text,
	"result_report_id" uuid,
	"evidence_cutoff_at" timestamp with time zone NOT NULL,
	"evidence_packet_canonical_text" text,
	"evidence_packet_sha256" text,
	"assembler_version" text NOT NULL,
	"report_schema_version" text NOT NULL,
	"eligibility_policy_version" text NOT NULL,
	"action_selection_policy_version" text NOT NULL,
	"customer_safety_policy_version" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"failure_code" text,
	"failure_message" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_generation_runs_base_issue_version_check" CHECK ("report_generation_runs"."base_issue_row_version" >= 0),
	CONSTRAINT "report_generation_runs_attempt_count_check" CHECK ("report_generation_runs"."attempt_count" >= 0),
	CONSTRAINT "report_generation_runs_base_candidate_check" CHECK (("report_generation_runs"."base_candidate_report_id" is null and "report_generation_runs"."base_candidate_row_version" is null and "report_generation_runs"."base_candidate_snapshot_sha256" is null) or ("report_generation_runs"."base_candidate_report_id" is not null and "report_generation_runs"."base_candidate_row_version" is not null and "report_generation_runs"."base_candidate_snapshot_sha256" ~ '^[0-9a-f]{64}$')),
	CONSTRAINT "report_generation_runs_evidence_packet_check" CHECK (("report_generation_runs"."evidence_packet_canonical_text" is null and "report_generation_runs"."evidence_packet_sha256" is null) or ("report_generation_runs"."evidence_packet_canonical_text" is not null and "report_generation_runs"."evidence_packet_sha256" ~ '^[0-9a-f]{64}$')),
	CONSTRAINT "report_generation_runs_failure_check" CHECK (("report_generation_runs"."failure_code" is null and "report_generation_runs"."failure_message" is null) or ("report_generation_runs"."failure_code" is not null and "report_generation_runs"."failure_message" is not null))
);
--> statement-breakpoint
CREATE TABLE "report_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"report_kind" "customer_report_kind" NOT NULL,
	"period" text NOT NULL,
	"locale" text NOT NULL,
	"timezone" text NOT NULL,
	"current_candidate_report_id" uuid,
	"current_published_report_id" uuid,
	"row_version" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_issues_period_check" CHECK ("report_issues"."period" ~ '^\d{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "report_issues_locale_check" CHECK ("report_issues"."locale" = 'de-DE'),
	CONSTRAINT "report_issues_timezone_check" CHECK ("report_issues"."timezone" = 'Europe/Berlin'),
	CONSTRAINT "report_issues_row_version_check" CHECK ("report_issues"."row_version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "report_lifecycle_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"report_issue_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"generation_run_id" uuid,
	"event_type" "customer_report_lifecycle_event_type" NOT NULL,
	"from_status" "customer_report_status",
	"to_status" "customer_report_status" NOT NULL,
	"actor_type" text NOT NULL,
	"actor_user_id" uuid,
	"request_id" uuid NOT NULL,
	"snapshot_sha256" text NOT NULL,
	"decision_note" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_lifecycle_events_snapshot_sha256_check" CHECK ("report_lifecycle_events"."snapshot_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "report_lifecycle_events_actor_type_check" CHECK ("report_lifecycle_events"."actor_type" in ('human', 'system')),
	CONSTRAINT "report_lifecycle_events_human_actor_check" CHECK (("report_lifecycle_events"."event_type" = 'report_generated' and "report_lifecycle_events"."actor_type" = 'system') or ("report_lifecycle_events"."event_type" <> 'report_generated' and "report_lifecycle_events"."actor_type" = 'human' and "report_lifecycle_events"."actor_user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"report_issue_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"status" "customer_report_status" DEFAULT 'draft' NOT NULL,
	"snapshot_canonical_text" text NOT NULL,
	"snapshot_sha256" text NOT NULL,
	"fact_projection_sha256" text NOT NULL,
	"schema_version" text NOT NULL,
	"assembler_version" text NOT NULL,
	"eligibility_policy_version" text NOT NULL,
	"action_selection_policy_version" text NOT NULL,
	"narrative_policy_version" text NOT NULL,
	"template_version" text NOT NULL,
	"narrative_mode" "customer_report_narrative_mode" NOT NULL,
	"source_generation_run_id" uuid NOT NULL,
	"source_agent_run_id" uuid,
	"reviewed_snapshot_sha256" text,
	"supersedes_report_id" uuid,
	"correction_reason" text,
	"created_by_actor_type" text DEFAULT 'system' NOT NULL,
	"created_by_user_id" uuid,
	"ready_at" timestamp with time zone,
	"published_by_user_id" uuid,
	"published_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"row_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_version_number_check" CHECK ("reports"."version_number" > 0),
	CONSTRAINT "reports_row_version_check" CHECK ("reports"."row_version" >= 0),
	CONSTRAINT "reports_snapshot_sha256_check" CHECK ("reports"."snapshot_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "reports_fact_projection_sha256_check" CHECK ("reports"."fact_projection_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "reports_reviewed_snapshot_sha256_check" CHECK ("reports"."reviewed_snapshot_sha256" is null or "reports"."reviewed_snapshot_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "reports_actor_type_check" CHECK ("reports"."created_by_actor_type" in ('human', 'system')),
	CONSTRAINT "reports_lifecycle_evidence_check" CHECK (("reports"."status" = 'draft' and "reports"."reviewed_snapshot_sha256" is null and "reports"."ready_at" is null and "reports"."published_at" is null and "reports"."superseded_at" is null) or ("reports"."status" = 'ready_for_review' and "reports"."reviewed_snapshot_sha256" = "reports"."snapshot_sha256" and "reports"."ready_at" is not null and "reports"."published_at" is null and "reports"."superseded_at" is null) or ("reports"."status" = 'published' and "reports"."reviewed_snapshot_sha256" = "reports"."snapshot_sha256" and "reports"."ready_at" is not null and "reports"."published_at" is not null and "reports"."published_by_user_id" is not null and "reports"."superseded_at" is null) or ("reports"."status" = 'superseded' and "reports"."reviewed_snapshot_sha256" = "reports"."snapshot_sha256" and "reports"."ready_at" is not null and "reports"."published_at" is not null and "reports"."published_by_user_id" is not null and "reports"."superseded_at" is not null)),
	CONSTRAINT "reports_correction_identity_check" CHECK (("reports"."supersedes_report_id" is null and "reports"."correction_reason" is null) or ("reports"."supersedes_report_id" is not null and "reports"."correction_reason" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "reports_id_project_idx" ON "reports" USING btree ("id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "report_claims_id_report_project_idx" ON "report_claims" USING btree ("id","report_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "report_evidence_items_id_report_project_idx" ON "report_evidence_items" USING btree ("id","report_id","project_id");--> statement-breakpoint
ALTER TABLE "report_claim_evidence" ADD CONSTRAINT "report_claim_evidence_claim_fk" FOREIGN KEY ("claim_id","report_id","project_id") REFERENCES "public"."report_claims"("id","report_id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_claim_evidence" ADD CONSTRAINT "report_claim_evidence_evidence_fk" FOREIGN KEY ("evidence_id","report_id","project_id") REFERENCES "public"."report_evidence_items"("id","report_id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_claims" ADD CONSTRAINT "report_claims_report_project_fk" FOREIGN KEY ("report_id","project_id") REFERENCES "public"."reports"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_evidence_items" ADD CONSTRAINT "report_evidence_items_ranking_proof_id_ranking_proofs_id_fk" FOREIGN KEY ("ranking_proof_id") REFERENCES "public"."ranking_proofs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_evidence_items" ADD CONSTRAINT "report_evidence_items_page_version_id_page_versions_id_fk" FOREIGN KEY ("page_version_id") REFERENCES "public"."page_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_evidence_items" ADD CONSTRAINT "report_evidence_items_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_evidence_items" ADD CONSTRAINT "report_evidence_items_release_verification_id_release_verifications_id_fk" FOREIGN KEY ("release_verification_id") REFERENCES "public"."release_verifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_evidence_items" ADD CONSTRAINT "report_evidence_items_release_verification_check_id_release_verification_checks_id_fk" FOREIGN KEY ("release_verification_check_id") REFERENCES "public"."release_verification_checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_evidence_items" ADD CONSTRAINT "report_evidence_items_rollback_point_id_rollback_points_id_fk" FOREIGN KEY ("rollback_point_id") REFERENCES "public"."rollback_points"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_evidence_items" ADD CONSTRAINT "report_evidence_items_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_evidence_items" ADD CONSTRAINT "report_evidence_items_report_project_fk" FOREIGN KEY ("report_id","project_id") REFERENCES "public"."reports"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_generation_runs" ADD CONSTRAINT "report_generation_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_generation_runs" ADD CONSTRAINT "report_generation_runs_report_issue_id_report_issues_id_fk" FOREIGN KEY ("report_issue_id") REFERENCES "public"."report_issues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_generation_runs" ADD CONSTRAINT "report_generation_runs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_generation_runs" ADD CONSTRAINT "report_generation_runs_base_candidate_report_id_reports_id_fk" FOREIGN KEY ("base_candidate_report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_generation_runs" ADD CONSTRAINT "report_generation_runs_result_report_id_reports_id_fk" FOREIGN KEY ("result_report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_issues" ADD CONSTRAINT "report_issues_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_issues" ADD CONSTRAINT "report_issues_current_candidate_report_id_reports_id_fk" FOREIGN KEY ("current_candidate_report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_issues" ADD CONSTRAINT "report_issues_current_published_report_id_reports_id_fk" FOREIGN KEY ("current_published_report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_issues" ADD CONSTRAINT "report_issues_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_lifecycle_events" ADD CONSTRAINT "report_lifecycle_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_lifecycle_events" ADD CONSTRAINT "report_lifecycle_events_report_issue_id_report_issues_id_fk" FOREIGN KEY ("report_issue_id") REFERENCES "public"."report_issues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_lifecycle_events" ADD CONSTRAINT "report_lifecycle_events_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_lifecycle_events" ADD CONSTRAINT "report_lifecycle_events_generation_run_id_report_generation_runs_id_fk" FOREIGN KEY ("generation_run_id") REFERENCES "public"."report_generation_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_lifecycle_events" ADD CONSTRAINT "report_lifecycle_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_report_issue_id_report_issues_id_fk" FOREIGN KEY ("report_issue_id") REFERENCES "public"."report_issues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_source_generation_run_id_report_generation_runs_id_fk" FOREIGN KEY ("source_generation_run_id") REFERENCES "public"."report_generation_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_source_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("source_agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_supersedes_report_id_reports_id_fk" FOREIGN KEY ("supersedes_report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_claim_evidence_report_idx" ON "report_claim_evidence" USING btree ("report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "report_claims_report_key_idx" ON "report_claims" USING btree ("report_id","claim_key");--> statement-breakpoint
CREATE UNIQUE INDEX "report_claims_report_ordinal_idx" ON "report_claims" USING btree ("report_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "report_evidence_items_report_key_idx" ON "report_evidence_items" USING btree ("report_id","evidence_key");--> statement-breakpoint
CREATE INDEX "report_evidence_items_source_idx" ON "report_evidence_items" USING btree ("source_kind","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "report_generation_runs_project_idempotency_idx" ON "report_generation_runs" USING btree ("project_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "report_generation_runs_queue_job_idx" ON "report_generation_runs" USING btree ("queue_job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "report_generation_runs_active_issue_idx" ON "report_generation_runs" USING btree ("report_issue_id") WHERE "report_generation_runs"."status" in ('queued', 'assembling', 'narrative_running', 'validating');--> statement-breakpoint
CREATE INDEX "report_generation_runs_issue_created_idx" ON "report_generation_runs" USING btree ("report_issue_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "report_issues_identity_idx" ON "report_issues" USING btree ("project_id","report_kind","period","locale","timezone");--> statement-breakpoint
CREATE UNIQUE INDEX "report_lifecycle_events_request_idx" ON "report_lifecycle_events" USING btree ("project_id","request_id","event_type","report_id");--> statement-breakpoint
CREATE INDEX "report_lifecycle_events_report_occurred_idx" ON "report_lifecycle_events" USING btree ("report_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_issue_version_idx" ON "reports" USING btree ("report_issue_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_open_candidate_issue_idx" ON "reports" USING btree ("report_issue_id") WHERE "reports"."status" in ('draft', 'ready_for_review');--> statement-breakpoint
CREATE UNIQUE INDEX "reports_current_published_issue_idx" ON "reports" USING btree ("report_issue_id") WHERE "reports"."status" = 'published';--> statement-breakpoint
CREATE UNIQUE INDEX "reports_correction_successor_idx" ON "reports" USING btree ("supersedes_report_id") WHERE "reports"."supersedes_report_id" is not null;--> statement-breakpoint
CREATE INDEX "reports_project_status_created_idx" ON "reports" USING btree ("project_id","status","created_at");--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_report_issue_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  candidate record;
  published record;
BEGIN
  IF NEW."project_id" IS DISTINCT FROM OLD."project_id"
    OR NEW."report_kind" IS DISTINCT FROM OLD."report_kind"
    OR NEW."period" IS DISTINCT FROM OLD."period"
    OR NEW."locale" IS DISTINCT FROM OLD."locale"
    OR NEW."timezone" IS DISTINCT FROM OLD."timezone"
    OR NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'Report issue identity and creator evidence are immutable.';
  END IF;

  IF NEW."row_version" <> OLD."row_version" + 1 THEN
    RAISE EXCEPTION 'Report issue updates must increment row_version exactly once.';
  END IF;

  IF NEW."current_candidate_report_id" IS NOT NULL THEN
    SELECT "report_issue_id", "project_id", "status" INTO candidate
    FROM "reports"
    WHERE "id" = NEW."current_candidate_report_id";
    IF NOT FOUND
      OR candidate."report_issue_id" <> NEW."id"
      OR candidate."project_id" <> NEW."project_id"
      OR candidate."status" NOT IN ('draft', 'ready_for_review') THEN
      RAISE EXCEPTION 'Report issue candidate pointer must reference its own open candidate.';
    END IF;
  END IF;

  IF NEW."current_published_report_id" IS NOT NULL THEN
    SELECT "report_issue_id", "project_id", "status" INTO published
    FROM "reports"
    WHERE "id" = NEW."current_published_report_id";
    IF NOT FOUND
      OR published."report_issue_id" <> NEW."id"
      OR published."project_id" <> NEW."project_id"
      OR published."status" <> 'published' THEN
      RAISE EXCEPTION 'Report issue published pointer must reference its own published report.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER report_issues_enforce_update
BEFORE UPDATE ON "report_issues"
FOR EACH ROW EXECUTE FUNCTION enforce_report_issue_update();--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_report_generation_run_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  owning_issue record;
  base_candidate record;
  result_report record;
BEGIN
  SELECT "project_id" INTO owning_issue
  FROM "report_issues"
  WHERE "id" = NEW."report_issue_id";
  IF NOT FOUND OR owning_issue."project_id" <> NEW."project_id" THEN
    RAISE EXCEPTION 'Report generation run must belong to the issue project.';
  END IF;

  IF NEW."base_candidate_report_id" IS NOT NULL THEN
    SELECT "project_id", "report_issue_id" INTO base_candidate
    FROM "reports"
    WHERE "id" = NEW."base_candidate_report_id";
    IF NOT FOUND
      OR base_candidate."project_id" <> NEW."project_id"
      OR base_candidate."report_issue_id" <> NEW."report_issue_id" THEN
      RAISE EXCEPTION 'Report generation base candidate must belong to the same issue and project.';
    END IF;
  END IF;

  IF NEW."result_report_id" IS NOT NULL THEN
    SELECT "project_id", "report_issue_id" INTO result_report
    FROM "reports"
    WHERE "id" = NEW."result_report_id";
    IF NOT FOUND
      OR result_report."project_id" <> NEW."project_id"
      OR result_report."report_issue_id" <> NEW."report_issue_id" THEN
      RAISE EXCEPTION 'Report generation result must belong to the same issue and project.';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW."project_id" IS DISTINCT FROM OLD."project_id"
      OR NEW."report_issue_id" IS DISTINCT FROM OLD."report_issue_id"
      OR NEW."narrative_mode" IS DISTINCT FROM OLD."narrative_mode"
      OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
      OR NEW."queue_job_id" IS DISTINCT FROM OLD."queue_job_id"
      OR NEW."requested_by_user_id" IS DISTINCT FROM OLD."requested_by_user_id"
      OR NEW."base_issue_row_version" IS DISTINCT FROM OLD."base_issue_row_version"
      OR NEW."base_candidate_report_id" IS DISTINCT FROM OLD."base_candidate_report_id"
      OR NEW."base_candidate_row_version" IS DISTINCT FROM OLD."base_candidate_row_version"
      OR NEW."base_candidate_snapshot_sha256" IS DISTINCT FROM OLD."base_candidate_snapshot_sha256"
      OR NEW."evidence_cutoff_at" IS DISTINCT FROM OLD."evidence_cutoff_at"
      OR NEW."assembler_version" IS DISTINCT FROM OLD."assembler_version"
      OR NEW."report_schema_version" IS DISTINCT FROM OLD."report_schema_version"
      OR NEW."eligibility_policy_version" IS DISTINCT FROM OLD."eligibility_policy_version"
      OR NEW."action_selection_policy_version" IS DISTINCT FROM OLD."action_selection_policy_version"
      OR NEW."customer_safety_policy_version" IS DISTINCT FROM OLD."customer_safety_policy_version"
      OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
      RAISE EXCEPTION 'Report generation admission identity is immutable.';
    END IF;

    IF OLD."status" IN ('succeeded', 'failed', 'cancelled', 'stale') AND NEW."status" IS DISTINCT FROM OLD."status" THEN
      RAISE EXCEPTION 'Terminal report generation runs cannot change status.';
    END IF;

    IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
      (OLD."status" = 'queued' AND NEW."status" IN ('assembling', 'validating', 'failed', 'cancelled', 'stale'))
      OR (OLD."status" = 'assembling' AND NEW."status" IN ('narrative_running', 'validating', 'failed', 'cancelled', 'stale'))
      OR (OLD."status" = 'narrative_running' AND NEW."status" IN ('validating', 'failed', 'cancelled', 'stale'))
      OR (OLD."status" = 'validating' AND NEW."status" IN ('succeeded', 'failed', 'cancelled', 'stale'))
    ) THEN
      RAISE EXCEPTION 'Illegal report generation lifecycle transition from % to %.', OLD."status", NEW."status";
    END IF;
  END IF;

  IF NEW."status" = 'succeeded' AND (NEW."result_report_id" IS NULL OR NEW."finished_at" IS NULL OR NEW."failure_code" IS NOT NULL) THEN
    RAISE EXCEPTION 'Succeeded report generation requires a result report and terminal timestamp.';
  END IF;
  IF NEW."status" IN ('failed', 'cancelled', 'stale') AND (NEW."finished_at" IS NULL OR NEW."failure_code" IS NULL) THEN
    RAISE EXCEPTION 'Terminal unsuccessful report generation requires failure evidence.';
  END IF;
  IF NEW."status" <> 'succeeded' AND NEW."result_report_id" IS NOT NULL THEN
    RAISE EXCEPTION 'Only succeeded report generation may reference a result report.';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER report_generation_runs_enforce_write
BEFORE INSERT OR UPDATE ON "report_generation_runs"
FOR EACH ROW EXECUTE FUNCTION enforce_report_generation_run_write();--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_report_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  owning_issue record;
  source_run record;
  predecessor record;
  snapshot_json jsonb;
  expected_claim_count integer;
  expected_evidence_count integer;
  persisted_claim_count integer;
  persisted_evidence_count integer;
  expected_link_count integer;
  persisted_link_count integer;
  persisted_claims_json jsonb;
  persisted_evidence_json jsonb;
  link_projection_mismatch boolean;
BEGIN
  SELECT "project_id" INTO owning_issue
  FROM "report_issues"
  WHERE "id" = NEW."report_issue_id";
  IF NOT FOUND OR owning_issue."project_id" <> NEW."project_id" THEN
    RAISE EXCEPTION 'Report must belong to the issue project.';
  END IF;

  SELECT "project_id", "report_issue_id" INTO source_run
  FROM "report_generation_runs"
  WHERE "id" = NEW."source_generation_run_id";
  IF NOT FOUND OR source_run."project_id" <> NEW."project_id" OR source_run."report_issue_id" <> NEW."report_issue_id" THEN
    RAISE EXCEPTION 'Report source generation run must belong to the same issue and project.';
  END IF;

  IF NEW."supersedes_report_id" IS NOT NULL THEN
    SELECT "project_id", "report_issue_id", "status" INTO predecessor
    FROM "reports"
    WHERE "id" = NEW."supersedes_report_id";
    IF NOT FOUND OR predecessor."project_id" <> NEW."project_id" OR predecessor."report_issue_id" <> NEW."report_issue_id" THEN
      RAISE EXCEPTION 'Report correction predecessor must belong to the same issue and project.';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND NEW."status" <> 'draft' THEN
    RAISE EXCEPTION 'New report versions must begin as draft.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW."project_id" IS DISTINCT FROM OLD."project_id"
      OR NEW."report_issue_id" IS DISTINCT FROM OLD."report_issue_id"
      OR NEW."version_number" IS DISTINCT FROM OLD."version_number"
      OR NEW."supersedes_report_id" IS DISTINCT FROM OLD."supersedes_report_id"
      OR NEW."correction_reason" IS DISTINCT FROM OLD."correction_reason"
      OR NEW."created_by_actor_type" IS DISTINCT FROM OLD."created_by_actor_type"
      OR NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id"
      OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
      RAISE EXCEPTION 'Report identity, version, correction lineage, and creator evidence are immutable.';
    END IF;

    IF NEW."row_version" <> OLD."row_version" + 1 THEN
      RAISE EXCEPTION 'Report updates must increment row_version exactly once.';
    END IF;

    IF NEW."status" IN ('published', 'superseded') AND NEW."status" IS DISTINCT FROM OLD."status" THEN
      RAISE EXCEPTION 'Report publication and supersession are not enabled by the aggregate foundation migration.';
    END IF;

    IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
      (OLD."status" = 'draft' AND NEW."status" = 'ready_for_review')
      OR (OLD."status" = 'ready_for_review' AND NEW."status" = 'draft')
    ) THEN
      RAISE EXCEPTION 'Illegal report lifecycle transition from % to %.', OLD."status", NEW."status";
    END IF;

    IF OLD."status" <> 'draft' AND (
      NEW."snapshot_canonical_text" IS DISTINCT FROM OLD."snapshot_canonical_text"
      OR NEW."snapshot_sha256" IS DISTINCT FROM OLD."snapshot_sha256"
      OR NEW."fact_projection_sha256" IS DISTINCT FROM OLD."fact_projection_sha256"
      OR NEW."schema_version" IS DISTINCT FROM OLD."schema_version"
      OR NEW."assembler_version" IS DISTINCT FROM OLD."assembler_version"
      OR NEW."eligibility_policy_version" IS DISTINCT FROM OLD."eligibility_policy_version"
      OR NEW."action_selection_policy_version" IS DISTINCT FROM OLD."action_selection_policy_version"
      OR NEW."narrative_policy_version" IS DISTINCT FROM OLD."narrative_policy_version"
      OR NEW."template_version" IS DISTINCT FROM OLD."template_version"
      OR NEW."narrative_mode" IS DISTINCT FROM OLD."narrative_mode"
      OR NEW."source_generation_run_id" IS DISTINCT FROM OLD."source_generation_run_id"
      OR NEW."source_agent_run_id" IS DISTINCT FROM OLD."source_agent_run_id"
    ) THEN
      RAISE EXCEPTION 'Reviewed and published report semantics are immutable.';
    END IF;

    IF OLD."status" = 'draft' AND NEW."status" <> 'draft' AND (
      NEW."snapshot_canonical_text" IS DISTINCT FROM OLD."snapshot_canonical_text"
      OR NEW."snapshot_sha256" IS DISTINCT FROM OLD."snapshot_sha256"
      OR NEW."fact_projection_sha256" IS DISTINCT FROM OLD."fact_projection_sha256"
      OR NEW."source_generation_run_id" IS DISTINCT FROM OLD."source_generation_run_id"
      OR NEW."source_agent_run_id" IS DISTINCT FROM OLD."source_agent_run_id"
    ) THEN
      RAISE EXCEPTION 'Submitting a report for review cannot change its semantic snapshot.';
    END IF;

    IF OLD."status" = 'draft' AND NEW."status" = 'ready_for_review' THEN
      snapshot_json := NEW."snapshot_canonical_text"::jsonb;
      IF snapshot_json->>'factProjectionSha256' <> NEW."fact_projection_sha256" THEN
        RAISE EXCEPTION 'Report fact projection digest must match the canonical snapshot before review.';
      END IF;

      expected_claim_count := jsonb_array_length(snapshot_json #> '{factProjection,claims}');
      expected_evidence_count := jsonb_array_length(snapshot_json #> '{factProjection,evidence}');
      SELECT count(*) INTO persisted_claim_count FROM "report_claims" WHERE "report_id" = NEW."id";
      SELECT count(*) INTO persisted_evidence_count FROM "report_evidence_items" WHERE "report_id" = NEW."id";
      SELECT coalesce(jsonb_agg("claim_json" ORDER BY "ordinal"), '[]'::jsonb)
        INTO persisted_claims_json
        FROM "report_claims"
        WHERE "report_id" = NEW."id";
      SELECT coalesce(jsonb_agg("evidence_json" ORDER BY "evidence_key"), '[]'::jsonb)
        INTO persisted_evidence_json
        FROM "report_evidence_items"
        WHERE "report_id" = NEW."id";
      SELECT coalesce(sum(jsonb_array_length("claim_json"->'evidenceKeys')), 0)
        INTO expected_link_count
        FROM "report_claims"
        WHERE "report_id" = NEW."id";
      SELECT count(*) INTO persisted_link_count FROM "report_claim_evidence" WHERE "report_id" = NEW."id";
      SELECT EXISTS (
        SELECT 1
        FROM "report_claims" claim
        WHERE claim."report_id" = NEW."id"
          AND coalesce(
            (
              SELECT jsonb_agg(evidence."evidence_key" ORDER BY evidence."evidence_key")
              FROM "report_claim_evidence" link
              INNER JOIN "report_evidence_items" evidence ON evidence."id" = link."evidence_id"
              WHERE link."report_id" = NEW."id" AND link."claim_id" = claim."id"
            ),
            '[]'::jsonb
          ) IS DISTINCT FROM claim."claim_json"->'evidenceKeys'
      ) INTO link_projection_mismatch;

      IF expected_claim_count <> persisted_claim_count
        OR expected_evidence_count <> persisted_evidence_count
        OR expected_link_count <> persisted_link_count
        OR persisted_claims_json IS DISTINCT FROM snapshot_json #> '{factProjection,claims}'
        OR persisted_evidence_json IS DISTINCT FROM snapshot_json #> '{factProjection,evidence}'
        OR link_projection_mismatch THEN
        RAISE EXCEPTION 'Report normalized provenance must match the exact canonical snapshot before review.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER reports_enforce_write
BEFORE INSERT OR UPDATE ON "reports"
FOR EACH ROW EXECUTE FUNCTION enforce_report_write();--> statement-breakpoint

CREATE OR REPLACE FUNCTION prevent_reviewed_report_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" <> 'draft' THEN
    RAISE EXCEPTION 'Reviewed, published, and superseded reports cannot be deleted.';
  END IF;
  RETURN OLD;
END;
$$;--> statement-breakpoint

CREATE TRIGGER reports_prevent_reviewed_delete
BEFORE DELETE ON "reports"
FOR EACH ROW EXECUTE FUNCTION prevent_reviewed_report_delete();--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_draft_report_projection_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_report_id uuid;
  target_status customer_report_status;
BEGIN
  target_report_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."report_id" ELSE NEW."report_id" END;
  SELECT "status" INTO target_status
  FROM "reports"
  WHERE "id" = target_report_id
  FOR UPDATE;
  IF NOT FOUND OR target_status <> 'draft' THEN
    RAISE EXCEPTION 'Report claims, evidence, and links may change only while the report is draft.';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;--> statement-breakpoint

CREATE TRIGGER report_claims_enforce_draft
BEFORE INSERT OR UPDATE OR DELETE ON "report_claims"
FOR EACH ROW EXECUTE FUNCTION enforce_draft_report_projection_write();--> statement-breakpoint
CREATE TRIGGER report_evidence_items_enforce_draft
BEFORE INSERT OR UPDATE OR DELETE ON "report_evidence_items"
FOR EACH ROW EXECUTE FUNCTION enforce_draft_report_projection_write();--> statement-breakpoint
CREATE TRIGGER report_claim_evidence_enforce_draft
BEFORE INSERT OR UPDATE OR DELETE ON "report_claim_evidence"
FOR EACH ROW EXECUTE FUNCTION enforce_draft_report_projection_write();--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_report_lifecycle_event_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_report record;
  generation_run record;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Report lifecycle events are append-only.';
  END IF;

  SELECT "project_id", "report_issue_id", "snapshot_sha256", "status" INTO target_report
  FROM "reports"
  WHERE "id" = NEW."report_id";
  IF NOT FOUND
    OR target_report."project_id" <> NEW."project_id"
    OR target_report."report_issue_id" <> NEW."report_issue_id"
    OR target_report."snapshot_sha256" <> NEW."snapshot_sha256" THEN
    RAISE EXCEPTION 'Report lifecycle event must bind the exact report issue, project, and snapshot digest.';
  END IF;

  IF target_report."status" <> NEW."to_status" THEN
    RAISE EXCEPTION 'Report lifecycle event destination must match current report truth.';
  END IF;

  IF NEW."event_type" = 'report_generated' THEN
    IF NEW."generation_run_id" IS NULL
      OR NEW."actor_type" <> 'system'
      OR NEW."actor_user_id" IS NOT NULL
      OR NEW."to_status" <> 'draft'
      OR NEW."from_status" NOT IN ('draft') AND NEW."from_status" IS NOT NULL
      OR NEW."request_id" <> NEW."generation_run_id"
      OR NEW."decision_note" IS NOT NULL THEN
      RAISE EXCEPTION 'ReportGenerated lifecycle evidence must describe one exact system generation transition.';
    END IF;

    SELECT "project_id", "report_issue_id", "result_report_id", "status" INTO generation_run
    FROM "report_generation_runs"
    WHERE "id" = NEW."generation_run_id";
    IF NOT FOUND
      OR generation_run."project_id" <> NEW."project_id"
      OR generation_run."report_issue_id" <> NEW."report_issue_id"
      OR generation_run."result_report_id" <> NEW."report_id"
      OR generation_run."status" <> 'succeeded' THEN
      RAISE EXCEPTION 'ReportGenerated lifecycle evidence must bind its succeeded generation run.';
    END IF;
  ELSIF NEW."event_type" = 'submitted_for_review' THEN
    IF NEW."generation_run_id" IS NOT NULL
      OR NEW."actor_type" <> 'human'
      OR NEW."actor_user_id" IS NULL
      OR NEW."from_status" <> 'draft'
      OR NEW."to_status" <> 'ready_for_review'
      OR NEW."decision_note" IS NOT NULL THEN
      RAISE EXCEPTION 'Submitted-for-review lifecycle evidence must describe one exact human review transition.';
    END IF;
  ELSIF NEW."event_type" = 'changes_requested' THEN
    IF NEW."generation_run_id" IS NOT NULL
      OR NEW."actor_type" <> 'human'
      OR NEW."actor_user_id" IS NULL
      OR NEW."from_status" <> 'ready_for_review'
      OR NEW."to_status" <> 'draft'
      OR NEW."decision_note" IS NULL
      OR btrim(NEW."decision_note") = ''
      OR length(NEW."decision_note") > 2000 THEN
      RAISE EXCEPTION 'Changes-requested lifecycle evidence must describe one exact human review transition.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Publication lifecycle events are not enabled by the aggregate foundation migration.';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER report_lifecycle_events_enforce_insert
BEFORE INSERT OR UPDATE OR DELETE ON "report_lifecycle_events"
FOR EACH ROW EXECUTE FUNCTION enforce_report_lifecycle_event_write();
