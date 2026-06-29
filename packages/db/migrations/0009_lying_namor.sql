CREATE TABLE "release_verification_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verification_id" uuid NOT NULL,
	"check_key" text NOT NULL,
	"scope" text NOT NULL,
	"target_url" text,
	"severity" "release_check_severity" NOT NULL,
	"result" "release_check_result" NOT NULL,
	"message" text NOT NULL,
	"expected_json" jsonb,
	"observed_json" jsonb,
	"evidence_json" jsonb,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "deployment_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "evidence_json" jsonb;--> statement-breakpoint
ALTER TABLE "release_verification_checks" ADD CONSTRAINT "release_verification_checks_verification_id_release_verifications_id_fk" FOREIGN KEY ("verification_id") REFERENCES "public"."release_verifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "release_verification_checks_verification_idx" ON "release_verification_checks" USING btree ("verification_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deployments_deployment_key_idx" ON "deployments" USING btree ("deployment_key");--> statement-breakpoint
CREATE INDEX "deployments_release_status_idx" ON "deployments" USING btree ("release_plan_id","status");