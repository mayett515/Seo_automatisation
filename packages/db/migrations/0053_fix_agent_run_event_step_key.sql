-- Rollback: restore the prior function body with its step_key variable. No
-- schema or table data changes need undoing, but doing so restores the
-- PL/pgSQL name collision this migration fixes.
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
  step_key_value text;
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
    INTO step_run, step_project, step_status, step_key_value, step_attempt_count, step_started_at, step_completed_at, step_output_sha256, step_failure_code
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
       OR NEW."payload_json"->>'stepKey' IS DISTINCT FROM step_key_value
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
