DROP INDEX "agent_runs_recovery_scan_idx";--> statement-breakpoint
ALTER TABLE "agent_run_steps" ADD COLUMN "execution_epoch" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "execution_epoch" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "execution_claim_token" text;--> statement-breakpoint
ALTER TABLE "public_web_search_captures" ADD COLUMN "execution_epoch" integer;--> statement-breakpoint
UPDATE "public_web_search_captures" AS capture
SET "execution_epoch" = run."execution_epoch"
FROM "agent_runs" AS run
WHERE run."id" = capture."agent_run_id";--> statement-breakpoint
ALTER TABLE "public_web_search_captures" ALTER COLUMN "execution_epoch" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "public_web_search_captures" ADD COLUMN "requested_region" text;--> statement-breakpoint
ALTER TABLE "public_web_search_captures" ADD COLUMN "max_results" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
CREATE INDEX "agent_runs_recovery_scan_idx" ON "agent_runs" USING btree ("task","status","updated_at") WHERE "agent_runs"."task" in ('page_brief_draft', 'section_text_generation', 'opportunity_scout') and "agent_runs"."status" in ('queued', 'running');--> statement-breakpoint
ALTER TABLE "agent_run_steps" ADD CONSTRAINT "agent_run_steps_execution_epoch_check" CHECK ("agent_run_steps"."execution_epoch" >= 0);--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_execution_epoch_check" CHECK (("agent_runs"."execution_epoch" = 0 and "agent_runs"."execution_claim_token" is null) or ("agent_runs"."execution_epoch" > 0 and "agent_runs"."execution_claim_token" is not null));--> statement-breakpoint
ALTER TABLE "public_web_search_captures" ADD CONSTRAINT "public_web_search_captures_max_results_check" CHECK ("public_web_search_captures"."max_results" between 1 and 5);--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_agent_run_workflow_identity()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."workflow_name" IS NULL THEN
      RETURN NEW;
    END IF;
    IF NEW."workflow_name" <> 'opportunity_research'
       OR NEW."task" <> 'opportunity_scout'
       OR NEW."subject_id" IS DISTINCT FROM NEW."project_id"
       OR NEW."status" <> 'queued'
       OR NEW."started_at" IS NOT NULL
       OR NEW."completed_at" IS NOT NULL
       OR NEW."failure_code" IS NOT NULL
       OR NEW."output_ref" IS NOT NULL
       OR NEW."output_sha256" IS NOT NULL
       OR NEW."output_json" IS NOT NULL
       OR NEW."execution_epoch" <> 0
       OR NEW."execution_claim_token" IS NOT NULL
       OR NEW."recovery_count" <> 0
       OR NEW."last_recovery_at" IS NOT NULL THEN
      RAISE EXCEPTION 'Opportunity Research workflows must be admitted in the canonical queued state';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."workflow_name" IS NULL OR NEW."workflow_name" IS NULL THEN
    IF OLD."workflow_name" IS DISTINCT FROM NEW."workflow_name" THEN
      RAISE EXCEPTION 'Legacy and workflow agent runs cannot be converted into one another';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."status" IN ('succeeded', 'failed') THEN
    RAISE EXCEPTION 'Terminal workflow runs are immutable';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."project_id" IS DISTINCT FROM OLD."project_id"
     OR NEW."subject_id" IS DISTINCT FROM OLD."subject_id"
     OR NEW."task" IS DISTINCT FROM OLD."task"
     OR NEW."workflow_name" IS DISTINCT FROM OLD."workflow_name"
     OR NEW."workflow_version" IS DISTINCT FROM OLD."workflow_version"
     OR NEW."constraint_profile_version" IS DISTINCT FROM OLD."constraint_profile_version"
     OR NEW."requested_by_user_id" IS DISTINCT FROM OLD."requested_by_user_id"
     OR NEW."trigger_source" IS DISTINCT FROM OLD."trigger_source"
     OR NEW."parent_run_id" IS DISTINCT FROM OLD."parent_run_id"
     OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
     OR NEW."input_sha256" IS DISTINCT FROM OLD."input_sha256"
     OR NEW."input_ref" IS DISTINCT FROM OLD."input_ref"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'Agent workflow identity is immutable after admission';
  END IF;

  IF NEW."status" = OLD."status" THEN
    IF OLD."status" NOT IN ('queued', 'running')
       OR NEW."failure_code" IS DISTINCT FROM OLD."failure_code"
       OR NEW."provider" IS DISTINCT FROM OLD."provider"
       OR NEW."model" IS DISTINCT FROM OLD."model"
       OR NEW."output_ref" IS DISTINCT FROM OLD."output_ref"
       OR NEW."output_sha256" IS DISTINCT FROM OLD."output_sha256"
       OR NEW."output_json" IS DISTINCT FROM OLD."output_json"
       OR NEW."usage_json" IS DISTINCT FROM OLD."usage_json"
       OR NEW."diagnostics_json" IS DISTINCT FROM OLD."diagnostics_json"
       OR NEW."latency_ms" IS DISTINCT FROM OLD."latency_ms"
       OR NEW."started_at" IS DISTINCT FROM OLD."started_at"
       OR NEW."completed_at" IS DISTINCT FROM OLD."completed_at" THEN
      RAISE EXCEPTION 'Same-status workflow updates cannot change result evidence';
    END IF;

    IF NEW."recovery_count" = OLD."recovery_count" + 1 THEN
      IF NEW."last_recovery_at" IS NULL
         OR NEW."execution_epoch" IS DISTINCT FROM OLD."execution_epoch"
         OR NEW."execution_claim_token" IS DISTINCT FROM OLD."execution_claim_token" THEN
        RAISE EXCEPTION 'Recovery claims must preserve execution ownership';
      END IF;
    ELSIF NEW."recovery_count" = OLD."recovery_count"
          AND NEW."last_recovery_at" IS NOT DISTINCT FROM OLD."last_recovery_at" THEN
      IF OLD."status" <> 'running'
         OR NEW."execution_epoch" <> OLD."execution_epoch" + 1
         OR NEW."execution_claim_token" IS NULL
         OR NEW."execution_claim_token" IS NOT DISTINCT FROM OLD."execution_claim_token" THEN
        RAISE EXCEPTION 'Execution takeover must advance exactly one epoch with a new claim token';
      END IF;
    ELSE
      RAISE EXCEPTION 'Same-status workflow updates require one bounded recovery or execution claim';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."recovery_count" IS DISTINCT FROM OLD."recovery_count"
     OR NEW."last_recovery_at" IS DISTINCT FROM OLD."last_recovery_at" THEN
    RAISE EXCEPTION 'Workflow lifecycle transitions cannot alter recovery evidence';
  END IF;

  IF OLD."status" = 'queued' AND NEW."status" = 'running' THEN
    IF NEW."started_at" IS NULL
       OR NEW."completed_at" IS NOT NULL
       OR NEW."failure_code" IS NOT NULL
       OR NEW."output_sha256" IS NOT NULL
       OR NEW."output_json" IS NOT NULL
       OR NEW."output_ref" IS NOT NULL
       OR NEW."execution_epoch" <> OLD."execution_epoch" + 1
       OR NEW."execution_claim_token" IS NULL THEN
      RAISE EXCEPTION 'Workflow start requires clean evidence and one execution epoch';
    END IF;
  ELSIF OLD."status" IN ('queued', 'running') AND NEW."status" = 'failed' THEN
    IF NEW."failure_code" IS NULL
       OR NEW."completed_at" IS NULL
       OR NEW."output_sha256" IS NOT NULL
       OR NEW."output_json" IS NOT NULL
       OR NEW."output_ref" IS NOT NULL
       OR NEW."execution_epoch" IS DISTINCT FROM OLD."execution_epoch"
       OR NEW."execution_claim_token" IS DISTINCT FROM OLD."execution_claim_token" THEN
      RAISE EXCEPTION 'Workflow failure requires terminal evidence without changing execution ownership';
    END IF;
  ELSIF OLD."status" = 'running' AND NEW."status" = 'succeeded' THEN
    IF NEW."failure_code" IS NOT NULL
       OR NEW."completed_at" IS NULL
       OR NEW."output_sha256" IS NULL
       OR NEW."output_json" IS NULL
       OR NEW."execution_epoch" IS DISTINCT FROM OLD."execution_epoch"
       OR NEW."execution_claim_token" IS DISTINCT FROM OLD."execution_claim_token" THEN
      RAISE EXCEPTION 'Workflow success requires digest-bound output under the owning execution epoch';
    END IF;
  ELSE
    RAISE EXCEPTION 'Illegal workflow run status transition';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_agent_run_step_write()
RETURNS trigger AS $$
DECLARE
  parent_project uuid;
  parent_status agent_run_status;
  parent_execution_epoch integer;
BEGIN
  SELECT "project_id", "status", "execution_epoch"
  INTO parent_project, parent_status, parent_execution_epoch
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
    NEW."execution_epoch" := 0;
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
    IF OLD."status" <> 'running'
       OR NEW."attempt_count" <> OLD."attempt_count"
       OR NEW."execution_epoch" <> OLD."execution_epoch" THEN
      RAISE EXCEPTION 'Agent run step same-status updates require the same running execution';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."status" = 'pending' AND NEW."status" = 'running' THEN
    IF NEW."attempt_count" <> OLD."attempt_count" + 1
       OR parent_execution_epoch <= 0
       OR NEW."execution_epoch" <> parent_execution_epoch THEN
      RAISE EXCEPTION 'Agent run step claim must bind one attempt to the current execution epoch';
    END IF;
  ELSIF OLD."status" = 'pending' AND NEW."status" = 'skipped' THEN
    IF NEW."attempt_count" <> OLD."attempt_count" OR NEW."execution_epoch" <> OLD."execution_epoch" THEN
      RAISE EXCEPTION 'Unstarted terminal agent run steps must preserve attempt and execution evidence';
    END IF;
  ELSIF OLD."status" = 'pending' AND NEW."status" = 'failed' THEN
    IF NEW."attempt_count" <> OLD."attempt_count"
       OR NEW."failure_code" <> 'parent_run_failed'
       OR NEW."execution_epoch" <> parent_execution_epoch THEN
      RAISE EXCEPTION 'Parent-terminalized pending steps must bind failure evidence to the current execution epoch';
    END IF;
  ELSIF OLD."status" = 'running' AND NEW."status" IN ('succeeded', 'failed') THEN
    IF NEW."attempt_count" <> OLD."attempt_count" OR NEW."execution_epoch" <> OLD."execution_epoch" THEN
      RAISE EXCEPTION 'Terminal agent run step transition must preserve its owning execution';
    END IF;
  ELSIF OLD."status" = 'failed' AND NEW."status" = 'running' THEN
    IF OLD."attempt_count" >= 20
       OR NEW."attempt_count" <> OLD."attempt_count" + 1
       OR parent_execution_epoch <= OLD."execution_epoch"
       OR NEW."execution_epoch" <> parent_execution_epoch THEN
      RAISE EXCEPTION 'Agent run step retry must advance to the current execution epoch';
    END IF;
  ELSE
    RAISE EXCEPTION 'Illegal agent run step status transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_public_web_search_capture_write()
RETURNS trigger AS $$
DECLARE
  run_project uuid;
  run_status agent_run_status;
  run_workflow agent_workflow_name;
  run_execution_epoch integer;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Public web-search captures are immutable evidence';
  END IF;
  SELECT "project_id", "status", "workflow_name", "execution_epoch"
  INTO run_project, run_status, run_workflow, run_execution_epoch
  FROM "agent_runs"
  WHERE "id" = NEW."agent_run_id"
  FOR UPDATE;
  IF run_project IS NULL
     OR run_project <> NEW."project_id"
     OR run_status <> 'running'
     OR run_workflow <> 'opportunity_research'
     OR run_execution_epoch <> NEW."execution_epoch" THEN
    RAISE EXCEPTION 'Public web-search captures require the current Opportunity Research execution epoch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE OR REPLACE FUNCTION require_agent_workflow_lifecycle_event()
RETURNS trigger AS $$
DECLARE
  required_event agent_run_event_type;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."status" = OLD."status" THEN
    IF NEW."recovery_count" <> OLD."recovery_count" AND NOT EXISTS (
      SELECT 1
      FROM "agent_run_events" AS event
      WHERE event."agent_run_id" = NEW."id"
        AND event."project_id" = NEW."project_id"
        AND event."agent_run_step_id" IS NULL
        AND event."event_type" = 'recovery.claimed'
        AND event."occurred_at" = NEW."last_recovery_at"
        AND (event."payload_json"->>'recoveryCount')::integer = NEW."recovery_count"
    ) THEN
      RAISE EXCEPTION 'Workflow recovery claim requires its exact durable event in the same transaction';
    END IF;
    IF NEW."execution_epoch" <> OLD."execution_epoch" THEN
      IF EXISTS (
        SELECT 1
        FROM "agent_run_steps" AS step
        WHERE step."agent_run_id" = NEW."id"
          AND step."project_id" = NEW."project_id"
          AND step."status" = 'running'
          AND step."execution_epoch" <> NEW."execution_epoch"
      ) THEN
        RAISE EXCEPTION 'Workflow execution takeover must resolve prior-epoch running steps';
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM "agent_run_events" AS event
        WHERE event."agent_run_id" = NEW."id"
          AND event."project_id" = NEW."project_id"
          AND event."agent_run_step_id" IS NULL
          AND event."event_type" = 'recovery.claimed'
          AND (event."payload_json"->>'executionEpoch')::integer = NEW."execution_epoch"
          AND event."payload_json"->>'executionClaimToken' = NEW."execution_claim_token"
      ) THEN
        RAISE EXCEPTION 'Workflow execution takeover requires its exact durable event in the same transaction';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."status" = 'queued' THEN
    required_event := 'run.queued';
  ELSIF NEW."status" = 'running' THEN
    required_event := 'run.started';
  ELSIF NEW."status" = 'succeeded' THEN
    required_event := 'run.succeeded';
  ELSIF NEW."status" = 'failed' THEN
    required_event := 'run.failed';
  ELSE
    RAISE EXCEPTION 'Unsupported workflow run lifecycle state';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "agent_run_events" AS event
    WHERE event."agent_run_id" = NEW."id"
      AND event."project_id" = NEW."project_id"
      AND event."agent_run_step_id" IS NULL
      AND event."event_type" = required_event
      AND (
        (required_event = 'run.queued' AND event."payload_json"->>'materialDigest' = NEW."input_sha256")
        OR (required_event = 'run.started' AND event."occurred_at" = NEW."started_at")
        OR (required_event = 'run.succeeded' AND event."occurred_at" = NEW."completed_at" AND event."payload_json"->>'outputSha256' = NEW."output_sha256")
        OR (required_event = 'run.failed' AND event."occurred_at" = NEW."completed_at" AND event."payload_json"->>'failureCode' = NEW."failure_code")
      )
  ) THEN
    RAISE EXCEPTION 'Workflow lifecycle transition requires its exact durable event in the same transaction';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
