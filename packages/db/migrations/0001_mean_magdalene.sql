CREATE TYPE "public"."gsc_opportunity_signal_status" AS ENUM('internal_radar', 'near_term_target', 'rejected', 'promoted');--> statement-breakpoint
CREATE TYPE "public"."gsc_opportunity_signal_type" AS ENUM('impressions_no_clicks', 'positions_11_100', 'wrong_page_service_location', 'service_location_query');--> statement-breakpoint
CREATE TYPE "public"."gsc_sync_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "gsc_opportunity_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"sync_run_id" uuid NOT NULL,
	"row_id" uuid,
	"signal_type" "gsc_opportunity_signal_type" NOT NULL,
	"status" "gsc_opportunity_signal_status" DEFAULT 'internal_radar' NOT NULL,
	"query" text NOT NULL,
	"page_url" text NOT NULL,
	"evidence_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gsc_search_analytics_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sync_run_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"property_url" text NOT NULL,
	"query" text NOT NULL,
	"page_url" text NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"ctr" double precision DEFAULT 0 NOT NULL,
	"position" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gsc_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"connection_id" uuid,
	"property_url" text NOT NULL,
	"date_from" text NOT NULL,
	"date_to" text NOT NULL,
	"dimensions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "gsc_sync_status" DEFAULT 'queued' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"failure_json" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gsc_connections" ALTER COLUMN "property_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "gsc_opportunity_signals" ADD CONSTRAINT "gsc_opportunity_signals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_opportunity_signals" ADD CONSTRAINT "gsc_opportunity_signals_sync_run_id_gsc_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."gsc_sync_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_opportunity_signals" ADD CONSTRAINT "gsc_opportunity_signals_row_id_gsc_search_analytics_rows_id_fk" FOREIGN KEY ("row_id") REFERENCES "public"."gsc_search_analytics_rows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_search_analytics_rows" ADD CONSTRAINT "gsc_search_analytics_rows_sync_run_id_gsc_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."gsc_sync_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_search_analytics_rows" ADD CONSTRAINT "gsc_search_analytics_rows_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_sync_runs" ADD CONSTRAINT "gsc_sync_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_sync_runs" ADD CONSTRAINT "gsc_sync_runs_connection_id_gsc_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."gsc_connections"("id") ON DELETE no action ON UPDATE no action;