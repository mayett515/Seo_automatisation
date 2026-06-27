ALTER TABLE "approvals" ALTER COLUMN "page_version_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "release_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_release_plan_id_release_plans_id_fk" FOREIGN KEY ("release_plan_id") REFERENCES "public"."release_plans"("id") ON DELETE no action ON UPDATE no action;