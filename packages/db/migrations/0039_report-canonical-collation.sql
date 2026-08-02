-- Custom SQL migration file, put your code below! --
-- Report canonicalization sorts logical keys by code units. Pin the database
-- backstop to the locale-independent C collation so review cannot drift by host locale.
CREATE OR REPLACE FUNCTION enforce_report_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  owning_issue record;
  source_run record;
  predecessor record;
  snapshot_json jsonb;
  expected_claim_count integer;
  expected_evidence_count integer;
  persisted_claim_count integer;
  persisted_evidence_count integer;
  expected_link_count integer;
  persisted_link_count integer;
  persisted_claims_json jsonb;
  persisted_evidence_json jsonb;
  link_projection_mismatch boolean;
BEGIN
  SELECT "project_id" INTO owning_issue
  FROM "report_issues"
  WHERE "id" = NEW."report_issue_id";
  IF NOT FOUND OR owning_issue."project_id" <> NEW."project_id" THEN
    RAISE EXCEPTION 'Report must belong to the issue project.';
  END IF;

  SELECT "project_id", "report_issue_id" INTO source_run
  FROM "report_generation_runs"
  WHERE "id" = NEW."source_generation_run_id";
  IF NOT FOUND OR source_run."project_id" <> NEW."project_id" OR source_run."report_issue_id" <> NEW."report_issue_id" THEN
    RAISE EXCEPTION 'Report source generation run must belong to the same issue and project.';
  END IF;

  IF NEW."supersedes_report_id" IS NOT NULL THEN
    SELECT "project_id", "report_issue_id", "status" INTO predecessor
    FROM "reports"
    WHERE "id" = NEW."supersedes_report_id";
    IF NOT FOUND OR predecessor."project_id" <> NEW."project_id" OR predecessor."report_issue_id" <> NEW."report_issue_id" THEN
      RAISE EXCEPTION 'Report correction predecessor must belong to the same issue and project.';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND NEW."status" <> 'draft' THEN
    RAISE EXCEPTION 'New report versions must begin as draft.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW."project_id" IS DISTINCT FROM OLD."project_id"
      OR NEW."report_issue_id" IS DISTINCT FROM OLD."report_issue_id"
      OR NEW."version_number" IS DISTINCT FROM OLD."version_number"
      OR NEW."supersedes_report_id" IS DISTINCT FROM OLD."supersedes_report_id"
      OR NEW."correction_reason" IS DISTINCT FROM OLD."correction_reason"
      OR NEW."created_by_actor_type" IS DISTINCT FROM OLD."created_by_actor_type"
      OR NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id"
      OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
      RAISE EXCEPTION 'Report identity, version, correction lineage, and creator evidence are immutable.';
    END IF;

    IF NEW."row_version" <> OLD."row_version" + 1 THEN
      RAISE EXCEPTION 'Report updates must increment row_version exactly once.';
    END IF;

    IF NEW."status" IN ('published', 'superseded') AND NEW."status" IS DISTINCT FROM OLD."status" THEN
      RAISE EXCEPTION 'Report publication and supersession are not enabled by the aggregate foundation migration.';
    END IF;

    IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
      (OLD."status" = 'draft' AND NEW."status" = 'ready_for_review')
      OR (OLD."status" = 'ready_for_review' AND NEW."status" = 'draft')
    ) THEN
      RAISE EXCEPTION 'Illegal report lifecycle transition from % to %.', OLD."status", NEW."status";
    END IF;

    IF OLD."status" <> 'draft' AND (
      NEW."snapshot_canonical_text" IS DISTINCT FROM OLD."snapshot_canonical_text"
      OR NEW."snapshot_sha256" IS DISTINCT FROM OLD."snapshot_sha256"
      OR NEW."fact_projection_sha256" IS DISTINCT FROM OLD."fact_projection_sha256"
      OR NEW."schema_version" IS DISTINCT FROM OLD."schema_version"
      OR NEW."assembler_version" IS DISTINCT FROM OLD."assembler_version"
      OR NEW."eligibility_policy_version" IS DISTINCT FROM OLD."eligibility_policy_version"
      OR NEW."action_selection_policy_version" IS DISTINCT FROM OLD."action_selection_policy_version"
      OR NEW."narrative_policy_version" IS DISTINCT FROM OLD."narrative_policy_version"
      OR NEW."template_version" IS DISTINCT FROM OLD."template_version"
      OR NEW."narrative_mode" IS DISTINCT FROM OLD."narrative_mode"
      OR NEW."source_generation_run_id" IS DISTINCT FROM OLD."source_generation_run_id"
      OR NEW."source_agent_run_id" IS DISTINCT FROM OLD."source_agent_run_id"
    ) THEN
      RAISE EXCEPTION 'Reviewed and published report semantics are immutable.';
    END IF;

    IF OLD."status" = 'draft' AND NEW."status" <> 'draft' AND (
      NEW."snapshot_canonical_text" IS DISTINCT FROM OLD."snapshot_canonical_text"
      OR NEW."snapshot_sha256" IS DISTINCT FROM OLD."snapshot_sha256"
      OR NEW."fact_projection_sha256" IS DISTINCT FROM OLD."fact_projection_sha256"
      OR NEW."source_generation_run_id" IS DISTINCT FROM OLD."source_generation_run_id"
      OR NEW."source_agent_run_id" IS DISTINCT FROM OLD."source_agent_run_id"
    ) THEN
      RAISE EXCEPTION 'Submitting a report for review cannot change its semantic snapshot.';
    END IF;

    IF OLD."status" = 'draft' AND NEW."status" = 'ready_for_review' THEN
      snapshot_json := NEW."snapshot_canonical_text"::jsonb;
      IF snapshot_json->>'factProjectionSha256' <> NEW."fact_projection_sha256" THEN
        RAISE EXCEPTION 'Report fact projection digest must match the canonical snapshot before review.';
      END IF;

      expected_claim_count := jsonb_array_length(snapshot_json #> '{factProjection,claims}');
      expected_evidence_count := jsonb_array_length(snapshot_json #> '{factProjection,evidence}');
      SELECT count(*) INTO persisted_claim_count FROM "report_claims" WHERE "report_id" = NEW."id";
      SELECT count(*) INTO persisted_evidence_count FROM "report_evidence_items" WHERE "report_id" = NEW."id";
      SELECT coalesce(jsonb_agg("claim_json" ORDER BY "ordinal"), '[]'::jsonb)
        INTO persisted_claims_json
        FROM "report_claims"
        WHERE "report_id" = NEW."id";
      SELECT coalesce(jsonb_agg("evidence_json" ORDER BY "evidence_key" COLLATE "C"), '[]'::jsonb)
        INTO persisted_evidence_json
        FROM "report_evidence_items"
        WHERE "report_id" = NEW."id";
      SELECT coalesce(sum(jsonb_array_length("claim_json"->'evidenceKeys')), 0)
        INTO expected_link_count
        FROM "report_claims"
        WHERE "report_id" = NEW."id";
      SELECT count(*) INTO persisted_link_count FROM "report_claim_evidence" WHERE "report_id" = NEW."id";
      SELECT EXISTS (
        SELECT 1
        FROM "report_claims" claim
        WHERE claim."report_id" = NEW."id"
          AND coalesce(
            (
              SELECT jsonb_agg(evidence."evidence_key" ORDER BY evidence."evidence_key" COLLATE "C")
              FROM "report_claim_evidence" link
              INNER JOIN "report_evidence_items" evidence ON evidence."id" = link."evidence_id"
              WHERE link."report_id" = NEW."id" AND link."claim_id" = claim."id"
            ),
            '[]'::jsonb
          ) IS DISTINCT FROM claim."claim_json"->'evidenceKeys'
      ) INTO link_projection_mismatch;

      IF expected_claim_count <> persisted_claim_count
        OR expected_evidence_count <> persisted_evidence_count
        OR expected_link_count <> persisted_link_count
        OR persisted_claims_json IS DISTINCT FROM snapshot_json #> '{factProjection,claims}'
        OR persisted_evidence_json IS DISTINCT FROM snapshot_json #> '{factProjection,evidence}'
        OR link_projection_mismatch THEN
        RAISE EXCEPTION 'Report normalized provenance must match the exact canonical snapshot before review.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
