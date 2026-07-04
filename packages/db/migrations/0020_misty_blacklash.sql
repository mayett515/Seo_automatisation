CREATE TYPE "public"."opportunity_lifecycle_status" AS ENUM('new', 'monitoring', 'held', 'rejected', 'brief_created');--> statement-breakpoint
ALTER TABLE "opportunities" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "opportunities" ALTER COLUMN "status" SET DATA TYPE "public"."opportunity_lifecycle_status" USING "status"::"public"."opportunity_lifecycle_status";--> statement-breakpoint
ALTER TABLE "opportunities" ALTER COLUMN "status" SET DEFAULT 'new'::"public"."opportunity_lifecycle_status";--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "decided_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "status_reason" text;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
