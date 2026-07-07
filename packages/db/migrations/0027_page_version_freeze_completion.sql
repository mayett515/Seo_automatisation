ALTER TABLE "page_versions"
ADD CONSTRAINT "page_versions_immutable_status_requires_approved_at"
CHECK ("status" NOT IN ('approved', 'release_candidate', 'released', 'superseded') OR "approved_at" IS NOT NULL);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_page_version_immutable_delete()
RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('approved', 'release_candidate', 'released', 'superseded') THEN
    RAISE EXCEPTION 'Approved page versions are immutable and cannot be deleted';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS page_versions_prevent_immutable_delete ON "page_versions";
--> statement-breakpoint
CREATE TRIGGER page_versions_prevent_immutable_delete
BEFORE DELETE ON "page_versions"
FOR EACH ROW
EXECUTE FUNCTION prevent_page_version_immutable_delete();
