CREATE TYPE "public"."media_asset_status" AS ENUM('pending_upload', 'processing', 'ready', 'failed', 'archived');--> statement-breakpoint
CREATE TABLE "media_asset_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"variant_key" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"checksum_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" text DEFAULT 'image' NOT NULL,
	"status" "media_asset_status" DEFAULT 'pending_upload' NOT NULL,
	"display_name" text NOT NULL,
	"claimed_content_type" text NOT NULL,
	"expected_bytes" integer NOT NULL,
	"expected_sha256" text NOT NULL,
	"detected_content_type" text,
	"source_storage_key" text NOT NULL,
	"source_bytes" integer,
	"width" integer,
	"height" integer,
	"checksum_sha256" text,
	"processor_version" text,
	"required_variant_keys" text[],
	"failure_code" text,
	"failure_message" text,
	"created_by_user_id" uuid NOT NULL,
	"archived_by_user_id" uuid,
	"recovery_count" integer DEFAULT 0 NOT NULL,
	"last_recovery_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_version_media_assets" (
	"page_version_id" uuid NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_asset_variants" ADD CONSTRAINT "media_asset_variants_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_archived_by_user_id_users_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_version_media_assets" ADD CONSTRAINT "page_version_media_assets_page_version_id_page_versions_id_fk" FOREIGN KEY ("page_version_id") REFERENCES "public"."page_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_version_media_assets" ADD CONSTRAINT "page_version_media_assets_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_asset_variants_asset_key_idx" ON "media_asset_variants" USING btree ("media_asset_id","variant_key");--> statement-breakpoint
CREATE UNIQUE INDEX "media_asset_variants_storage_key_idx" ON "media_asset_variants" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "media_assets_project_status_created_idx" ON "media_assets" USING btree ("project_id","status","created_at");--> statement-breakpoint
CREATE INDEX "media_assets_recovery_scan_idx" ON "media_assets" USING btree ("status","updated_at") WHERE "media_assets"."status" = 'processing';--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_source_storage_key_idx" ON "media_assets" USING btree ("source_storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "page_version_media_assets_version_asset_idx" ON "page_version_media_assets" USING btree ("page_version_id","media_asset_id");--> statement-breakpoint
CREATE INDEX "page_version_media_assets_asset_idx" ON "page_version_media_assets" USING btree ("media_asset_id");
--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_image_kind_check" CHECK ("kind" = 'image');
--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_expected_bytes_check" CHECK ("expected_bytes" BETWEEN 1 AND 10485760);
--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_claimed_content_type_check" CHECK ("claimed_content_type" IN ('image/jpeg', 'image/png', 'image/webp'));
--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_expected_sha256_check" CHECK ("expected_sha256" ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_detected_content_type_check" CHECK ("detected_content_type" IS NULL OR "detected_content_type" IN ('image/jpeg', 'image/png', 'image/webp'));
--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_detected_source_check" CHECK (("source_bytes" IS NULL OR "source_bytes" BETWEEN 1 AND 10485760) AND ("width" IS NULL OR "width" > 0) AND ("height" IS NULL OR "height" > 0) AND ("checksum_sha256" IS NULL OR "checksum_sha256" ~ '^[0-9a-f]{64}$'));
--> statement-breakpoint
ALTER TABLE "media_asset_variants" ADD CONSTRAINT "media_asset_variants_content_type_check" CHECK ("content_type" = 'image/webp');
--> statement-breakpoint
ALTER TABLE "media_asset_variants" ADD CONSTRAINT "media_asset_variants_key_check" CHECK ("variant_key" ~ '^w[1-9][0-9]*_webp$');
--> statement-breakpoint
ALTER TABLE "media_asset_variants" ADD CONSTRAINT "media_asset_variants_dimensions_check" CHECK ("width" > 0 AND "height" > 0 AND "bytes" > 0);
--> statement-breakpoint
ALTER TABLE "media_asset_variants" ADD CONSTRAINT "media_asset_variants_checksum_check" CHECK ("checksum_sha256" ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_media_asset_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  expected_keys text[];
  actual_keys text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending_upload' THEN
      RAISE EXCEPTION 'new media assets must begin as pending_upload';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'pending_upload' AND NEW.status NOT IN ('pending_upload', 'processing', 'failed') THEN
    RAISE EXCEPTION 'media asset cannot transition from pending_upload to %', NEW.status;
  ELSIF OLD.status = 'processing' AND NEW.status NOT IN ('processing', 'ready', 'failed') THEN
    RAISE EXCEPTION 'media asset cannot transition from processing to %', NEW.status;
  ELSIF OLD.status = 'ready' AND NEW.status NOT IN ('ready', 'archived') THEN
    RAISE EXCEPTION 'media asset cannot transition from ready to %', NEW.status;
  ELSIF OLD.status = 'failed' AND NEW.status <> 'failed' THEN
    RAISE EXCEPTION 'failed media assets are terminal';
  ELSIF OLD.status = 'archived' AND NEW.status <> 'archived' THEN
    RAISE EXCEPTION 'archived media assets are terminal';
  END IF;

  IF OLD.status IN ('ready', 'archived') AND (
    NEW.project_id IS DISTINCT FROM OLD.project_id OR
    NEW.kind IS DISTINCT FROM OLD.kind OR
    NEW.display_name IS DISTINCT FROM OLD.display_name OR
    NEW.claimed_content_type IS DISTINCT FROM OLD.claimed_content_type OR
    NEW.expected_bytes IS DISTINCT FROM OLD.expected_bytes OR
    NEW.expected_sha256 IS DISTINCT FROM OLD.expected_sha256 OR
    NEW.detected_content_type IS DISTINCT FROM OLD.detected_content_type OR
    NEW.source_storage_key IS DISTINCT FROM OLD.source_storage_key OR
    NEW.source_bytes IS DISTINCT FROM OLD.source_bytes OR
    NEW.width IS DISTINCT FROM OLD.width OR
    NEW.height IS DISTINCT FROM OLD.height OR
    NEW.checksum_sha256 IS DISTINCT FROM OLD.checksum_sha256 OR
    NEW.processor_version IS DISTINCT FROM OLD.processor_version OR
    NEW.required_variant_keys IS DISTINCT FROM OLD.required_variant_keys OR
    NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id OR
    NEW.processed_at IS DISTINCT FROM OLD.processed_at
  ) THEN
    RAISE EXCEPTION 'ready media asset manifest is immutable';
  END IF;

  IF OLD.status = 'archived' AND (
    NEW.archived_at IS DISTINCT FROM OLD.archived_at OR
    NEW.archived_by_user_id IS DISTINCT FROM OLD.archived_by_user_id
  ) THEN
    RAISE EXCEPTION 'archived media asset evidence is immutable';
  END IF;

  IF NEW.status = 'ready' AND OLD.status <> 'ready' THEN
    IF NEW.detected_content_type IS NULL OR NEW.source_bytes IS NULL OR NEW.width IS NULL OR NEW.height IS NULL OR
       NEW.checksum_sha256 IS NULL OR NEW.processor_version IS NULL OR NEW.processed_at IS NULL OR
       NEW.required_variant_keys IS NULL OR cardinality(NEW.required_variant_keys) = 0 THEN
      RAISE EXCEPTION 'ready media asset requires complete detected source and processor metadata';
    END IF;

    SELECT array_agg(key ORDER BY key)
      INTO expected_keys
      FROM unnest(NEW.required_variant_keys) AS key;

    SELECT array_agg(variant_key ORDER BY variant_key)
      INTO actual_keys
      FROM media_asset_variants
      WHERE media_asset_id = NEW.id;

    IF expected_keys IS DISTINCT FROM actual_keys THEN
      RAISE EXCEPTION 'ready media asset requires the exact persisted derivative set';
    END IF;
  END IF;

  IF NEW.status = 'archived' AND (NEW.archived_at IS NULL OR NEW.archived_by_user_id IS NULL) THEN
    RAISE EXCEPTION 'archived media asset requires actor and timestamp evidence';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER media_assets_enforce_lifecycle
BEFORE INSERT OR UPDATE ON media_assets
FOR EACH ROW
EXECUTE FUNCTION enforce_media_asset_lifecycle();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_ready_media_variant_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_status media_asset_status;
  parent_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    parent_id := OLD.media_asset_id;
  ELSE
    parent_id := NEW.media_asset_id;
  END IF;

  SELECT status INTO parent_status
  FROM media_assets
  WHERE id = parent_id
  FOR UPDATE;

  IF parent_status IN ('ready', 'archived') THEN
    RAISE EXCEPTION 'ready media asset variants are immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER media_asset_variants_prevent_ready_mutation
BEFORE INSERT OR UPDATE OR DELETE ON media_asset_variants
FOR EACH ROW
EXECUTE FUNCTION prevent_ready_media_variant_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_frozen_media_asset_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('ready', 'archived') THEN
    RAISE EXCEPTION 'ready or archived media assets cannot be hard-deleted';
  END IF;

  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER media_assets_prevent_frozen_delete
BEFORE DELETE ON media_assets
FOR EACH ROW
EXECUTE FUNCTION prevent_frozen_media_asset_delete();
