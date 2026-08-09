DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "agent_run_steps" WHERE "status" = 'succeeded') THEN
    RAISE EXCEPTION 'Migration 0051 requires an empty succeeded agent workflow step set';
  END IF;
END;
$$;--> statement-breakpoint
CREATE TYPE "public"."knowledge_model_use_policy" AS ENUM('operator_only', 'model_allowed');--> statement-breakpoint
ALTER TABLE "agent_run_steps" DROP CONSTRAINT "agent_run_steps_terminal_evidence_check";--> statement-breakpoint
ALTER TABLE "agent_runs" DROP CONSTRAINT "agent_runs_execution_epoch_check";--> statement-breakpoint
ALTER TABLE "agent_run_steps" ADD COLUMN "output_canonical_text" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "execution_recovery_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "last_heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_knowledge_documents" ADD COLUMN "retired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_knowledge_documents" ADD COLUMN "retired_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "project_knowledge_documents" ADD COLUMN "retirement_reason" text;--> statement-breakpoint
ALTER TABLE "project_knowledge_versions" ADD COLUMN "model_use_policy" "knowledge_model_use_policy" DEFAULT 'operator_only' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_knowledge_documents" ADD CONSTRAINT "project_knowledge_documents_retired_by_user_id_users_id_fk" FOREIGN KEY ("retired_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_steps" ADD CONSTRAINT "agent_run_steps_terminal_evidence_check" CHECK (("agent_run_steps"."status" in ('pending', 'running') and "agent_run_steps"."completed_at" is null and "agent_run_steps"."failure_code" is null and "agent_run_steps"."failure_message" is null and "agent_run_steps"."output_canonical_text" is null) or ("agent_run_steps"."status" = 'succeeded' and "agent_run_steps"."completed_at" is not null and "agent_run_steps"."failure_code" is null and "agent_run_steps"."failure_message" is null and "agent_run_steps"."output_canonical_text" is not null and "agent_run_steps"."output_sha256" is not null and "agent_run_steps"."output_sha256" ~ '^[0-9a-f]{64}$') or ("agent_run_steps"."status" = 'failed' and "agent_run_steps"."completed_at" is not null and "agent_run_steps"."failure_code" is not null and "agent_run_steps"."failure_message" is not null and "agent_run_steps"."output_canonical_text" is null) or ("agent_run_steps"."status" = 'skipped' and "agent_run_steps"."completed_at" is not null and "agent_run_steps"."failure_code" is null and "agent_run_steps"."failure_message" is null and "agent_run_steps"."output_canonical_text" is null));--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_execution_epoch_check" CHECK (("agent_runs"."execution_epoch" = 0 and "agent_runs"."execution_claim_token" is null and "agent_runs"."execution_recovery_count" = 0) or ("agent_runs"."execution_epoch" > 0 and "agent_runs"."execution_claim_token" is not null and "agent_runs"."execution_recovery_count" between 0 and "agent_runs"."recovery_count"));--> statement-breakpoint
ALTER TABLE "project_knowledge_documents" ADD CONSTRAINT "project_knowledge_documents_retirement_check" CHECK (("project_knowledge_documents"."retired_at" is null and "project_knowledge_documents"."retired_by_user_id" is null and "project_knowledge_documents"."retirement_reason" is null) or ("project_knowledge_documents"."retired_at" is not null and "project_knowledge_documents"."retired_by_user_id" is not null and "project_knowledge_documents"."retirement_reason" is not null and "project_knowledge_documents"."current_approved_version_id" is null));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_agent_run_step_canonical_output()
RETURNS trigger AS $$
DECLARE
  parsed_output jsonb;
BEGIN
  IF NEW."status" = 'succeeded' THEN
    BEGIN
      parsed_output := NEW."output_canonical_text"::jsonb;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Succeeded workflow step canonical output must be valid JSON';
    END;
    IF parsed_output IS DISTINCT FROM NEW."output_json" THEN
      RAISE EXCEPTION 'Succeeded workflow step canonical output must match output JSON';
    END IF;
    IF encode(sha256(convert_to(NEW."output_canonical_text", 'UTF8')), 'hex') IS DISTINCT FROM NEW."output_sha256" THEN
      RAISE EXCEPTION 'Succeeded workflow step digest must match canonical output bytes';
    END IF;
  ELSIF NEW."output_canonical_text" IS NOT NULL THEN
    RAISE EXCEPTION 'Non-succeeded workflow steps cannot carry canonical output bytes';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER agent_run_steps_canonical_output_guard
BEFORE INSERT OR UPDATE OF "status", "output_json", "output_canonical_text", "output_sha256" ON "agent_run_steps"
FOR EACH ROW EXECUTE FUNCTION enforce_agent_run_step_canonical_output();--> statement-breakpoint

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
       OR NEW."output_ref" IS NOT NULL
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
       OR NEW."output_ref" IS NOT NULL
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
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE OR REPLACE FUNCTION require_opportunity_research_execution_generation()
RETURNS trigger AS $$
BEGIN
  IF NEW."workflow_name" IS DISTINCT FROM 'opportunity_research' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;
  IF NEW."execution_epoch" <> OLD."execution_epoch" THEN
    IF NOT EXISTS (
      SELECT 1 FROM "agent_run_events" AS event
      WHERE event."agent_run_id" = NEW."id"
        AND event."project_id" = NEW."project_id"
        AND event."execution_epoch" = NEW."execution_epoch"
        AND event."agent_run_step_id" IS NULL
        AND event."event_type" = CASE WHEN OLD."status" = 'queued' THEN 'run.started'::agent_run_event_type ELSE 'recovery.claimed'::agent_run_event_type END
        AND (event."payload_json"->>'executionRecoveryCount')::integer = NEW."execution_recovery_count"
        AND (OLD."status" = 'queued' OR event."payload_json"->>'executionClaimToken' = NEW."execution_claim_token")
    ) THEN
      RAISE EXCEPTION 'Opportunity Research execution generation requires its exact durable event';
    END IF;
  ELSIF NEW."execution_recovery_count" IS DISTINCT FROM OLD."execution_recovery_count" THEN
    RAISE EXCEPTION 'Opportunity Research recovery generation can change only with execution ownership';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER agent_runs_require_execution_generation
AFTER INSERT OR UPDATE ON "agent_runs"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION require_opportunity_research_execution_generation();--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_project_knowledge_version_write()
RETURNS trigger AS $$
DECLARE
  document_project uuid;
  document_retired_at timestamptz;
  run_project uuid;
  run_status text;
  source_project uuid;
  source_status text;
  source_workflow text;
  actor_authorized boolean;
BEGIN
  SELECT "project_id", "retired_at"
  INTO document_project, document_retired_at
  FROM "project_knowledge_documents"
  WHERE "id" = NEW."document_id"
  FOR UPDATE;
  IF document_project IS NULL OR document_project <> NEW."project_id" THEN
    RAISE EXCEPTION 'Knowledge version must match its document project';
  END IF;
  IF document_retired_at IS NOT NULL THEN
    RAISE EXCEPTION 'Retired knowledge documents cannot accept versions or reviews';
  END IF;
  IF octet_length(NEW."body_markdown") > 50000 THEN
    RAISE EXCEPTION 'Knowledge Markdown exceeds 50 KiB';
  END IF;
  IF NEW."content_sha256" IS DISTINCT FROM encode(sha256(convert_to(NEW."body_markdown", 'UTF8')), 'hex') THEN
    RAISE EXCEPTION 'Knowledge content digest must match the exact Markdown bytes';
  END IF;

  IF TG_OP = 'INSERT' THEN
    CASE NEW."source_kind"
      WHEN 'human' THEN
        IF NEW."source_id" IS NOT NULL THEN
          RAISE EXCEPTION 'Human knowledge cannot claim an external source id';
        END IF;
      WHEN 'agent' THEN
        SELECT "project_id", "status"::text
        INTO run_project, run_status
        FROM "agent_runs"
        WHERE "id" = NEW."source_agent_run_id";
        IF run_project IS NULL
           OR run_project <> NEW."project_id"
           OR run_status <> 'succeeded'
           OR NEW."source_id" IS NOT NULL
           OR NEW."status" <> 'proposed' THEN
          RAISE EXCEPTION 'Agent knowledge must be proposed by a succeeded run in the same project';
        END IF;
      WHEN 'website_import' THEN
        SELECT "project_id", "status"::text
        INTO source_project, source_status
        FROM "website_import_runs"
        WHERE "id" = NEW."source_id";
        IF source_project IS NULL OR source_project <> NEW."project_id" OR source_status <> 'completed' THEN
          RAISE EXCEPTION 'Website-import knowledge requires a completed run in the same project';
        END IF;
      WHEN 'research' THEN
        SELECT "project_id", "status"::text, "workflow_name"::text
        INTO source_project, source_status, source_workflow
        FROM "agent_runs"
        WHERE "id" = NEW."source_id";
        IF source_project IS NULL
           OR source_project <> NEW."project_id"
           OR source_status <> 'succeeded'
           OR source_workflow <> 'opportunity_research' THEN
          RAISE EXCEPTION 'Research knowledge requires a succeeded Opportunity Research run in the same project';
        END IF;
      WHEN 'field_evidence' THEN
        RAISE EXCEPTION 'Field-evidence knowledge has no admitted durable source owner';
    END CASE;

    IF NEW."source_kind" <> 'agent' THEN
      SELECT EXISTS (
        SELECT 1
        FROM "projects" AS project
        INNER JOIN "customers" AS customer ON customer."id" = project."customer_id"
        LEFT JOIN "customer_memberships" AS membership
          ON membership."customer_id" = customer."id"
         AND membership."user_id" = NEW."created_by_user_id"
        WHERE project."id" = NEW."project_id"
          AND (
            customer."owner_user_id" = NEW."created_by_user_id"
            OR membership."role" IN ('owner', 'admin', 'editor')
          )
      ) INTO actor_authorized;
      IF NOT actor_authorized THEN
        RAISE EXCEPTION 'Knowledge creation actor must have write authority in the project';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."status" <> 'proposed' THEN
    RAISE EXCEPTION 'Reviewed knowledge versions are immutable';
  END IF;
  IF NEW."status" NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Knowledge review allows only proposed to approved or rejected';
  END IF;
  SELECT EXISTS (
    SELECT 1
    FROM "projects" AS project
    INNER JOIN "customers" AS customer ON customer."id" = project."customer_id"
    LEFT JOIN "customer_memberships" AS membership
      ON membership."customer_id" = customer."id"
     AND membership."user_id" = NEW."reviewed_by_user_id"
    WHERE project."id" = NEW."project_id"
      AND (
        customer."owner_user_id" = NEW."reviewed_by_user_id"
        OR membership."role" IN ('owner', 'admin')
      )
  ) INTO actor_authorized;
  IF NOT actor_authorized THEN
    RAISE EXCEPTION 'Knowledge review actor must have approval authority in the project';
  END IF;
  IF NEW."document_id" IS DISTINCT FROM OLD."document_id"
     OR NEW."project_id" IS DISTINCT FROM OLD."project_id"
     OR NEW."version" IS DISTINCT FROM OLD."version"
     OR NEW."title" IS DISTINCT FROM OLD."title"
     OR NEW."body_markdown" IS DISTINCT FROM OLD."body_markdown"
     OR NEW."source_kind" IS DISTINCT FROM OLD."source_kind"
     OR NEW."source_id" IS DISTINCT FROM OLD."source_id"
     OR NEW."source_agent_run_id" IS DISTINCT FROM OLD."source_agent_run_id"
     OR NEW."content_sha256" IS DISTINCT FROM OLD."content_sha256"
     OR NEW."model_use_policy" IS DISTINCT FROM OLD."model_use_policy"
     OR NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'Knowledge semantic content and provenance are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_project_knowledge_document_pointer()
RETURNS trigger AS $$
DECLARE
  version_document uuid;
  version_project uuid;
  version_status knowledge_version_status;
  actor_authorized boolean;
BEGIN
  IF NEW."current_approved_version_id" IS NOT NULL THEN
    SELECT "document_id", "project_id", "status"
    INTO version_document, version_project, version_status
    FROM "project_knowledge_versions"
    WHERE "id" = NEW."current_approved_version_id";
    IF version_document IS NULL OR version_document <> NEW."id" OR version_project <> NEW."project_id" OR version_status <> 'approved' THEN
      RAISE EXCEPTION 'Knowledge current pointer must reference an approved version of the same document and project';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."retired_at" IS NOT NULL THEN
      RAISE EXCEPTION 'Knowledge documents cannot be inserted retired';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."project_id" IS DISTINCT FROM OLD."project_id"
     OR NEW."document_key" IS DISTINCT FROM OLD."document_key"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'Knowledge document identity is immutable';
  END IF;
  IF OLD."retired_at" IS NOT NULL THEN
    IF NEW."current_approved_version_id" IS DISTINCT FROM OLD."current_approved_version_id"
       OR NEW."retired_at" IS DISTINCT FROM OLD."retired_at"
       OR NEW."retired_by_user_id" IS DISTINCT FROM OLD."retired_by_user_id"
       OR NEW."retirement_reason" IS DISTINCT FROM OLD."retirement_reason" THEN
      RAISE EXCEPTION 'Retired knowledge evidence is immutable';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."retired_at" IS NOT NULL THEN
    IF OLD."current_approved_version_id" IS NULL
       OR NEW."current_approved_version_id" IS NOT NULL
       OR length(btrim(NEW."retirement_reason")) = 0 THEN
      RAISE EXCEPTION 'Knowledge retirement requires a current approved version and actor evidence';
    END IF;
    SELECT EXISTS (
      SELECT 1
      FROM "projects" AS project
      INNER JOIN "customers" AS customer ON customer."id" = project."customer_id"
      LEFT JOIN "customer_memberships" AS membership
        ON membership."customer_id" = customer."id"
       AND membership."user_id" = NEW."retired_by_user_id"
      WHERE project."id" = NEW."project_id"
        AND (customer."owner_user_id" = NEW."retired_by_user_id" OR membership."role" IN ('owner', 'admin'))
    ) INTO actor_authorized;
    IF NOT actor_authorized THEN
      RAISE EXCEPTION 'Knowledge retirement actor must have approval authority in the project';
    END IF;
  ELSIF NEW."current_approved_version_id" IS NULL AND OLD."current_approved_version_id" IS NOT NULL THEN
    RAISE EXCEPTION 'Knowledge current pointer can be cleared only by retirement';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_ranking_proof_write()
RETURNS trigger AS $$
DECLARE
  actor_user_id uuid;
  actor_authorized boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW."row_version" := 0;
    IF NEW."status" <> 'captured' THEN
      RAISE EXCEPTION 'Ranking proofs must be inserted captured';
    END IF;
    actor_user_id := NEW."created_by_user_id";
  ELSE
    IF NEW."project_id" IS DISTINCT FROM OLD."project_id"
       OR NEW."query" IS DISTINCT FROM OLD."query"
       OR NEW."page_url" IS DISTINCT FROM OLD."page_url"
       OR NEW."rank" IS DISTINCT FROM OLD."rank"
       OR NEW."captured_at" IS DISTINCT FROM OLD."captured_at"
       OR NEW."search_engine" IS DISTINCT FROM OLD."search_engine"
       OR NEW."device" IS DISTINCT FROM OLD."device"
       OR NEW."locale" IS DISTINCT FROM OLD."locale"
       OR NEW."screenshot_artifact_key" IS DISTINCT FROM OLD."screenshot_artifact_key"
       OR NEW."notes" IS DISTINCT FROM OLD."notes"
       OR NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id"
       OR NEW."evidence_json" IS DISTINCT FROM OLD."evidence_json"
       OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
      RAISE EXCEPTION 'Ranking proof captured facts are immutable';
    END IF;
    IF NEW."row_version" IS DISTINCT FROM OLD."row_version" THEN
      RAISE EXCEPTION 'Ranking proof row_version is database-managed';
    END IF;
    NEW."row_version" := OLD."row_version" + 1;

    IF OLD."status" = 'captured' AND NEW."status" = 'reviewed' THEN
      IF NEW."reviewed_at" IS NULL OR NEW."reviewed_by_user_id" IS NULL THEN
        RAISE EXCEPTION 'Ranking proof review requires actor evidence';
      END IF;
      actor_user_id := NEW."reviewed_by_user_id";
    ELSIF OLD."status" = 'reviewed' AND NEW."status" = 'invalidated' THEN
      IF NEW."invalidated_at" IS NULL OR NEW."invalidated_by_user_id" IS NULL OR NEW."invalidation_reason" IS NULL THEN
        RAISE EXCEPTION 'Ranking proof invalidation requires actor evidence and reason';
      END IF;
      actor_user_id := NEW."invalidated_by_user_id";
    ELSE
      RAISE EXCEPTION 'Illegal ranking proof status transition';
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM "projects" AS project
    INNER JOIN "customers" AS customer ON customer."id" = project."customer_id"
    LEFT JOIN "customer_memberships" AS membership
      ON membership."customer_id" = customer."id"
     AND membership."user_id" = actor_user_id
    WHERE project."id" = NEW."project_id"
      AND (
        customer."owner_user_id" = actor_user_id
        OR membership."role" IN ('owner', 'admin', 'editor')
      )
  ) INTO actor_authorized;
  IF NOT actor_authorized THEN
    RAISE EXCEPTION 'Ranking proof actor must have evidence authority in the project';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE OR REPLACE FUNCTION assert_agent_evidence_source_current(
  expected_source_kind agent_run_evidence_source_kind,
  expected_source_id uuid,
  expected_source_version text,
  expected_project_id uuid,
  expected_agent_run_id uuid
)
RETURNS void AS $$
BEGIN
  PERFORM "id" FROM "projects" WHERE "id" = expected_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent evidence project was not found';
  END IF;

  CASE expected_source_kind::text
    WHEN 'business_profile_revision' THEN
      PERFORM revision."id"
      FROM "project_business_profile_revisions" AS revision
      INNER JOIN "project_business_profiles" AS profile
        ON profile."current_revision_id" = revision."id"
       AND profile."project_id" = revision."project_id"
       AND profile."status" = 'confirmed'
      WHERE revision."id" = expected_source_id
        AND revision."project_id" = expected_project_id
        AND 'sha256:' || revision."profile_sha256" = expected_source_version
      FOR SHARE OF revision, profile;
    WHEN 'canonical_service' THEN
      PERFORM "id"
      FROM "services"
      WHERE "id" = expected_source_id
        AND "project_id" = expected_project_id
        AND "status" = 'confirmed'
        AND 'row-version:' || "row_version"::text = expected_source_version
      FOR SHARE;
    WHEN 'canonical_area' THEN
      PERFORM "id"
      FROM "areas"
      WHERE "id" = expected_source_id
        AND "project_id" = expected_project_id
        AND "status" = 'confirmed'
        AND 'row-version:' || "row_version"::text = expected_source_version
      FOR SHARE;
    WHEN 'website_import' THEN
      PERFORM "id"
      FROM "website_import_runs"
      WHERE "id" = expected_source_id
        AND "project_id" = expected_project_id
        AND "status" = 'completed'
        AND "completed_at" IS NOT NULL
        AND 'completed-at:' || to_char("completed_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') = expected_source_version
      FOR SHARE;
    WHEN 'gsc_row' THEN
      PERFORM row."id"
      FROM "gsc_search_analytics_rows" AS row
      INNER JOIN "gsc_sync_runs" AS sync
        ON sync."id" = row."sync_run_id"
       AND sync."project_id" = row."project_id"
       AND sync."status" = 'completed'
       AND (sync."date_to" || 'T23:59:59.999Z')::timestamptz >= current_date - interval '90 days'
      WHERE row."id" = expected_source_id
        AND row."project_id" = expected_project_id
        AND 'sync-run:' || sync."id"::text = expected_source_version
      FOR SHARE OF row, sync;
    WHEN 'gsc_signal' THEN
      PERFORM signal."id"
      FROM "gsc_opportunity_signals" AS signal
      INNER JOIN "gsc_sync_runs" AS sync
        ON sync."id" = signal."sync_run_id"
       AND sync."project_id" = signal."project_id"
       AND sync."status" = 'completed'
       AND (sync."date_to" || 'T23:59:59.999Z')::timestamptz >= current_date - interval '90 days'
      WHERE signal."id" = expected_source_id
        AND signal."project_id" = expected_project_id
        AND 'sync-run:' || sync."id"::text = expected_source_version
      FOR SHARE OF signal, sync;
    WHEN 'ranking_proof' THEN
      PERFORM "id"
      FROM "ranking_proofs"
      WHERE "id" = expected_source_id
        AND "project_id" = expected_project_id
        AND "status" = 'reviewed'
        AND "captured_at" >= now() - interval '30 days'
        AND 'row-version:' || "row_version"::text = expected_source_version
      FOR SHARE;
    WHEN 'public_web_search_capture' THEN
      PERFORM "id"
      FROM "public_web_search_captures"
      WHERE "id" = expected_source_id
        AND "project_id" = expected_project_id
        AND "agent_run_id" = expected_agent_run_id
        AND "status" = 'succeeded'
        AND 'captured-at:' || to_char("captured_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') = expected_source_version
      FOR SHARE;
    WHEN 'knowledge_version' THEN
      PERFORM version."id"
      FROM "project_knowledge_versions" AS version
      INNER JOIN "project_knowledge_documents" AS document
        ON document."id" = version."document_id"
       AND document."project_id" = version."project_id"
       AND document."current_approved_version_id" = version."id"
       AND document."retired_at" IS NULL
      WHERE version."id" = expected_source_id
        AND version."project_id" = expected_project_id
        AND version."status" = 'approved'
        AND version."model_use_policy" = 'model_allowed'
        AND version."content_sha256" = encode(sha256(convert_to(version."body_markdown", 'UTF8')), 'hex')
        AND 'sha256:' || version."content_sha256" = expected_source_version
        AND EXISTS (
          SELECT 1
          FROM "project_knowledge_task_scopes" AS scope
          WHERE scope."version_id" = version."id"
            AND scope."task_scope" = 'opportunity_research'
        )
      FOR SHARE OF version, document;
    WHEN 'technical_audit_finding' THEN
      PERFORM finding."id"
      FROM "technical_audit_findings" AS finding
      INNER JOIN "technical_audit_runs" AS audit
        ON audit."id" = finding."audit_run_id"
       AND audit."project_id" = finding."project_id"
       AND audit."status" = 'completed'
      WHERE finding."id" = expected_source_id
        AND finding."project_id" = expected_project_id
        AND 'audit-run:' || audit."id"::text = expected_source_version
      FOR SHARE OF finding, audit;
    WHEN 'existing_page' THEN
      PERFORM version."id"
      FROM "page_versions" AS version
      INNER JOIN "page_proposals" AS proposal
        ON proposal."id" = version."page_proposal_id"
       AND proposal."project_id" = expected_project_id
      WHERE version."id" = expected_source_id
        AND version."status" IN ('approved', 'release_candidate', 'released', 'superseded')
        AND 'version-number:' || version."version_number"::text = expected_source_version
      FOR SHARE OF version, proposal;
    ELSE
      RAISE EXCEPTION 'Unsupported agent run evidence source kind';
  END CASE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent evidence source is no longer current and admissible';
  END IF;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE OR REPLACE FUNCTION lock_agent_run_evidence_source_before_parent()
RETURNS trigger AS $$
BEGIN
  PERFORM assert_agent_evidence_source_current(
    NEW."source_kind",
    NEW."source_id",
    NEW."source_version",
    NEW."project_id",
    NEW."agent_run_id"
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

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
  evidence_source_kind agent_run_evidence_source_kind;
  evidence_source_id uuid;
  evidence_source_version text;
BEGIN
  SELECT "agent_run_id", "project_id", "execution_epoch", "source_kind", "source_id", "source_version"
  INTO evidence_run, evidence_project, evidence_epoch, evidence_source_kind, evidence_source_id, evidence_source_version
  FROM "agent_run_evidence_items"
  WHERE "id" = NEW."evidence_item_id";

  IF evidence_run IS NULL
     OR evidence_run <> NEW."agent_run_id"
     OR evidence_project <> NEW."project_id" THEN
    RAISE EXCEPTION 'Agent run step-evidence links must stay inside one run and project';
  END IF;

  PERFORM assert_agent_evidence_source_current(
    evidence_source_kind,
    evidence_source_id,
    evidence_source_version,
    evidence_project,
    evidence_run
  );

  SELECT "status", "execution_epoch" INTO run_status, run_epoch
  FROM "agent_runs" WHERE "id" = NEW."agent_run_id" FOR UPDATE;
  SELECT "agent_run_id", "project_id", "status", "execution_epoch"
  INTO step_run, step_project, step_status, step_epoch
  FROM "agent_run_steps" WHERE "id" = NEW."agent_run_step_id";

  IF run_status <> 'running' OR step_status <> 'running' THEN
    RAISE EXCEPTION 'Agent evidence links require a running workflow and step';
  END IF;
  IF step_run IS NULL
     OR step_run <> NEW."agent_run_id"
     OR step_project <> NEW."project_id" THEN
    RAISE EXCEPTION 'Agent run step-evidence links must stay inside one run and project';
  END IF;
  IF run_epoch <= 0 OR step_epoch <> run_epoch OR evidence_epoch <= 0 OR evidence_epoch > step_epoch THEN
    RAISE EXCEPTION 'Agent run step-evidence links must bind durable evidence no newer than the current execution epoch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_research_opportunity_lifecycle_truth()
RETURNS trigger AS $$
DECLARE
  actor_authorized boolean;
BEGIN
  IF NEW."policy_version" IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'new'
       OR NEW."decided_by_user_id" IS NOT NULL
       OR NEW."status_reason" IS NOT NULL THEN
      RAISE EXCEPTION 'Research opportunities must enter the lifecycle as undecided new work';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."status" IS NOT DISTINCT FROM OLD."status" THEN
    IF NEW."decided_by_user_id" IS DISTINCT FROM OLD."decided_by_user_id"
       OR NEW."status_reason" IS DISTINCT FROM OLD."status_reason" THEN
      RAISE EXCEPTION 'Research opportunity decision evidence can change only with lifecycle status';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."status" = 'brief_created' THEN
    RAISE EXCEPTION 'Research opportunities with a created page brief are terminal';
  END IF;

  IF NEW."status" = 'brief_created' THEN
    IF OLD."status" = 'rejected'
       OR NOT EXISTS (
         SELECT 1
         FROM "page_proposals" AS proposal
         WHERE proposal."opportunity_id" = NEW."id"
           AND proposal."project_id" = NEW."project_id"
       ) THEN
      RAISE EXCEPTION 'Research opportunity brief_created truth requires a durable same-project page proposal';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."status" NOT IN ('new', 'monitoring', 'held', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported research opportunity lifecycle status';
  END IF;
  IF NEW."decided_by_user_id" IS NULL THEN
    RAISE EXCEPTION 'Research opportunity lifecycle decisions require an actor';
  END IF;
  IF NEW."status" = 'rejected' AND (NEW."status_reason" IS NULL OR length(btrim(NEW."status_reason")) = 0) THEN
    RAISE EXCEPTION 'Rejected research opportunities require a reason';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM "projects" AS project
    INNER JOIN "customers" AS customer ON customer."id" = project."customer_id"
    LEFT JOIN "customer_memberships" AS membership
      ON membership."customer_id" = customer."id"
     AND membership."user_id" = NEW."decided_by_user_id"
    WHERE project."id" = NEW."project_id"
      AND (
        customer."owner_user_id" = NEW."decided_by_user_id"
        OR membership."role" IN ('owner', 'admin', 'editor')
      )
  ) INTO actor_authorized;
  IF NOT actor_authorized THEN
    RAISE EXCEPTION 'Research opportunity lifecycle actor must have write authority in the project';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER opportunities_research_lifecycle_guard
BEFORE INSERT OR UPDATE OF "status", "decided_by_user_id", "status_reason" ON "opportunities"
FOR EACH ROW EXECUTE FUNCTION enforce_research_opportunity_lifecycle_truth();--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_project_business_profile_revision()
RETURNS trigger AS $$
DECLARE
  source_project uuid;
  source_status text;
  actor_authorized boolean;
BEGIN
  IF octet_length(NEW."profile_json"::text) > 32768 THEN
    RAISE EXCEPTION 'Business profile projection exceeds 32 KiB';
  END IF;
  IF NEW."source_import_run_id" IS NOT NULL THEN
    SELECT "project_id", "status"::text
    INTO source_project, source_status
    FROM "website_import_runs"
    WHERE "id" = NEW."source_import_run_id";
    IF source_project IS NULL OR source_project <> NEW."project_id" OR source_status <> 'completed' THEN
      RAISE EXCEPTION 'Business profile import source must be completed in the same project';
    END IF;
  END IF;
  IF NEW."created_by_user_id" IS NULL THEN
    RAISE EXCEPTION 'Business profile revisions require a creation actor';
  END IF;
  SELECT EXISTS (
    SELECT 1
    FROM "projects" AS project
    INNER JOIN "customers" AS customer ON customer."id" = project."customer_id"
    LEFT JOIN "customer_memberships" AS membership
      ON membership."customer_id" = customer."id"
     AND membership."user_id" = NEW."created_by_user_id"
    WHERE project."id" = NEW."project_id"
      AND (
        customer."owner_user_id" = NEW."created_by_user_id"
        OR membership."role" IN ('owner', 'admin')
      )
  ) INTO actor_authorized;
  IF NOT actor_authorized THEN
    RAISE EXCEPTION 'Business profile revision actor must have configuration authority in the project';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_project_business_profile_write()
RETURNS trigger AS $$
DECLARE
  revision_project uuid;
  revision_actor uuid;
  actor_authorized boolean;
BEGIN
  IF NEW."current_revision_id" IS NOT NULL THEN
    SELECT "project_id", "created_by_user_id"
    INTO revision_project, revision_actor
    FROM "project_business_profile_revisions"
    WHERE "id" = NEW."current_revision_id";
    IF revision_project IS NULL OR revision_project <> NEW."project_id" THEN
      RAISE EXCEPTION 'Business profile current revision must belong to the same project';
    END IF;
    SELECT EXISTS (
      SELECT 1
      FROM "projects" AS project
      INNER JOIN "customers" AS customer ON customer."id" = project."customer_id"
      LEFT JOIN "customer_memberships" AS membership
        ON membership."customer_id" = customer."id"
       AND membership."user_id" = revision_actor
      WHERE project."id" = NEW."project_id"
        AND (
          customer."owner_user_id" = revision_actor
          OR membership."role" IN ('owner', 'admin')
        )
    ) INTO actor_authorized;
    IF NOT actor_authorized THEN
      RAISE EXCEPTION 'Business profile revision actor must have configuration authority in the project';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW."row_version" := 0;
  ELSE
    IF NEW."project_id" IS DISTINCT FROM OLD."project_id" OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
      RAISE EXCEPTION 'Business profile identity is immutable';
    END IF;
    IF NEW."row_version" IS DISTINCT FROM OLD."row_version" THEN
      RAISE EXCEPTION 'Business profile row_version is database-managed';
    END IF;
    NEW."row_version" := OLD."row_version" + 1;
    IF OLD."status" = 'draft' AND NEW."status" NOT IN ('draft', 'confirmed') THEN
      RAISE EXCEPTION 'Illegal business profile status transition';
    END IF;
    IF OLD."status" = 'confirmed' AND NEW."status" NOT IN ('confirmed', 'draft') THEN
      RAISE EXCEPTION 'Illegal business profile status transition';
    END IF;
    IF NEW."current_revision_id" IS DISTINCT FROM OLD."current_revision_id" AND NEW."status" <> 'draft' THEN
      RAISE EXCEPTION 'A changed business profile revision must return to draft review';
    END IF;
    IF NEW."status" = OLD."status" AND (
      NEW."confirmed_at" IS DISTINCT FROM OLD."confirmed_at"
      OR NEW."confirmed_by_user_id" IS DISTINCT FROM OLD."confirmed_by_user_id"
    ) THEN
      RAISE EXCEPTION 'Business profile confirmation evidence changes only with lifecycle status';
    END IF;
  END IF;

  IF NEW."status" = 'confirmed' THEN
    IF NEW."confirmed_by_user_id" IS NULL OR NEW."confirmed_at" IS NULL THEN
      RAISE EXCEPTION 'Confirmed business profiles require actor evidence';
    END IF;
    SELECT EXISTS (
      SELECT 1
      FROM "projects" AS project
      INNER JOIN "customers" AS customer ON customer."id" = project."customer_id"
      LEFT JOIN "customer_memberships" AS membership
        ON membership."customer_id" = customer."id"
       AND membership."user_id" = NEW."confirmed_by_user_id"
      WHERE project."id" = NEW."project_id"
        AND (
          customer."owner_user_id" = NEW."confirmed_by_user_id"
          OR membership."role" IN ('owner', 'admin')
        )
    ) INTO actor_authorized;
    IF NOT actor_authorized THEN
      RAISE EXCEPTION 'Business profile confirmation actor must have configuration authority in the project';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_canonical_business_entity_write()
RETURNS trigger AS $$
DECLARE
  source_project uuid;
  source_status text;
  lifecycle_actor uuid;
  actor_authorized boolean;
BEGIN
  IF NEW."source_kind" = 'website_import' THEN
    SELECT "project_id", "status" INTO source_project, source_status
    FROM "website_import_runs" WHERE "id" = NEW."source_id" FOR SHARE;
    IF source_project IS NULL OR source_project <> NEW."project_id" OR source_status <> 'completed' THEN
      RAISE EXCEPTION 'Canonical business entity import source must be completed in the same project';
    END IF;
  ELSIF NEW."source_kind" = 'knowledge' THEN
    SELECT version."project_id", version."status"::text
    INTO source_project, source_status
    FROM "project_knowledge_versions" AS version
    INNER JOIN "project_knowledge_documents" AS document
      ON document."id" = version."document_id"
     AND document."project_id" = version."project_id"
     AND document."current_approved_version_id" = version."id"
     AND document."retired_at" IS NULL
    WHERE version."id" = NEW."source_id"
    FOR SHARE OF version, document;
    IF source_project IS NULL OR source_project <> NEW."project_id" OR source_status <> 'approved' THEN
      RAISE EXCEPTION 'Canonical business entity knowledge source must be current and approved in the same project';
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

  IF OLD."status"::text = 'proposed' AND NEW."status"::text = 'confirmed' THEN
    lifecycle_actor := NEW."confirmed_by_user_id";
  ELSIF OLD."status"::text = 'confirmed' AND NEW."status"::text = 'retired' THEN
    lifecycle_actor := NEW."retired_by_user_id";
  ELSIF OLD."status"::text = 'retired' AND NEW."status"::text = 'confirmed' THEN
    lifecycle_actor := NEW."confirmed_by_user_id";
  ELSE
    RAISE EXCEPTION 'Illegal canonical business entity status transition';
  END IF;

  IF NEW."status"::text IN ('confirmed', 'retired') THEN
    SELECT EXISTS (
      SELECT 1
      FROM "projects" AS project
      INNER JOIN "customers" AS customer ON customer."id" = project."customer_id"
      LEFT JOIN "customer_memberships" AS membership
        ON membership."customer_id" = customer."id"
       AND membership."user_id" = lifecycle_actor
      WHERE project."id" = NEW."project_id"
        AND (
          customer."owner_user_id" = lifecycle_actor
          OR membership."role" IN ('owner', 'admin')
        )
    ) INTO actor_authorized;
    IF NOT actor_authorized THEN
      RAISE EXCEPTION 'Canonical business entity lifecycle actor must have configuration authority in the project';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
