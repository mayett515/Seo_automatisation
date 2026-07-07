CREATE TYPE "public"."page_section_note_instruction_type" AS ENUM('general', 'copy_change', 'design_change', 'seo_change', 'evidence_request', 'approval_blocker');--> statement-breakpoint
CREATE TABLE "page_section_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_version_id" uuid NOT NULL,
	"section_id" text NOT NULL,
	"field_path" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"instruction_type" "page_section_note_instruction_type" DEFAULT 'general' NOT NULL,
	"note" text NOT NULL,
	"created_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "page_section_notes" ADD CONSTRAINT "page_section_notes_page_version_id_page_versions_id_fk" FOREIGN KEY ("page_version_id") REFERENCES "public"."page_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_section_notes" ADD CONSTRAINT "page_section_notes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_section_notes" ADD CONSTRAINT "page_section_notes_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_section_notes_version_section_idx" ON "page_section_notes" USING btree ("page_version_id","section_id");--> statement-breakpoint
CREATE INDEX "page_section_notes_version_resolved_idx" ON "page_section_notes" USING btree ("page_version_id","resolved_at");