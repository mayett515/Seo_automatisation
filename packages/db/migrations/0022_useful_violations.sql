CREATE TYPE "public"."ranking_proof_status" AS ENUM('reviewed', 'invalidated');--> statement-breakpoint
CREATE TYPE "public"."technical_audit_finding_category" AS ENUM('http_status', 'indexability', 'canonical', 'metadata', 'schema', 'internal_links', 'crawl');--> statement-breakpoint
CREATE TYPE "public"."technical_audit_finding_severity" AS ENUM('info', 'warning', 'blocker');--> statement-breakpoint
CREATE TYPE "public"."technical_audit_status" AS ENUM('queued', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "technical_audit_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"audit_run_id" uuid NOT NULL,
	"check_key" text NOT NULL,
	"category" "technical_audit_finding_category" NOT NULL,
	"severity" "technical_audit_finding_severity" NOT NULL,
	"route" text,
	"page_url" text,
	"message" text NOT NULL,
	"evidence_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "technical_audit_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"source_url" text NOT NULL,
	"status" "technical_audit_status" DEFAULT 'queued' NOT NULL,
	"artifact_key" text,
	"summary_json" jsonb,
	"failure_json" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "ranking_proofs_project_captured_idx";--> statement-breakpoint
ALTER TABLE "ranking_proofs" ADD COLUMN "status" "ranking_proof_status" DEFAULT 'reviewed' NOT NULL;--> statement-breakpoint
ALTER TABLE "ranking_proofs" ADD COLUMN "invalidated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ranking_proofs" ADD COLUMN "invalidated_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "ranking_proofs" ADD COLUMN "invalidation_reason" text;--> statement-breakpoint
ALTER TABLE "technical_audit_findings" ADD CONSTRAINT "technical_audit_findings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_audit_findings" ADD CONSTRAINT "technical_audit_findings_audit_run_id_technical_audit_runs_id_fk" FOREIGN KEY ("audit_run_id") REFERENCES "public"."technical_audit_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_audit_runs" ADD CONSTRAINT "technical_audit_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "technical_audit_findings_run_idx" ON "technical_audit_findings" USING btree ("audit_run_id");--> statement-breakpoint
CREATE INDEX "technical_audit_findings_project_severity_idx" ON "technical_audit_findings" USING btree ("project_id","severity","created_at");--> statement-breakpoint
CREATE INDEX "technical_audit_runs_project_status_idx" ON "technical_audit_runs" USING btree ("project_id","status","created_at");--> statement-breakpoint
ALTER TABLE "ranking_proofs" ADD CONSTRAINT "ranking_proofs_invalidated_by_user_id_users_id_fk" FOREIGN KEY ("invalidated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ranking_proofs_project_status_captured_idx" ON "ranking_proofs" USING btree ("project_id","status","captured_at");