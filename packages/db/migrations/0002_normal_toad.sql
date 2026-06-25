CREATE INDEX "gsc_connections_project_created_idx" ON "gsc_connections" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "gsc_signals_sync_created_idx" ON "gsc_opportunity_signals" USING btree ("sync_run_id","created_at");--> statement-breakpoint
CREATE INDEX "gsc_rows_sync_impressions_idx" ON "gsc_search_analytics_rows" USING btree ("sync_run_id","impressions");--> statement-breakpoint
CREATE INDEX "gsc_sync_runs_project_status_completed_idx" ON "gsc_sync_runs" USING btree ("project_id","status","completed_at");