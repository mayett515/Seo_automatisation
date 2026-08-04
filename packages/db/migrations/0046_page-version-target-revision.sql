ALTER TABLE "page_versions" ADD COLUMN "row_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_row_version_check" CHECK ("page_versions"."row_version" >= 0);--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_page_version_row_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW."row_version" := 0;
    RETURN NEW;
  END IF;

  IF NEW."row_version" IS DISTINCT FROM OLD."row_version" THEN
    RAISE EXCEPTION 'Page version row_version is database-managed';
  END IF;

  NEW."row_version" := OLD."row_version" + 1;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "page_versions_row_version_guard"
BEFORE INSERT OR UPDATE ON "page_versions"
FOR EACH ROW
EXECUTE FUNCTION enforce_page_version_row_version();
