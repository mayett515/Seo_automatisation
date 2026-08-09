CREATE TYPE "public"."agent_run_event_type" AS ENUM('run.queued', 'run.started', 'run.succeeded', 'run.failed', 'step.started', 'step.succeeded', 'step.failed', 'step.skipped', 'tool.call.requested', 'tool.call.allowed', 'tool.call.blocked', 'tool.result.captured', 'tool.call.failed', 'evidence.bound', 'qa.gate.passed', 'qa.gate.failed', 'proposal.persisted', 'recovery.claimed', 'recovery.exhausted');--> statement-breakpoint
CREATE TYPE "public"."agent_run_evidence_role" AS ENUM('input', 'captured', 'cited', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."agent_run_evidence_source_kind" AS ENUM('business_profile_revision', 'canonical_service', 'canonical_area', 'website_import', 'gsc_row', 'gsc_signal', 'ranking_proof', 'public_web_search_capture', 'knowledge_version', 'technical_audit_finding', 'existing_page');--> statement-breakpoint
CREATE TYPE "public"."agent_run_step_kind" AS ENUM('workflow', 'agent', 'tool', 'qa', 'persist');--> statement-breakpoint
CREATE TYPE "public"."agent_run_step_status" AS ENUM('pending', 'running', 'succeeded', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."agent_workflow_name" AS ENUM('opportunity_research');--> statement-breakpoint
CREATE TYPE "public"."business_profile_status" AS ENUM('draft', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."canonical_entity_source_kind" AS ENUM('manual', 'website_import', 'knowledge');--> statement-breakpoint
CREATE TYPE "public"."canonical_entity_status" AS ENUM('proposed', 'confirmed', 'rejected', 'retired');--> statement-breakpoint
CREATE TYPE "public"."knowledge_link_kind" AS ENUM('supports', 'supersedes', 'related', 'derived_from');--> statement-breakpoint
CREATE TYPE "public"."knowledge_source_kind" AS ENUM('human', 'agent', 'website_import', 'field_evidence', 'research');--> statement-breakpoint
CREATE TYPE "public"."knowledge_task_scope" AS ENUM('opportunity_research', 'page_proposal', 'section_copy', 'customer_report');--> statement-breakpoint
CREATE TYPE "public"."knowledge_version_status" AS ENUM('proposed', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."opportunity_evidence_readiness" AS ENUM('internal_signal', 'supporting_context', 'reviewed_proof');--> statement-breakpoint
CREATE TYPE "public"."opportunity_lane" AS ENUM('defend_advance', 'quick_win', 'build_cluster', 'strategic_market');--> statement-breakpoint
CREATE TYPE "public"."opportunity_ranking_milestone" AS ENUM('unverified', 'outside_top_10', 'top_10', 'top_5', 'top_3', 'rank_1');--> statement-breakpoint
CREATE TYPE "public"."opportunity_research_status" AS ENUM('idle', 'needs_research', 'queued', 'running', 'succeeded', 'failed', 'paused');--> statement-breakpoint
CREATE TYPE "public"."opportunity_value_band" AS ENUM('unknown', 'low', 'medium', 'high');--> statement-breakpoint
ALTER TABLE "ranking_proofs" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TYPE "public"."ranking_proof_status" RENAME TO "ranking_proof_status_old";--> statement-breakpoint
CREATE TYPE "public"."ranking_proof_status" AS ENUM('captured', 'reviewed', 'invalidated');--> statement-breakpoint
ALTER TABLE "ranking_proofs" ALTER COLUMN "status" TYPE "public"."ranking_proof_status" USING "status"::text::"public"."ranking_proof_status";--> statement-breakpoint
DROP TYPE "public"."ranking_proof_status_old";--> statement-breakpoint
CREATE TABLE "agent_run_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"agent_run_step_id" uuid,
	"sequence" integer GENERATED ALWAYS AS IDENTITY (sequence name "agent_run_events_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"event_key" text NOT NULL,
	"event_type" "agent_run_event_type" NOT NULL,
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"artifact_ref" text,
	"artifact_sha256" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_run_events_artifact_check" CHECK (("agent_run_events"."artifact_ref" is null and "agent_run_events"."artifact_sha256" is null) or ("agent_run_events"."artifact_ref" is not null and "agent_run_events"."artifact_sha256" ~ '^[0-9a-f]{64}$'))
);
--> statement-breakpoint
CREATE TABLE "agent_run_evidence_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"evidence_key" text NOT NULL,
	"source_kind" "agent_run_evidence_source_kind" NOT NULL,
	"source_id" uuid NOT NULL,
	"source_version" text NOT NULL,
	"payload_sha256" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"proof_tier" text NOT NULL,
	"evidence_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_run_evidence_sha256_check" CHECK ("agent_run_evidence_items"."payload_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "agent_run_evidence_proof_tier_check" CHECK ("agent_run_evidence_items"."proof_tier" in ('internal_signal', 'supporting_context', 'customer_safe_proof'))
);
--> statement-breakpoint
CREATE TABLE "agent_run_step_evidence_links" (
	"project_id" uuid NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"agent_run_step_id" uuid NOT NULL,
	"evidence_item_id" uuid NOT NULL,
	"role" "agent_run_evidence_role" NOT NULL,
	"ordinal" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_run_step_evidence_links_agent_run_step_id_evidence_item_id_role_pk" PRIMARY KEY("agent_run_step_id","evidence_item_id","role"),
	CONSTRAINT "agent_run_step_evidence_ordinal_check" CHECK ("agent_run_step_evidence_links"."ordinal" >= 0)
);
--> statement-breakpoint
CREATE TABLE "agent_run_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"step_key" text NOT NULL,
	"step_kind" "agent_run_step_kind" NOT NULL,
	"status" "agent_run_step_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"row_version" integer DEFAULT 0 NOT NULL,
	"agent_role" text,
	"tool_key" text,
	"provider" text,
	"model" text,
	"input_ref" text,
	"input_sha256" text,
	"output_ref" text,
	"output_sha256" text,
	"output_json" jsonb,
	"usage_json" jsonb,
	"failure_code" text,
	"failure_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_run_steps_attempt_check" CHECK ("agent_run_steps"."attempt_count" between 0 and 20),
	CONSTRAINT "agent_run_steps_row_version_check" CHECK ("agent_run_steps"."row_version" >= 0),
	CONSTRAINT "agent_run_steps_identity_check" CHECK (("agent_run_steps"."step_kind" = 'agent' and "agent_run_steps"."agent_role" is not null and "agent_run_steps"."tool_key" is null) or ("agent_run_steps"."step_kind" = 'tool' and "agent_run_steps"."tool_key" is not null and "agent_run_steps"."agent_role" is null) or ("agent_run_steps"."step_kind" not in ('agent', 'tool') and "agent_run_steps"."agent_role" is null and "agent_run_steps"."tool_key" is null)),
	CONSTRAINT "agent_run_steps_terminal_evidence_check" CHECK (("agent_run_steps"."status" in ('pending', 'running') and "agent_run_steps"."completed_at" is null and "agent_run_steps"."failure_code" is null and "agent_run_steps"."failure_message" is null) or ("agent_run_steps"."status" = 'succeeded' and "agent_run_steps"."completed_at" is not null and "agent_run_steps"."failure_code" is null and "agent_run_steps"."failure_message" is null and "agent_run_steps"."output_sha256" ~ '^[0-9a-f]{64}$') or ("agent_run_steps"."status" = 'failed' and "agent_run_steps"."completed_at" is not null and "agent_run_steps"."failure_code" is not null and "agent_run_steps"."failure_message" is not null) or ("agent_run_steps"."status" = 'skipped' and "agent_run_steps"."completed_at" is not null and "agent_run_steps"."failure_code" is null and "agent_run_steps"."failure_message" is null))
);
--> statement-breakpoint
CREATE TABLE "project_business_profile_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"profile_json" jsonb NOT NULL,
	"profile_sha256" text NOT NULL,
	"source_import_run_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_business_profile_revisions_revision_check" CHECK ("project_business_profile_revisions"."revision" > 0),
	CONSTRAINT "project_business_profile_revisions_sha256_check" CHECK ("project_business_profile_revisions"."profile_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "project_business_profiles" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"current_revision_id" uuid,
	"status" "business_profile_status" DEFAULT 'draft' NOT NULL,
	"row_version" integer DEFAULT 0 NOT NULL,
	"confirmed_at" timestamp with time zone,
	"confirmed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_business_profiles_row_version_check" CHECK ("project_business_profiles"."row_version" >= 0),
	CONSTRAINT "project_business_profiles_confirmation_check" CHECK (("project_business_profiles"."status" = 'draft' and "project_business_profiles"."confirmed_at" is null and "project_business_profiles"."confirmed_by_user_id" is null) or ("project_business_profiles"."status" = 'confirmed' and "project_business_profiles"."current_revision_id" is not null and "project_business_profiles"."confirmed_at" is not null and "project_business_profiles"."confirmed_by_user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "project_knowledge_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"document_key" text NOT NULL,
	"current_approved_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_knowledge_documents_key_check" CHECK ("project_knowledge_documents"."document_key" ~ '^[a-z0-9]+([._-][a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "project_knowledge_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"from_version_id" uuid NOT NULL,
	"to_version_id" uuid NOT NULL,
	"kind" "knowledge_link_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_knowledge_links_not_self_check" CHECK ("project_knowledge_links"."from_version_id" <> "project_knowledge_links"."to_version_id")
);
--> statement-breakpoint
CREATE TABLE "project_knowledge_task_scopes" (
	"project_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"task_scope" "knowledge_task_scope" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_knowledge_task_scopes_version_id_task_scope_pk" PRIMARY KEY("version_id","task_scope")
);
--> statement-breakpoint
CREATE TABLE "project_knowledge_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"body_markdown" text NOT NULL,
	"status" "knowledge_version_status" DEFAULT 'proposed' NOT NULL,
	"source_kind" "knowledge_source_kind" NOT NULL,
	"source_id" uuid,
	"source_agent_run_id" uuid,
	"content_sha256" text NOT NULL,
	"created_by_user_id" uuid,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_knowledge_versions_version_check" CHECK ("project_knowledge_versions"."version" > 0),
	CONSTRAINT "project_knowledge_versions_sha256_check" CHECK ("project_knowledge_versions"."content_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "project_knowledge_versions_source_check" CHECK (("project_knowledge_versions"."source_kind" = 'agent' and "project_knowledge_versions"."source_agent_run_id" is not null and "project_knowledge_versions"."created_by_user_id" is null) or ("project_knowledge_versions"."source_kind" <> 'agent' and "project_knowledge_versions"."source_agent_run_id" is null and "project_knowledge_versions"."created_by_user_id" is not null)),
	CONSTRAINT "project_knowledge_versions_review_check" CHECK (("project_knowledge_versions"."status" = 'proposed' and "project_knowledge_versions"."reviewed_by_user_id" is null and "project_knowledge_versions"."reviewed_at" is null and "project_knowledge_versions"."rejection_reason" is null) or ("project_knowledge_versions"."status" = 'approved' and "project_knowledge_versions"."reviewed_by_user_id" is not null and "project_knowledge_versions"."reviewed_at" is not null and "project_knowledge_versions"."rejection_reason" is null) or ("project_knowledge_versions"."status" = 'rejected' and "project_knowledge_versions"."reviewed_by_user_id" is not null and "project_knowledge_versions"."reviewed_at" is not null and "project_knowledge_versions"."rejection_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "project_opportunity_research_states" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"status" "opportunity_research_status" DEFAULT 'idle' NOT NULL,
	"row_version" integer DEFAULT 0 NOT NULL,
	"material_digest" text,
	"last_successful_digest" text,
	"active_run_id" uuid,
	"next_scheduled_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"paused_by_user_id" uuid,
	"pause_reason" text,
	"portfolio_shortfalls_json" jsonb DEFAULT '{"defendAdvance":2,"quickBuild":4,"strategic":2}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_opportunity_research_row_version_check" CHECK ("project_opportunity_research_states"."row_version" >= 0),
	CONSTRAINT "project_opportunity_research_digest_check" CHECK (("project_opportunity_research_states"."material_digest" is null or "project_opportunity_research_states"."material_digest" ~ '^[0-9a-f]{64}$') and ("project_opportunity_research_states"."last_successful_digest" is null or "project_opportunity_research_states"."last_successful_digest" ~ '^[0-9a-f]{64}$')),
	CONSTRAINT "project_opportunity_research_pause_check" CHECK ((("project_opportunity_research_states"."paused_at" is null and "project_opportunity_research_states"."paused_by_user_id" is null and "project_opportunity_research_states"."pause_reason" is null) or ("project_opportunity_research_states"."paused_at" is not null and "project_opportunity_research_states"."paused_by_user_id" is not null and "project_opportunity_research_states"."pause_reason" is not null)) and ("project_opportunity_research_states"."status" <> 'paused' or "project_opportunity_research_states"."paused_at" is not null)),
	CONSTRAINT "project_opportunity_research_active_run_check" CHECK (("project_opportunity_research_states"."status" in ('queued', 'running') and "project_opportunity_research_states"."active_run_id" is not null) or ("project_opportunity_research_states"."status" not in ('queued', 'running') and "project_opportunity_research_states"."active_run_id" is null))
);
--> statement-breakpoint
CREATE TABLE "public_web_search_captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"query" text NOT NULL,
	"provider" text DEFAULT 'duckduckgo_html' NOT NULL,
	"requested_locale" text NOT NULL,
	"effective_locale" text NOT NULL,
	"observed_locale" text,
	"research_ordinal" integer NOT NULL,
	"round" integer NOT NULL,
	"status" text NOT NULL,
	"failure_code" text,
	"results_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_policy" text DEFAULT 'research_support_only' NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_web_search_captures_provider_check" CHECK ("public_web_search_captures"."provider" = 'duckduckgo_html'),
	CONSTRAINT "public_web_search_captures_ordinal_check" CHECK ("public_web_search_captures"."research_ordinal" between 1 and 12),
	CONSTRAINT "public_web_search_captures_round_check" CHECK ("public_web_search_captures"."round" between 1 and 2),
	CONSTRAINT "public_web_search_captures_status_check" CHECK (("public_web_search_captures"."status" = 'succeeded' and "public_web_search_captures"."failure_code" is null) or ("public_web_search_captures"."status" = 'failed' and "public_web_search_captures"."failure_code" in ('provider_timeout', 'provider_unavailable', 'provider_blocked', 'invalid_response', 'policy_denied'))),
	CONSTRAINT "public_web_search_captures_evidence_policy_check" CHECK ("public_web_search_captures"."evidence_policy" = 'research_support_only')
);
--> statement-breakpoint
ALTER TABLE "opportunities" ALTER COLUMN "classification" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "opportunities" ALTER COLUMN "classification" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "opportunities" ALTER COLUMN "score" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "opportunities" ALTER COLUMN "score" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ranking_proofs" ALTER COLUMN "status" SET DEFAULT 'captured';--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "workflow_name" "agent_workflow_name";--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "workflow_version" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "constraint_profile_version" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "requested_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "trigger_source" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "parent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "input_sha256" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "output_sha256" text;--> statement-breakpoint
ALTER TABLE "areas" ADD COLUMN "status" "canonical_entity_status" DEFAULT 'proposed' NOT NULL;--> statement-breakpoint
ALTER TABLE "areas" ADD COLUMN "source_kind" "canonical_entity_source_kind" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "areas" ADD COLUMN "source_id" uuid;--> statement-breakpoint
ALTER TABLE "areas" ADD COLUMN "row_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "areas" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "areas" ADD COLUMN "confirmed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "ranking_milestone" "opportunity_ranking_milestone";--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "evidence_readiness" "opportunity_evidence_readiness";--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "business_value" "opportunity_value_band";--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "market_difficulty" "opportunity_value_band";--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "execution_effort" "opportunity_value_band";--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "lane" "opportunity_lane";--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "policy_version" text;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "research_material_digest" text;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "candidate_key" text;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "portfolio_selected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "portfolio_order" integer;--> statement-breakpoint
ALTER TABLE "ranking_proofs" ADD COLUMN "row_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ranking_proofs" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ranking_proofs" ADD COLUMN "reviewed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "status" "canonical_entity_status" DEFAULT 'proposed' NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "source_kind" "canonical_entity_source_kind" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "source_id" uuid;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "row_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "confirmed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_run_events" ADD CONSTRAINT "agent_run_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_events" ADD CONSTRAINT "agent_run_events_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_events" ADD CONSTRAINT "agent_run_events_agent_run_step_id_agent_run_steps_id_fk" FOREIGN KEY ("agent_run_step_id") REFERENCES "public"."agent_run_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_evidence_items" ADD CONSTRAINT "agent_run_evidence_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_evidence_items" ADD CONSTRAINT "agent_run_evidence_items_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_step_evidence_links" ADD CONSTRAINT "agent_run_step_evidence_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_step_evidence_links" ADD CONSTRAINT "agent_run_step_evidence_links_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_step_evidence_links" ADD CONSTRAINT "agent_run_step_evidence_links_agent_run_step_id_agent_run_steps_id_fk" FOREIGN KEY ("agent_run_step_id") REFERENCES "public"."agent_run_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_step_evidence_links" ADD CONSTRAINT "agent_run_step_evidence_links_evidence_item_id_agent_run_evidence_items_id_fk" FOREIGN KEY ("evidence_item_id") REFERENCES "public"."agent_run_evidence_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_steps" ADD CONSTRAINT "agent_run_steps_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_steps" ADD CONSTRAINT "agent_run_steps_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_business_profile_revisions" ADD CONSTRAINT "project_business_profile_revisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_business_profile_revisions" ADD CONSTRAINT "project_business_profile_revisions_source_import_run_id_website_import_runs_id_fk" FOREIGN KEY ("source_import_run_id") REFERENCES "public"."website_import_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_business_profile_revisions" ADD CONSTRAINT "project_business_profile_revisions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_business_profiles" ADD CONSTRAINT "project_business_profiles_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_business_profiles" ADD CONSTRAINT "project_business_profiles_current_revision_id_project_business_profile_revisions_id_fk" FOREIGN KEY ("current_revision_id") REFERENCES "public"."project_business_profile_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_business_profiles" ADD CONSTRAINT "project_business_profiles_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_knowledge_documents" ADD CONSTRAINT "project_knowledge_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_knowledge_links" ADD CONSTRAINT "project_knowledge_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_knowledge_links" ADD CONSTRAINT "project_knowledge_links_from_version_id_project_knowledge_versions_id_fk" FOREIGN KEY ("from_version_id") REFERENCES "public"."project_knowledge_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_knowledge_links" ADD CONSTRAINT "project_knowledge_links_to_version_id_project_knowledge_versions_id_fk" FOREIGN KEY ("to_version_id") REFERENCES "public"."project_knowledge_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_knowledge_task_scopes" ADD CONSTRAINT "project_knowledge_task_scopes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_knowledge_task_scopes" ADD CONSTRAINT "project_knowledge_task_scopes_version_id_project_knowledge_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."project_knowledge_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_knowledge_versions" ADD CONSTRAINT "project_knowledge_versions_document_id_project_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."project_knowledge_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_knowledge_versions" ADD CONSTRAINT "project_knowledge_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_knowledge_versions" ADD CONSTRAINT "project_knowledge_versions_source_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("source_agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_knowledge_versions" ADD CONSTRAINT "project_knowledge_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_knowledge_versions" ADD CONSTRAINT "project_knowledge_versions_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_opportunity_research_states" ADD CONSTRAINT "project_opportunity_research_states_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_opportunity_research_states" ADD CONSTRAINT "project_opportunity_research_states_active_run_id_agent_runs_id_fk" FOREIGN KEY ("active_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_opportunity_research_states" ADD CONSTRAINT "project_opportunity_research_states_paused_by_user_id_users_id_fk" FOREIGN KEY ("paused_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_web_search_captures" ADD CONSTRAINT "public_web_search_captures_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_web_search_captures" ADD CONSTRAINT "public_web_search_captures_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_run_events_run_key_idx" ON "agent_run_events" USING btree ("agent_run_id","event_key");--> statement-breakpoint
CREATE INDEX "agent_run_events_run_sequence_idx" ON "agent_run_events" USING btree ("agent_run_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_run_evidence_run_key_idx" ON "agent_run_evidence_items" USING btree ("agent_run_id","evidence_key");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_run_evidence_id_run_project_idx" ON "agent_run_evidence_items" USING btree ("id","agent_run_id","project_id");--> statement-breakpoint
CREATE INDEX "agent_run_evidence_source_idx" ON "agent_run_evidence_items" USING btree ("project_id","source_kind","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_run_step_evidence_order_idx" ON "agent_run_step_evidence_links" USING btree ("agent_run_step_id","role","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_run_steps_run_key_idx" ON "agent_run_steps" USING btree ("agent_run_id","step_key");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_run_steps_id_run_project_idx" ON "agent_run_steps" USING btree ("id","agent_run_id","project_id");--> statement-breakpoint
CREATE INDEX "agent_run_steps_run_status_idx" ON "agent_run_steps" USING btree ("agent_run_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "project_business_profile_revisions_project_revision_idx" ON "project_business_profile_revisions" USING btree ("project_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "project_business_profile_revisions_id_project_idx" ON "project_business_profile_revisions" USING btree ("id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_knowledge_documents_project_key_idx" ON "project_knowledge_documents" USING btree ("project_id","document_key");--> statement-breakpoint
CREATE UNIQUE INDEX "project_knowledge_documents_id_project_idx" ON "project_knowledge_documents" USING btree ("id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_knowledge_links_identity_idx" ON "project_knowledge_links" USING btree ("from_version_id","to_version_id","kind");--> statement-breakpoint
CREATE INDEX "project_knowledge_scopes_project_idx" ON "project_knowledge_task_scopes" USING btree ("project_id","task_scope");--> statement-breakpoint
CREATE UNIQUE INDEX "project_knowledge_versions_document_version_idx" ON "project_knowledge_versions" USING btree ("document_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "project_knowledge_versions_id_project_idx" ON "project_knowledge_versions" USING btree ("id","project_id");--> statement-breakpoint
CREATE INDEX "project_knowledge_versions_project_status_idx" ON "project_knowledge_versions" USING btree ("project_id","status","created_at");--> statement-breakpoint
CREATE INDEX "project_knowledge_versions_simple_fts_idx" ON "project_knowledge_versions" USING gin (to_tsvector('simple', "title" || ' ' || "body_markdown"));--> statement-breakpoint
CREATE INDEX "project_opportunity_research_scan_idx" ON "project_opportunity_research_states" USING btree ("status","next_scheduled_at","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "public_web_search_captures_run_ordinal_idx" ON "public_web_search_captures" USING btree ("agent_run_id","research_ordinal");--> statement-breakpoint
CREATE INDEX "public_web_search_captures_project_captured_idx" ON "public_web_search_captures" USING btree ("project_id","captured_at");--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_parent_run_id_agent_runs_id_fk" FOREIGN KEY ("parent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_proofs" ADD CONSTRAINT "ranking_proofs_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_id_project_idx" ON "agent_runs" USING btree ("id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_project_idempotency_idx" ON "agent_runs" USING btree ("project_id","idempotency_key") WHERE "agent_runs"."idempotency_key" is not null;--> statement-breakpoint
WITH ranked_services AS (
  SELECT
    "id",
    first_value("id") OVER (PARTITION BY "project_id", lower("name") ORDER BY "id") AS keep_id,
    row_number() OVER (PARTITION BY "project_id", lower("name") ORDER BY "id") AS duplicate_ordinal
  FROM "services"
)
UPDATE "opportunities" AS opportunity
SET "service_id" = ranked_services.keep_id
FROM ranked_services
WHERE ranked_services.duplicate_ordinal > 1
  AND opportunity."service_id" = ranked_services."id";--> statement-breakpoint
WITH ranked_services AS (
  SELECT
    "id",
    row_number() OVER (PARTITION BY "project_id", lower("name") ORDER BY "id") AS duplicate_ordinal
  FROM "services"
)
DELETE FROM "services" AS service
USING ranked_services
WHERE ranked_services.duplicate_ordinal > 1
  AND service."id" = ranked_services."id";--> statement-breakpoint
WITH ranked_areas AS (
  SELECT
    "id",
    first_value("id") OVER (PARTITION BY "project_id", lower("name") ORDER BY "id") AS keep_id,
    row_number() OVER (PARTITION BY "project_id", lower("name") ORDER BY "id") AS duplicate_ordinal
  FROM "areas"
)
UPDATE "opportunities" AS opportunity
SET "area_id" = ranked_areas.keep_id
FROM ranked_areas
WHERE ranked_areas.duplicate_ordinal > 1
  AND opportunity."area_id" = ranked_areas."id";--> statement-breakpoint
WITH ranked_areas AS (
  SELECT
    "id",
    row_number() OVER (PARTITION BY "project_id", lower("name") ORDER BY "id") AS duplicate_ordinal
  FROM "areas"
)
DELETE FROM "areas" AS area
USING ranked_areas
WHERE ranked_areas.duplicate_ordinal > 1
  AND area."id" = ranked_areas."id";--> statement-breakpoint
CREATE UNIQUE INDEX "areas_project_normalized_name_idx" ON "areas" USING btree ("project_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "opportunities_project_candidate_key_idx" ON "opportunities" USING btree ("project_id","candidate_key") WHERE "opportunities"."candidate_key" is not null and "opportunities"."status" <> 'rejected';--> statement-breakpoint
CREATE UNIQUE INDEX "opportunities_run_portfolio_order_idx" ON "opportunities" USING btree ("agent_run_id","portfolio_order") WHERE "opportunities"."agent_run_id" is not null and "opportunities"."portfolio_order" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "services_project_normalized_name_idx" ON "services" USING btree ("project_id",lower("name"));--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workflow_identity_check" CHECK (("agent_runs"."workflow_name" is null and "agent_runs"."workflow_version" is null and "agent_runs"."constraint_profile_version" is null and "agent_runs"."input_sha256" is null and "agent_runs"."output_sha256" is null) or ("agent_runs"."workflow_name" is not null and "agent_runs"."workflow_version" is not null and "agent_runs"."constraint_profile_version" is not null and "agent_runs"."input_sha256" ~ '^[0-9a-f]{64}$' and ("agent_runs"."output_sha256" is null or "agent_runs"."output_sha256" ~ '^[0-9a-f]{64}$')));--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workflow_success_digest_check" CHECK ("agent_runs"."workflow_name" is null or "agent_runs"."status" <> 'succeeded' or "agent_runs"."output_sha256" is not null);--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_row_version_check" CHECK ("areas"."row_version" >= 0);--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_research_axes_check" CHECK (("opportunities"."policy_version" is null and "opportunities"."ranking_milestone" is null and "opportunities"."evidence_readiness" is null and "opportunities"."business_value" is null and "opportunities"."market_difficulty" is null and "opportunities"."execution_effort" is null and "opportunities"."lane" is null and "opportunities"."candidate_key" is null and "opportunities"."research_material_digest" is null) or ("opportunities"."policy_version" is not null and "opportunities"."ranking_milestone" is not null and "opportunities"."evidence_readiness" is not null and "opportunities"."business_value" is not null and "opportunities"."market_difficulty" is not null and "opportunities"."execution_effort" is not null and "opportunities"."lane" is not null and "opportunities"."candidate_key" is not null and "opportunities"."research_material_digest" ~ '^[0-9a-f]{64}$'));--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_portfolio_order_check" CHECK (("opportunities"."portfolio_selected" = false and "opportunities"."portfolio_order" is null) or ("opportunities"."portfolio_selected" = true and "opportunities"."portfolio_order" between 1 and 8));--> statement-breakpoint
ALTER TABLE "ranking_proofs" ADD CONSTRAINT "ranking_proofs_row_version_check" CHECK ("ranking_proofs"."row_version" >= 0);--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ranking_proofs"
    WHERE ("status" = 'reviewed' AND "created_by_user_id" IS NULL)
       OR ("status" = 'invalidated' AND coalesce("invalidated_by_user_id", "created_by_user_id") IS NULL)
  ) THEN
    RAISE EXCEPTION 'Ranking-proof lifecycle migration requires an existing persisted actor; repair actorless legacy rows before retrying';
  END IF;
END;
$$;--> statement-breakpoint
UPDATE "ranking_proofs"
SET "reviewed_at" = coalesce("created_at", "captured_at"),
    "reviewed_by_user_id" = "created_by_user_id"
WHERE "status" = 'reviewed';--> statement-breakpoint
UPDATE "ranking_proofs"
SET "reviewed_at" = coalesce("created_at", "captured_at"),
    "reviewed_by_user_id" = coalesce("created_by_user_id", "invalidated_by_user_id"),
    "invalidated_at" = coalesce("invalidated_at", "updated_at", "created_at"),
    "invalidated_by_user_id" = coalesce("invalidated_by_user_id", "created_by_user_id"),
    "invalidation_reason" = coalesce(nullif(btrim("invalidation_reason"), ''), 'Legacy invalidation migrated without a recorded reason.')
WHERE "status" = 'invalidated';--> statement-breakpoint
ALTER TABLE "ranking_proofs" ADD CONSTRAINT "ranking_proofs_lifecycle_evidence_check" CHECK (("ranking_proofs"."status" = 'captured' and "ranking_proofs"."reviewed_at" is null and "ranking_proofs"."reviewed_by_user_id" is null and "ranking_proofs"."invalidated_at" is null and "ranking_proofs"."invalidated_by_user_id" is null and "ranking_proofs"."invalidation_reason" is null) or ("ranking_proofs"."status" = 'reviewed' and "ranking_proofs"."reviewed_at" is not null and "ranking_proofs"."reviewed_by_user_id" is not null and "ranking_proofs"."invalidated_at" is null and "ranking_proofs"."invalidated_by_user_id" is null and "ranking_proofs"."invalidation_reason" is null) or ("ranking_proofs"."status" = 'invalidated' and "ranking_proofs"."reviewed_at" is not null and "ranking_proofs"."reviewed_by_user_id" is not null and "ranking_proofs"."invalidated_at" is not null and "ranking_proofs"."invalidated_by_user_id" is not null and "ranking_proofs"."invalidation_reason" is not null));--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_row_version_check" CHECK ("services"."row_version" >= 0);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_agent_run_step_write()
RETURNS trigger AS $$
DECLARE
  parent_project uuid;
  parent_status agent_run_status;
BEGIN
  SELECT "project_id", "status"
  INTO parent_project, parent_status
  FROM "agent_runs"
  WHERE "id" = NEW."agent_run_id"
  FOR UPDATE;

  IF parent_project IS NULL OR parent_project <> NEW."project_id" THEN
    RAISE EXCEPTION 'Agent run step must match the parent run project';
  END IF;

  IF parent_status NOT IN ('queued', 'running') THEN
    RAISE EXCEPTION 'Agent run steps cannot change after the parent run is terminal';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW."row_version" := 0;
    IF NEW."status" <> 'pending' OR NEW."attempt_count" <> 0 THEN
      RAISE EXCEPTION 'Agent run steps must be inserted pending at attempt zero';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."status" IN ('succeeded', 'skipped') THEN
    RAISE EXCEPTION 'Succeeded or skipped agent run steps are immutable';
  END IF;

  IF NEW."project_id" IS DISTINCT FROM OLD."project_id"
     OR NEW."agent_run_id" IS DISTINCT FROM OLD."agent_run_id"
     OR NEW."step_key" IS DISTINCT FROM OLD."step_key"
     OR NEW."step_kind" IS DISTINCT FROM OLD."step_kind"
     OR NEW."agent_role" IS DISTINCT FROM OLD."agent_role"
     OR NEW."tool_key" IS DISTINCT FROM OLD."tool_key"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'Agent run step identity is immutable';
  END IF;

  IF NEW."row_version" IS DISTINCT FROM OLD."row_version" THEN
    RAISE EXCEPTION 'Agent run step row_version is database-managed';
  END IF;
  NEW."row_version" := OLD."row_version" + 1;

  IF NEW."status" = OLD."status" THEN
    IF OLD."status" <> 'running' OR NEW."attempt_count" <> OLD."attempt_count" THEN
      RAISE EXCEPTION 'Agent run step same-status updates require running state';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."status" = 'pending' AND NEW."status" = 'running' THEN
    IF NEW."attempt_count" <> OLD."attempt_count" + 1 THEN
      RAISE EXCEPTION 'Agent run step claim must increment attempt_count exactly once';
    END IF;
  ELSIF OLD."status" = 'pending' AND NEW."status" = 'skipped' THEN
    IF NEW."attempt_count" <> OLD."attempt_count" THEN
      RAISE EXCEPTION 'Skipped agent run step must not consume an attempt';
    END IF;
  ELSIF OLD."status" = 'running' AND NEW."status" IN ('succeeded', 'failed') THEN
    IF NEW."attempt_count" <> OLD."attempt_count" THEN
      RAISE EXCEPTION 'Terminal agent run step transition must preserve attempt_count';
    END IF;
  ELSIF OLD."status" = 'failed' AND NEW."status" = 'running' THEN
    IF OLD."attempt_count" >= 20 OR NEW."attempt_count" <> OLD."attempt_count" + 1 THEN
      RAISE EXCEPTION 'Agent run step retry is exhausted or has invalid attempt_count';
    END IF;
  ELSE
    RAISE EXCEPTION 'Illegal agent run step status transition';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER agent_run_steps_enforce_write
BEFORE INSERT OR UPDATE ON "agent_run_steps"
FOR EACH ROW EXECUTE FUNCTION enforce_agent_run_step_write();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_agent_run_step_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Agent run steps are durable audit truth and cannot be deleted';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER agent_run_steps_prevent_delete
BEFORE DELETE ON "agent_run_steps"
FOR EACH ROW EXECUTE FUNCTION prevent_agent_run_step_delete();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_agent_run_event_insert()
RETURNS trigger AS $$
DECLARE
  run_project uuid;
  step_run uuid;
  step_project uuid;
BEGIN
  SELECT "project_id" INTO run_project FROM "agent_runs" WHERE "id" = NEW."agent_run_id";
  IF run_project IS NULL OR run_project <> NEW."project_id" THEN
    RAISE EXCEPTION 'Agent run event must match the parent run project';
  END IF;

  IF NEW."agent_run_step_id" IS NOT NULL THEN
    SELECT "agent_run_id", "project_id"
    INTO step_run, step_project
    FROM "agent_run_steps"
    WHERE "id" = NEW."agent_run_step_id";
    IF step_run IS NULL OR step_run <> NEW."agent_run_id" OR step_project <> NEW."project_id" THEN
      RAISE EXCEPTION 'Agent run event step must belong to the same run and project';
    END IF;
  END IF;

  IF octet_length(NEW."payload_json"::text) > 16384 THEN
    RAISE EXCEPTION 'Agent run event payload exceeds 16 KiB';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER agent_run_events_enforce_insert
BEFORE INSERT ON "agent_run_events"
FOR EACH ROW EXECUTE FUNCTION enforce_agent_run_event_insert();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_agent_run_event_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Agent run events are append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER agent_run_events_prevent_update
BEFORE UPDATE ON "agent_run_events"
FOR EACH ROW EXECUTE FUNCTION prevent_agent_run_event_mutation();
--> statement-breakpoint
CREATE TRIGGER agent_run_events_prevent_delete
BEFORE DELETE ON "agent_run_events"
FOR EACH ROW EXECUTE FUNCTION prevent_agent_run_event_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_agent_run_evidence_insert()
RETURNS trigger AS $$
DECLARE
  run_project uuid;
  run_status agent_run_status;
  source_project uuid;
  source_status text;
BEGIN
  SELECT "project_id", "status"
  INTO run_project, run_status
  FROM "agent_runs"
  WHERE "id" = NEW."agent_run_id"
  FOR UPDATE;

  IF run_project IS NULL OR run_project <> NEW."project_id" OR run_status <> 'running' THEN
    RAISE EXCEPTION 'Agent run evidence requires a running parent in the same project';
  END IF;

  CASE NEW."source_kind"
    WHEN 'website_import' THEN
      SELECT "project_id", "status"::text INTO source_project, source_status FROM "website_import_runs" WHERE "id" = NEW."source_id";
      IF source_status <> 'completed' THEN RAISE EXCEPTION 'Website-import evidence must be completed'; END IF;
    WHEN 'gsc_row' THEN
      SELECT "project_id" INTO source_project FROM "gsc_search_analytics_rows" WHERE "id" = NEW."source_id";
    WHEN 'gsc_signal' THEN
      SELECT "project_id" INTO source_project FROM "gsc_opportunity_signals" WHERE "id" = NEW."source_id";
    WHEN 'ranking_proof' THEN
      SELECT "project_id", "status"::text INTO source_project, source_status FROM "ranking_proofs" WHERE "id" = NEW."source_id";
      IF source_status <> 'reviewed' THEN RAISE EXCEPTION 'Ranking-proof evidence must be reviewed'; END IF;
    WHEN 'public_web_search_capture' THEN
      SELECT "project_id", "status" INTO source_project, source_status FROM "public_web_search_captures" WHERE "id" = NEW."source_id";
      IF source_status <> 'succeeded' OR NEW."proof_tier" <> 'supporting_context' THEN
        RAISE EXCEPTION 'Public-web search is supporting context only';
      END IF;
    WHEN 'knowledge_version' THEN
      SELECT "project_id", "status"::text INTO source_project, source_status FROM "project_knowledge_versions" WHERE "id" = NEW."source_id";
      IF source_status <> 'approved' OR NEW."proof_tier" <> 'supporting_context' THEN
        RAISE EXCEPTION 'Knowledge evidence must be approved supporting context';
      END IF;
    WHEN 'technical_audit_finding' THEN
      SELECT "project_id" INTO source_project FROM "technical_audit_findings" WHERE "id" = NEW."source_id";
    WHEN 'existing_page' THEN
      SELECT pp."project_id" INTO source_project
      FROM "page_versions" pv
      INNER JOIN "page_proposals" pp ON pp."id" = pv."page_proposal_id"
      WHERE pv."id" = NEW."source_id";
    ELSE
      RAISE EXCEPTION 'Unsupported agent run evidence source kind';
  END CASE;

  IF source_project IS NULL OR source_project <> NEW."project_id" THEN
    RAISE EXCEPTION 'Agent run evidence source must belong to the same project';
  END IF;
  IF NEW."source_kind" <> 'ranking_proof' AND NEW."proof_tier" = 'customer_safe_proof' THEN
    RAISE EXCEPTION 'Only reviewed ranking proof may be customer-safe evidence in Opportunity Research';
  END IF;
  IF octet_length(NEW."evidence_json"::text) > 16384 THEN
    RAISE EXCEPTION 'Agent run evidence projection exceeds 16 KiB';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER agent_run_evidence_enforce_insert
BEFORE INSERT ON "agent_run_evidence_items"
FOR EACH ROW EXECUTE FUNCTION enforce_agent_run_evidence_insert();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_agent_run_evidence_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Agent run evidence is immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER agent_run_evidence_prevent_update
BEFORE UPDATE ON "agent_run_evidence_items"
FOR EACH ROW EXECUTE FUNCTION prevent_agent_run_evidence_mutation();
--> statement-breakpoint
CREATE TRIGGER agent_run_evidence_prevent_delete
BEFORE DELETE ON "agent_run_evidence_items"
FOR EACH ROW EXECUTE FUNCTION prevent_agent_run_evidence_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_agent_run_step_evidence_link()
RETURNS trigger AS $$
DECLARE
  step_run uuid;
  step_project uuid;
  evidence_run uuid;
  evidence_project uuid;
BEGIN
  SELECT "agent_run_id", "project_id" INTO step_run, step_project FROM "agent_run_steps" WHERE "id" = NEW."agent_run_step_id";
  SELECT "agent_run_id", "project_id" INTO evidence_run, evidence_project FROM "agent_run_evidence_items" WHERE "id" = NEW."evidence_item_id";
  IF step_run IS NULL OR evidence_run IS NULL OR step_run <> NEW."agent_run_id" OR evidence_run <> NEW."agent_run_id"
     OR step_project <> NEW."project_id" OR evidence_project <> NEW."project_id" THEN
    RAISE EXCEPTION 'Agent run step-evidence links must stay inside one run and project';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER agent_run_step_evidence_enforce_insert
BEFORE INSERT ON "agent_run_step_evidence_links"
FOR EACH ROW EXECUTE FUNCTION enforce_agent_run_step_evidence_link();
--> statement-breakpoint
CREATE TRIGGER agent_run_step_evidence_prevent_update
BEFORE UPDATE ON "agent_run_step_evidence_links"
FOR EACH ROW EXECUTE FUNCTION prevent_agent_run_evidence_mutation();
--> statement-breakpoint
CREATE TRIGGER agent_run_step_evidence_prevent_delete
BEFORE DELETE ON "agent_run_step_evidence_links"
FOR EACH ROW EXECUTE FUNCTION prevent_agent_run_evidence_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_project_business_profile_revision()
RETURNS trigger AS $$
DECLARE
  source_project uuid;
BEGIN
  IF octet_length(NEW."profile_json"::text) > 32768 THEN
    RAISE EXCEPTION 'Business profile projection exceeds 32 KiB';
  END IF;
  IF NEW."source_import_run_id" IS NOT NULL THEN
    SELECT "project_id" INTO source_project FROM "website_import_runs" WHERE "id" = NEW."source_import_run_id";
    IF source_project IS NULL OR source_project <> NEW."project_id" THEN
      RAISE EXCEPTION 'Business profile import source must belong to the same project';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER project_business_profile_revisions_enforce_insert
BEFORE INSERT ON "project_business_profile_revisions"
FOR EACH ROW EXECUTE FUNCTION enforce_project_business_profile_revision();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_immutable_row_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Immutable provenance rows cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER project_business_profile_revisions_prevent_update
BEFORE UPDATE ON "project_business_profile_revisions"
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_row_mutation();
--> statement-breakpoint
CREATE TRIGGER project_business_profile_revisions_prevent_delete
BEFORE DELETE ON "project_business_profile_revisions"
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_row_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_project_business_profile_write()
RETURNS trigger AS $$
DECLARE
  revision_project uuid;
BEGIN
  IF NEW."current_revision_id" IS NOT NULL THEN
    SELECT "project_id" INTO revision_project FROM "project_business_profile_revisions" WHERE "id" = NEW."current_revision_id";
    IF revision_project IS NULL OR revision_project <> NEW."project_id" THEN
      RAISE EXCEPTION 'Business profile current revision must belong to the same project';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW."row_version" := 0;
    RETURN NEW;
  END IF;

  IF NEW."project_id" IS DISTINCT FROM OLD."project_id" OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'Business profile identity is immutable';
  END IF;
  IF NEW."row_version" IS DISTINCT FROM OLD."row_version" THEN
    RAISE EXCEPTION 'Business profile row_version is database-managed';
  END IF;
  NEW."row_version" := OLD."row_version" + 1;
  IF OLD."status" = 'draft' AND NEW."status" NOT IN ('draft', 'confirmed') THEN
    RAISE EXCEPTION 'Illegal business profile status transition';
  END IF;
  IF OLD."status" = 'confirmed' AND NEW."status" NOT IN ('confirmed', 'draft') THEN
    RAISE EXCEPTION 'Illegal business profile status transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER project_business_profiles_enforce_write
BEFORE INSERT OR UPDATE ON "project_business_profiles"
FOR EACH ROW EXECUTE FUNCTION enforce_project_business_profile_write();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_canonical_business_entity_write()
RETURNS trigger AS $$
DECLARE
  source_project uuid;
  source_status text;
BEGIN
  IF NEW."source_kind" = 'website_import' THEN
    SELECT "project_id", "status" INTO source_project, source_status FROM "website_import_runs" WHERE "id" = NEW."source_id";
    IF source_project IS NULL OR source_project <> NEW."project_id" OR source_status <> 'completed' THEN
      RAISE EXCEPTION 'Canonical business entity import source must be completed in the same project';
    END IF;
  ELSIF NEW."source_kind" = 'knowledge' THEN
    SELECT "project_id", "status"::text INTO source_project, source_status FROM "project_knowledge_versions" WHERE "id" = NEW."source_id";
    IF source_project IS NULL OR source_project <> NEW."project_id" OR source_status <> 'approved' THEN
      RAISE EXCEPTION 'Canonical business entity knowledge source must be approved in the same project';
    END IF;
  ELSIF NEW."source_kind" = 'manual' AND NEW."source_id" IS NOT NULL THEN
    RAISE EXCEPTION 'Manual canonical business entities cannot claim a source id';
  END IF;
  IF NEW."status" = 'confirmed' AND (NEW."confirmed_at" IS NULL OR NEW."confirmed_by_user_id" IS NULL) THEN
    RAISE EXCEPTION 'Confirmed canonical business entities require actor evidence';
  END IF;
  IF NEW."status" <> 'confirmed' AND (NEW."confirmed_at" IS NOT NULL OR NEW."confirmed_by_user_id" IS NOT NULL) THEN
    RAISE EXCEPTION 'Unconfirmed canonical business entities cannot carry confirmation evidence';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW."row_version" := 0;
    RETURN NEW;
  END IF;
  IF NEW."project_id" IS DISTINCT FROM OLD."project_id"
     OR NEW."name" IS DISTINCT FROM OLD."name"
     OR NEW."source_kind" IS DISTINCT FROM OLD."source_kind"
     OR NEW."source_id" IS DISTINCT FROM OLD."source_id"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'Canonical business entity identity and provenance are immutable';
  END IF;
  IF NEW."row_version" IS DISTINCT FROM OLD."row_version" THEN
    RAISE EXCEPTION 'Canonical business entity row_version is database-managed';
  END IF;
  NEW."row_version" := OLD."row_version" + 1;
  IF OLD."status" <> 'proposed' OR NEW."status" NOT IN ('confirmed', 'rejected') THEN
    RAISE EXCEPTION 'Canonical business entities allow only proposed to confirmed or rejected';
  END IF;
  IF NEW."status" = 'confirmed' AND (NEW."confirmed_at" IS NULL OR NEW."confirmed_by_user_id" IS NULL) THEN
    RAISE EXCEPTION 'Confirmed canonical business entities require actor evidence';
  END IF;
  IF NEW."status" = 'rejected' AND (NEW."confirmed_at" IS NOT NULL OR NEW."confirmed_by_user_id" IS NOT NULL) THEN
    RAISE EXCEPTION 'Rejected canonical business entities cannot carry confirmation evidence';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER services_enforce_write
BEFORE INSERT OR UPDATE ON "services"
FOR EACH ROW EXECUTE FUNCTION enforce_canonical_business_entity_write();
--> statement-breakpoint
CREATE TRIGGER areas_enforce_write
BEFORE INSERT OR UPDATE ON "areas"
FOR EACH ROW EXECUTE FUNCTION enforce_canonical_business_entity_write();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_project_knowledge_version_write()
RETURNS trigger AS $$
DECLARE
  document_project uuid;
  run_project uuid;
BEGIN
  SELECT "project_id" INTO document_project FROM "project_knowledge_documents" WHERE "id" = NEW."document_id" FOR UPDATE;
  IF document_project IS NULL OR document_project <> NEW."project_id" THEN
    RAISE EXCEPTION 'Knowledge version must match its document project';
  END IF;
  IF octet_length(NEW."body_markdown") > 50000 THEN
    RAISE EXCEPTION 'Knowledge Markdown exceeds 50 KiB';
  END IF;
  IF NEW."content_sha256" IS DISTINCT FROM encode(sha256(convert_to(NEW."body_markdown", 'UTF8')), 'hex') THEN
    RAISE EXCEPTION 'Knowledge content digest must match the exact Markdown bytes';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."source_kind" = 'agent' THEN
      SELECT "project_id" INTO run_project FROM "agent_runs" WHERE "id" = NEW."source_agent_run_id";
      IF run_project IS NULL OR run_project <> NEW."project_id" OR NEW."status" <> 'proposed' THEN
        RAISE EXCEPTION 'Agent knowledge must be proposed by a run in the same project';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."status" <> 'proposed' THEN
    RAISE EXCEPTION 'Reviewed knowledge versions are immutable';
  END IF;
  IF NEW."status" NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Knowledge review allows only proposed to approved or rejected';
  END IF;
  IF NEW."document_id" IS DISTINCT FROM OLD."document_id"
     OR NEW."project_id" IS DISTINCT FROM OLD."project_id"
     OR NEW."version" IS DISTINCT FROM OLD."version"
     OR NEW."title" IS DISTINCT FROM OLD."title"
     OR NEW."body_markdown" IS DISTINCT FROM OLD."body_markdown"
     OR NEW."source_kind" IS DISTINCT FROM OLD."source_kind"
     OR NEW."source_id" IS DISTINCT FROM OLD."source_id"
     OR NEW."source_agent_run_id" IS DISTINCT FROM OLD."source_agent_run_id"
     OR NEW."content_sha256" IS DISTINCT FROM OLD."content_sha256"
     OR NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'Knowledge semantic content and provenance are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER project_knowledge_versions_enforce_write
BEFORE INSERT OR UPDATE ON "project_knowledge_versions"
FOR EACH ROW EXECUTE FUNCTION enforce_project_knowledge_version_write();
--> statement-breakpoint
CREATE TRIGGER project_knowledge_versions_prevent_delete
BEFORE DELETE ON "project_knowledge_versions"
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_row_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_project_knowledge_scope_insert()
RETURNS trigger AS $$
DECLARE
  version_project uuid;
  version_status knowledge_version_status;
BEGIN
  SELECT "project_id", "status" INTO version_project, version_status FROM "project_knowledge_versions" WHERE "id" = NEW."version_id" FOR UPDATE;
  IF version_project IS NULL OR version_project <> NEW."project_id" OR version_status <> 'proposed' THEN
    RAISE EXCEPTION 'Knowledge task scopes must be added to a proposed version in the same project';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER project_knowledge_scopes_enforce_insert
BEFORE INSERT ON "project_knowledge_task_scopes"
FOR EACH ROW EXECUTE FUNCTION enforce_project_knowledge_scope_insert();
--> statement-breakpoint
CREATE TRIGGER project_knowledge_scopes_prevent_update
BEFORE UPDATE ON "project_knowledge_task_scopes"
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_row_mutation();
--> statement-breakpoint
CREATE TRIGGER project_knowledge_scopes_prevent_delete
BEFORE DELETE ON "project_knowledge_task_scopes"
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_row_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_project_knowledge_link_insert()
RETURNS trigger AS $$
DECLARE
  from_project uuid;
  to_project uuid;
  from_status knowledge_version_status;
BEGIN
  SELECT "project_id", "status" INTO from_project, from_status FROM "project_knowledge_versions" WHERE "id" = NEW."from_version_id" FOR UPDATE;
  SELECT "project_id" INTO to_project FROM "project_knowledge_versions" WHERE "id" = NEW."to_version_id";
  IF from_project IS NULL OR to_project IS NULL OR from_project <> NEW."project_id" OR to_project <> NEW."project_id" OR from_status <> 'proposed' THEN
    RAISE EXCEPTION 'Knowledge links must connect same-project versions while the source version is proposed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER project_knowledge_links_enforce_insert
BEFORE INSERT ON "project_knowledge_links"
FOR EACH ROW EXECUTE FUNCTION enforce_project_knowledge_link_insert();
--> statement-breakpoint
CREATE TRIGGER project_knowledge_links_prevent_update
BEFORE UPDATE ON "project_knowledge_links"
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_row_mutation();
--> statement-breakpoint
CREATE TRIGGER project_knowledge_links_prevent_delete
BEFORE DELETE ON "project_knowledge_links"
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_row_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_project_knowledge_document_pointer()
RETURNS trigger AS $$
DECLARE
  version_document uuid;
  version_project uuid;
  version_status knowledge_version_status;
BEGIN
  IF NEW."current_approved_version_id" IS NOT NULL THEN
    SELECT "document_id", "project_id", "status"
    INTO version_document, version_project, version_status
    FROM "project_knowledge_versions"
    WHERE "id" = NEW."current_approved_version_id";
    IF version_document IS NULL OR version_document <> NEW."id" OR version_project <> NEW."project_id" OR version_status <> 'approved' THEN
      RAISE EXCEPTION 'Knowledge current pointer must reference an approved version of the same document and project';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW."id" IS DISTINCT FROM OLD."id" OR NEW."project_id" IS DISTINCT FROM OLD."project_id" OR NEW."document_key" IS DISTINCT FROM OLD."document_key" OR NEW."created_at" IS DISTINCT FROM OLD."created_at") THEN
    RAISE EXCEPTION 'Knowledge document identity is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER project_knowledge_documents_enforce_pointer
BEFORE INSERT OR UPDATE ON "project_knowledge_documents"
FOR EACH ROW EXECUTE FUNCTION enforce_project_knowledge_document_pointer();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_ranking_proof_write()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW."row_version" := 0;
    IF NEW."status" <> 'captured' THEN
      RAISE EXCEPTION 'Ranking proofs must be inserted captured';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."project_id" IS DISTINCT FROM OLD."project_id"
     OR NEW."query" IS DISTINCT FROM OLD."query"
     OR NEW."page_url" IS DISTINCT FROM OLD."page_url"
     OR NEW."rank" IS DISTINCT FROM OLD."rank"
     OR NEW."captured_at" IS DISTINCT FROM OLD."captured_at"
     OR NEW."search_engine" IS DISTINCT FROM OLD."search_engine"
     OR NEW."device" IS DISTINCT FROM OLD."device"
     OR NEW."locale" IS DISTINCT FROM OLD."locale"
     OR NEW."screenshot_artifact_key" IS DISTINCT FROM OLD."screenshot_artifact_key"
     OR NEW."notes" IS DISTINCT FROM OLD."notes"
     OR NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id"
     OR NEW."evidence_json" IS DISTINCT FROM OLD."evidence_json"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'Ranking proof captured facts are immutable';
  END IF;
  IF NEW."row_version" IS DISTINCT FROM OLD."row_version" THEN
    RAISE EXCEPTION 'Ranking proof row_version is database-managed';
  END IF;
  NEW."row_version" := OLD."row_version" + 1;

  IF OLD."status" = 'captured' AND NEW."status" = 'reviewed' THEN
    IF NEW."reviewed_at" IS NULL OR NEW."reviewed_by_user_id" IS NULL THEN
      RAISE EXCEPTION 'Ranking proof review requires actor evidence';
    END IF;
  ELSIF OLD."status" = 'reviewed' AND NEW."status" = 'invalidated' THEN
    IF NEW."invalidated_at" IS NULL OR NEW."invalidated_by_user_id" IS NULL OR NEW."invalidation_reason" IS NULL THEN
      RAISE EXCEPTION 'Ranking proof invalidation requires actor evidence and reason';
    END IF;
  ELSE
    RAISE EXCEPTION 'Illegal ranking proof status transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER ranking_proofs_enforce_write
BEFORE INSERT OR UPDATE ON "ranking_proofs"
FOR EACH ROW EXECUTE FUNCTION enforce_ranking_proof_write();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_agent_run_workflow_identity()
RETURNS trigger AS $$
BEGIN
  IF NEW."workflow_name" IS DISTINCT FROM OLD."workflow_name"
     OR NEW."workflow_version" IS DISTINCT FROM OLD."workflow_version"
     OR NEW."constraint_profile_version" IS DISTINCT FROM OLD."constraint_profile_version"
     OR NEW."requested_by_user_id" IS DISTINCT FROM OLD."requested_by_user_id"
     OR NEW."trigger_source" IS DISTINCT FROM OLD."trigger_source"
     OR NEW."parent_run_id" IS DISTINCT FROM OLD."parent_run_id"
     OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
     OR NEW."input_sha256" IS DISTINCT FROM OLD."input_sha256" THEN
    RAISE EXCEPTION 'Agent workflow identity is immutable after admission';
  END IF;
  IF NEW."output_sha256" IS DISTINCT FROM OLD."output_sha256"
     AND NOT (OLD."output_sha256" IS NULL AND OLD."status" = 'running' AND NEW."status" = 'succeeded') THEN
    RAISE EXCEPTION 'Agent workflow output digest may be written only on successful completion';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER agent_runs_enforce_workflow_identity
BEFORE UPDATE ON "agent_runs"
FOR EACH ROW WHEN (OLD."workflow_name" IS NOT NULL)
EXECUTE FUNCTION enforce_agent_run_workflow_identity();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_opportunity_research_state_write()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW."row_version" := 0;
    RETURN NEW;
  END IF;
  IF NEW."project_id" IS DISTINCT FROM OLD."project_id" OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'Opportunity research state identity is immutable';
  END IF;
  IF NEW."row_version" IS DISTINCT FROM OLD."row_version" THEN
    RAISE EXCEPTION 'Opportunity research state row_version is database-managed';
  END IF;
  NEW."row_version" := OLD."row_version" + 1;

  IF NEW."status" = OLD."status" THEN
    RETURN NEW;
  END IF;
  IF OLD."status" = 'idle' AND NEW."status" IN ('needs_research', 'queued', 'paused') THEN RETURN NEW; END IF;
  IF OLD."status" = 'needs_research' AND NEW."status" IN ('queued', 'paused') THEN RETURN NEW; END IF;
  IF OLD."status" = 'queued' AND NEW."status" IN ('running', 'failed', 'needs_research', 'paused') THEN RETURN NEW; END IF;
  IF OLD."status" = 'running' AND NEW."status" IN ('succeeded', 'failed', 'needs_research', 'paused') THEN RETURN NEW; END IF;
  IF OLD."status" IN ('succeeded', 'failed') AND NEW."status" IN ('needs_research', 'queued', 'paused') THEN RETURN NEW; END IF;
  IF OLD."status" = 'paused' AND NEW."status" = 'needs_research' THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Illegal opportunity research state transition';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER project_opportunity_research_states_enforce_write
BEFORE INSERT OR UPDATE ON "project_opportunity_research_states"
FOR EACH ROW EXECUTE FUNCTION enforce_opportunity_research_state_write();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mark_project_opportunity_research_dirty()
RETURNS trigger AS $$
DECLARE
  target_project uuid;
  material_change boolean := true;
BEGIN
  target_project := NEW."project_id";

  IF TG_TABLE_NAME IN ('services', 'areas') THEN
    material_change := NEW."status" = 'confirmed' OR (TG_OP = 'UPDATE' AND OLD."status" = 'confirmed');
  ELSIF TG_TABLE_NAME = 'project_knowledge_documents' THEN
    material_change := NEW."current_approved_version_id" IS DISTINCT FROM OLD."current_approved_version_id";
  ELSIF TG_TABLE_NAME = 'ranking_proofs' THEN
    material_change := NEW."status" = 'reviewed' OR (TG_OP = 'UPDATE' AND OLD."status" = 'reviewed');
  ELSIF TG_TABLE_NAME = 'website_import_runs' THEN
    material_change := NEW."status" = 'completed';
  ELSIF TG_TABLE_NAME = 'gsc_sync_runs' THEN
    material_change := NEW."status" = 'completed';
  END IF;

  IF NOT material_change THEN
    RETURN NEW;
  END IF;

  INSERT INTO "project_opportunity_research_states" (
    "project_id", "status", "material_digest", "next_scheduled_at", "created_at", "updated_at"
  ) VALUES (
    target_project, 'needs_research', NULL, now(), now(), now()
  )
  ON CONFLICT ("project_id") DO UPDATE
  SET "status" = CASE
        WHEN "project_opportunity_research_states"."status" IN ('paused', 'queued', 'running')
          THEN "project_opportunity_research_states"."status"
        ELSE 'needs_research'::opportunity_research_status
      END,
      "material_digest" = NULL,
      "next_scheduled_at" = now(),
      "updated_at" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER project_business_profiles_mark_research_dirty
AFTER INSERT OR UPDATE OF "current_revision_id", "status" ON "project_business_profiles"
FOR EACH ROW EXECUTE FUNCTION mark_project_opportunity_research_dirty();
--> statement-breakpoint
CREATE TRIGGER services_mark_research_dirty
AFTER INSERT OR UPDATE OF "status" ON "services"
FOR EACH ROW EXECUTE FUNCTION mark_project_opportunity_research_dirty();
--> statement-breakpoint
CREATE TRIGGER areas_mark_research_dirty
AFTER INSERT OR UPDATE OF "status" ON "areas"
FOR EACH ROW EXECUTE FUNCTION mark_project_opportunity_research_dirty();
--> statement-breakpoint
CREATE TRIGGER project_knowledge_documents_mark_research_dirty
AFTER UPDATE OF "current_approved_version_id" ON "project_knowledge_documents"
FOR EACH ROW EXECUTE FUNCTION mark_project_opportunity_research_dirty();
--> statement-breakpoint
CREATE TRIGGER ranking_proofs_mark_research_dirty
AFTER INSERT OR UPDATE OF "status" ON "ranking_proofs"
FOR EACH ROW EXECUTE FUNCTION mark_project_opportunity_research_dirty();
--> statement-breakpoint
CREATE TRIGGER website_import_runs_mark_research_dirty
AFTER INSERT OR UPDATE OF "status" ON "website_import_runs"
FOR EACH ROW EXECUTE FUNCTION mark_project_opportunity_research_dirty();
--> statement-breakpoint
CREATE TRIGGER gsc_sync_runs_mark_research_dirty
AFTER INSERT OR UPDATE OF "status" ON "gsc_sync_runs"
FOR EACH ROW EXECUTE FUNCTION mark_project_opportunity_research_dirty();
