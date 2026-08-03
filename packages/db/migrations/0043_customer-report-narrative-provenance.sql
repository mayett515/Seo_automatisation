ALTER TABLE "reports" ADD CONSTRAINT "reports_narrative_provenance_shape_check" CHECK (("reports"."narrative_mode" = 'fact_only' and "reports"."source_agent_run_id" is null) or ("reports"."narrative_mode" = 'bounded_ai' and "reports"."source_agent_run_id" is not null));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_report_narrative_provenance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  snapshot_json jsonb;
  narrative_agent record;
BEGIN
  snapshot_json := NEW."snapshot_canonical_text"::jsonb;

  IF jsonb_typeof(snapshot_json->'narrative') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Report canonical snapshot must contain a narrative array.';
  END IF;

  IF snapshot_json->>'narrativeMode' IS DISTINCT FROM NEW."narrative_mode"::text THEN
    RAISE EXCEPTION 'Report narrative mode must match the canonical snapshot.';
  END IF;

  IF NEW."narrative_mode" = 'fact_only' THEN
    IF NEW."source_agent_run_id" IS NOT NULL
      OR jsonb_array_length(snapshot_json->'narrative') <> 0 THEN
      RAISE EXCEPTION 'Fact-only reports cannot claim agent narrative provenance.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."source_agent_run_id" IS NULL
    OR jsonb_array_length(snapshot_json->'narrative') = 0 THEN
    RAISE EXCEPTION 'Bounded-AI reports require agent provenance and narrative fragments.';
  END IF;

  SELECT "project_id", "subject_id", "task", "status", "output_json"
    INTO narrative_agent
    FROM "agent_runs"
    WHERE "id" = NEW."source_agent_run_id"
    FOR UPDATE;

  IF NOT FOUND
    OR narrative_agent."project_id" <> NEW."project_id"
    OR narrative_agent."subject_id" <> NEW."id"
    OR narrative_agent."task" <> 'report_narrative'
    OR narrative_agent."status" <> 'succeeded'
    OR narrative_agent."output_json"->>'schemaVersion' <> 'customer_report_narrative_output.v1'
    OR narrative_agent."output_json"->'fragments' IS DISTINCT FROM snapshot_json->'narrative' THEN
    RAISE EXCEPTION 'Bounded-AI report narrative must match its succeeded report-scoped agent run.';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "reports_narrative_provenance_insert_trigger"
BEFORE INSERT ON "reports"
FOR EACH ROW
EXECUTE FUNCTION enforce_report_narrative_provenance();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_report_narrative_agent_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."task" = 'report_narrative' AND OLD."status" = 'succeeded' THEN
      RAISE EXCEPTION 'Succeeded report narrative agent runs are immutable audit evidence.';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW."task" = 'report_narrative' AND NEW."subject_id" IS NULL THEN
    RAISE EXCEPTION 'Report narrative agent runs require a report subject id.';
  END IF;

  IF NEW."task" = 'report_narrative' AND NEW."status" = 'succeeded' AND (
    NEW."output_json"->>'schemaVersion' IS DISTINCT FROM 'customer_report_narrative_output.v1'
    OR jsonb_typeof(NEW."output_json"->'fragments') IS DISTINCT FROM 'array'
    OR jsonb_array_length(NEW."output_json"->'fragments') = 0
  ) THEN
    RAISE EXCEPTION 'Succeeded report narrative agent runs require attributed output.';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."task" = 'report_narrative' THEN
    IF NEW."project_id" IS DISTINCT FROM OLD."project_id"
      OR NEW."subject_id" IS DISTINCT FROM OLD."subject_id"
      OR NEW."task" IS DISTINCT FROM OLD."task"
      OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
      RAISE EXCEPTION 'Report narrative agent identity is immutable.';
    END IF;

    IF OLD."status" = 'succeeded' AND (
      NEW."status" IS DISTINCT FROM OLD."status"
      OR NEW."provider" IS DISTINCT FROM OLD."provider"
      OR NEW."model" IS DISTINCT FROM OLD."model"
      OR NEW."input_ref" IS DISTINCT FROM OLD."input_ref"
      OR NEW."output_json" IS DISTINCT FROM OLD."output_json"
      OR NEW."usage_json" IS DISTINCT FROM OLD."usage_json"
      OR NEW."diagnostics_json" IS DISTINCT FROM OLD."diagnostics_json"
      OR NEW."latency_ms" IS DISTINCT FROM OLD."latency_ms"
      OR NEW."started_at" IS DISTINCT FROM OLD."started_at"
      OR NEW."completed_at" IS DISTINCT FROM OLD."completed_at"
    ) THEN
      RAISE EXCEPTION 'Succeeded report narrative agent runs are immutable audit evidence.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "report_narrative_agent_write_trigger"
BEFORE INSERT OR UPDATE ON "agent_runs"
FOR EACH ROW
EXECUTE FUNCTION enforce_report_narrative_agent_write();
--> statement-breakpoint
CREATE TRIGGER "report_narrative_agent_delete_trigger"
BEFORE DELETE ON "agent_runs"
FOR EACH ROW
EXECUTE FUNCTION enforce_report_narrative_agent_write();
--> statement-breakpoint
CREATE TRIGGER "reports_narrative_provenance_update_trigger"
BEFORE UPDATE OF "snapshot_canonical_text", "narrative_mode", "source_agent_run_id" ON "reports"
FOR EACH ROW
EXECUTE FUNCTION enforce_report_narrative_provenance();
