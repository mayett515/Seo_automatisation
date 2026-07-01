WITH ranked_rollback_points AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "release_plan_id", "deployment_id", "provider_deploy_id"
      ORDER BY "created_at" ASC, "id" ASC
    ) AS "duplicate_rank"
  FROM "rollback_points"
  WHERE "deployment_id" IS NOT NULL
    AND "provider_deploy_id" IS NOT NULL
)
DELETE FROM "rollback_points"
WHERE "rollback_points"."id" IN (
  SELECT "id"
  FROM ranked_rollback_points
  WHERE "duplicate_rank" > 1
);

CREATE UNIQUE INDEX "rollback_points_release_source_idx" ON "rollback_points" USING btree ("release_plan_id","deployment_id","provider_deploy_id");
