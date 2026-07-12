CREATE TYPE "public"."section_copy_suggestion_status" AS ENUM('queued', 'generating', 'ready', 'failed', 'applied', 'dismissed');--> statement-breakpoint
CREATE TABLE "page_section_copy_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"page_version_id" uuid NOT NULL,
	"section_id" text NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"status" "section_copy_suggestion_status" DEFAULT 'queued' NOT NULL,
	"instruction" text,
	"suggested_props" jsonb,
	"failure_code" text,
	"failure_message" text,
	"applied_page_version_id" uuid,
	"applied_by_user_id" uuid,
	"dismissed_by_user_id" uuid,
	"ready_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "agent_runs_recovery_scan_idx";--> statement-breakpoint
ALTER TABLE "page_section_copy_suggestions" ADD CONSTRAINT "page_section_copy_suggestions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_section_copy_suggestions" ADD CONSTRAINT "page_section_copy_suggestions_page_version_id_page_versions_id_fk" FOREIGN KEY ("page_version_id") REFERENCES "public"."page_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_section_copy_suggestions" ADD CONSTRAINT "page_section_copy_suggestions_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_section_copy_suggestions" ADD CONSTRAINT "page_section_copy_suggestions_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_section_copy_suggestions" ADD CONSTRAINT "page_section_copy_suggestions_applied_page_version_id_page_versions_id_fk" FOREIGN KEY ("applied_page_version_id") REFERENCES "public"."page_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_section_copy_suggestions" ADD CONSTRAINT "page_section_copy_suggestions_applied_by_user_id_users_id_fk" FOREIGN KEY ("applied_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_section_copy_suggestions" ADD CONSTRAINT "page_section_copy_suggestions_dismissed_by_user_id_users_id_fk" FOREIGN KEY ("dismissed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "page_section_copy_suggestions_agent_run_idx" ON "page_section_copy_suggestions" USING btree ("agent_run_id");--> statement-breakpoint
CREATE INDEX "page_section_copy_suggestions_version_created_idx" ON "page_section_copy_suggestions" USING btree ("page_version_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "page_section_copy_suggestions_active_idx" ON "page_section_copy_suggestions" USING btree ("page_version_id","section_id") WHERE "page_section_copy_suggestions"."status" in ('queued', 'generating', 'ready');--> statement-breakpoint
CREATE INDEX "agent_runs_recovery_scan_idx" ON "agent_runs" USING btree ("task","status","updated_at") WHERE "agent_runs"."task" in ('page_brief_draft', 'section_text_generation') and "agent_runs"."status" in ('queued', 'running');