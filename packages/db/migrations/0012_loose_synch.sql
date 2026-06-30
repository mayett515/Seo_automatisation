CREATE TYPE "public"."provider_operation_status" AS ENUM('not_started', 'in_flight', 'recorded', 'failed', 'manual_reconciliation_required');--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "deployments"
    WHERE "provider_operation_status" NOT IN ('not_started', 'in_flight', 'recorded', 'failed', 'manual_reconciliation_required')
  ) THEN
    RAISE EXCEPTION 'Unknown provider_operation_status value exists; normalize deployments.provider_operation_status before applying migration 0012';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "deployments" ALTER COLUMN "provider_operation_status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "deployments" ALTER COLUMN "provider_operation_status" SET DATA TYPE "public"."provider_operation_status" USING "provider_operation_status"::"public"."provider_operation_status";--> statement-breakpoint
ALTER TABLE "deployments" ALTER COLUMN "provider_operation_status" SET DEFAULT 'not_started'::"public"."provider_operation_status";
