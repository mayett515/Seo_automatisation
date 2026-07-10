ALTER TABLE "agent_runs" ADD COLUMN "recovery_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "last_recovery_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "release_verifications" ADD COLUMN "recovery_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "release_verifications" ADD COLUMN "last_recovery_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "agent_runs_recovery_scan_idx" ON "agent_runs" USING btree ("task","status","updated_at") WHERE "agent_runs"."task" = 'page_brief_draft' and "agent_runs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "release_verifications_recovery_scan_idx" ON "release_verifications" USING btree ("status","updated_at") WHERE "release_verifications"."status" = 'running';