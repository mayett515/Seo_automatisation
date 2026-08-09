ALTER TABLE "agent_run_events" DROP CONSTRAINT "agent_run_events_artifact_check";--> statement-breakpoint
ALTER TABLE "agent_run_steps" DROP CONSTRAINT "agent_run_steps_terminal_evidence_check";--> statement-breakpoint
ALTER TABLE "agent_runs" DROP CONSTRAINT "agent_runs_workflow_identity_check";--> statement-breakpoint
ALTER TABLE "opportunities" DROP CONSTRAINT "opportunities_research_axes_check";--> statement-breakpoint
ALTER TABLE "areas" ADD COLUMN "retired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "areas" ADD COLUMN "retired_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "project_opportunity_research_states" ADD COLUMN "material_dirty" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "retired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "retired_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_run_events" ADD CONSTRAINT "agent_run_events_run_project_fk" FOREIGN KEY ("agent_run_id","project_id") REFERENCES "public"."agent_runs"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_events" ADD CONSTRAINT "agent_run_events_step_run_project_fk" FOREIGN KEY ("agent_run_step_id","agent_run_id","project_id") REFERENCES "public"."agent_run_steps"("id","agent_run_id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_evidence_items" ADD CONSTRAINT "agent_run_evidence_run_project_fk" FOREIGN KEY ("agent_run_id","project_id") REFERENCES "public"."agent_runs"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_step_evidence_links" ADD CONSTRAINT "agent_run_step_evidence_step_run_project_fk" FOREIGN KEY ("agent_run_step_id","agent_run_id","project_id") REFERENCES "public"."agent_run_steps"("id","agent_run_id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_step_evidence_links" ADD CONSTRAINT "agent_run_step_evidence_item_run_project_fk" FOREIGN KEY ("evidence_item_id","agent_run_id","project_id") REFERENCES "public"."agent_run_evidence_items"("id","agent_run_id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_steps" ADD CONSTRAINT "agent_run_steps_run_project_fk" FOREIGN KEY ("agent_run_id","project_id") REFERENCES "public"."agent_runs"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_retired_by_user_id_users_id_fk" FOREIGN KEY ("retired_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_opportunity_research_states" ADD CONSTRAINT "project_opportunity_research_active_run_project_fk" FOREIGN KEY ("active_run_id","project_id") REFERENCES "public"."agent_runs"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_web_search_captures" ADD CONSTRAINT "public_web_search_captures_run_project_fk" FOREIGN KEY ("agent_run_id","project_id") REFERENCES "public"."agent_runs"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_retired_by_user_id_users_id_fk" FOREIGN KEY ("retired_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_events" ADD CONSTRAINT "agent_run_events_artifact_check" CHECK (("agent_run_events"."artifact_ref" is null and "agent_run_events"."artifact_sha256" is null) or ("agent_run_events"."artifact_ref" is not null and "agent_run_events"."artifact_sha256" is not null and "agent_run_events"."artifact_sha256" ~ '^[0-9a-f]{64}$'));--> statement-breakpoint
ALTER TABLE "agent_run_steps" ADD CONSTRAINT "agent_run_steps_terminal_evidence_check" CHECK (("agent_run_steps"."status" in ('pending', 'running') and "agent_run_steps"."completed_at" is null and "agent_run_steps"."failure_code" is null and "agent_run_steps"."failure_message" is null) or ("agent_run_steps"."status" = 'succeeded' and "agent_run_steps"."completed_at" is not null and "agent_run_steps"."failure_code" is null and "agent_run_steps"."failure_message" is null and "agent_run_steps"."output_sha256" is not null and "agent_run_steps"."output_sha256" ~ '^[0-9a-f]{64}$') or ("agent_run_steps"."status" = 'failed' and "agent_run_steps"."completed_at" is not null and "agent_run_steps"."failure_code" is not null and "agent_run_steps"."failure_message" is not null) or ("agent_run_steps"."status" = 'skipped' and "agent_run_steps"."completed_at" is not null and "agent_run_steps"."failure_code" is null and "agent_run_steps"."failure_message" is null));--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workflow_identity_check" CHECK (("agent_runs"."workflow_name" is null and "agent_runs"."workflow_version" is null and "agent_runs"."constraint_profile_version" is null and "agent_runs"."input_sha256" is null and "agent_runs"."output_sha256" is null) or ("agent_runs"."workflow_name" is not null and "agent_runs"."workflow_version" is not null and "agent_runs"."constraint_profile_version" is not null and "agent_runs"."input_sha256" is not null and "agent_runs"."input_sha256" ~ '^[0-9a-f]{64}$' and ("agent_runs"."output_sha256" is null or "agent_runs"."output_sha256" ~ '^[0-9a-f]{64}$')));--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_research_axes_check" CHECK (("opportunities"."policy_version" is null and "opportunities"."ranking_milestone" is null and "opportunities"."evidence_readiness" is null and "opportunities"."business_value" is null and "opportunities"."market_difficulty" is null and "opportunities"."execution_effort" is null and "opportunities"."lane" is null and "opportunities"."candidate_key" is null and "opportunities"."research_material_digest" is null) or ("opportunities"."policy_version" is not null and "opportunities"."ranking_milestone" is not null and "opportunities"."evidence_readiness" is not null and "opportunities"."business_value" is not null and "opportunities"."market_difficulty" is not null and "opportunities"."execution_effort" is not null and "opportunities"."lane" is not null and "opportunities"."candidate_key" is not null and "opportunities"."research_material_digest" is not null and "opportunities"."research_material_digest" ~ '^[0-9a-f]{64}$'));
--> statement-breakpoint
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
       OR NEW."recovery_count" <> OLD."recovery_count" + 1
       OR NEW."last_recovery_at" IS NULL
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
      RAISE EXCEPTION 'Same-status workflow updates are reserved for bounded recovery claims';
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
       OR NEW."output_ref" IS NOT NULL THEN
      RAISE EXCEPTION 'Workflow start requires clean running evidence';
    END IF;
  ELSIF OLD."status" IN ('queued', 'running') AND NEW."status" = 'failed' THEN
    IF NEW."failure_code" IS NULL
       OR NEW."completed_at" IS NULL
       OR NEW."output_sha256" IS NOT NULL
       OR NEW."output_json" IS NOT NULL
       OR NEW."output_ref" IS NOT NULL THEN
      RAISE EXCEPTION 'Workflow failure requires terminal failure evidence without output';
    END IF;
  ELSIF OLD."status" = 'running' AND NEW."status" = 'succeeded' THEN
    IF NEW."failure_code" IS NOT NULL
       OR NEW."completed_at" IS NULL
       OR NEW."output_sha256" IS NULL
       OR NEW."output_json" IS NULL THEN
      RAISE EXCEPTION 'Workflow success requires digest-bound output evidence';
    END IF;
  ELSE
    RAISE EXCEPTION 'Illegal workflow run status transition';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER "agent_runs_enforce_workflow_identity" ON "agent_runs";
--> statement-breakpoint
CREATE TRIGGER agent_runs_enforce_workflow_identity
BEFORE INSERT OR UPDATE ON "agent_runs"
FOR EACH ROW EXECUTE FUNCTION enforce_agent_run_workflow_identity();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_agent_workflow_run_delete()
RETURNS trigger AS $$
BEGIN
  IF OLD."workflow_name" IS NOT NULL THEN
    RAISE EXCEPTION 'Workflow runs are durable audit truth and cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER agent_runs_prevent_workflow_delete
BEFORE DELETE ON "agent_runs"
FOR EACH ROW EXECUTE FUNCTION prevent_agent_workflow_run_delete();
--> statement-breakpoint
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
    RAISE EXCEPTION 'Unsupported workflow lifecycle state';
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
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER agent_runs_require_lifecycle_event
AFTER INSERT OR UPDATE ON "agent_runs"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (NEW."workflow_name" IS NOT NULL)
EXECUTE FUNCTION require_agent_workflow_lifecycle_event();
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
  ELSIF OLD."status" = 'pending' AND NEW."status" IN ('skipped', 'failed') THEN
    IF NEW."attempt_count" <> OLD."attempt_count" THEN
      RAISE EXCEPTION 'Unstarted terminal agent run steps must not consume an attempt';
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
CREATE OR REPLACE FUNCTION require_agent_run_step_lifecycle_event()
RETURNS trigger AS $$
DECLARE
  required_event agent_run_event_type;
BEGIN
  IF TG_OP = 'INSERT' OR NEW."status" = OLD."status" THEN
    RETURN NEW;
  END IF;

  IF NEW."status" = 'running' THEN
    required_event := 'step.started';
  ELSIF NEW."status" = 'succeeded' THEN
    required_event := 'step.succeeded';
  ELSIF NEW."status" = 'failed' THEN
    required_event := 'step.failed';
  ELSIF NEW."status" = 'skipped' THEN
    required_event := 'step.skipped';
  ELSE
    RAISE EXCEPTION 'Unsupported agent step lifecycle state';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "agent_run_events" AS event
    WHERE event."agent_run_id" = NEW."agent_run_id"
      AND event."project_id" = NEW."project_id"
      AND event."agent_run_step_id" = NEW."id"
      AND event."event_type" = required_event
      AND (
        (required_event = 'step.started' AND event."occurred_at" = NEW."started_at" AND event."payload_json"->>'stepKey' = NEW."step_key" AND (event."payload_json"->>'attemptCount')::integer = NEW."attempt_count")
        OR (required_event = 'step.succeeded' AND event."occurred_at" = NEW."completed_at" AND event."payload_json"->>'outputSha256' = NEW."output_sha256")
        OR (required_event = 'step.failed' AND event."occurred_at" = NEW."completed_at" AND event."payload_json"->>'failureCode' = NEW."failure_code")
        OR (required_event = 'step.skipped' AND event."occurred_at" = NEW."completed_at")
      )
  ) THEN
    RAISE EXCEPTION 'Agent step lifecycle transition requires its exact durable event in the same transaction';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER agent_run_steps_require_lifecycle_event
AFTER UPDATE ON "agent_run_steps"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (NEW."status" IS DISTINCT FROM OLD."status")
EXECUTE FUNCTION require_agent_run_step_lifecycle_event();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_agent_run_event_insert()
RETURNS trigger AS $$
DECLARE
  run_project uuid;
  run_status agent_run_status;
  run_completed_at timestamptz;
  run_output_sha256 text;
  run_failure_code text;
  run_workflow agent_workflow_name;
  step_run uuid;
  step_project uuid;
  step_status agent_run_step_status;
  step_key text;
  step_attempt_count integer;
  step_started_at timestamptz;
  step_completed_at timestamptz;
  step_output_sha256 text;
  step_failure_code text;
BEGIN
  SELECT "project_id", "status", "completed_at", "output_sha256", "failure_code", "workflow_name"
  INTO run_project, run_status, run_completed_at, run_output_sha256, run_failure_code, run_workflow
  FROM "agent_runs"
  WHERE "id" = NEW."agent_run_id"
  FOR UPDATE;

  IF run_project IS NULL OR run_project <> NEW."project_id" OR run_workflow IS NULL THEN
    RAISE EXCEPTION 'Agent run event must match the parent run project';
  END IF;

  IF NEW."agent_run_step_id" IS NOT NULL THEN
    SELECT "agent_run_id", "project_id", "status", "step_key", "attempt_count", "started_at", "completed_at", "output_sha256", "failure_code"
    INTO step_run, step_project, step_status, step_key, step_attempt_count, step_started_at, step_completed_at, step_output_sha256, step_failure_code
    FROM "agent_run_steps"
    WHERE "id" = NEW."agent_run_step_id";
    IF step_run IS NULL OR step_run <> NEW."agent_run_id" OR step_project <> NEW."project_id" THEN
      RAISE EXCEPTION 'Agent run event step must belong to the same run and project';
    END IF;
  END IF;

  IF NEW."event_type" = 'run.queued' THEN
    IF NEW."agent_run_step_id" IS NOT NULL OR run_status <> 'queued'
       OR NEW."payload_json"->>'materialDigest' IS DISTINCT FROM (SELECT "input_sha256" FROM "agent_runs" WHERE "id" = NEW."agent_run_id") THEN
      RAISE EXCEPTION 'run.queued must match queued workflow admission truth';
    END IF;
  ELSIF NEW."event_type" = 'run.started' THEN
    IF NEW."agent_run_step_id" IS NOT NULL OR run_status <> 'running' OR NEW."occurred_at" IS DISTINCT FROM (SELECT "started_at" FROM "agent_runs" WHERE "id" = NEW."agent_run_id") THEN
      RAISE EXCEPTION 'run.started must match workflow start truth';
    END IF;
  ELSIF NEW."event_type" = 'run.succeeded' THEN
    IF NEW."agent_run_step_id" IS NOT NULL OR run_status <> 'succeeded' OR NEW."occurred_at" IS DISTINCT FROM run_completed_at
       OR NEW."payload_json"->>'outputSha256' IS DISTINCT FROM run_output_sha256 THEN
      RAISE EXCEPTION 'run.succeeded must match terminal workflow truth';
    END IF;
  ELSIF NEW."event_type" = 'run.failed' THEN
    IF NEW."agent_run_step_id" IS NOT NULL OR run_status <> 'failed' OR NEW."occurred_at" IS DISTINCT FROM run_completed_at
       OR NEW."payload_json"->>'failureCode' IS DISTINCT FROM run_failure_code THEN
      RAISE EXCEPTION 'run.failed must match terminal workflow truth';
    END IF;
  ELSIF NEW."event_type" = 'step.started' THEN
    IF step_status <> 'running' OR NEW."occurred_at" IS DISTINCT FROM step_started_at
       OR NEW."payload_json"->>'stepKey' IS DISTINCT FROM step_key
       OR (NEW."payload_json"->>'attemptCount')::integer IS DISTINCT FROM step_attempt_count THEN
      RAISE EXCEPTION 'step.started must match step claim truth';
    END IF;
  ELSIF NEW."event_type" = 'step.succeeded' THEN
    IF step_status <> 'succeeded' OR NEW."occurred_at" IS DISTINCT FROM step_completed_at
       OR NEW."payload_json"->>'outputSha256' IS DISTINCT FROM step_output_sha256 THEN
      RAISE EXCEPTION 'step.succeeded must match terminal step truth';
    END IF;
  ELSIF NEW."event_type" = 'step.failed' THEN
    IF step_status <> 'failed' OR NEW."occurred_at" IS DISTINCT FROM step_completed_at
       OR NEW."payload_json"->>'failureCode' IS DISTINCT FROM step_failure_code THEN
      RAISE EXCEPTION 'step.failed must match terminal step truth';
    END IF;
  ELSIF NEW."event_type" = 'step.skipped' THEN
    IF step_status <> 'skipped' OR NEW."occurred_at" IS DISTINCT FROM step_completed_at THEN
      RAISE EXCEPTION 'step.skipped must match terminal step truth';
    END IF;
  ELSIF run_status IN ('succeeded', 'failed') THEN
    RAISE EXCEPTION 'Terminal workflow runs admit no additional events';
  END IF;
  IF NEW."event_type" IN ('run.queued', 'run.started', 'run.succeeded', 'run.failed')
     AND EXISTS (
       SELECT 1 FROM "agent_run_events" AS existing
       WHERE existing."agent_run_id" = NEW."agent_run_id"
         AND existing."event_type" = NEW."event_type"
     ) THEN
    RAISE EXCEPTION 'Workflow lifecycle event already exists';
  END IF;
  IF octet_length(NEW."payload_json"::text) > 16384 THEN
    RAISE EXCEPTION 'Agent run event payload exceeds 16 KiB';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_agent_run_step_evidence_link()
RETURNS trigger AS $$
DECLARE
  run_status agent_run_status;
  run_workflow agent_workflow_name;
  step_run uuid;
  step_project uuid;
  step_status agent_run_step_status;
  evidence_run uuid;
  evidence_project uuid;
BEGIN
  SELECT "status" INTO run_status FROM "agent_runs" WHERE "id" = NEW."agent_run_id" FOR UPDATE;
  SELECT "agent_run_id", "project_id", "status"
  INTO step_run, step_project, step_status
  FROM "agent_run_steps"
  WHERE "id" = NEW."agent_run_step_id";
  SELECT "agent_run_id", "project_id"
  INTO evidence_run, evidence_project
  FROM "agent_run_evidence_items"
  WHERE "id" = NEW."evidence_item_id";

  IF run_status <> 'running' OR step_status <> 'running' THEN
    RAISE EXCEPTION 'Agent evidence links require a running workflow and step';
  END IF;
  IF step_run IS NULL OR evidence_run IS NULL OR step_run <> NEW."agent_run_id" OR evidence_run <> NEW."agent_run_id"
     OR step_project <> NEW."project_id" OR evidence_project <> NEW."project_id" THEN
    RAISE EXCEPTION 'Agent run step-evidence links must stay inside one run and project';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_public_web_search_capture_write()
RETURNS trigger AS $$
DECLARE
  run_project uuid;
  run_status agent_run_status;
  run_workflow agent_workflow_name;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Public web-search captures are immutable evidence';
  END IF;
  SELECT "project_id", "status", "workflow_name"
  INTO run_project, run_status, run_workflow
  FROM "agent_runs"
  WHERE "id" = NEW."agent_run_id"
  FOR UPDATE;
  IF run_project IS NULL OR run_project <> NEW."project_id" OR run_status <> 'running' OR run_workflow <> 'opportunity_research' THEN
    RAISE EXCEPTION 'Public web-search captures require a running Opportunity Research workflow in the same project';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER public_web_search_captures_enforce_insert
BEFORE INSERT ON "public_web_search_captures"
FOR EACH ROW EXECUTE FUNCTION enforce_public_web_search_capture_write();
--> statement-breakpoint
CREATE TRIGGER public_web_search_captures_prevent_update
BEFORE UPDATE ON "public_web_search_captures"
FOR EACH ROW EXECUTE FUNCTION enforce_public_web_search_capture_write();
--> statement-breakpoint
CREATE TRIGGER public_web_search_captures_prevent_delete
BEFORE DELETE ON "public_web_search_captures"
FOR EACH ROW EXECUTE FUNCTION enforce_public_web_search_capture_write();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_agent_run_evidence_insert()
RETURNS trigger AS $$
DECLARE
  run_project uuid;
  run_status agent_run_status;
  run_workflow agent_workflow_name;
  source_project uuid;
  source_status text;
  source_run_id uuid;
  source_observed_at timestamptz;
  source_projection jsonb;
  evidence_projection jsonb;
  resolved_proof_tier text;
  resolved_source_version text;
  resolved_payload_sha256 text;
  stored_content_sha256 text;
  stored_markdown text;
BEGIN
  SELECT "project_id", "status", "workflow_name"
  INTO run_project, run_status, run_workflow
  FROM "agent_runs"
  WHERE "id" = NEW."agent_run_id"
  FOR UPDATE;
  IF run_project IS NULL OR run_project <> NEW."project_id" OR run_status <> 'running' OR run_workflow IS NULL THEN
    RAISE EXCEPTION 'Agent run evidence requires a running parent in the same project';
  END IF;
  IF NEW."evidence_key" IS DISTINCT FROM NEW."source_kind"::text || ':' || NEW."source_id"::text THEN
    RAISE EXCEPTION 'Agent run evidence key must be the canonical source identity';
  END IF;

  CASE NEW."source_kind"::text
    WHEN 'business_profile_revision' THEN
      SELECT
        revision."project_id",
        jsonb_build_object(
          'id', revision."id",
          'revision', revision."revision",
          'profile', revision."profile_json",
          'profileSha256', revision."profile_sha256",
          'sourceImportRunId', revision."source_import_run_id",
          'createdByUserId', revision."created_by_user_id",
          'createdAt', revision."created_at"
        ),
        jsonb_build_object(
          'summary', 'Confirmed business profile revision',
          'businessName', revision."profile_json"->>'businessName',
          'websiteUrl', revision."profile_json"->>'websiteUrl',
          'revision', revision."revision"
        ),
        revision."created_at"
      INTO source_project, source_projection, evidence_projection, source_observed_at
      FROM "project_business_profile_revisions" AS revision
      INNER JOIN "project_business_profiles" AS profile
        ON profile."current_revision_id" = revision."id"
       AND profile."project_id" = revision."project_id"
       AND profile."status" = 'confirmed'
      WHERE revision."id" = NEW."source_id"
      FOR SHARE OF revision, profile;
      resolved_proof_tier := 'supporting_context';
    WHEN 'canonical_service' THEN
      SELECT
        service."project_id",
        jsonb_build_object(
          'id', service."id",
          'name', service."name",
          'status', service."status",
          'rowVersion', service."row_version",
          'confirmedAt', service."confirmed_at",
          'confirmedByUserId', service."confirmed_by_user_id"
        ),
        jsonb_build_object('summary', 'Confirmed canonical service', 'name', service."name"),
        service."confirmed_at",
        service."status"::text
      INTO source_project, source_projection, evidence_projection, source_observed_at, source_status
      FROM "services" AS service
      WHERE service."id" = NEW."source_id"
      FOR SHARE OF service;
      IF source_status <> 'confirmed' THEN RAISE EXCEPTION 'Canonical service evidence must be confirmed'; END IF;
      resolved_proof_tier := 'supporting_context';
    WHEN 'canonical_area' THEN
      SELECT
        area."project_id",
        jsonb_build_object(
          'id', area."id",
          'name', area."name",
          'kind', area."kind",
          'status', area."status",
          'rowVersion', area."row_version",
          'confirmedAt', area."confirmed_at",
          'confirmedByUserId', area."confirmed_by_user_id"
        ),
        jsonb_build_object('summary', 'Confirmed canonical area', 'name', area."name", 'kind', area."kind"),
        area."confirmed_at",
        area."status"::text
      INTO source_project, source_projection, evidence_projection, source_observed_at, source_status
      FROM "areas" AS area
      WHERE area."id" = NEW."source_id"
      FOR SHARE OF area;
      IF source_status <> 'confirmed' THEN RAISE EXCEPTION 'Canonical area evidence must be confirmed'; END IF;
      resolved_proof_tier := 'supporting_context';
    WHEN 'website_import' THEN
      SELECT
        import_run."project_id",
        jsonb_build_object(
          'id', import_run."id",
          'mainWebsiteId', import_run."main_website_id",
          'sourceUrl', import_run."source_url",
          'status', import_run."status",
          'artifactKey', import_run."artifact_key",
          'summary', import_run."summary_json",
          'completedAt', import_run."completed_at"
        ),
        jsonb_build_object('summary', 'Completed website import', 'sourceUrl', import_run."source_url"),
        import_run."completed_at",
        import_run."status"::text
      INTO source_project, source_projection, evidence_projection, source_observed_at, source_status
      FROM "website_import_runs" AS import_run
      WHERE import_run."id" = NEW."source_id"
      FOR SHARE OF import_run;
      IF source_status <> 'completed' OR source_observed_at IS NULL THEN
        RAISE EXCEPTION 'Website-import evidence must be completed';
      END IF;
      resolved_proof_tier := 'supporting_context';
    WHEN 'gsc_row' THEN
      SELECT
        row."project_id",
        jsonb_build_object(
          'id', row."id",
          'syncRunId', row."sync_run_id",
          'propertyUrl', row."property_url",
          'dateFrom', sync."date_from",
          'dateTo', sync."date_to",
          'query', row."query",
          'pageUrl', row."page_url",
          'clicks', row."clicks",
          'impressions', row."impressions",
          'ctr', row."ctr",
          'position', row."position"
        ),
        jsonb_build_object('summary', 'Google Search Console query-page row', 'query', row."query", 'pageUrl', row."page_url"),
        (sync."date_to" || 'T23:59:59.999Z')::timestamptz,
        sync."status"::text
      INTO source_project, source_projection, evidence_projection, source_observed_at, source_status
      FROM "gsc_search_analytics_rows" AS row
      INNER JOIN "gsc_sync_runs" AS sync
        ON sync."id" = row."sync_run_id"
       AND sync."project_id" = row."project_id"
      WHERE row."id" = NEW."source_id"
      FOR SHARE OF row, sync;
      IF source_status <> 'completed' OR source_observed_at < current_date - interval '90 days' THEN
        RAISE EXCEPTION 'GSC row evidence must come from a fresh completed sync';
      END IF;
      resolved_proof_tier := 'internal_signal';
    WHEN 'gsc_signal' THEN
      SELECT
        signal."project_id",
        jsonb_build_object(
          'id', signal."id",
          'syncRunId', signal."sync_run_id",
          'rowId', signal."row_id",
          'propertyUrl', sync."property_url",
          'dateFrom', sync."date_from",
          'dateTo', sync."date_to",
          'signalType', signal."signal_type",
          'status', signal."status",
          'query', signal."query",
          'pageUrl', signal."page_url",
          'evidence', signal."evidence_json"
        ),
        jsonb_build_object('summary', 'Google Search Console opportunity signal', 'query', signal."query", 'pageUrl', signal."page_url"),
        (sync."date_to" || 'T23:59:59.999Z')::timestamptz,
        sync."status"::text
      INTO source_project, source_projection, evidence_projection, source_observed_at, source_status
      FROM "gsc_opportunity_signals" AS signal
      INNER JOIN "gsc_sync_runs" AS sync
        ON sync."id" = signal."sync_run_id"
       AND sync."project_id" = signal."project_id"
      WHERE signal."id" = NEW."source_id"
      FOR SHARE OF signal, sync;
      IF source_status <> 'completed' OR source_observed_at < current_date - interval '90 days' THEN
        RAISE EXCEPTION 'GSC signal evidence must come from a fresh completed sync';
      END IF;
      resolved_proof_tier := 'internal_signal';
    WHEN 'ranking_proof' THEN
      SELECT
        proof."project_id",
        jsonb_build_object(
          'id', proof."id",
          'query', proof."query",
          'pageUrl', proof."page_url",
          'rank', proof."rank",
          'capturedAt', proof."captured_at",
          'searchEngine', proof."search_engine",
          'device', proof."device",
          'locale', proof."locale",
          'status', proof."status",
          'rowVersion', proof."row_version",
          'reviewedAt', proof."reviewed_at",
          'reviewedByUserId', proof."reviewed_by_user_id"
        ),
        jsonb_build_object('summary', 'Human-reviewed ranking proof', 'query', proof."query", 'pageUrl', proof."page_url", 'rank', proof."rank"),
        proof."captured_at",
        proof."status"::text
      INTO source_project, source_projection, evidence_projection, source_observed_at, source_status
      FROM "ranking_proofs" AS proof
      WHERE proof."id" = NEW."source_id"
      FOR SHARE OF proof;
      IF source_status <> 'reviewed' OR source_observed_at < now() - interval '30 days' THEN
        RAISE EXCEPTION 'Ranking-proof evidence must be current and reviewed';
      END IF;
      resolved_proof_tier := 'customer_safe_proof';
    WHEN 'public_web_search_capture' THEN
      SELECT
        capture."project_id",
        capture."agent_run_id",
        jsonb_build_object(
          'id', capture."id",
          'query', capture."query",
          'provider', capture."provider",
          'requestedLocale', capture."requested_locale",
          'effectiveLocale', capture."effective_locale",
          'observedLocale', capture."observed_locale",
          'executionEpoch', coalesce((to_jsonb(capture)->>'execution_epoch')::integer, 0),
          'requestedRegion', to_jsonb(capture)->>'requested_region',
          'maxResults', coalesce((to_jsonb(capture)->>'max_results')::integer, 5),
          'researchOrdinal', capture."research_ordinal",
          'round', capture."round",
          'status', capture."status",
          'results', capture."results_json",
          'capturedAt', capture."captured_at"
        ),
        jsonb_build_object('summary', 'Captured public-web research results', 'query', capture."query", 'resultCount', jsonb_array_length(capture."results_json")),
        capture."captured_at",
        capture."status"
      INTO source_project, source_run_id, source_projection, evidence_projection, source_observed_at, source_status
      FROM "public_web_search_captures" AS capture
      WHERE capture."id" = NEW."source_id"
      FOR SHARE OF capture;
      IF source_status <> 'succeeded' OR source_run_id <> NEW."agent_run_id" THEN
        RAISE EXCEPTION 'Public-web search evidence must be a succeeded capture from the same run';
      END IF;
      resolved_proof_tier := 'supporting_context';
    WHEN 'knowledge_version' THEN
      SELECT
        version."project_id",
        jsonb_build_object(
          'id', version."id",
          'documentId', version."document_id",
          'documentKey', document."document_key",
          'version', version."version",
          'title', version."title",
          'bodyMarkdown', version."body_markdown",
          'contentSha256', version."content_sha256",
          'taskScopes', (
            SELECT coalesce(jsonb_agg(scope."task_scope" ORDER BY scope."task_scope"), '[]'::jsonb)
            FROM "project_knowledge_task_scopes" AS scope
            WHERE scope."version_id" = version."id"
          )
        ),
        jsonb_build_object(
          'summary', 'Approved project knowledge',
          'documentKey', document."document_key",
          'title', version."title",
          'excerpt', left(version."body_markdown", 8000),
          'contentSha256', version."content_sha256"
        ),
        version."created_at",
        version."status"::text,
        version."content_sha256",
        version."body_markdown"
      INTO source_project, source_projection, evidence_projection, source_observed_at, source_status, stored_content_sha256, stored_markdown
      FROM "project_knowledge_versions" AS version
      INNER JOIN "project_knowledge_documents" AS document
        ON document."id" = version."document_id"
       AND document."current_approved_version_id" = version."id"
      WHERE version."id" = NEW."source_id"
        AND EXISTS (
          SELECT 1 FROM "project_knowledge_task_scopes" AS scope
          WHERE scope."version_id" = version."id" AND scope."task_scope" = 'opportunity_research'
        )
      FOR SHARE OF version, document;
      IF source_status <> 'approved'
         OR stored_content_sha256 IS DISTINCT FROM encode(sha256(convert_to(stored_markdown, 'UTF8')), 'hex') THEN
        RAISE EXCEPTION 'Knowledge evidence must be current, approved, scoped, and checksum-valid';
      END IF;
      resolved_proof_tier := 'supporting_context';
    WHEN 'technical_audit_finding' THEN
      SELECT
        finding."project_id",
        jsonb_build_object(
          'id', finding."id",
          'auditRunId', finding."audit_run_id",
          'checkKey', finding."check_key",
          'category', finding."category",
          'severity', finding."severity",
          'route', finding."route",
          'pageUrl', finding."page_url",
          'message', finding."message",
          'evidence', finding."evidence_json",
          'completedAt', audit."completed_at"
        ),
        jsonb_build_object('summary', finding."message", 'checkKey', finding."check_key", 'severity', finding."severity"),
        coalesce(audit."completed_at", finding."created_at"),
        audit."status"::text
      INTO source_project, source_projection, evidence_projection, source_observed_at, source_status
      FROM "technical_audit_findings" AS finding
      INNER JOIN "technical_audit_runs" AS audit
        ON audit."id" = finding."audit_run_id"
       AND audit."project_id" = finding."project_id"
      WHERE finding."id" = NEW."source_id"
      FOR SHARE OF finding, audit;
      IF source_status <> 'completed' THEN RAISE EXCEPTION 'Technical-audit evidence requires a completed audit'; END IF;
      resolved_proof_tier := 'supporting_context';
    WHEN 'existing_page' THEN
      SELECT
        proposal."project_id",
        jsonb_build_object(
          'id', version."id",
          'proposalId', version."page_proposal_id",
          'route', proposal."route",
          'versionNumber', version."version_number",
          'status', version."status",
          'pageJson', version."page_json",
          'approvedAt', version."approved_at"
        ),
        jsonb_build_object('summary', 'Approved existing page version', 'route', proposal."route", 'status', version."status"),
        coalesce(version."approved_at", version."created_at"),
        version."status"::text
      INTO source_project, source_projection, evidence_projection, source_observed_at, source_status
      FROM "page_versions" AS version
      INNER JOIN "page_proposals" AS proposal ON proposal."id" = version."page_proposal_id"
      WHERE version."id" = NEW."source_id"
      FOR SHARE OF version, proposal;
      IF source_status NOT IN ('approved', 'release_candidate', 'released', 'superseded') THEN
        RAISE EXCEPTION 'Existing-page evidence must be an approved immutable page version';
      END IF;
      resolved_proof_tier := 'supporting_context';
    ELSE
      RAISE EXCEPTION 'Unsupported agent run evidence source kind';
  END CASE;

  IF source_project IS NULL OR source_project <> NEW."project_id" OR source_projection IS NULL OR source_observed_at IS NULL THEN
    RAISE EXCEPTION 'Agent run evidence source must resolve inside the same project';
  END IF;
  resolved_source_version := CASE NEW."source_kind"::text
    WHEN 'business_profile_revision' THEN 'sha256:' || source_projection->>'profileSha256'
    WHEN 'canonical_service' THEN 'row-version:' || source_projection->>'rowVersion'
    WHEN 'canonical_area' THEN 'row-version:' || source_projection->>'rowVersion'
    WHEN 'website_import' THEN 'completed-at:' || to_char(source_observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    WHEN 'gsc_row' THEN 'sync-run:' || source_projection->>'syncRunId'
    WHEN 'gsc_signal' THEN 'sync-run:' || source_projection->>'syncRunId'
    WHEN 'ranking_proof' THEN 'row-version:' || source_projection->>'rowVersion'
    WHEN 'public_web_search_capture' THEN 'captured-at:' || to_char(source_observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    WHEN 'knowledge_version' THEN 'sha256:' || source_projection->>'contentSha256'
    WHEN 'technical_audit_finding' THEN 'audit-run:' || source_projection->>'auditRunId'
    WHEN 'existing_page' THEN 'version-number:' || source_projection->>'versionNumber'
    ELSE NULL
  END;
  IF resolved_source_version IS NULL OR NEW."source_version" IS DISTINCT FROM resolved_source_version THEN
    RAISE EXCEPTION 'Agent run evidence source changed after material selection';
  END IF;
  resolved_payload_sha256 := encode(sha256(convert_to(source_projection::text, 'UTF8')), 'hex');
  NEW."source_version" := resolved_source_version;
  NEW."payload_sha256" := resolved_payload_sha256;
  NEW."observed_at" := source_observed_at;
  NEW."proof_tier" := resolved_proof_tier;
  NEW."evidence_json" := evidence_projection;
  IF octet_length(NEW."evidence_json"::text) > 16384 THEN
    RAISE EXCEPTION 'Agent run evidence projection exceeds 16 KiB';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_canonical_business_entity_write()
RETURNS trigger AS $$
DECLARE
  source_project uuid;
  source_status text;
BEGIN
  IF NEW."source_kind" = 'website_import' THEN
    SELECT "project_id", "status" INTO source_project, source_status FROM "website_import_runs" WHERE "id" = NEW."source_id" FOR SHARE;
    IF source_project IS NULL OR source_project <> NEW."project_id" OR source_status <> 'completed' THEN
      RAISE EXCEPTION 'Canonical business entity import source must be completed in the same project';
    END IF;
  ELSIF NEW."source_kind" = 'knowledge' THEN
    SELECT "project_id", "status"::text INTO source_project, source_status FROM "project_knowledge_versions" WHERE "id" = NEW."source_id" FOR SHARE;
    IF source_project IS NULL OR source_project <> NEW."project_id" OR source_status <> 'approved' THEN
      RAISE EXCEPTION 'Canonical business entity knowledge source must be approved in the same project';
    END IF;
  ELSIF NEW."source_kind" = 'manual' AND NEW."source_id" IS NOT NULL THEN
    RAISE EXCEPTION 'Manual canonical business entities cannot claim a source id';
  END IF;

  IF NEW."status"::text = 'confirmed' AND (
    NEW."confirmed_at" IS NULL OR NEW."confirmed_by_user_id" IS NULL OR NEW."retired_at" IS NOT NULL OR NEW."retired_by_user_id" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Confirmed canonical business entities require confirmation evidence and no retirement evidence';
  ELSIF NEW."status"::text = 'retired' AND (
    NEW."confirmed_at" IS NULL OR NEW."confirmed_by_user_id" IS NULL OR NEW."retired_at" IS NULL OR NEW."retired_by_user_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Retired canonical business entities require confirmation and retirement evidence';
  ELSIF NEW."status"::text IN ('proposed', 'rejected') AND (
    NEW."confirmed_at" IS NOT NULL OR NEW."confirmed_by_user_id" IS NOT NULL OR NEW."retired_at" IS NOT NULL OR NEW."retired_by_user_id" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Unconfirmed canonical business entities cannot carry lifecycle evidence';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW."row_version" := 0;
    IF NEW."status"::text <> 'proposed' THEN
      RAISE EXCEPTION 'Canonical business entities must be inserted proposed';
    END IF;
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

  IF OLD."status"::text = 'proposed' AND NEW."status"::text IN ('confirmed', 'rejected') THEN RETURN NEW; END IF;
  IF OLD."status"::text = 'confirmed' AND NEW."status"::text = 'retired' THEN RETURN NEW; END IF;
  IF OLD."status"::text = 'retired' AND NEW."status"::text = 'confirmed' THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Illegal canonical business entity status transition';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_opportunity_research_state_write()
RETURNS trigger AS $$
DECLARE
  active_project uuid;
  active_workflow agent_workflow_name;
  active_status agent_run_status;
BEGIN
  IF NEW."active_run_id" IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW."active_run_id" IS DISTINCT FROM OLD."active_run_id") THEN
    SELECT "project_id", "workflow_name", "status"
    INTO active_project, active_workflow, active_status
    FROM "agent_runs"
    WHERE "id" = NEW."active_run_id"
    FOR UPDATE;
    IF active_project IS NULL OR active_project <> NEW."project_id" OR active_workflow <> 'opportunity_research'
       OR active_status NOT IN ('queued', 'running') THEN
      RAISE EXCEPTION 'Opportunity research active run must be an active workflow in the same project';
    END IF;
  END IF;
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
  IF NEW."status" = OLD."status" THEN RETURN NEW; END IF;
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
CREATE OR REPLACE FUNCTION mark_project_opportunity_research_dirty()
RETURNS trigger AS $$
DECLARE
  target_project uuid;
  material_change boolean := false;
BEGIN
  target_project := NEW."project_id";
  IF TG_TABLE_NAME = 'project_business_profiles' THEN
    material_change := (TG_OP = 'INSERT' AND NEW."status" = 'confirmed')
      OR (TG_OP = 'UPDATE' AND (
        NEW."current_revision_id" IS DISTINCT FROM OLD."current_revision_id"
        OR NEW."status" IS DISTINCT FROM OLD."status"
      ));
  ELSIF TG_TABLE_NAME IN ('services', 'areas') THEN
    material_change := NEW."status"::text IN ('confirmed', 'retired')
      OR (TG_OP = 'UPDATE' AND OLD."status"::text = 'confirmed');
  ELSIF TG_TABLE_NAME = 'project_knowledge_documents' THEN
    material_change := NEW."current_approved_version_id" IS DISTINCT FROM OLD."current_approved_version_id";
  ELSIF TG_TABLE_NAME = 'ranking_proofs' THEN
    material_change := NEW."status" = 'reviewed' OR (TG_OP = 'UPDATE' AND OLD."status" = 'reviewed');
  ELSIF TG_TABLE_NAME = 'website_import_runs' THEN
    material_change := NEW."status" = 'completed';
  ELSIF TG_TABLE_NAME = 'gsc_sync_runs' THEN
    material_change := NEW."status" = 'completed';
  END IF;
  IF NOT material_change THEN RETURN NEW; END IF;

  INSERT INTO "project_opportunity_research_states" (
    "project_id", "status", "material_digest", "material_dirty", "next_scheduled_at", "created_at", "updated_at"
  ) VALUES (
    target_project, 'needs_research', NULL, true, now(), now(), now()
  )
  ON CONFLICT ("project_id") DO UPDATE
  SET "status" = CASE
        WHEN "project_opportunity_research_states"."status" IN ('paused', 'queued', 'running')
          THEN "project_opportunity_research_states"."status"
        ELSE 'needs_research'::opportunity_research_status
      END,
      "material_digest" = CASE
        WHEN "project_opportunity_research_states"."status" IN ('paused', 'queued', 'running')
          THEN "project_opportunity_research_states"."material_digest"
        ELSE NULL
      END,
      "material_dirty" = true,
      "next_scheduled_at" = CASE
        WHEN "project_opportunity_research_states"."status" IN ('paused', 'queued', 'running') THEN NULL
        ELSE now()
      END,
      "updated_at" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
