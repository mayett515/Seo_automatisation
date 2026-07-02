CREATE TYPE "public"."agent_run_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."agent_task" AS ENUM('opportunity_scout', 'page_brief_draft', 'section_text_generation', 'report_narrative');--> statement-breakpoint
CREATE TYPE "public"."opportunity_classification" AS ENUM('proven_win', 'near_term_target', 'internal_radar', 'rejected');--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"task" "agent_task" NOT NULL,
	"status" "agent_run_status" DEFAULT 'queued' NOT NULL,
	"failure_code" text,
	"provider" text,
	"model" text,
	"input_ref" text,
	"output_json" jsonb,
	"usage_json" jsonb,
	"diagnostics_json" jsonb,
	"latency_ms" integer,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "agent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "classification" "opportunity_classification" DEFAULT 'internal_radar' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_project_task_status_idx" ON "agent_runs" USING btree ("project_id","task","status","created_at");--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;