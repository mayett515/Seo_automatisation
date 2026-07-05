CREATE TYPE "public"."serp_snapshot_status" AS ENUM('captured', 'failed');--> statement-breakpoint
CREATE TABLE "serp_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"agent_run_id" uuid,
	"status" "serp_snapshot_status" DEFAULT 'captured' NOT NULL,
	"query" text NOT NULL,
	"search_engine" text DEFAULT 'google' NOT NULL,
	"device" text DEFAULT 'desktop' NOT NULL,
	"locale" text,
	"region" text,
	"cache_key" text NOT NULL,
	"provider" text,
	"results_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"serp_features_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"engine_errors_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"artifact_refs_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "serp_snapshots" ADD CONSTRAINT "serp_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serp_snapshots" ADD CONSTRAINT "serp_snapshots_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "serp_snapshots_project_query_captured_idx" ON "serp_snapshots" USING btree ("project_id","query","captured_at");--> statement-breakpoint
CREATE INDEX "serp_snapshots_project_cache_idx" ON "serp_snapshots" USING btree ("project_id","cache_key");--> statement-breakpoint
CREATE INDEX "serp_snapshots_agent_run_idx" ON "serp_snapshots" USING btree ("agent_run_id");