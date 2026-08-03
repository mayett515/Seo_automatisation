-- Advance new immutable report artifacts after Slice 6 changed renderer and stylesheet bytes.
-- Historical v1 rows may finish or expire, but no new v1 artifact may be admitted.
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
    OR NOT (
      (
        NEW."render_manifest_json"->>'rendererVersion' = 'customer_report_html_renderer.v1'
        AND NEW."render_manifest_json"->>'stylesheetVersion' = 'customer_report_stylesheet.v1'
      )
      OR (
        NEW."render_manifest_json"->>'rendererVersion' = 'customer_report_html_renderer.v2'
        AND NEW."render_manifest_json"->>'stylesheetVersion' = 'customer_report_stylesheet.v2'
      )
    )
  THEN
    RAISE EXCEPTION 'Report artifact manifest must match the immutable report snapshot';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."render_manifest_json"->>'rendererVersion' <> 'customer_report_html_renderer.v2'
      OR NEW."render_manifest_json"->>'stylesheetVersion' <> 'customer_report_stylesheet.v2' THEN
      RAISE EXCEPTION 'New report artifacts require the current renderer and stylesheet versions';
    END IF;
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
