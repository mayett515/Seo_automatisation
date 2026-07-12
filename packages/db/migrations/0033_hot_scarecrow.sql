ALTER TABLE "page_versions" ADD COLUMN "based_on_version_id" uuid;--> statement-breakpoint
ALTER TABLE "page_versions" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_based_on_version_id_page_versions_id_fk" FOREIGN KEY ("based_on_version_id") REFERENCES "public"."page_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_versions_based_on_version_idx" ON "page_versions" USING btree ("based_on_version_id");
--> statement-breakpoint
UPDATE "page_versions" AS derived
SET "based_on_version_id" = base."id"
FROM "page_versions" AS base
WHERE derived."based_on_version_id" IS NULL
  AND derived."page_proposal_id" = base."page_proposal_id"
  AND derived."version_number" = base."version_number" + 1;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "page_versions"
    WHERE "version_number" < 1
      OR ("version_number" = 1 AND "based_on_version_id" IS NOT NULL)
      OR ("version_number" > 1 AND "based_on_version_id" IS NULL)
  ) THEN
    RAISE EXCEPTION 'Existing page versions cannot be migrated to direct lineage';
  END IF;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_page_version_lineage()
RETURNS trigger AS $$
DECLARE
  base_page_proposal_id uuid;
  base_version_number integer;
BEGIN
  IF NEW.version_number < 1 THEN
    RAISE EXCEPTION 'Page version numbers must be positive';
  END IF;

  IF NEW.version_number = 1 AND NEW.based_on_version_id IS NOT NULL THEN
    RAISE EXCEPTION 'Initial page versions cannot reference a base version';
  END IF;

  IF NEW.version_number > 1 AND NEW.based_on_version_id IS NULL THEN
    RAISE EXCEPTION 'Derived page versions require based_on_version_id';
  END IF;

  IF NEW.based_on_version_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT page_proposal_id, version_number
  INTO base_page_proposal_id, base_version_number
  FROM page_versions
  WHERE id = NEW.based_on_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Base page version does not exist';
  END IF;

  IF base_page_proposal_id IS DISTINCT FROM NEW.page_proposal_id THEN
    RAISE EXCEPTION 'Page version lineage must stay within one page proposal';
  END IF;

  IF base_version_number <> NEW.version_number - 1 THEN
    RAISE EXCEPTION 'Page version lineage must point to the immediately previous version';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS page_versions_validate_lineage ON "page_versions";
--> statement-breakpoint
CREATE TRIGGER page_versions_validate_lineage
BEFORE INSERT OR UPDATE OF "based_on_version_id", "page_proposal_id", "version_number" ON "page_versions"
FOR EACH ROW
EXECUTE FUNCTION validate_page_version_lineage();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_page_version_immutable_update()
RETURNS trigger AS $$
DECLARE
  old_is_immutable boolean := OLD.status IN ('approved', 'release_candidate', 'released', 'superseded');
  new_is_immutable boolean := NEW.status IN ('approved', 'release_candidate', 'released', 'superseded');
BEGIN
  IF
    OLD.page_proposal_id IS DISTINCT FROM NEW.page_proposal_id OR
    OLD.version_number IS DISTINCT FROM NEW.version_number OR
    OLD.page_json IS DISTINCT FROM NEW.page_json OR
    OLD.based_on_version_id IS DISTINCT FROM NEW.based_on_version_id OR
    OLD.created_by_user_id IS DISTINCT FROM NEW.created_by_user_id
  THEN
    RAISE EXCEPTION 'Page version structure and provenance are append-only; create a new page version for edits';
  END IF;

  IF old_is_immutable AND NEW.status NOT IN ('approved', 'release_candidate', 'released', 'superseded') THEN
    RAISE EXCEPTION 'Approved page versions cannot return to editable statuses';
  END IF;

  IF new_is_immutable AND NEW.approved_at IS NULL THEN
    RAISE EXCEPTION 'Approved page versions require approved_at';
  END IF;

  IF old_is_immutable AND OLD.approved_at IS NOT NULL AND OLD.approved_at IS DISTINCT FROM NEW.approved_at THEN
    RAISE EXCEPTION 'Approved page version approval evidence cannot be changed';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
