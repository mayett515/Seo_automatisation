DROP INDEX "agent_runs_active_per_project_task_idx";--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "subject_id" uuid;--> statement-breakpoint
UPDATE "agent_runs"
SET "subject_id" = ("diagnostics_json"->>'opportunityId')::uuid
WHERE "task" = 'page_brief_draft'
  AND "subject_id" IS NULL
  AND "diagnostics_json" ? 'opportunityId'
  AND ("diagnostics_json"->>'opportunityId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';--> statement-breakpoint
CREATE INDEX "agent_runs_project_task_subject_status_idx" ON "agent_runs" USING btree ("project_id","task","subject_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_active_per_project_task_subject_idx" ON "agent_runs" USING btree ("project_id","task","subject_id") WHERE "agent_runs"."status" in ('queued', 'running') and "agent_runs"."subject_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_active_per_project_task_null_subject_idx" ON "agent_runs" USING btree ("project_id","task") WHERE "agent_runs"."status" in ('queued', 'running') and "agent_runs"."subject_id" is null;
