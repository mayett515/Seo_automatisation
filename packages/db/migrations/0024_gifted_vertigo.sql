CREATE TYPE "public"."page_version_status" AS ENUM('draft', 'preview', 'changes_requested', 'approved', 'release_candidate', 'released', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."release_item_action" AS ENUM('create', 'update', 'redirect', 'noindex', 'remove');--> statement-breakpoint
ALTER TABLE "page_versions" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "page_versions" ALTER COLUMN "status" SET DATA TYPE "public"."page_version_status" USING "status"::"public"."page_version_status";--> statement-breakpoint
ALTER TABLE "page_versions" ALTER COLUMN "status" SET DEFAULT 'preview'::"public"."page_version_status";--> statement-breakpoint
UPDATE "release_plan_items" SET "action" = 'create' WHERE "action" = 'publish';--> statement-breakpoint
ALTER TABLE "release_plan_items" ALTER COLUMN "action" SET DATA TYPE "public"."release_item_action" USING "action"::"public"."release_item_action";--> statement-breakpoint
ALTER TABLE "page_proposals" ADD COLUMN "proposal_json" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "page_versions_proposal_version_idx" ON "page_versions" USING btree ("page_proposal_id","version_number");
