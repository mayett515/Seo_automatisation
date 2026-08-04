import { sql } from "drizzle-orm";
import type { DatabaseClient } from "./client.js";

type ReleaseLifecycleClient = Pick<DatabaseClient, "execute">;

export async function demoteReleaseCandidatePageVersionsForPlan(
  db: ReleaseLifecycleClient,
  input: { projectId: string; releasePlanId: string; updatedAt: Date }
): Promise<void> {
  await db.execute(sql`
    WITH "locked_page_versions" AS MATERIALIZED (
      SELECT pv."id"
      FROM "page_versions" pv
      INNER JOIN "release_plan_items" rpi ON rpi."page_version_id" = pv."id"
      INNER JOIN "release_plans" rp ON rp."id" = rpi."release_plan_id"
      WHERE rpi."release_plan_id" = ${input.releasePlanId}
        AND rp."project_id" = ${input.projectId}
        AND pv."status" = 'release_candidate'
      ORDER BY pv."id"
      FOR UPDATE OF pv
    )
    UPDATE "page_versions" pv
    SET "status" = 'approved',
        "updated_at" = ${input.updatedAt.toISOString()}::timestamptz
    FROM "locked_page_versions" locked
    WHERE pv."id" = locked."id"
  `);
}
