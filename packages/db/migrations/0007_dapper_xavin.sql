CREATE TABLE "project_tracking_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"key_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_runs" ADD COLUMN "external_job_id" text;--> statement-breakpoint
ALTER TABLE "job_runs" ADD COLUMN "queue_name" text;--> statement-breakpoint
ALTER TABLE "job_runs" ADD COLUMN "actor_type" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_runs" ADD COLUMN "actor_user_id" uuid;--> statement-breakpoint
ALTER TABLE "job_runs" ADD COLUMN "trigger_source" text;--> statement-breakpoint
ALTER TABLE "project_tracking_keys" ADD CONSTRAINT "project_tracking_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_tracking_keys_hash_idx" ON "project_tracking_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "project_tracking_keys_project_status_idx" ON "project_tracking_keys" USING btree ("project_id","status");--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;