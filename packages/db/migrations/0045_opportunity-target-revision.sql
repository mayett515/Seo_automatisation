ALTER TABLE "opportunities" ADD COLUMN "row_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_row_version_check" CHECK ("opportunities"."row_version" >= 0);--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_opportunity_row_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW."row_version" := 0;
    RETURN NEW;
  END IF;

  IF NEW."row_version" IS DISTINCT FROM OLD."row_version" THEN
    RAISE EXCEPTION 'Opportunity row_version is database-managed';
  END IF;

  NEW."row_version" := OLD."row_version" + 1;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "opportunities_row_version_guard"
BEFORE INSERT OR UPDATE ON "opportunities"
FOR EACH ROW
EXECUTE FUNCTION enforce_opportunity_row_version();
