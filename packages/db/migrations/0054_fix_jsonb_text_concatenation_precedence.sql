-- Rollback: restore the 0048 enforce_agent_run_evidence_insert body and
-- the 0050 require_opportunity_research_projection body. This migration
-- changes expression grouping only and does not modify tables or data.
CREATE OR REPLACE FUNCTION enforce_agent_run_evidence_insert()
RETURNS trigger AS $$
DECLARE
  run_project uuid;
  run_status agent_run_status;
  run_workflow agent_workflow_name;
  source_project uuid;
  source_status text;
  source_run_id uuid;
  source_observed_at timestamptz;
  source_projection jsonb;
  evidence_projection jsonb;
  resolved_proof_tier text;
  resolved_source_version text;
  resolved_payload_sha256 text;
  stored_content_sha256 text;
  stored_markdown text;
BEGIN
  SELECT "project_id", "status", "workflow_name"
  INTO run_project, run_status, run_workflow
  FROM "agent_runs"
  WHERE "id" = NEW."agent_run_id"
  FOR UPDATE;
  IF run_project IS NULL OR run_project <> NEW."project_id" OR run_status <> 'running' OR run_workflow IS NULL THEN
    RAISE EXCEPTION 'Agent run evidence requires a running parent in the same project';
  END IF;
  IF NEW."evidence_key" IS DISTINCT FROM NEW."source_kind"::text || ':' || NEW."source_id"::text THEN
    RAISE EXCEPTION 'Agent run evidence key must be the canonical source identity';
  END IF;

  CASE NEW."source_kind"::text
    WHEN 'business_profile_revision' THEN
      SELECT
        revision."project_id",
        jsonb_build_object(
          'id', revision."id",
          'revision', revision."revision",
          'profile', revision."profile_json",
          'profileSha256', revision."profile_sha256",
          'sourceImportRunId', revision."source_import_run_id",
          'createdByUserId', revision."created_by_user_id",
          'createdAt', revision."created_at"
        ),
        jsonb_build_object(
          'summary', 'Confirmed business profile revision',
          'businessName', revision."profile_json"->>'businessName',
          'websiteUrl', revision."profile_json"->>'websiteUrl',
          'revision', revision."revision"
        ),
        revision."created_at"
      INTO source_project, source_projection, evidence_projection, source_observed_at
      FROM "project_business_profile_revisions" AS revision
      INNER JOIN "project_business_profiles" AS profile
        ON profile."current_revision_id" = revision."id"
       AND profile."project_id" = revision."project_id"
       AND profile."status" = 'confirmed'
      WHERE revision."id" = NEW."source_id"
      FOR SHARE OF revision, profile;
      resolved_proof_tier := 'supporting_context';
    WHEN 'canonical_service' THEN
      SELECT
        service."project_id",
        jsonb_build_object(
          'id', service."id",
          'name', service."name",
          'status', service."status",
          'rowVersion', service."row_version",
          'confirmedAt', service."confirmed_at",
          'confirmedByUserId', service."confirmed_by_user_id"
        ),
        jsonb_build_object('summary', 'Confirmed canonical service', 'name', service."name"),
        service."confirmed_at",
        service."status"::text
      INTO source_project, source_projection, evidence_projection, source_observed_at, source_status
      FROM "services" AS service
      WHERE service."id" = NEW."source_id"
      FOR SHARE OF service;
      IF source_status <> 'confirmed' THEN RAISE EXCEPTION 'Canonical service evidence must be confirmed'; END IF;
      resolved_proof_tier := 'supporting_context';
    WHEN 'canonical_area' THEN
      SELECT
        area."project_id",
        jsonb_build_object(
          'id', area."id",
          'name', area."name",
          'kind', area."kind",
          'status', area."status",
          'rowVersion', area."row_version",
          'confirmedAt', area."confirmed_at",
          'confirmedByUserId', area."confirmed_by_user_id"
        ),
        jsonb_build_object('summary', 'Confirmed canonical area', 'name', area."name", 'kind', area."kind"),
        area."confirmed_at",
        area."status"::text
      INTO source_project, source_projection, evidence_projection, source_observed_at, source_status
      FROM "areas" AS area
      WHERE area."id" = NEW."source_id"
      FOR SHARE OF area;
      IF source_status <> 'confirmed' THEN RAISE EXCEPTION 'Canonical area evidence must be confirmed'; END IF;
      resolved_proof_tier := 'supporting_context';
    WHEN 'website_import' THEN
      SELECT
        import_run."project_id",
        jsonb_build_object(
          'id', import_run."id",
          'mainWebsiteId', import_run."main_website_id",
          'sourceUrl', import_run."source_url",
          'status', import_run."status",
          'artifactKey', import_run."artifact_key",
          'summary', import_run."summary_json",
          'completedAt', import_run."completed_at"
        ),
        jsonb_build_object('summary', 'Completed website import', 'sourceUrl', import_run."source_url"),
        import_run."completed_at",
        import_run."status"::text
      INTO source_project, source_projection, evidence_projection, source_observed_at, source_status
      FROM "website_import_runs" AS import_run
      WHERE import_run."id" = NEW."source_id"
      FOR SHARE OF import_run;
      IF source_status <> 'completed' OR source_observed_at IS NULL THEN
        RAISE EXCEPTION 'Website-import evidence must be completed';
      END IF;
      resolved_proof_tier := 'supporting_context';
    WHEN 'gsc_row' THEN
      SELECT
        row."project_id",
        jsonb_build_object(
          'id', row."id",
          'syncRunId', row."sync_run_id",
          'propertyUrl', row."property_url",
          'dateFrom', sync."date_from",
          'dateTo', sync."date_to",
          'query', row."query",
          'pageUrl', row."page_url",
          'clicks', row."clicks",
          'impressions', row."impressions",
          'ctr', row."ctr",
          'position', row."position"
        ),
        jsonb_build_object('summary', 'Google Search Console query-page row', 'query', row."query", 'pageUrl', row."page_url"),
        (sync."date_to" || 'T23:59:59.999Z')::timestamptz,
        sync."status"::text
      INTO source_project, source_projection, evidence_projection, source_observed_at, source_status
      FROM "gsc_search_analytics_rows" AS row
      INNER JOIN "gsc_sync_runs" AS sync
        ON sync."id" = row."sync_run_id"
       AND sync."project_id" = row."project_id"
      WHERE row."id" = NEW."source_id"
      FOR SHARE OF row, sync;
      IF source_status <> 'completed' OR source_observed_at < current_date - interval '90 days' THEN
        RAISE EXCEPTION 'GSC row evidence must come from a fresh completed sync';
      END IF;
      resolved_proof_tier := 'internal_signal';
    WHEN 'gsc_signal' THEN
      SELECT
        signal."project_id",
        jsonb_build_object(
          'id', signal."id",
          'syncRunId', signal."sync_run_id",
          'rowId', signal."row_id",
          'propertyUrl', sync."property_url",
          'dateFrom', sync."date_from",
          'dateTo', sync."date_to",
          'signalType', signal."signal_type",
          'status', signal."status",
          'query', signal."query",
          'pageUrl', signal."page_url",
          'evidence', signal."evidence_json"
        ),
        jsonb_build_object('summary', 'Google Search Console opportunity signal', 'query', signal."query", 'pageUrl', signal."page_url"),
        (sync."date_to" || 'T23:59:59.999Z')::timestamptz,
        sync."status"::text
      INTO source_project, source_projection, evidence_projection, source_observed_at, source_status
      FROM "gsc_opportunity_signals" AS signal
      INNER JOIN "gsc_sync_runs" AS sync
        ON sync."id" = signal."sync_run_id"
       AND sync."project_id" = signal."project_id"
      WHERE signal."id" = NEW."source_id"
      FOR SHARE OF signal, sync;
      IF source_status <> 'completed' OR source_observed_at < current_date - interval '90 days' THEN
        RAISE EXCEPTION 'GSC signal evidence must come from a fresh completed sync';
      END IF;
      resolved_proof_tier := 'internal_signal';
    WHEN 'ranking_proof' THEN
      SELECT
        proof."project_id",
        jsonb_build_object(
          'id', proof."id",
          'query', proof."query",
          'pageUrl', proof."page_url",
          'rank', proof."rank",
          'capturedAt', proof."captured_at",
          'searchEngine', proof."search_engine",
          'device', proof."device",
          'locale', proof."locale",
          'status', proof."status",
          'rowVersion', proof."row_version",
          'reviewedAt', proof."reviewed_at",
          'reviewedByUserId', proof."reviewed_by_user_id"
        ),
        jsonb_build_object('summary', 'Human-reviewed ranking proof', 'query', proof."query", 'pageUrl', proof."page_url", 'rank', proof."rank"),
        proof."captured_at",
        proof."status"::text
      INTO source_project, source_projection, evidence_projection, source_observed_at, source_status
      FROM "ranking_proofs" AS proof
      WHERE proof."id" = NEW."source_id"
      FOR SHARE OF proof;
      IF source_status <> 'reviewed' OR source_observed_at < now() - interval '30 days' THEN
        RAISE EXCEPTION 'Ranking-proof evidence must be current and reviewed';
      END IF;
      resolved_proof_tier := 'customer_safe_proof';
    WHEN 'public_web_search_capture' THEN
      SELECT
        capture."project_id",
        capture."agent_run_id",
        jsonb_build_object(
          'id', capture."id",
          'query', capture."query",
          'provider', capture."provider",
          'requestedLocale', capture."requested_locale",
          'effectiveLocale', capture."effective_locale",
          'observedLocale', capture."observed_locale",
          'executionEpoch', coalesce((to_jsonb(capture)->>'execution_epoch')::integer, 0),
          'requestedRegion', to_jsonb(capture)->>'requested_region',
          'maxResults', coalesce((to_jsonb(capture)->>'max_results')::integer, 5),
          'researchOrdinal', capture."research_ordinal",
          'round', capture."round",
          'status', capture."status",
          'results', capture."results_json",
          'capturedAt', capture."captured_at"
        ),
        jsonb_build_object('summary', 'Captured public-web research results', 'query', capture."query", 'resultCount', jsonb_array_length(capture."results_json")),
        capture."captured_at",
        capture."status"
      INTO source_project, source_run_id, source_projection, evidence_projection, source_observed_at, source_status
      FROM "public_web_search_captures" AS capture
      WHERE capture."id" = NEW."source_id"
      FOR SHARE OF capture;
      IF source_status <> 'succeeded' OR source_run_id <> NEW."agent_run_id" THEN
        RAISE EXCEPTION 'Public-web search evidence must be a succeeded capture from the same run';
      END IF;
      resolved_proof_tier := 'supporting_context';
    WHEN 'knowledge_version' THEN
      SELECT
        version."project_id",
        jsonb_build_object(
          'id', version."id",
          'documentId', version."document_id",
          'documentKey', document."document_key",
          'version', version."version",
          'title', version."title",
          'bodyMarkdown', version."body_markdown",
          'contentSha256', version."content_sha256",
          'taskScopes', (
            SELECT coalesce(jsonb_agg(scope."task_scope" ORDER BY scope."task_scope"), '[]'::jsonb)
            FROM "project_knowledge_task_scopes" AS scope
            WHERE scope."version_id" = version."id"
          )
        ),
        jsonb_build_object(
          'summary', 'Approved project knowledge',
          'documentKey', document."document_key",
          'title', version."title",
          'excerpt', left(version."body_markdown", 8000),
          'contentSha256', version."content_sha256"
        ),
        version."created_at",
        version."status"::text,
        version."content_sha256",
        version."body_markdown"
      INTO source_project, source_projection, evidence_projection, source_observed_at, source_status, stored_content_sha256, stored_markdown
      FROM "project_knowledge_versions" AS version
      INNER JOIN "project_knowledge_documents" AS document
        ON document."id" = version."document_id"
       AND document."current_approved_version_id" = version."id"
      WHERE version."id" = NEW."source_id"
        AND EXISTS (
          SELECT 1 FROM "project_knowledge_task_scopes" AS scope
          WHERE scope."version_id" = version."id" AND scope."task_scope" = 'opportunity_research'
        )
      FOR SHARE OF version, document;
      IF source_status <> 'approved'
         OR stored_content_sha256 IS DISTINCT FROM encode(sha256(convert_to(stored_markdown, 'UTF8')), 'hex') THEN
        RAISE EXCEPTION 'Knowledge evidence must be current, approved, scoped, and checksum-valid';
      END IF;
      resolved_proof_tier := 'supporting_context';
    WHEN 'technical_audit_finding' THEN
      SELECT
        finding."project_id",
        jsonb_build_object(
          'id', finding."id",
          'auditRunId', finding."audit_run_id",
          'checkKey', finding."check_key",
          'category', finding."category",
          'severity', finding."severity",
          'route', finding."route",
          'pageUrl', finding."page_url",
          'message', finding."message",
          'evidence', finding."evidence_json",
          'completedAt', audit."completed_at"
        ),
        jsonb_build_object('summary', finding."message", 'checkKey', finding."check_key", 'severity', finding."severity"),
        coalesce(audit."completed_at", finding."created_at"),
        audit."status"::text
      INTO source_project, source_projection, evidence_projection, source_observed_at, source_status
      FROM "technical_audit_findings" AS finding
      INNER JOIN "technical_audit_runs" AS audit
        ON audit."id" = finding."audit_run_id"
       AND audit."project_id" = finding."project_id"
      WHERE finding."id" = NEW."source_id"
      FOR SHARE OF finding, audit;
      IF source_status <> 'completed' THEN RAISE EXCEPTION 'Technical-audit evidence requires a completed audit'; END IF;
      resolved_proof_tier := 'supporting_context';
    WHEN 'existing_page' THEN
      SELECT
        proposal."project_id",
        jsonb_build_object(
          'id', version."id",
          'proposalId', version."page_proposal_id",
          'route', proposal."route",
          'versionNumber', version."version_number",
          'status', version."status",
          'pageJson', version."page_json",
          'approvedAt', version."approved_at"
        ),
        jsonb_build_object('summary', 'Approved existing page version', 'route', proposal."route", 'status', version."status"),
        coalesce(version."approved_at", version."created_at"),
        version."status"::text
      INTO source_project, source_projection, evidence_projection, source_observed_at, source_status
      FROM "page_versions" AS version
      INNER JOIN "page_proposals" AS proposal ON proposal."id" = version."page_proposal_id"
      WHERE version."id" = NEW."source_id"
      FOR SHARE OF version, proposal;
      IF source_status NOT IN ('approved', 'release_candidate', 'released', 'superseded') THEN
        RAISE EXCEPTION 'Existing-page evidence must be an approved immutable page version';
      END IF;
      resolved_proof_tier := 'supporting_context';
    ELSE
      RAISE EXCEPTION 'Unsupported agent run evidence source kind';
  END CASE;

  IF source_project IS NULL OR source_project <> NEW."project_id" OR source_projection IS NULL OR source_observed_at IS NULL THEN
    RAISE EXCEPTION 'Agent run evidence source must resolve inside the same project';
  END IF;
  resolved_source_version := CASE NEW."source_kind"::text
    WHEN 'business_profile_revision' THEN 'sha256:' || (source_projection->>'profileSha256')
    WHEN 'canonical_service' THEN 'row-version:' || (source_projection->>'rowVersion')
    WHEN 'canonical_area' THEN 'row-version:' || (source_projection->>'rowVersion')
    WHEN 'website_import' THEN 'completed-at:' || to_char(source_observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    WHEN 'gsc_row' THEN 'sync-run:' || (source_projection->>'syncRunId')
    WHEN 'gsc_signal' THEN 'sync-run:' || (source_projection->>'syncRunId')
    WHEN 'ranking_proof' THEN 'row-version:' || (source_projection->>'rowVersion')
    WHEN 'public_web_search_capture' THEN 'captured-at:' || to_char(source_observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    WHEN 'knowledge_version' THEN 'sha256:' || (source_projection->>'contentSha256')
    WHEN 'technical_audit_finding' THEN 'audit-run:' || (source_projection->>'auditRunId')
    WHEN 'existing_page' THEN 'version-number:' || (source_projection->>'versionNumber')
    ELSE NULL
  END;
  IF resolved_source_version IS NULL OR NEW."source_version" IS DISTINCT FROM resolved_source_version THEN
    RAISE EXCEPTION 'Agent run evidence source changed after material selection';
  END IF;
  resolved_payload_sha256 := encode(sha256(convert_to(source_projection::text, 'UTF8')), 'hex');
  NEW."source_version" := resolved_source_version;
  NEW."payload_sha256" := resolved_payload_sha256;
  NEW."observed_at" := source_observed_at;
  NEW."proof_tier" := resolved_proof_tier;
  NEW."evidence_json" := evidence_projection;
  IF octet_length(NEW."evidence_json"::text) > 16384 THEN
    RAISE EXCEPTION 'Agent run evidence projection exceeds 16 KiB';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION require_opportunity_research_projection(
  target_project_id uuid,
  target_material_digest text,
  stored_shortfalls jsonb
)
RETURNS void AS $$
DECLARE
  target_run_id uuid;
  run_output jsonb;
  expected_candidate_keys text[];
  actual_candidate_keys text[];
  expected_shortfalls jsonb;
  portfolio_mismatch boolean;
BEGIN
  SELECT run."id", run."output_json"
  INTO target_run_id, run_output
  FROM "agent_runs" AS run
  WHERE run."project_id" = target_project_id
    AND run."workflow_name" = 'opportunity_research'
    AND run."status" = 'succeeded'
    AND run."input_sha256" = target_material_digest
  ORDER BY run."completed_at" DESC, run."id" DESC
  LIMIT 1;

  IF target_run_id IS NULL OR jsonb_typeof(run_output->'candidates') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Opportunity Research projection requires one exact succeeded workflow output';
  END IF;

  WITH output_keys AS (
    SELECT DISTINCT
      (candidate.value->>'serviceId') || ':' || (candidate.value->>'areaId') || ':' ||
      lower(regexp_replace(btrim(candidate.value->>'primaryKeyword'), '\s+', ' ', 'g')) AS candidate_key
    FROM jsonb_array_elements(run_output->'candidates') AS candidate(value)
  )
  SELECT array_agg(output_keys.candidate_key ORDER BY output_keys.candidate_key)
  INTO expected_candidate_keys
  FROM output_keys
  WHERE output_keys.candidate_key IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "opportunities" AS existing
      WHERE existing."project_id" = target_project_id
        AND existing."candidate_key" = output_keys.candidate_key
        AND existing."status" <> 'rejected'
        AND existing."agent_run_id" IS DISTINCT FROM target_run_id
    );

  SELECT array_agg(opportunity."candidate_key" ORDER BY opportunity."candidate_key")
  INTO actual_candidate_keys
  FROM "opportunities" AS opportunity
  WHERE opportunity."project_id" = target_project_id
    AND opportunity."agent_run_id" = target_run_id
    AND opportunity."policy_version" = 'opportunity-portfolio.v1';

  IF coalesce(expected_candidate_keys, ARRAY[]::text[]) IS DISTINCT FROM
     coalesce(actual_candidate_keys, ARRAY[]::text[]) THEN
    RAISE EXCEPTION 'Opportunity Research projection must persist the exact deduplicated strategy candidate set';
  END IF;

  WITH ranked AS (
    SELECT
      opportunity."id",
      opportunity."lane",
      CASE
        WHEN opportunity."lane" = 'defend_advance' THEN 1
        WHEN opportunity."lane" IN ('quick_win', 'build_cluster') THEN 2
        ELSE 3
      END AS portfolio_group,
      row_number() OVER (
        PARTITION BY CASE
          WHEN opportunity."lane" = 'defend_advance' THEN 1
          WHEN opportunity."lane" IN ('quick_win', 'build_cluster') THEN 2
          ELSE 3
        END
        ORDER BY
          CASE opportunity."evidence_readiness" WHEN 'reviewed_proof' THEN 2 WHEN 'supporting_context' THEN 1 ELSE 0 END DESC,
          CASE opportunity."business_value" WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END DESC,
          CASE opportunity."market_difficulty" WHEN 'low' THEN 3 WHEN 'medium' THEN 2 WHEN 'high' THEN 1 ELSE 0 END DESC,
          CASE opportunity."execution_effort" WHEN 'low' THEN 3 WHEN 'medium' THEN 2 WHEN 'high' THEN 1 ELSE 0 END DESC,
          opportunity."candidate_key",
          opportunity."id"
      ) AS group_order
    FROM "opportunities" AS opportunity
    WHERE opportunity."project_id" = target_project_id
      AND opportunity."agent_run_id" = target_run_id
      AND opportunity."policy_version" = 'opportunity-portfolio.v1'
  ), selected AS (
    SELECT
      ranked."id",
      row_number() OVER (ORDER BY ranked.portfolio_group, ranked.group_order)::integer AS expected_order
    FROM ranked
    WHERE (ranked.portfolio_group = 1 AND ranked.group_order <= 2)
       OR (ranked.portfolio_group = 2 AND ranked.group_order <= 4)
       OR (ranked.portfolio_group = 3 AND ranked.group_order <= 2)
  )
  SELECT coalesce(bool_or(
    opportunity."portfolio_selected" IS DISTINCT FROM (selected."id" IS NOT NULL)
    OR opportunity."portfolio_order" IS DISTINCT FROM selected.expected_order
  ), false)
  INTO portfolio_mismatch
  FROM "opportunities" AS opportunity
  LEFT JOIN selected ON selected."id" = opportunity."id"
  WHERE opportunity."project_id" = target_project_id
    AND opportunity."agent_run_id" = target_run_id
    AND opportunity."policy_version" = 'opportunity-portfolio.v1';

  IF portfolio_mismatch THEN
    RAISE EXCEPTION 'Opportunity Research portfolio selection must match deterministic policy order';
  END IF;

  SELECT jsonb_build_object(
    'defendAdvance', 2 - least(2, count(*) FILTER (WHERE opportunity."lane" = 'defend_advance')),
    'quickBuild', 4 - least(4, count(*) FILTER (WHERE opportunity."lane" IN ('quick_win', 'build_cluster'))),
    'strategic', 2 - least(2, count(*) FILTER (WHERE opportunity."lane" = 'strategic_market'))
  )
  INTO expected_shortfalls
  FROM "opportunities" AS opportunity
  WHERE opportunity."project_id" = target_project_id
    AND opportunity."agent_run_id" = target_run_id
    AND opportunity."policy_version" = 'opportunity-portfolio.v1';

  IF stored_shortfalls IS DISTINCT FROM expected_shortfalls THEN
    RAISE EXCEPTION 'Opportunity Research state shortfalls must match deterministic portfolio truth';
  END IF;
END;
$$ LANGUAGE plpgsql;
