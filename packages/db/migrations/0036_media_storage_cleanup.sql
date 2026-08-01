ALTER TABLE "media_assets" ADD COLUMN "storage_cleanup_attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "last_storage_cleanup_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "storage_cleanup_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "storage_cleanup_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "storage_cleanup_failure_code" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "storage_cleanup_failure_message" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_storage_cleanup_attempt_count_check" CHECK ("storage_cleanup_attempt_count" >= 0);--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_storage_cleanup_evidence_check" CHECK (
	("storage_cleanup_failure_code" IS NULL) = ("storage_cleanup_failure_message" IS NULL)
	AND ("storage_cleanup_completed_at" IS NULL OR (
		"storage_cleanup_claimed_at" IS NULL
		AND "storage_cleanup_failure_code" IS NULL
		AND "status" IN ('ready', 'failed', 'archived')
	))
);--> statement-breakpoint
CREATE INDEX "media_assets_ready_cleanup_scan_idx" ON "media_assets" USING btree ("processed_at") WHERE "media_assets"."storage_cleanup_completed_at" is null and "media_assets"."status" in ('ready', 'archived');--> statement-breakpoint
CREATE INDEX "media_assets_failed_cleanup_scan_idx" ON "media_assets" USING btree ("updated_at") WHERE "media_assets"."storage_cleanup_completed_at" is null and "media_assets"."status" = 'failed';
