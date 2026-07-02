CREATE TYPE "public"."website_import_status" AS ENUM('queued', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "website_import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"main_website_id" uuid,
	"source_url" text NOT NULL,
	"status" "website_import_status" DEFAULT 'queued' NOT NULL,
	"artifact_key" text,
	"summary_json" jsonb,
	"failure_json" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "website_import_runs" ADD CONSTRAINT "website_import_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_import_runs" ADD CONSTRAINT "website_import_runs_main_website_id_main_websites_id_fk" FOREIGN KEY ("main_website_id") REFERENCES "public"."main_websites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "website_import_runs_project_status_idx" ON "website_import_runs" USING btree ("project_id","status","created_at");--> statement-breakpoint
CREATE INDEX "website_import_runs_main_website_idx" ON "website_import_runs" USING btree ("main_website_id");