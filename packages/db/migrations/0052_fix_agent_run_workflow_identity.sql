-- Rollback: replace this function with its prior definition. No schema or data
-- changes need undoing, but the prior definition is invalid while agent_runs
-- has no run-level output reference column.
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
       OR NEW."output_sha256" IS NOT NULL
       OR NEW."output_json" IS NOT NULL
       OR NEW."execution_epoch" <> 0
       OR NEW."execution_claim_token" IS NOT NULL
       OR NEW."execution_recovery_count" <> 0
       OR NEW."last_heartbeat_at" IS NOT NULL
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
         OR NEW."execution_claim_token" IS DISTINCT FROM OLD."execution_claim_token"
         OR NEW."execution_recovery_count" IS DISTINCT FROM OLD."execution_recovery_count"
         OR (OLD."status" = 'queued' AND NEW."last_heartbeat_at" IS DISTINCT FROM OLD."last_heartbeat_at")
         OR (OLD."status" = 'running' AND (NEW."last_heartbeat_at" IS NULL
             OR (OLD."last_heartbeat_at" IS NOT NULL AND NEW."last_heartbeat_at" < OLD."last_heartbeat_at"))) THEN
        RAISE EXCEPTION 'Recovery claims must preserve execution ownership and advance liveness monotonically';
      END IF;
    ELSIF NEW."recovery_count" = OLD."recovery_count"
          AND NEW."last_recovery_at" IS NOT DISTINCT FROM OLD."last_recovery_at"
          AND NEW."execution_epoch" = OLD."execution_epoch" + 1 THEN
      IF OLD."status" <> 'running'
         OR NEW."execution_claim_token" IS NULL
         OR NEW."execution_claim_token" IS NOT DISTINCT FROM OLD."execution_claim_token"
         OR NEW."execution_recovery_count" < OLD."execution_recovery_count"
         OR NEW."execution_recovery_count" > NEW."recovery_count"
         OR (NEW."execution_recovery_count" <> OLD."execution_recovery_count"
             AND NEW."execution_recovery_count" <> NEW."recovery_count")
         OR NEW."last_heartbeat_at" IS NULL
         OR (OLD."last_heartbeat_at" IS NOT NULL AND NEW."last_heartbeat_at" < OLD."last_heartbeat_at") THEN
        RAISE EXCEPTION 'Execution takeover must advance one epoch under the current recovery generation';
      END IF;
    ELSIF NEW."recovery_count" = OLD."recovery_count"
          AND NEW."last_recovery_at" IS NOT DISTINCT FROM OLD."last_recovery_at"
          AND NEW."execution_epoch" IS NOT DISTINCT FROM OLD."execution_epoch"
          AND NEW."execution_claim_token" IS NOT DISTINCT FROM OLD."execution_claim_token"
          AND NEW."execution_recovery_count" IS NOT DISTINCT FROM OLD."execution_recovery_count" THEN
      IF OLD."status" <> 'running'
         OR NEW."last_heartbeat_at" IS NULL
         OR (OLD."last_heartbeat_at" IS NOT NULL AND NEW."last_heartbeat_at" <= OLD."last_heartbeat_at") THEN
        RAISE EXCEPTION 'Workflow heartbeat must monotonically renew the current running execution';
      END IF;
    ELSE
      RAISE EXCEPTION 'Same-status workflow updates require one bounded recovery, execution claim, or heartbeat';
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
       OR NEW."execution_epoch" <> OLD."execution_epoch" + 1
       OR NEW."execution_claim_token" IS NULL
       OR NEW."execution_recovery_count" NOT IN (0, NEW."recovery_count")
       OR NEW."last_heartbeat_at" IS NULL THEN
      RAISE EXCEPTION 'Workflow start requires clean evidence and one execution epoch';
    END IF;
  ELSIF OLD."status" IN ('queued', 'running') AND NEW."status" = 'failed' THEN
    IF NEW."failure_code" IS NULL
       OR NEW."completed_at" IS NULL
       OR NEW."output_sha256" IS NOT NULL
       OR NEW."output_json" IS NOT NULL
       OR NEW."execution_epoch" IS DISTINCT FROM OLD."execution_epoch"
       OR NEW."execution_claim_token" IS DISTINCT FROM OLD."execution_claim_token"
       OR NEW."execution_recovery_count" IS DISTINCT FROM OLD."execution_recovery_count"
       OR NEW."last_heartbeat_at" IS DISTINCT FROM OLD."last_heartbeat_at" THEN
      RAISE EXCEPTION 'Workflow failure requires terminal evidence without changing execution ownership';
    END IF;
  ELSIF OLD."status" = 'running' AND NEW."status" = 'succeeded' THEN
    IF NEW."failure_code" IS NOT NULL
       OR NEW."completed_at" IS NULL
       OR NEW."output_sha256" IS NULL
       OR NEW."output_json" IS NULL
       OR NEW."execution_epoch" IS DISTINCT FROM OLD."execution_epoch"
       OR NEW."execution_claim_token" IS DISTINCT FROM OLD."execution_claim_token"
       OR NEW."execution_recovery_count" IS DISTINCT FROM OLD."execution_recovery_count"
       OR NEW."last_heartbeat_at" IS DISTINCT FROM OLD."last_heartbeat_at" THEN
      RAISE EXCEPTION 'Workflow success requires digest-bound output under the owning execution epoch';
    END IF;
  ELSE
    RAISE EXCEPTION 'Illegal workflow run status transition';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
