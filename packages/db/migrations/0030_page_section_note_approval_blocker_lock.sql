DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "page_section_notes"
    INNER JOIN "page_versions" ON "page_versions"."id" = "page_section_notes"."page_version_id"
    WHERE "page_section_notes"."instruction_type" = 'approval_blocker'
      AND "page_section_notes"."resolved_at" IS NULL
      AND "page_versions"."status" NOT IN ('preview', 'changes_requested')
  ) THEN
    RAISE EXCEPTION 'Unresolved approval blocker notes cannot exist on non-reviewable page versions';
  END IF;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_unreviewable_approval_blocker_note()
RETURNS trigger AS $$
DECLARE
  version_status text;
BEGIN
  IF NEW.instruction_type = 'approval_blocker' AND NEW.resolved_at IS NULL THEN
    SELECT "status"::text
    INTO version_status
    FROM "page_versions"
    WHERE "id" = NEW.page_version_id
    FOR UPDATE;

    IF version_status IS NULL THEN
      RAISE EXCEPTION 'Approval blocker notes require an existing page version';
    END IF;

    IF version_status NOT IN ('preview', 'changes_requested') THEN
      RAISE EXCEPTION 'Approval blocker notes can only be open on reviewable page versions';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS page_section_notes_prevent_unreviewable_approval_blocker ON "page_section_notes";
--> statement-breakpoint
CREATE TRIGGER page_section_notes_prevent_unreviewable_approval_blocker
BEFORE INSERT OR UPDATE OF page_version_id, instruction_type, resolved_at ON "page_section_notes"
FOR EACH ROW
EXECUTE FUNCTION prevent_unreviewable_approval_blocker_note();
