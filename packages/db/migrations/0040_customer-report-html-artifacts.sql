CREATE TYPE "public"."customer_report_artifact_format" AS ENUM('html');--> statement-breakpoint
CREATE TYPE "public"."customer_report_artifact_status" AS ENUM('pending', 'running', 'staged', 'failed', 'expired');--> statement-breakpoint
CREATE TABLE "report_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"format" "customer_report_artifact_format" DEFAULT 'html' NOT NULL,
	"status" "customer_report_artifact_status" DEFAULT 'pending' NOT NULL,
	"snapshot_sha256" text NOT NULL,
	"render_manifest_json" jsonb NOT NULL,
	"render_manifest_canonical_text" text NOT NULL,
	"render_manifest_sha256" text NOT NULL,
	"queue_job_id" text NOT NULL,
	"storage_key" text,
	"artifact_sha256" text,
	"byte_size" integer,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"recovery_count" integer DEFAULT 0 NOT NULL,
	"last_recovery_at" timestamp with time zone,
	"failure_code" text,
	"failure_message" text,
	"started_at" timestamp with time zone,
	"staged_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_artifacts_snapshot_sha256_check" CHECK ("report_artifacts"."snapshot_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "report_artifacts_manifest_sha256_check" CHECK ("report_artifacts"."render_manifest_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "report_artifacts_artifact_sha256_check" CHECK ("report_artifacts"."artifact_sha256" is null or "report_artifacts"."artifact_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "report_artifacts_attempt_count_check" CHECK ("report_artifacts"."attempt_count" >= 0),
	CONSTRAINT "report_artifacts_recovery_count_check" CHECK ("report_artifacts"."recovery_count" >= 0),
	CONSTRAINT "report_artifacts_byte_size_check" CHECK ("report_artifacts"."byte_size" is null or "report_artifacts"."byte_size" >= 0),
	CONSTRAINT "report_artifacts_terminal_evidence_check" CHECK (("report_artifacts"."status" in ('pending', 'running') and "report_artifacts"."storage_key" is null and "report_artifacts"."artifact_sha256" is null and "report_artifacts"."byte_size" is null and "report_artifacts"."failure_code" is null and "report_artifacts"."failure_message" is null and "report_artifacts"."staged_at" is null and "report_artifacts"."expired_at" is null) or ("report_artifacts"."status" = 'staged' and "report_artifacts"."storage_key" is not null and "report_artifacts"."artifact_sha256" is not null and "report_artifacts"."byte_size" is not null and "report_artifacts"."failure_code" is null and "report_artifacts"."failure_message" is null and "report_artifacts"."staged_at" is not null and "report_artifacts"."expired_at" is null) or ("report_artifacts"."status" = 'failed' and "report_artifacts"."storage_key" is null and "report_artifacts"."artifact_sha256" is null and "report_artifacts"."byte_size" is null and "report_artifacts"."failure_code" is not null and "report_artifacts"."failure_message" is not null and "report_artifacts"."staged_at" is null and "report_artifacts"."expired_at" is null) or ("report_artifacts"."status" = 'expired' and "report_artifacts"."expired_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "report_artifacts" ADD CONSTRAINT "report_artifacts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_artifacts" ADD CONSTRAINT "report_artifacts_report_project_fk" FOREIGN KEY ("report_id","project_id") REFERENCES "public"."reports"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "report_artifacts_identity_idx" ON "report_artifacts" USING btree ("report_id","format","snapshot_sha256","render_manifest_sha256") WHERE "report_artifacts"."status" in ('pending', 'running', 'staged');--> statement-breakpoint
CREATE UNIQUE INDEX "report_artifacts_queue_job_idx" ON "report_artifacts" USING btree ("queue_job_id");--> statement-breakpoint
CREATE INDEX "report_artifacts_project_status_created_idx" ON "report_artifacts" USING btree ("project_id","status","created_at");--> statement-breakpoint
CREATE INDEX "report_artifacts_recovery_scan_idx" ON "report_artifacts" USING btree ("status","updated_at") WHERE "report_artifacts"."status" in ('pending', 'running');
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "enforce_report_artifact_write"()
RETURNS trigger AS $$
DECLARE
  report_row record;
BEGIN
  SELECT "status", "snapshot_sha256", "schema_version", "template_version"
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
    IF NEW."status" <> 'pending' OR report_row."status" NOT IN ('draft', 'ready_for_review') THEN
      RAISE EXCEPTION 'Report artifacts may start only as pending for the current review candidate';
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
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
  THEN
    RAISE EXCEPTION 'Report artifact identity and render manifest are immutable';
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

  IF NEW."status" IN ('pending', 'running', 'staged') AND report_row."status" <> 'ready_for_review' THEN
    RAISE EXCEPTION 'Active report artifacts require the exact reviewed report';
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
CREATE TRIGGER "report_artifacts_write_guard"
BEFORE INSERT OR UPDATE ON "report_artifacts"
FOR EACH ROW
EXECUTE FUNCTION "enforce_report_artifact_write"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "validate_report_artifact_review_binding"()
RETURNS trigger AS $$
DECLARE
  report_status customer_report_status;
BEGIN
  IF NEW."status" IN ('pending', 'running', 'staged') THEN
    SELECT "status" INTO report_status
    FROM "reports"
    WHERE "id" = NEW."report_id" AND "project_id" = NEW."project_id";
    IF report_status IS DISTINCT FROM 'ready_for_review' THEN
      RAISE EXCEPTION 'Active report artifact must be committed with its reviewed report';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "report_artifacts_review_binding_guard"
AFTER INSERT OR UPDATE ON "report_artifacts"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "validate_report_artifact_review_binding"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_active_report_artifact_delete"()
RETURNS trigger AS $$
BEGIN
  IF OLD."status" IN ('pending', 'running', 'staged') THEN
    RAISE EXCEPTION 'Active and staged report artifacts cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "report_artifacts_delete_guard"
BEFORE DELETE ON "report_artifacts"
FOR EACH ROW
EXECUTE FUNCTION "prevent_active_report_artifact_delete"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "enforce_report_review_artifact_binding"()
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
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "reports_z_artifact_binding_guard"
BEFORE UPDATE OF "status" ON "reports"
FOR EACH ROW
EXECUTE FUNCTION "enforce_report_review_artifact_binding"();
