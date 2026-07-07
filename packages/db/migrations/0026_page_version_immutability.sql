CREATE OR REPLACE FUNCTION prevent_page_version_immutable_update()
RETURNS trigger AS $$
DECLARE
  old_is_immutable boolean := OLD.status IN ('approved', 'release_candidate', 'released', 'superseded');
  new_is_immutable boolean := NEW.status IN ('approved', 'release_candidate', 'released', 'superseded');
BEGIN
  IF old_is_immutable AND NEW.status NOT IN ('approved', 'release_candidate', 'released', 'superseded') THEN
    RAISE EXCEPTION 'Approved page versions cannot return to editable statuses';
  END IF;

  IF new_is_immutable AND NEW.approved_at IS NULL THEN
    RAISE EXCEPTION 'Approved page versions require approved_at';
  END IF;

  IF old_is_immutable AND OLD.approved_at IS NOT NULL AND OLD.approved_at IS DISTINCT FROM NEW.approved_at THEN
    RAISE EXCEPTION 'Approved page version approval evidence cannot be changed';
  END IF;

  IF (old_is_immutable OR new_is_immutable) AND (
    OLD.page_proposal_id IS DISTINCT FROM NEW.page_proposal_id OR
    OLD.version_number IS DISTINCT FROM NEW.version_number OR
    OLD.page_json IS DISTINCT FROM NEW.page_json
  ) THEN
    RAISE EXCEPTION 'Approved page versions are immutable; create a new page version for edits';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS page_versions_prevent_immutable_update ON "page_versions";
--> statement-breakpoint
CREATE TRIGGER page_versions_prevent_immutable_update
BEFORE UPDATE ON "page_versions"
FOR EACH ROW
EXECUTE FUNCTION prevent_page_version_immutable_update();
