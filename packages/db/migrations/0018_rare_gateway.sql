CREATE TABLE "ranking_proofs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"query" text NOT NULL,
	"page_url" text NOT NULL,
	"rank" integer NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"search_engine" text DEFAULT 'google' NOT NULL,
	"device" text DEFAULT 'desktop' NOT NULL,
	"locale" text,
	"screenshot_artifact_key" text,
	"notes" text,
	"created_by_user_id" uuid,
	"evidence_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ranking_proofs" ADD CONSTRAINT "ranking_proofs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_proofs" ADD CONSTRAINT "ranking_proofs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ranking_proofs_project_captured_idx" ON "ranking_proofs" USING btree ("project_id","captured_at");--> statement-breakpoint
CREATE INDEX "ranking_proofs_project_query_idx" ON "ranking_proofs" USING btree ("project_id","query");