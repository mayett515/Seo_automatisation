ALTER TABLE "job_runs" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_runs" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_tracking_keys" ADD COLUMN "allowed_origins" jsonb DEFAULT '[]'::jsonb NOT NULL;