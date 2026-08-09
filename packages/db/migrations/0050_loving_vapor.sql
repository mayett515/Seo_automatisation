ALTER TABLE "agent_run_events" ADD COLUMN "execution_epoch" integer;--> statement-breakpoint
ALTER TABLE "agent_run_evidence_items" ADD COLUMN "execution_epoch" integer;--> statement-breakpoint
UPDATE "agent_run_events" AS event
SET "execution_epoch" = coalesce(
  (SELECT step."execution_epoch" FROM "agent_run_steps" AS step WHERE step."id" = event."agent_run_step_id"),
  CASE WHEN event."event_type" = 'run.queued' THEN 0 ELSE run."execution_epoch" END
)
FROM "agent_runs" AS run
WHERE run."id" = event."agent_run_id";--> statement-breakpoint
UPDATE "agent_run_evidence_items" AS evidence
SET "execution_epoch" = run."execution_epoch"
FROM "agent_runs" AS run
WHERE run."id" = evidence."agent_run_id";--> statement-breakpoint
ALTER TABLE "agent_run_events" ALTER COLUMN "execution_epoch" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "agent_run_events" ALTER COLUMN "execution_epoch" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_run_evidence_items" ALTER COLUMN "execution_epoch" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "agent_run_evidence_items" ALTER COLUMN "execution_epoch" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_run_events" ADD CONSTRAINT "agent_run_events_execution_epoch_check" CHECK ("agent_run_events"."execution_epoch" >= 0);--> statement-breakpoint
ALTER TABLE "agent_run_evidence_items" ADD CONSTRAINT "agent_run_evidence_execution_epoch_check" CHECK ("agent_run_evidence_items"."execution_epoch" > 0);--> statement-breakpoint

CREATE OR REPLACE FUNCTION lock_agent_run_evidence_source_before_parent()
RETURNS trigger AS $$
BEGIN
  PERFORM "id" FROM "projects" WHERE "id" = NEW."project_id" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent evidence project was not found';
  END IF;
  CASE NEW."source_kind"::text
    WHEN 'business_profile_revision' THEN
      PERFORM revision."id"
      FROM "project_business_profile_revisions" AS revision
      INNER JOIN "project_business_profiles" AS profile
        ON profile."current_revision_id" = revision."id"
       AND profile."project_id" = revision."project_id"
      WHERE revision."id" = NEW."source_id" AND revision."project_id" = NEW."project_id"
      FOR SHARE OF revision, profile;
    WHEN 'canonical_service' THEN
      PERFORM "id" FROM "services" WHERE "id" = NEW."source_id" AND "project_id" = NEW."project_id" FOR SHARE;
    WHEN 'canonical_area' THEN
      PERFORM "id" FROM "areas" WHERE "id" = NEW."source_id" AND "project_id" = NEW."project_id" FOR SHARE;
    WHEN 'website_import' THEN
      PERFORM "id" FROM "website_import_runs" WHERE "id" = NEW."source_id" AND "project_id" = NEW."project_id" FOR SHARE;
    WHEN 'gsc_row' THEN
      PERFORM row."id"
      FROM "gsc_search_analytics_rows" AS row
      INNER JOIN "gsc_sync_runs" AS sync
        ON sync."id" = row."sync_run_id"
       AND sync."project_id" = row."project_id"
      WHERE row."id" = NEW."source_id" AND row."project_id" = NEW."project_id"
      FOR SHARE OF row, sync;
    WHEN 'gsc_signal' THEN
      PERFORM signal."id"
      FROM "gsc_opportunity_signals" AS signal
      INNER JOIN "gsc_sync_runs" AS sync
        ON sync."id" = signal."sync_run_id"
       AND sync."project_id" = signal."project_id"
      WHERE signal."id" = NEW."source_id" AND signal."project_id" = NEW."project_id"
      FOR SHARE OF signal, sync;
    WHEN 'ranking_proof' THEN
      PERFORM "id" FROM "ranking_proofs" WHERE "id" = NEW."source_id" AND "project_id" = NEW."project_id" FOR SHARE;
    WHEN 'public_web_search_capture' THEN
      PERFORM "id" FROM "public_web_search_captures" WHERE "id" = NEW."source_id" AND "project_id" = NEW."project_id" FOR SHARE;
    WHEN 'knowledge_version' THEN
      PERFORM version."id"
      FROM "project_knowledge_versions" AS version
      INNER JOIN "project_knowledge_documents" AS document
        ON document."id" = version."document_id"
       AND document."project_id" = version."project_id"
      WHERE version."id" = NEW."source_id" AND version."project_id" = NEW."project_id"
      FOR SHARE OF version, document;
    WHEN 'technical_audit_finding' THEN
      PERFORM finding."id"
      FROM "technical_audit_findings" AS finding
      INNER JOIN "technical_audit_runs" AS audit
        ON audit."id" = finding."audit_run_id"
       AND audit."project_id" = finding."project_id"
      WHERE finding."id" = NEW."source_id" AND finding."project_id" = NEW."project_id"
      FOR SHARE OF finding, audit;
    WHEN 'existing_page' THEN
      PERFORM version."id"
      FROM "page_versions" AS version
      INNER JOIN "page_proposals" AS proposal
        ON proposal."id" = version."page_proposal_id"
       AND proposal."project_id" = NEW."project_id"
      WHERE version."id" = NEW."source_id"
      FOR SHARE OF version, proposal;
    ELSE
      RAISE EXCEPTION 'Unsupported agent run evidence source kind';
  END CASE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER agent_run_evidence_00_source_lock_order
BEFORE INSERT ON "agent_run_evidence_items"
FOR EACH ROW EXECUTE FUNCTION lock_agent_run_evidence_source_before_parent();--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_agent_run_event_execution_epoch()
RETURNS trigger AS $$
DECLARE
  run_epoch integer;
  step_epoch integer;
BEGIN
  SELECT "execution_epoch" INTO run_epoch
  FROM "agent_runs"
  WHERE "id" = NEW."agent_run_id";

  IF NEW."agent_run_step_id" IS NOT NULL THEN
    SELECT "execution_epoch" INTO step_epoch
    FROM "agent_run_steps"
    WHERE "id" = NEW."agent_run_step_id";
    IF step_epoch IS NULL OR run_epoch IS NULL
       OR NEW."execution_epoch" <> step_epoch
       OR NEW."execution_epoch" <> run_epoch THEN
      RAISE EXCEPTION 'Agent run step event must bind the exact step execution epoch';
    END IF;
  ELSIF NEW."event_type" = 'run.queued' THEN
    IF NEW."execution_epoch" <> 0 THEN
      RAISE EXCEPTION 'Queued workflow event must bind execution epoch zero';
    END IF;
  ELSIF run_epoch IS NULL OR NEW."execution_epoch" <> run_epoch THEN
    RAISE EXCEPTION 'Agent run event must bind the current workflow execution epoch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER agent_run_events_execution_epoch_guard
BEFORE INSERT ON "agent_run_events"
FOR EACH ROW EXECUTE FUNCTION enforce_agent_run_event_execution_epoch();--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_agent_run_evidence_execution_epoch()
RETURNS trigger AS $$
DECLARE
  run_project uuid;
  run_status agent_run_status;
  run_epoch integer;
BEGIN
  SELECT "project_id", "status", "execution_epoch"
  INTO run_project, run_status, run_epoch
  FROM "agent_runs"
  WHERE "id" = NEW."agent_run_id"
  FOR UPDATE;

  IF run_project IS NULL OR run_project <> NEW."project_id" OR run_status <> 'running'
     OR run_epoch <= 0 OR NEW."execution_epoch" <> run_epoch THEN
    RAISE EXCEPTION 'Agent evidence must bind the current running workflow execution epoch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER agent_run_evidence_execution_epoch_guard
BEFORE INSERT ON "agent_run_evidence_items"
FOR EACH ROW EXECUTE FUNCTION enforce_agent_run_evidence_execution_epoch();--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_agent_run_step_evidence_link()
RETURNS trigger AS $$
DECLARE
  run_status agent_run_status;
  run_epoch integer;
  step_run uuid;
  step_project uuid;
  step_status agent_run_step_status;
  step_epoch integer;
  evidence_run uuid;
  evidence_project uuid;
  evidence_epoch integer;
BEGIN
  SELECT "status", "execution_epoch" INTO run_status, run_epoch
  FROM "agent_runs" WHERE "id" = NEW."agent_run_id" FOR UPDATE;
  SELECT "agent_run_id", "project_id", "status", "execution_epoch"
  INTO step_run, step_project, step_status, step_epoch
  FROM "agent_run_steps" WHERE "id" = NEW."agent_run_step_id";
  SELECT "agent_run_id", "project_id", "execution_epoch"
  INTO evidence_run, evidence_project, evidence_epoch
  FROM "agent_run_evidence_items" WHERE "id" = NEW."evidence_item_id";

  IF run_status <> 'running' OR step_status <> 'running' THEN
    RAISE EXCEPTION 'Agent evidence links require a running workflow and step';
  END IF;
  IF step_run IS NULL OR evidence_run IS NULL OR step_run <> NEW."agent_run_id" OR evidence_run <> NEW."agent_run_id"
     OR step_project <> NEW."project_id" OR evidence_project <> NEW."project_id" THEN
    RAISE EXCEPTION 'Agent run step-evidence links must stay inside one run and project';
  END IF;
  IF run_epoch <= 0 OR step_epoch <> run_epoch OR evidence_epoch <= 0 OR evidence_epoch > step_epoch THEN
    RAISE EXCEPTION 'Agent run step-evidence links must bind durable evidence no newer than the current execution epoch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE OR REPLACE FUNCTION require_agent_workflow_lifecycle_event()
RETURNS trigger AS $$
DECLARE
  required_event agent_run_event_type;
  workflow_step_count integer;
  valid_workflow_step_count integer;
  strategy_output_sha256 text;
  strategy_output_json jsonb;
  research_plan_epoch integer;
  follow_up_epoch integer;
  strategy_epoch integer;
  research_plan_completed_at timestamptz;
  follow_up_completed_at timestamptz;
  strategy_completed_at timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."status" = OLD."status" THEN
    IF NEW."recovery_count" <> OLD."recovery_count" AND NOT EXISTS (
      SELECT 1 FROM "agent_run_events" AS event
      WHERE event."agent_run_id" = NEW."id"
        AND event."project_id" = NEW."project_id"
        AND event."agent_run_step_id" IS NULL
        AND event."event_type" = 'recovery.claimed'
        AND event."execution_epoch" = NEW."execution_epoch"
        AND event."occurred_at" = NEW."last_recovery_at"
        AND (event."payload_json"->>'recoveryCount')::integer = NEW."recovery_count"
    ) THEN
      RAISE EXCEPTION 'Workflow recovery claim requires its exact durable event in the same transaction';
    END IF;
    IF NEW."execution_epoch" <> OLD."execution_epoch" THEN
      IF EXISTS (
        SELECT 1 FROM "agent_run_steps" AS step
        WHERE step."agent_run_id" = NEW."id"
          AND step."project_id" = NEW."project_id"
          AND step."status" = 'running'
          AND step."execution_epoch" <> NEW."execution_epoch"
      ) THEN
        RAISE EXCEPTION 'Workflow execution takeover must resolve prior-epoch running steps';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM "agent_run_events" AS event
        WHERE event."agent_run_id" = NEW."id"
          AND event."project_id" = NEW."project_id"
          AND event."agent_run_step_id" IS NULL
          AND event."event_type" = 'recovery.claimed'
          AND event."execution_epoch" = NEW."execution_epoch"
          AND (event."payload_json"->>'executionEpoch')::integer = NEW."execution_epoch"
          AND event."payload_json"->>'executionClaimToken' = NEW."execution_claim_token"
      ) THEN
        RAISE EXCEPTION 'Workflow execution takeover requires its exact durable event in the same transaction';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."workflow_name" = 'opportunity_research' THEN
    IF NEW."status" = 'queued' AND NOT EXISTS (
      SELECT 1 FROM "project_opportunity_research_states" AS state
      WHERE state."project_id" = NEW."project_id" AND state."status" = 'queued' AND state."active_run_id" = NEW."id"
    ) THEN
      RAISE EXCEPTION 'Queued Opportunity Research run must own the queued project state';
    ELSIF NEW."status" = 'running' AND NOT EXISTS (
      SELECT 1 FROM "project_opportunity_research_states" AS state
      WHERE state."project_id" = NEW."project_id" AND state."status" = 'running' AND state."active_run_id" = NEW."id"
    ) THEN
      RAISE EXCEPTION 'Running Opportunity Research run must own the running project state';
    ELSIF NEW."status" = 'succeeded' THEN
      IF NOT EXISTS (
        SELECT 1 FROM "project_opportunity_research_states" AS state
        WHERE state."project_id" = NEW."project_id"
          AND state."active_run_id" IS NULL
          AND state."status" IN ('succeeded', 'paused')
          AND state."last_successful_digest" = NEW."input_sha256"
      ) THEN
        RAISE EXCEPTION 'Succeeded Opportunity Research run requires its exact terminal project state';
      END IF;
      SELECT
        count(*),
        count(*) FILTER (
          WHERE step."status" = 'succeeded'
            AND step."execution_epoch" > 0
            AND step."execution_epoch" <= NEW."execution_epoch"
            AND step."completed_at" IS NOT NULL
            AND step."output_sha256" IS NOT NULL
            AND step."output_json" IS NOT NULL
            AND (
              (step."step_key" = 'research-plan-agent.v2' AND step."step_kind" = 'agent'
                AND step."agent_role" = 'ResearchAgent' AND step."tool_key" IS NULL)
              OR (step."step_key" = 'follow-up-capture.v2' AND step."step_kind" = 'tool'
                AND step."agent_role" IS NULL AND step."tool_key" = 'public_web_search_follow_up')
              OR (step."step_key" = 'seo-strategy-agent.v2' AND step."step_kind" = 'agent'
                AND step."agent_role" = 'SeoStrategyAgent' AND step."tool_key" IS NULL)
            )
        ),
        max(step."execution_epoch") FILTER (WHERE step."step_key" = 'research-plan-agent.v2'),
        max(step."execution_epoch") FILTER (WHERE step."step_key" = 'follow-up-capture.v2'),
        max(step."execution_epoch") FILTER (WHERE step."step_key" = 'seo-strategy-agent.v2'),
        max(step."completed_at") FILTER (WHERE step."step_key" = 'research-plan-agent.v2'),
        max(step."completed_at") FILTER (WHERE step."step_key" = 'follow-up-capture.v2'),
        max(step."completed_at") FILTER (WHERE step."step_key" = 'seo-strategy-agent.v2')
      INTO workflow_step_count, valid_workflow_step_count,
        research_plan_epoch, follow_up_epoch, strategy_epoch,
        research_plan_completed_at, follow_up_completed_at, strategy_completed_at
      FROM "agent_run_steps" AS step
      WHERE step."agent_run_id" = NEW."id" AND step."project_id" = NEW."project_id";
      SELECT step."output_sha256", step."output_json"
      INTO strategy_output_sha256, strategy_output_json
      FROM "agent_run_steps" AS step
      WHERE step."agent_run_id" = NEW."id"
        AND step."project_id" = NEW."project_id"
        AND step."step_key" = 'seo-strategy-agent.v2';
      IF workflow_step_count <> 3 OR valid_workflow_step_count <> 3
         OR research_plan_epoch > follow_up_epoch OR follow_up_epoch > strategy_epoch
         OR research_plan_completed_at > follow_up_completed_at
         OR follow_up_completed_at > strategy_completed_at
         OR strategy_output_sha256 IS DISTINCT FROM NEW."output_sha256"
         OR strategy_output_json IS DISTINCT FROM NEW."output_json" THEN
        RAISE EXCEPTION 'Succeeded Opportunity Research run requires the exact completed workflow ledger';
      END IF;
    ELSIF NEW."status" = 'failed' AND NOT EXISTS (
      SELECT 1 FROM "project_opportunity_research_states" AS state
      WHERE state."project_id" = NEW."project_id"
        AND state."active_run_id" IS NULL
        AND state."status" IN ('failed', 'needs_research', 'paused')
    ) THEN
      RAISE EXCEPTION 'Failed Opportunity Research run requires a terminal project state';
    END IF;
    IF NEW."status" IN ('succeeded', 'failed') AND EXISTS (
      SELECT 1 FROM "agent_run_steps" AS step
      WHERE step."agent_run_id" = NEW."id" AND step."status" IN ('pending', 'running')
    ) THEN
      RAISE EXCEPTION 'Terminal Opportunity Research run cannot retain unresolved workflow steps';
    END IF;
  END IF;

  IF NEW."status" = 'queued' THEN required_event := 'run.queued';
  ELSIF NEW."status" = 'running' THEN required_event := 'run.started';
  ELSIF NEW."status" = 'succeeded' THEN required_event := 'run.succeeded';
  ELSIF NEW."status" = 'failed' THEN required_event := 'run.failed';
  ELSE RAISE EXCEPTION 'Unsupported workflow run lifecycle state';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "agent_run_events" AS event
    WHERE event."agent_run_id" = NEW."id"
      AND event."project_id" = NEW."project_id"
      AND event."agent_run_step_id" IS NULL
      AND event."event_type" = required_event
      AND event."execution_epoch" = NEW."execution_epoch"
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
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE OR REPLACE FUNCTION require_opportunity_research_projection(
  target_project_id uuid,
  target_material_digest text,
  stored_shortfalls jsonb
)
RETURNS void AS $$
DECLARE
  target_run_id uuid;
  run_output jsonb;
  expected_candidate_keys text[];
  actual_candidate_keys text[];
  expected_shortfalls jsonb;
  portfolio_mismatch boolean;
BEGIN
  SELECT run."id", run."output_json"
  INTO target_run_id, run_output
  FROM "agent_runs" AS run
  WHERE run."project_id" = target_project_id
    AND run."workflow_name" = 'opportunity_research'
    AND run."status" = 'succeeded'
    AND run."input_sha256" = target_material_digest
  ORDER BY run."completed_at" DESC, run."id" DESC
  LIMIT 1;

  IF target_run_id IS NULL OR jsonb_typeof(run_output->'candidates') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Opportunity Research projection requires one exact succeeded workflow output';
  END IF;

  WITH output_keys AS (
    SELECT DISTINCT
      candidate.value->>'serviceId' || ':' || candidate.value->>'areaId' || ':' ||
      lower(regexp_replace(btrim(candidate.value->>'primaryKeyword'), '\s+', ' ', 'g')) AS candidate_key
    FROM jsonb_array_elements(run_output->'candidates') AS candidate(value)
  )
  SELECT array_agg(output_keys.candidate_key ORDER BY output_keys.candidate_key)
  INTO expected_candidate_keys
  FROM output_keys
  WHERE output_keys.candidate_key IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "opportunities" AS existing
      WHERE existing."project_id" = target_project_id
        AND existing."candidate_key" = output_keys.candidate_key
        AND existing."status" <> 'rejected'
        AND existing."agent_run_id" IS DISTINCT FROM target_run_id
    );

  SELECT array_agg(opportunity."candidate_key" ORDER BY opportunity."candidate_key")
  INTO actual_candidate_keys
  FROM "opportunities" AS opportunity
  WHERE opportunity."project_id" = target_project_id
    AND opportunity."agent_run_id" = target_run_id
    AND opportunity."policy_version" = 'opportunity-portfolio.v1';

  IF coalesce(expected_candidate_keys, ARRAY[]::text[]) IS DISTINCT FROM
     coalesce(actual_candidate_keys, ARRAY[]::text[]) THEN
    RAISE EXCEPTION 'Opportunity Research projection must persist the exact deduplicated strategy candidate set';
  END IF;

  WITH ranked AS (
    SELECT
      opportunity."id",
      opportunity."lane",
      CASE
        WHEN opportunity."lane" = 'defend_advance' THEN 1
        WHEN opportunity."lane" IN ('quick_win', 'build_cluster') THEN 2
        ELSE 3
      END AS portfolio_group,
      row_number() OVER (
        PARTITION BY CASE
          WHEN opportunity."lane" = 'defend_advance' THEN 1
          WHEN opportunity."lane" IN ('quick_win', 'build_cluster') THEN 2
          ELSE 3
        END
        ORDER BY
          CASE opportunity."evidence_readiness" WHEN 'reviewed_proof' THEN 2 WHEN 'supporting_context' THEN 1 ELSE 0 END DESC,
          CASE opportunity."business_value" WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END DESC,
          CASE opportunity."market_difficulty" WHEN 'low' THEN 3 WHEN 'medium' THEN 2 WHEN 'high' THEN 1 ELSE 0 END DESC,
          CASE opportunity."execution_effort" WHEN 'low' THEN 3 WHEN 'medium' THEN 2 WHEN 'high' THEN 1 ELSE 0 END DESC,
          opportunity."candidate_key",
          opportunity."id"
      ) AS group_order
    FROM "opportunities" AS opportunity
    WHERE opportunity."project_id" = target_project_id
      AND opportunity."agent_run_id" = target_run_id
      AND opportunity."policy_version" = 'opportunity-portfolio.v1'
  ), selected AS (
    SELECT
      ranked."id",
      row_number() OVER (ORDER BY ranked.portfolio_group, ranked.group_order)::integer AS expected_order
    FROM ranked
    WHERE (ranked.portfolio_group = 1 AND ranked.group_order <= 2)
       OR (ranked.portfolio_group = 2 AND ranked.group_order <= 4)
       OR (ranked.portfolio_group = 3 AND ranked.group_order <= 2)
  )
  SELECT coalesce(bool_or(
    opportunity."portfolio_selected" IS DISTINCT FROM (selected."id" IS NOT NULL)
    OR opportunity."portfolio_order" IS DISTINCT FROM selected.expected_order
  ), false)
  INTO portfolio_mismatch
  FROM "opportunities" AS opportunity
  LEFT JOIN selected ON selected."id" = opportunity."id"
  WHERE opportunity."project_id" = target_project_id
    AND opportunity."agent_run_id" = target_run_id
    AND opportunity."policy_version" = 'opportunity-portfolio.v1';

  IF portfolio_mismatch THEN
    RAISE EXCEPTION 'Opportunity Research portfolio selection must match deterministic policy order';
  END IF;

  SELECT jsonb_build_object(
    'defendAdvance', 2 - least(2, count(*) FILTER (WHERE opportunity."lane" = 'defend_advance')),
    'quickBuild', 4 - least(4, count(*) FILTER (WHERE opportunity."lane" IN ('quick_win', 'build_cluster'))),
    'strategic', 2 - least(2, count(*) FILTER (WHERE opportunity."lane" = 'strategic_market'))
  )
  INTO expected_shortfalls
  FROM "opportunities" AS opportunity
  WHERE opportunity."project_id" = target_project_id
    AND opportunity."agent_run_id" = target_run_id
    AND opportunity."policy_version" = 'opportunity-portfolio.v1';

  IF stored_shortfalls IS DISTINCT FROM expected_shortfalls THEN
    RAISE EXCEPTION 'Opportunity Research state shortfalls must match deterministic portfolio truth';
  END IF;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE OR REPLACE FUNCTION require_opportunity_research_state_consistency()
RETURNS trigger AS $$
BEGIN
  IF NEW."status" IN ('queued', 'running') THEN
    IF NOT EXISTS (
      SELECT 1 FROM "agent_runs" AS run
      WHERE run."id" = NEW."active_run_id"
        AND run."project_id" = NEW."project_id"
        AND run."workflow_name" = 'opportunity_research'
        AND run."status"::text = NEW."status"::text
    ) THEN
      RAISE EXCEPTION 'Active Opportunity Research state must match its workflow run';
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM "agent_runs" AS run
    WHERE run."project_id" = NEW."project_id"
      AND run."workflow_name" = 'opportunity_research'
      AND run."status" IN ('queued', 'running')
  ) THEN
    RAISE EXCEPTION 'Terminal Opportunity Research state cannot abandon an active workflow run';
  END IF;
  IF NEW."status" = 'succeeded' AND NOT EXISTS (
    SELECT 1 FROM "agent_runs" AS run
    WHERE run."project_id" = NEW."project_id"
      AND run."workflow_name" = 'opportunity_research'
      AND run."status" = 'succeeded'
      AND run."input_sha256" = NEW."last_successful_digest"
  ) THEN
    RAISE EXCEPTION 'Succeeded Opportunity Research state must reference durable workflow success truth';
  END IF;
  IF NEW."status" IN ('succeeded', 'paused') AND NEW."last_successful_digest" IS NOT NULL THEN
    PERFORM require_opportunity_research_projection(
      NEW."project_id",
      NEW."last_successful_digest",
      NEW."portfolio_shortfalls_json"
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE CONSTRAINT TRIGGER project_opportunity_research_states_require_consistency
AFTER INSERT OR UPDATE ON "project_opportunity_research_states"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION require_opportunity_research_state_consistency();--> statement-breakpoint

CREATE OR REPLACE FUNCTION require_research_opportunity_source_truth()
RETURNS trigger AS $$
DECLARE
  run_project uuid;
  run_status agent_run_status;
  run_workflow agent_workflow_name;
  run_input_sha256 text;
  run_output_json jsonb;
  service_project uuid;
  service_status canonical_entity_status;
  area_project uuid;
  area_status canonical_entity_status;
  candidate_evidence_keys text[];
  cited_evidence_keys text[];
  candidate_evidence_count integer;
  cited_evidence_count integer;
  best_rank integer;
  has_supporting_context boolean;
  expected_ranking_milestone text;
  expected_evidence_readiness text;
  expected_lane text;
  expected_candidate_key text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."policy_version" IS NOT NULL AND NEW."policy_version" IS NULL THEN
    RAISE EXCEPTION 'Research opportunity strategy and provenance are immutable after insertion';
  END IF;
  IF NEW."policy_version" IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."project_id" IS DISTINCT FROM OLD."project_id"
    OR NEW."agent_run_id" IS DISTINCT FROM OLD."agent_run_id"
    OR NEW."area_id" IS DISTINCT FROM OLD."area_id"
    OR NEW."service_id" IS DISTINCT FROM OLD."service_id"
    OR NEW."classification" IS DISTINCT FROM OLD."classification"
    OR NEW."primary_keyword" IS DISTINCT FROM OLD."primary_keyword"
    OR NEW."score" IS DISTINCT FROM OLD."score"
    OR NEW."ranking_milestone" IS DISTINCT FROM OLD."ranking_milestone"
    OR NEW."evidence_readiness" IS DISTINCT FROM OLD."evidence_readiness"
    OR NEW."business_value" IS DISTINCT FROM OLD."business_value"
    OR NEW."market_difficulty" IS DISTINCT FROM OLD."market_difficulty"
    OR NEW."execution_effort" IS DISTINCT FROM OLD."execution_effort"
    OR NEW."lane" IS DISTINCT FROM OLD."lane"
    OR NEW."policy_version" IS DISTINCT FROM OLD."policy_version"
    OR NEW."research_material_digest" IS DISTINCT FROM OLD."research_material_digest"
    OR NEW."candidate_key" IS DISTINCT FROM OLD."candidate_key"
    OR NEW."portfolio_selected" IS DISTINCT FROM OLD."portfolio_selected"
    OR NEW."portfolio_order" IS DISTINCT FROM OLD."portfolio_order"
    OR NEW."evidence_json" IS DISTINCT FROM OLD."evidence_json"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
  ) THEN
    RAISE EXCEPTION 'Research opportunity strategy and provenance are immutable after insertion';
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW."policy_version" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT "project_id", "status", "workflow_name", "input_sha256", "output_json"
  INTO run_project, run_status, run_workflow, run_input_sha256, run_output_json
  FROM "agent_runs" WHERE "id" = NEW."agent_run_id";
  SELECT "project_id", "status" INTO service_project, service_status
  FROM "services" WHERE "id" = NEW."service_id";
  SELECT "project_id", "status" INTO area_project, area_status
  FROM "areas" WHERE "id" = NEW."area_id";

  IF run_project IS NULL OR run_project <> NEW."project_id" OR run_workflow <> 'opportunity_research'
     OR run_status <> 'succeeded' OR run_input_sha256 IS DISTINCT FROM NEW."research_material_digest" THEN
    RAISE EXCEPTION 'Research opportunity requires succeeded same-project workflow truth';
  END IF;
  IF service_project IS NULL OR service_project <> NEW."project_id" OR service_status <> 'confirmed'
     OR area_project IS NULL OR area_project <> NEW."project_id" OR area_status <> 'confirmed' THEN
    RAISE EXCEPTION 'Research opportunity requires confirmed same-project service and area truth';
  END IF;
  IF NEW."policy_version" IS DISTINCT FROM 'opportunity-portfolio.v1'
     OR NEW."classification" IS NOT NULL
     OR NEW."score" IS NOT NULL
     OR NEW."status" <> 'new'
     OR NEW."row_version" <> 0
     OR NEW."decided_by_user_id" IS NOT NULL
     OR NEW."status_reason" IS NOT NULL
     OR jsonb_typeof(NEW."evidence_json") IS DISTINCT FROM 'object'
     OR NEW."evidence_json"->>'workflowVersion' IS DISTINCT FROM 'opportunity-research.v2'
     OR jsonb_typeof(NEW."evidence_json"->'candidate') IS DISTINCT FROM 'object'
     OR jsonb_typeof(NEW."evidence_json"->'derivedAxes') IS DISTINCT FROM 'object'
     OR jsonb_typeof(NEW."evidence_json"->'citedEvidenceKeys') IS DISTINCT FROM 'array'
     OR jsonb_typeof(run_output_json->'candidates') IS DISTINCT FROM 'array'
     OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(run_output_json->'candidates') AS candidate(value)
       WHERE candidate.value = NEW."evidence_json"->'candidate'
     )
     OR NEW."evidence_json"->'candidate'->>'serviceId' IS DISTINCT FROM NEW."service_id"::text
     OR NEW."evidence_json"->'candidate'->>'areaId' IS DISTINCT FROM NEW."area_id"::text
     OR NEW."evidence_json"->'candidate'->>'primaryKeyword' IS DISTINCT FROM NEW."primary_keyword"
     OR NEW."evidence_json"->'candidate'->>'businessValue' IS DISTINCT FROM NEW."business_value"::text
     OR NEW."evidence_json"->'candidate'->>'marketDifficulty' IS DISTINCT FROM NEW."market_difficulty"::text
     OR NEW."evidence_json"->'candidate'->>'executionEffort' IS DISTINCT FROM NEW."execution_effort"::text
     OR NEW."evidence_json"->'derivedAxes'->>'rankingMilestone' IS DISTINCT FROM NEW."ranking_milestone"::text
     OR NEW."evidence_json"->'derivedAxes'->>'evidenceReadiness' IS DISTINCT FROM NEW."evidence_readiness"::text
     OR NEW."evidence_json"->'derivedAxes'->>'businessValue' IS DISTINCT FROM NEW."business_value"::text
     OR NEW."evidence_json"->'derivedAxes'->>'marketDifficulty' IS DISTINCT FROM NEW."market_difficulty"::text
     OR NEW."evidence_json"->'derivedAxes'->>'executionEffort' IS DISTINCT FROM NEW."execution_effort"::text
     OR NEW."evidence_json"->'derivedAxes'->>'lane' IS DISTINCT FROM NEW."lane"::text THEN
    RAISE EXCEPTION 'Research opportunity must match exact succeeded strategy output truth';
  END IF;

  expected_candidate_key := NEW."service_id"::text || ':' || NEW."area_id"::text || ':' ||
    lower(regexp_replace(btrim(NEW."primary_keyword"), '\s+', ' ', 'g'));
  IF NEW."candidate_key" IS DISTINCT FROM expected_candidate_key THEN
    RAISE EXCEPTION 'Research opportunity candidate key must be server-derived';
  END IF;

  SELECT array_agg(DISTINCT value ORDER BY value), count(*)
  INTO candidate_evidence_keys, candidate_evidence_count
  FROM jsonb_array_elements_text(NEW."evidence_json"->'candidate'->'evidenceKeys') AS evidence(value);
  SELECT array_agg(DISTINCT value ORDER BY value), count(*)
  INTO cited_evidence_keys, cited_evidence_count
  FROM jsonb_array_elements_text(NEW."evidence_json"->'citedEvidenceKeys') AS evidence(value);
  IF candidate_evidence_keys IS NULL
     OR candidate_evidence_keys IS DISTINCT FROM cited_evidence_keys
     OR candidate_evidence_count <> cardinality(candidate_evidence_keys)
     OR cited_evidence_count <> cardinality(cited_evidence_keys)
     OR EXISTS (
       SELECT 1
       FROM unnest(cited_evidence_keys) AS cited(evidence_key)
       WHERE NOT EXISTS (
         SELECT 1
         FROM "agent_run_evidence_items" AS item
         INNER JOIN "agent_run_step_evidence_links" AS link
           ON link."evidence_item_id" = item."id"
          AND link."agent_run_id" = item."agent_run_id"
          AND link."project_id" = item."project_id"
         INNER JOIN "agent_run_steps" AS step
           ON step."id" = link."agent_run_step_id"
          AND step."agent_run_id" = link."agent_run_id"
          AND step."project_id" = link."project_id"
         WHERE item."agent_run_id" = NEW."agent_run_id"
           AND item."project_id" = NEW."project_id"
           AND item."evidence_key" = cited.evidence_key
           AND link."role" = 'cited'
           AND step."step_key" = 'seo-strategy-agent.v2'
           AND step."status" = 'succeeded'
       )
     ) THEN
    RAISE EXCEPTION 'Research opportunity citations must match strategy evidence ledger truth';
  END IF;

  SELECT min(proof."rank")
  INTO best_rank
  FROM "agent_run_evidence_items" AS item
  INNER JOIN "ranking_proofs" AS proof
    ON item."source_kind" = 'ranking_proof'
   AND proof."id" = item."source_id"
   AND proof."project_id" = item."project_id"
  WHERE item."agent_run_id" = NEW."agent_run_id"
    AND item."project_id" = NEW."project_id"
    AND item."evidence_key" = ANY(cited_evidence_keys)
    AND proof."status" = 'reviewed'
    AND lower(regexp_replace(btrim(proof."query"), '\s+', ' ', 'g')) =
        lower(regexp_replace(btrim(NEW."primary_keyword"), '\s+', ' ', 'g'));

  SELECT EXISTS (
    SELECT 1
    FROM "agent_run_evidence_items" AS item
    WHERE item."agent_run_id" = NEW."agent_run_id"
      AND item."project_id" = NEW."project_id"
      AND item."evidence_key" = ANY(cited_evidence_keys)
      AND item."source_kind" NOT IN ('gsc_row', 'gsc_signal')
  ) INTO has_supporting_context;

  expected_ranking_milestone := CASE
    WHEN best_rank IS NULL THEN 'unverified'
    WHEN best_rank = 1 THEN 'rank_1'
    WHEN best_rank <= 3 THEN 'top_3'
    WHEN best_rank <= 5 THEN 'top_5'
    WHEN best_rank <= 10 THEN 'top_10'
    ELSE 'outside_top_10'
  END;
  expected_evidence_readiness := CASE
    WHEN best_rank IS NOT NULL THEN 'reviewed_proof'
    WHEN has_supporting_context THEN 'supporting_context'
    ELSE 'internal_signal'
  END;
  expected_lane := CASE
    WHEN expected_ranking_milestone IN ('top_10', 'top_5', 'top_3', 'rank_1') THEN 'defend_advance'
    WHEN NEW."business_value"::text IN ('medium', 'high')
      AND NEW."market_difficulty"::text = 'low'
      AND NEW."execution_effort"::text IN ('low', 'medium') THEN 'quick_win'
    WHEN NEW."business_value"::text = 'high' AND NEW."market_difficulty"::text = 'high' THEN 'strategic_market'
    WHEN NEW."business_value"::text = 'high' AND NEW."execution_effort"::text = 'high' THEN 'strategic_market'
    ELSE 'build_cluster'
  END;

  IF NEW."ranking_milestone"::text IS DISTINCT FROM expected_ranking_milestone
     OR NEW."evidence_readiness"::text IS DISTINCT FROM expected_evidence_readiness
     OR NEW."lane"::text IS DISTINCT FROM expected_lane
     OR NEW."evidence_json"->'derivedAxes'->>'rankingMilestone' IS DISTINCT FROM expected_ranking_milestone
     OR NEW."evidence_json"->'derivedAxes'->>'evidenceReadiness' IS DISTINCT FROM expected_evidence_readiness
     OR NEW."evidence_json"->'derivedAxes'->>'lane' IS DISTINCT FROM expected_lane THEN
    RAISE EXCEPTION 'Research opportunity derived axes must match durable evidence truth';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE CONSTRAINT TRIGGER opportunities_require_research_source_truth
AFTER INSERT OR UPDATE ON "opportunities"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION require_research_opportunity_source_truth();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_research_opportunity_delete()
RETURNS trigger AS $$
BEGIN
  IF OLD."policy_version" IS NOT NULL THEN
    RAISE EXCEPTION 'Research opportunities are durable product truth and cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER opportunities_prevent_research_delete
BEFORE DELETE ON "opportunities"
FOR EACH ROW EXECUTE FUNCTION prevent_research_opportunity_delete();
