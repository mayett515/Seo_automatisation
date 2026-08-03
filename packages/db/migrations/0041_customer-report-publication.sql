CREATE TYPE "public"."customer_report_evidence_alert_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TABLE "report_evidence_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"report_evidence_item_id" uuid NOT NULL,
	"evidence_key" text NOT NULL,
	"source_kind" "customer_report_evidence_kind" NOT NULL,
	"source_id" uuid NOT NULL,
	"alert_kind" text DEFAULT 'source_invalidated' NOT NULL,
	"status" "customer_report_evidence_alert_status" DEFAULT 'open' NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_report_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_evidence_alerts_kind_check" CHECK ("report_evidence_alerts"."alert_kind" = 'source_invalidated'),
	CONSTRAINT "report_evidence_alerts_resolution_check" CHECK (("report_evidence_alerts"."status" = 'open' and "report_evidence_alerts"."resolved_at" is null and "report_evidence_alerts"."resolved_by_report_id" is null) or ("report_evidence_alerts"."status" = 'resolved' and "report_evidence_alerts"."resolved_at" is not null and "report_evidence_alerts"."resolved_by_report_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "reports" DROP CONSTRAINT "reports_lifecycle_evidence_check";--> statement-breakpoint
ALTER TABLE "report_artifacts" ADD COLUMN "requested_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "report_artifacts" ADD COLUMN "request_id" uuid;--> statement-breakpoint
ALTER TABLE "report_generation_runs" ADD COLUMN "correction_predecessor_report_id" uuid;--> statement-breakpoint
ALTER TABLE "report_generation_runs" ADD COLUMN "correction_reason" text;--> statement-breakpoint
ALTER TABLE "report_lifecycle_events" ADD COLUMN "artifact_id" uuid;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "published_artifact_id" uuid;--> statement-breakpoint
ALTER TABLE "report_evidence_alerts" ADD CONSTRAINT "report_evidence_alerts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_evidence_alerts" ADD CONSTRAINT "report_evidence_alerts_report_project_fk" FOREIGN KEY ("report_id","project_id") REFERENCES "public"."reports"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_evidence_alerts" ADD CONSTRAINT "report_evidence_alerts_evidence_report_project_fk" FOREIGN KEY ("report_evidence_item_id","report_id","project_id") REFERENCES "public"."report_evidence_items"("id","report_id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_evidence_alerts" ADD CONSTRAINT "report_evidence_alerts_resolution_report_project_fk" FOREIGN KEY ("resolved_by_report_id","project_id") REFERENCES "public"."reports"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "report_evidence_alerts_open_evidence_idx" ON "report_evidence_alerts" USING btree ("report_id","evidence_key") WHERE "report_evidence_alerts"."status" = 'open';--> statement-breakpoint
CREATE INDEX "report_evidence_alerts_project_status_idx" ON "report_evidence_alerts" USING btree ("project_id","status","detected_at");--> statement-breakpoint
ALTER TABLE "report_artifacts" ADD CONSTRAINT "report_artifacts_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_generation_runs" ADD CONSTRAINT "report_generation_runs_correction_predecessor_report_id_reports_id_fk" FOREIGN KEY ("correction_predecessor_report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_lifecycle_events" ADD CONSTRAINT "report_lifecycle_events_artifact_id_report_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."report_artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_published_artifact_id_report_artifacts_id_fk" FOREIGN KEY ("published_artifact_id") REFERENCES "public"."report_artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "report_artifacts_project_request_idx" ON "report_artifacts" USING btree ("project_id","request_id") WHERE "report_artifacts"."request_id" is not null;--> statement-breakpoint
ALTER TABLE "report_artifacts" ADD CONSTRAINT "report_artifacts_request_actor_check" CHECK (("report_artifacts"."request_id" is null and "report_artifacts"."requested_by_user_id" is null) or ("report_artifacts"."request_id" is not null and "report_artifacts"."requested_by_user_id" is not null));--> statement-breakpoint
ALTER TABLE "report_generation_runs" ADD CONSTRAINT "report_generation_runs_correction_check" CHECK (("report_generation_runs"."correction_predecessor_report_id" is null and "report_generation_runs"."correction_reason" is null) or ("report_generation_runs"."correction_predecessor_report_id" is not null and "report_generation_runs"."correction_reason" is not null));--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_lifecycle_evidence_check" CHECK (("reports"."status" = 'draft' and "reports"."reviewed_snapshot_sha256" is null and "reports"."ready_at" is null and "reports"."published_artifact_id" is null and "reports"."published_at" is null and "reports"."superseded_at" is null) or ("reports"."status" = 'ready_for_review' and "reports"."reviewed_snapshot_sha256" = "reports"."snapshot_sha256" and "reports"."ready_at" is not null and "reports"."published_artifact_id" is null and "reports"."published_at" is null and "reports"."superseded_at" is null) or ("reports"."status" = 'published' and "reports"."reviewed_snapshot_sha256" = "reports"."snapshot_sha256" and "reports"."ready_at" is not null and "reports"."published_artifact_id" is not null and "reports"."published_at" is not null and "reports"."published_by_user_id" is not null and "reports"."superseded_at" is null) or ("reports"."status" = 'superseded' and "reports"."reviewed_snapshot_sha256" = "reports"."snapshot_sha256" and "reports"."ready_at" is not null and "reports"."published_artifact_id" is not null and "reports"."published_at" is not null and "reports"."published_by_user_id" is not null and "reports"."superseded_at" is not null));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_report_generation_run_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  owning_issue record;
  base_candidate record;
  correction_predecessor record;
  result_report record;
BEGIN
  SELECT "project_id", "current_published_report_id" INTO owning_issue
  FROM "report_issues"
  WHERE "id" = NEW."report_issue_id";
  IF NOT FOUND OR owning_issue."project_id" <> NEW."project_id" THEN
    RAISE EXCEPTION 'Report generation run must belong to the issue project.';
  END IF;

  IF NEW."base_candidate_report_id" IS NOT NULL THEN
    SELECT "project_id", "report_issue_id" INTO base_candidate
    FROM "reports"
    WHERE "id" = NEW."base_candidate_report_id";
    IF NOT FOUND
      OR base_candidate."project_id" <> NEW."project_id"
      OR base_candidate."report_issue_id" <> NEW."report_issue_id" THEN
      RAISE EXCEPTION 'Report generation base candidate must belong to the same issue and project.';
    END IF;
  END IF;

  IF NEW."correction_predecessor_report_id" IS NOT NULL THEN
    SELECT "project_id", "report_issue_id", "status" INTO correction_predecessor
    FROM "reports"
    WHERE "id" = NEW."correction_predecessor_report_id";
    IF NOT FOUND
      OR correction_predecessor."project_id" <> NEW."project_id"
      OR correction_predecessor."report_issue_id" <> NEW."report_issue_id" THEN
      RAISE EXCEPTION 'Report correction generation must bind a report of the same issue and project.';
    END IF;
    IF TG_OP = 'INSERT' AND (
      correction_predecessor."status" <> 'published'
      OR owning_issue."current_published_report_id" IS DISTINCT FROM NEW."correction_predecessor_report_id"
    ) THEN
      RAISE EXCEPTION 'Report correction generation must bind the current published report.';
    END IF;
  ELSIF TG_OP = 'INSERT' AND owning_issue."current_published_report_id" IS NOT NULL THEN
    RAISE EXCEPTION 'A published report requires an explicit correction generation reason.';
  END IF;

  IF NEW."result_report_id" IS NOT NULL THEN
    SELECT "project_id", "report_issue_id", "supersedes_report_id", "correction_reason" INTO result_report
    FROM "reports"
    WHERE "id" = NEW."result_report_id";
    IF NOT FOUND
      OR result_report."project_id" <> NEW."project_id"
      OR result_report."report_issue_id" <> NEW."report_issue_id"
      OR result_report."supersedes_report_id" IS DISTINCT FROM NEW."correction_predecessor_report_id"
      OR result_report."correction_reason" IS DISTINCT FROM NEW."correction_reason" THEN
      RAISE EXCEPTION 'Report generation result must preserve the admitted issue and correction lineage.';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW."project_id" IS DISTINCT FROM OLD."project_id"
      OR NEW."report_issue_id" IS DISTINCT FROM OLD."report_issue_id"
      OR NEW."narrative_mode" IS DISTINCT FROM OLD."narrative_mode"
      OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
      OR NEW."queue_job_id" IS DISTINCT FROM OLD."queue_job_id"
      OR NEW."requested_by_user_id" IS DISTINCT FROM OLD."requested_by_user_id"
      OR NEW."base_issue_row_version" IS DISTINCT FROM OLD."base_issue_row_version"
      OR NEW."base_candidate_report_id" IS DISTINCT FROM OLD."base_candidate_report_id"
      OR NEW."base_candidate_row_version" IS DISTINCT FROM OLD."base_candidate_row_version"
      OR NEW."base_candidate_snapshot_sha256" IS DISTINCT FROM OLD."base_candidate_snapshot_sha256"
      OR NEW."correction_predecessor_report_id" IS DISTINCT FROM OLD."correction_predecessor_report_id"
      OR NEW."correction_reason" IS DISTINCT FROM OLD."correction_reason"
      OR NEW."evidence_cutoff_at" IS DISTINCT FROM OLD."evidence_cutoff_at"
      OR NEW."assembler_version" IS DISTINCT FROM OLD."assembler_version"
      OR NEW."report_schema_version" IS DISTINCT FROM OLD."report_schema_version"
      OR NEW."eligibility_policy_version" IS DISTINCT FROM OLD."eligibility_policy_version"
      OR NEW."action_selection_policy_version" IS DISTINCT FROM OLD."action_selection_policy_version"
      OR NEW."customer_safety_policy_version" IS DISTINCT FROM OLD."customer_safety_policy_version"
      OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
      RAISE EXCEPTION 'Report generation admission identity is immutable.';
    END IF;

    IF OLD."status" IN ('succeeded', 'failed', 'cancelled', 'stale') AND NEW."status" IS DISTINCT FROM OLD."status" THEN
      RAISE EXCEPTION 'Terminal report generation runs cannot change status.';
    END IF;

    IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
      (OLD."status" = 'queued' AND NEW."status" IN ('assembling', 'validating', 'failed', 'cancelled', 'stale'))
      OR (OLD."status" = 'assembling' AND NEW."status" IN ('narrative_running', 'validating', 'failed', 'cancelled', 'stale'))
      OR (OLD."status" = 'narrative_running' AND NEW."status" IN ('validating', 'failed', 'cancelled', 'stale'))
      OR (OLD."status" = 'validating' AND NEW."status" IN ('succeeded', 'failed', 'cancelled', 'stale'))
    ) THEN
      RAISE EXCEPTION 'Illegal report generation lifecycle transition from % to %.', OLD."status", NEW."status";
    END IF;
  END IF;

  IF NEW."status" = 'succeeded' AND (NEW."result_report_id" IS NULL OR NEW."finished_at" IS NULL OR NEW."failure_code" IS NOT NULL) THEN
    RAISE EXCEPTION 'Succeeded report generation requires a result report and terminal timestamp.';
  END IF;
  IF NEW."status" IN ('failed', 'cancelled', 'stale') AND (NEW."finished_at" IS NULL OR NEW."failure_code" IS NULL) THEN
    RAISE EXCEPTION 'Terminal unsuccessful report generation requires failure evidence.';
  END IF;
  IF NEW."status" <> 'succeeded' AND NEW."result_report_id" IS NOT NULL THEN
    RAISE EXCEPTION 'Only succeeded report generation may reference a result report.';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_report_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  owning_issue record;
  source_run record;
  predecessor record;
  publication_artifact record;
  snapshot_json jsonb;
  expected_claim_count integer;
  expected_evidence_count integer;
  persisted_claim_count integer;
  persisted_evidence_count integer;
  expected_link_count integer;
  persisted_link_count integer;
  persisted_claims_json jsonb;
  persisted_evidence_json jsonb;
  link_projection_mismatch boolean;
BEGIN
  SELECT "project_id" INTO owning_issue
  FROM "report_issues"
  WHERE "id" = NEW."report_issue_id";
  IF NOT FOUND OR owning_issue."project_id" <> NEW."project_id" THEN
    RAISE EXCEPTION 'Report must belong to the issue project.';
  END IF;

  SELECT "project_id", "report_issue_id", "correction_predecessor_report_id", "correction_reason" INTO source_run
  FROM "report_generation_runs"
  WHERE "id" = NEW."source_generation_run_id";
  IF NOT FOUND
    OR source_run."project_id" <> NEW."project_id"
    OR source_run."report_issue_id" <> NEW."report_issue_id"
    OR source_run."correction_predecessor_report_id" IS DISTINCT FROM NEW."supersedes_report_id"
    OR source_run."correction_reason" IS DISTINCT FROM NEW."correction_reason" THEN
    RAISE EXCEPTION 'Report source generation run must preserve the same issue, project, and correction lineage.';
  END IF;

  IF NEW."supersedes_report_id" IS NOT NULL THEN
    SELECT "project_id", "report_issue_id", "status" INTO predecessor
    FROM "reports"
    WHERE "id" = NEW."supersedes_report_id";
    IF NOT FOUND
      OR predecessor."project_id" <> NEW."project_id"
      OR predecessor."report_issue_id" <> NEW."report_issue_id"
      OR predecessor."status" NOT IN ('published', 'superseded') THEN
      RAISE EXCEPTION 'Report correction predecessor must be published truth for the same issue and project.';
    END IF;
    IF TG_OP = 'INSERT' AND predecessor."status" <> 'published' THEN
      RAISE EXCEPTION 'A correction draft must branch from the current published report.';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND NEW."status" <> 'draft' THEN
    RAISE EXCEPTION 'New report versions must begin as draft.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW."project_id" IS DISTINCT FROM OLD."project_id"
      OR NEW."report_issue_id" IS DISTINCT FROM OLD."report_issue_id"
      OR NEW."version_number" IS DISTINCT FROM OLD."version_number"
      OR NEW."supersedes_report_id" IS DISTINCT FROM OLD."supersedes_report_id"
      OR NEW."correction_reason" IS DISTINCT FROM OLD."correction_reason"
      OR NEW."created_by_actor_type" IS DISTINCT FROM OLD."created_by_actor_type"
      OR NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id"
      OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
      RAISE EXCEPTION 'Report identity, version, correction lineage, and creator evidence are immutable.';
    END IF;

    IF NEW."row_version" <> OLD."row_version" + 1 THEN
      RAISE EXCEPTION 'Report updates must increment row_version exactly once.';
    END IF;

    IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
      (OLD."status" = 'draft' AND NEW."status" = 'ready_for_review')
      OR (OLD."status" = 'ready_for_review' AND NEW."status" = 'draft')
      OR (OLD."status" = 'ready_for_review' AND NEW."status" = 'published')
      OR (OLD."status" = 'published' AND NEW."status" = 'superseded')
    ) THEN
      RAISE EXCEPTION 'Illegal report lifecycle transition from % to %.', OLD."status", NEW."status";
    END IF;

    IF OLD."status" <> 'draft' AND (
      NEW."snapshot_canonical_text" IS DISTINCT FROM OLD."snapshot_canonical_text"
      OR NEW."snapshot_sha256" IS DISTINCT FROM OLD."snapshot_sha256"
      OR NEW."fact_projection_sha256" IS DISTINCT FROM OLD."fact_projection_sha256"
      OR NEW."schema_version" IS DISTINCT FROM OLD."schema_version"
      OR NEW."assembler_version" IS DISTINCT FROM OLD."assembler_version"
      OR NEW."eligibility_policy_version" IS DISTINCT FROM OLD."eligibility_policy_version"
      OR NEW."action_selection_policy_version" IS DISTINCT FROM OLD."action_selection_policy_version"
      OR NEW."narrative_policy_version" IS DISTINCT FROM OLD."narrative_policy_version"
      OR NEW."template_version" IS DISTINCT FROM OLD."template_version"
      OR NEW."narrative_mode" IS DISTINCT FROM OLD."narrative_mode"
      OR NEW."source_generation_run_id" IS DISTINCT FROM OLD."source_generation_run_id"
      OR NEW."source_agent_run_id" IS DISTINCT FROM OLD."source_agent_run_id"
    ) THEN
      RAISE EXCEPTION 'Reviewed and published report semantics are immutable.';
    END IF;

    IF OLD."status" = 'draft' AND NEW."status" <> 'draft' AND (
      NEW."snapshot_canonical_text" IS DISTINCT FROM OLD."snapshot_canonical_text"
      OR NEW."snapshot_sha256" IS DISTINCT FROM OLD."snapshot_sha256"
      OR NEW."fact_projection_sha256" IS DISTINCT FROM OLD."fact_projection_sha256"
      OR NEW."source_generation_run_id" IS DISTINCT FROM OLD."source_generation_run_id"
      OR NEW."source_agent_run_id" IS DISTINCT FROM OLD."source_agent_run_id"
    ) THEN
      RAISE EXCEPTION 'Submitting a report for review cannot change its semantic snapshot.';
    END IF;

    IF OLD."status" = 'draft' AND NEW."status" = 'ready_for_review' THEN
      snapshot_json := NEW."snapshot_canonical_text"::jsonb;
      IF snapshot_json->>'factProjectionSha256' <> NEW."fact_projection_sha256" THEN
        RAISE EXCEPTION 'Report fact projection digest must match the canonical snapshot before review.';
      END IF;

      expected_claim_count := jsonb_array_length(snapshot_json #> '{factProjection,claims}');
      expected_evidence_count := jsonb_array_length(snapshot_json #> '{factProjection,evidence}');
      SELECT count(*) INTO persisted_claim_count FROM "report_claims" WHERE "report_id" = NEW."id";
      SELECT count(*) INTO persisted_evidence_count FROM "report_evidence_items" WHERE "report_id" = NEW."id";
      SELECT coalesce(jsonb_agg("claim_json" ORDER BY "ordinal"), '[]'::jsonb)
        INTO persisted_claims_json FROM "report_claims" WHERE "report_id" = NEW."id";
      SELECT coalesce(jsonb_agg("evidence_json" ORDER BY "evidence_key"), '[]'::jsonb)
        INTO persisted_evidence_json FROM "report_evidence_items" WHERE "report_id" = NEW."id";
      SELECT coalesce(sum(jsonb_array_length("claim_json"->'evidenceKeys')), 0)
        INTO expected_link_count FROM "report_claims" WHERE "report_id" = NEW."id";
      SELECT count(*) INTO persisted_link_count FROM "report_claim_evidence" WHERE "report_id" = NEW."id";
      SELECT EXISTS (
        SELECT 1
        FROM "report_claims" claim
        WHERE claim."report_id" = NEW."id"
          AND coalesce(
            (
              SELECT jsonb_agg(evidence."evidence_key" ORDER BY evidence."evidence_key")
              FROM "report_claim_evidence" link
              INNER JOIN "report_evidence_items" evidence ON evidence."id" = link."evidence_id"
              WHERE link."report_id" = NEW."id" AND link."claim_id" = claim."id"
            ),
            '[]'::jsonb
          ) IS DISTINCT FROM claim."claim_json"->'evidenceKeys'
      ) INTO link_projection_mismatch;

      IF expected_claim_count <> persisted_claim_count
        OR expected_evidence_count <> persisted_evidence_count
        OR expected_link_count <> persisted_link_count
        OR persisted_claims_json IS DISTINCT FROM snapshot_json #> '{factProjection,claims}'
        OR persisted_evidence_json IS DISTINCT FROM snapshot_json #> '{factProjection,evidence}'
        OR link_projection_mismatch THEN
        RAISE EXCEPTION 'Report normalized provenance must match the exact canonical snapshot before review.';
      END IF;
    END IF;

    IF OLD."status" = 'ready_for_review' AND NEW."status" = 'published' THEN
      SELECT "project_id", "report_id", "status", "snapshot_sha256", "artifact_sha256", "byte_size" INTO publication_artifact
      FROM "report_artifacts"
      WHERE "id" = NEW."published_artifact_id";
      IF NOT FOUND
        OR publication_artifact."project_id" <> NEW."project_id"
        OR publication_artifact."report_id" <> NEW."id"
        OR publication_artifact."status" <> 'staged'
        OR publication_artifact."snapshot_sha256" <> NEW."snapshot_sha256"
        OR publication_artifact."artifact_sha256" IS NULL
        OR publication_artifact."byte_size" IS NULL THEN
        RAISE EXCEPTION 'Report publication requires one exact staged immutable artifact.';
      END IF;
      IF EXISTS (
        SELECT 1 FROM "report_artifacts"
        WHERE "report_id" = NEW."id"
          AND "id" <> NEW."published_artifact_id"
          AND "status" IN ('pending', 'running', 'staged')
      ) THEN
        RAISE EXCEPTION 'Report publication requires all non-selected artifacts to be terminal.';
      END IF;
      -- Live source-state validation is authoritative; this also backstops future pre-publication alert writers.
      IF EXISTS (
        SELECT 1 FROM "report_evidence_alerts"
        WHERE "report_id" = NEW."id" AND "status" = 'open'
      ) THEN
        RAISE EXCEPTION 'Report publication is blocked by invalidated source evidence.';
      END IF;
    END IF;

    IF OLD."status" IN ('published', 'superseded') AND (
      NEW."published_artifact_id" IS DISTINCT FROM OLD."published_artifact_id"
      OR NEW."published_by_user_id" IS DISTINCT FROM OLD."published_by_user_id"
      OR NEW."published_at" IS DISTINCT FROM OLD."published_at"
      OR (OLD."status" = 'superseded' AND NEW."superseded_at" IS DISTINCT FROM OLD."superseded_at")
    ) THEN
      RAISE EXCEPTION 'Published report artifact and actor evidence are immutable.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_report_artifact_write()
RETURNS trigger AS $$
DECLARE
  report_row record;
BEGIN
  SELECT "status", "snapshot_sha256", "schema_version", "template_version", "published_artifact_id"
  INTO report_row
  FROM "reports"
  WHERE "id" = NEW."report_id" AND "project_id" = NEW."project_id"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report artifact must reference a report in the same project';
  END IF;

  IF NEW."snapshot_sha256" <> report_row."snapshot_sha256"
    OR NEW."render_manifest_json"->>'projectId' <> NEW."project_id"::text
    OR NEW."render_manifest_json"->>'reportId' <> NEW."report_id"::text
    OR NEW."render_manifest_json"->>'snapshotSha256' <> NEW."snapshot_sha256"
    OR NEW."render_manifest_json"->>'reportSchemaVersion' <> report_row."schema_version"
    OR NEW."render_manifest_json"->>'templateVersion' <> report_row."template_version"
    OR NEW."render_manifest_json"->>'schemaVersion' <> 'customer_report_html_manifest.v1'
    OR NEW."render_manifest_json"->>'rendererVersion' <> 'customer_report_html_renderer.v1'
    OR NEW."render_manifest_json"->>'stylesheetVersion' <> 'customer_report_stylesheet.v1'
  THEN
    RAISE EXCEPTION 'Report artifact manifest must match the immutable report snapshot';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'pending'
      OR report_row."status" NOT IN ('draft', 'ready_for_review')
      OR NEW."request_id" IS NULL
      OR NEW."requested_by_user_id" IS NULL THEN
      RAISE EXCEPTION 'Report artifacts may start only as actor-backed pending work for the current review candidate';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."project_id" IS DISTINCT FROM OLD."project_id"
    OR NEW."report_id" IS DISTINCT FROM OLD."report_id"
    OR NEW."format" IS DISTINCT FROM OLD."format"
    OR NEW."snapshot_sha256" IS DISTINCT FROM OLD."snapshot_sha256"
    OR NEW."render_manifest_json" IS DISTINCT FROM OLD."render_manifest_json"
    OR NEW."render_manifest_canonical_text" IS DISTINCT FROM OLD."render_manifest_canonical_text"
    OR NEW."render_manifest_sha256" IS DISTINCT FROM OLD."render_manifest_sha256"
    OR NEW."queue_job_id" IS DISTINCT FROM OLD."queue_job_id"
    OR NEW."requested_by_user_id" IS DISTINCT FROM OLD."requested_by_user_id"
    OR NEW."request_id" IS DISTINCT FROM OLD."request_id"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
  THEN
    RAISE EXCEPTION 'Report artifact identity, actor request, and render manifest are immutable';
  END IF;

  IF NOT (
    (OLD."status" = 'pending' AND NEW."status" IN ('pending', 'running', 'failed', 'expired'))
    OR (OLD."status" = 'running' AND NEW."status" IN ('running', 'staged', 'failed', 'expired'))
    OR (OLD."status" = 'staged' AND NEW."status" IN ('staged', 'expired'))
    OR (OLD."status" = 'failed' AND NEW."status" = 'failed')
    OR (OLD."status" = 'expired' AND NEW."status" = 'expired')
  ) THEN
    RAISE EXCEPTION 'Illegal report artifact lifecycle transition';
  END IF;

  IF NEW."status" IN ('pending', 'running') AND report_row."status" <> 'ready_for_review' THEN
    RAISE EXCEPTION 'Pending report artifacts require the exact reviewed report';
  END IF;
  IF NEW."status" = 'staged'
    AND NOT (
      report_row."status" = 'ready_for_review'
      OR (report_row."status" IN ('published', 'superseded') AND report_row."published_artifact_id" = NEW."id")
    ) THEN
    RAISE EXCEPTION 'Staged report artifacts must be the reviewed or selected published artifact';
  END IF;
  IF OLD."status" = 'staged'
    AND NEW."status" = 'expired'
    AND report_row."published_artifact_id" = OLD."id" THEN
    RAISE EXCEPTION 'The selected published report artifact cannot expire';
  END IF;

  IF OLD."status" IN ('staged', 'failed', 'expired')
    AND (
      NEW."storage_key" IS DISTINCT FROM OLD."storage_key"
      OR NEW."artifact_sha256" IS DISTINCT FROM OLD."artifact_sha256"
      OR NEW."byte_size" IS DISTINCT FROM OLD."byte_size"
      OR NEW."failure_code" IS DISTINCT FROM OLD."failure_code"
      OR NEW."failure_message" IS DISTINCT FROM OLD."failure_message"
      OR NEW."staged_at" IS DISTINCT FROM OLD."staged_at"
    )
  THEN
    RAISE EXCEPTION 'Terminal report artifact evidence is immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_report_artifact_review_binding()
RETURNS trigger AS $$
DECLARE
  report_row record;
BEGIN
  IF NEW."status" IN ('pending', 'running', 'staged') THEN
    SELECT "status", "published_artifact_id" INTO report_row
    FROM "reports"
    WHERE "id" = NEW."report_id" AND "project_id" = NEW."project_id";
    IF NEW."status" IN ('pending', 'running') AND report_row."status" IS DISTINCT FROM 'ready_for_review' THEN
      RAISE EXCEPTION 'Pending report artifact must be committed with its reviewed report';
    END IF;
    IF NEW."status" = 'staged'
      AND NOT (
        report_row."status" = 'ready_for_review'
        OR (report_row."status" IN ('published', 'superseded') AND report_row."published_artifact_id" = NEW."id")
      ) THEN
      RAISE EXCEPTION 'Staged report artifact must be committed with its reviewed or published report';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_report_review_artifact_binding()
RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'draft' AND NEW."status" = 'ready_for_review' AND NOT EXISTS (
    SELECT 1 FROM "report_artifacts"
    WHERE "report_id" = OLD."id"
      AND "project_id" = OLD."project_id"
      AND "snapshot_sha256" = NEW."snapshot_sha256"
      AND "status" IN ('pending', 'running', 'staged')
  ) THEN
    RAISE EXCEPTION 'Reviewed report requires an exact pending or staged HTML artifact';
  END IF;
  IF OLD."status" = 'ready_for_review' AND NEW."status" = 'draft' AND EXISTS (
    SELECT 1 FROM "report_artifacts"
    WHERE "report_id" = OLD."id"
      AND "project_id" = OLD."project_id"
      AND "status" IN ('pending', 'running', 'staged')
  ) THEN
    RAISE EXCEPTION 'Reviewed report artifacts must be expired before requesting changes';
  END IF;
  IF OLD."status" = 'ready_for_review' AND NEW."status" = 'published' AND NOT EXISTS (
    SELECT 1 FROM "report_artifacts"
    WHERE "id" = NEW."published_artifact_id"
      AND "report_id" = NEW."id"
      AND "project_id" = NEW."project_id"
      AND "snapshot_sha256" = NEW."snapshot_sha256"
      AND "status" = 'staged'
  ) THEN
    RAISE EXCEPTION 'Published report requires its exact staged HTML artifact';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_report_lifecycle_event_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_report record;
  generation_run record;
  target_artifact record;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Report lifecycle events are append-only.';
  END IF;

  SELECT "project_id", "report_issue_id", "snapshot_sha256", "status", "published_artifact_id" INTO target_report
  FROM "reports"
  WHERE "id" = NEW."report_id";
  IF NOT FOUND
    OR target_report."project_id" <> NEW."project_id"
    OR target_report."report_issue_id" <> NEW."report_issue_id"
    OR target_report."snapshot_sha256" <> NEW."snapshot_sha256"
    OR target_report."status" <> NEW."to_status" THEN
    RAISE EXCEPTION 'Report lifecycle event must bind the exact current report transition.';
  END IF;

  IF NEW."event_type" = 'report_generated' THEN
    IF NEW."generation_run_id" IS NULL
      OR NEW."artifact_id" IS NOT NULL
      OR NEW."actor_type" <> 'system'
      OR NEW."actor_user_id" IS NOT NULL
      OR NEW."to_status" <> 'draft'
      OR NEW."from_status" NOT IN ('draft') AND NEW."from_status" IS NOT NULL
      OR NEW."request_id" <> NEW."generation_run_id"
      OR NEW."decision_note" IS NOT NULL THEN
      RAISE EXCEPTION 'ReportGenerated lifecycle evidence must describe one exact system generation transition.';
    END IF;

    SELECT "project_id", "report_issue_id", "result_report_id", "status" INTO generation_run
    FROM "report_generation_runs"
    WHERE "id" = NEW."generation_run_id";
    IF NOT FOUND
      OR generation_run."project_id" <> NEW."project_id"
      OR generation_run."report_issue_id" <> NEW."report_issue_id"
      OR generation_run."result_report_id" <> NEW."report_id"
      OR generation_run."status" <> 'succeeded' THEN
      RAISE EXCEPTION 'ReportGenerated lifecycle evidence must bind its succeeded generation run.';
    END IF;
  ELSIF NEW."event_type" = 'submitted_for_review' THEN
    IF NEW."generation_run_id" IS NOT NULL
      OR NEW."artifact_id" IS NULL
      OR NEW."actor_type" <> 'human'
      OR NEW."actor_user_id" IS NULL
      OR NEW."from_status" <> 'draft'
      OR NEW."to_status" <> 'ready_for_review'
      OR NEW."decision_note" IS NOT NULL THEN
      RAISE EXCEPTION 'Submitted-for-review lifecycle evidence must describe one exact human review transition.';
    END IF;
  ELSIF NEW."event_type" = 'changes_requested' THEN
    IF NEW."generation_run_id" IS NOT NULL
      OR NEW."artifact_id" IS NOT NULL
      OR NEW."actor_type" <> 'human'
      OR NEW."actor_user_id" IS NULL
      OR NEW."from_status" <> 'ready_for_review'
      OR NEW."to_status" <> 'draft'
      OR NEW."decision_note" IS NULL
      OR btrim(NEW."decision_note") = ''
      OR length(NEW."decision_note") > 2000 THEN
      RAISE EXCEPTION 'Changes-requested lifecycle evidence must describe one exact human review transition.';
    END IF;
  ELSIF NEW."event_type" = 'published' THEN
    IF NEW."generation_run_id" IS NOT NULL
      OR NEW."artifact_id" IS NULL
      OR NEW."actor_type" <> 'human'
      OR NEW."actor_user_id" IS NULL
      OR NEW."from_status" <> 'ready_for_review'
      OR NEW."to_status" <> 'published'
      OR NEW."decision_note" IS NOT NULL
      OR target_report."published_artifact_id" IS DISTINCT FROM NEW."artifact_id" THEN
      RAISE EXCEPTION 'Published lifecycle evidence must bind one exact human decision and artifact.';
    END IF;
  ELSIF NEW."event_type" = 'superseded' THEN
    IF NEW."generation_run_id" IS NOT NULL
      OR NEW."artifact_id" IS NULL
      OR NEW."actor_type" <> 'human'
      OR NEW."actor_user_id" IS NULL
      OR NEW."from_status" <> 'published'
      OR NEW."to_status" <> 'superseded'
      OR NEW."decision_note" IS NULL
      OR btrim(NEW."decision_note") = ''
      OR length(NEW."decision_note") > 2000
      OR target_report."published_artifact_id" IS DISTINCT FROM NEW."artifact_id" THEN
      RAISE EXCEPTION 'Superseded lifecycle evidence must bind the correction actor, reason, and prior artifact.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported report lifecycle event type.';
  END IF;

  IF NEW."artifact_id" IS NOT NULL THEN
    SELECT "project_id", "report_id", "status", "snapshot_sha256" INTO target_artifact
    FROM "report_artifacts"
    WHERE "id" = NEW."artifact_id";
    IF NOT FOUND
      OR target_artifact."project_id" <> NEW."project_id"
      OR target_artifact."report_id" <> NEW."report_id"
      OR target_artifact."snapshot_sha256" <> NEW."snapshot_sha256"
      OR (NEW."event_type" = 'submitted_for_review' AND target_artifact."status" NOT IN ('pending', 'running', 'staged'))
      OR (NEW."event_type" IN ('published', 'superseded') AND target_artifact."status" <> 'staged') THEN
      RAISE EXCEPTION 'Report lifecycle artifact evidence must bind the exact artifact for its transition.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_report_evidence_alert_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_evidence record;
  affected_report record;
  resolution_report record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Report evidence alerts are durable lifecycle evidence.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT "id", "project_id", "report_id", "evidence_key", "source_kind", "source_id"
    INTO source_evidence
    FROM "report_evidence_items"
    WHERE "id" = NEW."report_evidence_item_id";
    SELECT "id", "project_id", "status" INTO affected_report
    FROM "reports"
    WHERE "id" = NEW."report_id";
    IF source_evidence."id" IS NULL
      OR affected_report."id" IS NULL
      OR source_evidence."project_id" <> NEW."project_id"
      OR source_evidence."report_id" <> NEW."report_id"
      OR source_evidence."evidence_key" <> NEW."evidence_key"
      OR source_evidence."source_kind" <> NEW."source_kind"
      OR source_evidence."source_id" <> NEW."source_id"
      OR affected_report."project_id" <> NEW."project_id"
      OR affected_report."status" <> 'published'
      OR NEW."status" <> 'open' THEN
      RAISE EXCEPTION 'Source invalidation alerts must bind exact evidence on a published report.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."project_id" IS DISTINCT FROM OLD."project_id"
    OR NEW."report_id" IS DISTINCT FROM OLD."report_id"
    OR NEW."report_evidence_item_id" IS DISTINCT FROM OLD."report_evidence_item_id"
    OR NEW."evidence_key" IS DISTINCT FROM OLD."evidence_key"
    OR NEW."source_kind" IS DISTINCT FROM OLD."source_kind"
    OR NEW."source_id" IS DISTINCT FROM OLD."source_id"
    OR NEW."alert_kind" IS DISTINCT FROM OLD."alert_kind"
    OR NEW."detected_at" IS DISTINCT FROM OLD."detected_at"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'Report evidence alert identity is immutable.';
  END IF;
  IF OLD."status" <> 'open' OR NEW."status" <> 'resolved' THEN
    RAISE EXCEPTION 'Report evidence alerts may transition only from open to resolved.';
  END IF;

  SELECT "id", "project_id", "report_issue_id", "status", "supersedes_report_id" INTO resolution_report
  FROM "reports"
  WHERE "id" = NEW."resolved_by_report_id";
  SELECT "id", "report_issue_id" INTO affected_report FROM "reports" WHERE "id" = OLD."report_id";
  IF resolution_report."id" IS NULL
    OR affected_report."id" IS NULL
    OR resolution_report."project_id" <> NEW."project_id"
    OR resolution_report."report_issue_id" <> affected_report."report_issue_id"
    OR resolution_report."status" <> 'published'
    OR resolution_report."supersedes_report_id" <> OLD."report_id" THEN
    RAISE EXCEPTION 'Report evidence alerts require the published correction successor for resolution.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER report_evidence_alerts_enforce_write
BEFORE INSERT OR UPDATE OR DELETE ON "report_evidence_alerts"
FOR EACH ROW EXECUTE FUNCTION enforce_report_evidence_alert_write();
