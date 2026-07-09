import { sql } from "drizzle-orm";
import type { DatabaseClient } from "./client.js";

type ReleaseLifecycleClient = Pick<DatabaseClient, "execute">;

export async function demoteReleaseCandidatePageVersionsForPlan(
  db: ReleaseLifecycleClient,
  input: { projectId: string; releasePlanId: string; updatedAt: Date }
): Promise<void> {
  await db.execute(sql`
    UPDATE "page_versions" pv
    SET "status" = 'approved',
        "updated_at" = ${input.updatedAt}
    FROM "release_plan_items" rpi
    INNER JOIN "release_plans" rp ON rp."id" = rpi."release_plan_id"
    WHERE rpi."page_version_id" = pv."id"
      AND rpi."release_plan_id" = ${input.releasePlanId}
      AND rp."project_id" = ${input.projectId}
      AND pv."status" = 'release_candidate'
  `);
}
