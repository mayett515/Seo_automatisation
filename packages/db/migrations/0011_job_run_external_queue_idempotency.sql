WITH ranked_job_runs AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "external_job_id", "queue_name"
      ORDER BY "created_at" ASC, "id" ASC
    ) AS "duplicate_rank"
  FROM "job_runs"
  WHERE "external_job_id" IS NOT NULL
    AND "queue_name" IS NOT NULL
)
UPDATE "job_runs"
SET "external_job_id" = "job_runs"."external_job_id" || ':duplicate:' || "job_runs"."id"::text
WHERE "job_runs"."id" IN (
  SELECT "id"
  FROM ranked_job_runs
  WHERE "duplicate_rank" > 1
);

CREATE UNIQUE INDEX "job_runs_external_queue_idx" ON "job_runs" USING btree ("external_job_id","queue_name");
