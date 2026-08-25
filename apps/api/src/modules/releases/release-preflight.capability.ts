import type { MediaAssetStoragePort } from "@localseo/adapters";
import { BadRequestException, ConflictException, ServiceUnavailableException } from "@nestjs/common";
import { type ReleaseCheck } from "@localseo/contracts";
import { decideReleaseReadiness } from "@localseo/domain";
import { buildReleasePreflightChecks } from "@localseo/seo";
import { approvals, pageVersions, releasePlans, releasePlanItems } from "@localseo/db";
import { and, eq, inArray, isNotNull, sql } from "@localseo/db/query";
import { isPersistedId } from "../../persisted-id.js";
import { DatabaseService } from "../../database/database.service.js";
import {
  approvableReleaseStatusSet,
  approvableReleaseStatuses,
  loadReleaseChecks,
  loadPreparedReleasePreflightEvidence,
  loadReleasePlanForProject,
  lockReleasePlan,
  persistReleasePreflight,
  preflightableReleasePlanStatusSet
} from "./release-aggregate-store.js";

export class ReleasePreflightCapability {
  constructor(
    private readonly database: DatabaseService,
    private readonly mediaStorage: Pick<MediaAssetStoragePort, "readPrivateObject">
  ) {}

  async preflight(
    projectId: string,
    releasePlanId: string
  ): Promise<{
    projectId: string;
    releasePlanId: string;
    readiness: string;
    checks: ReleaseCheck[];
  }> {
    const db = this.database.db;

    if (!isPersistedId(releasePlanId)) {
      throw new BadRequestException("Release plan id must be a UUID.");
    }

    if (!db) {
      throw new ServiceUnavailableException("Release persistence is required to run release preflight.");
    }

    const plan = await loadReleasePlanForProject(db, projectId, releasePlanId);

    if (!preflightableReleasePlanStatusSet.has(plan.status)) {
      throw new BadRequestException("Release plan is not in a preflightable state.");
    }

    const evidence = await loadPreparedReleasePreflightEvidence(db, this.mediaStorage, projectId, releasePlanId);
    const checks = buildReleasePreflightChecks(evidence);
    const readiness = decideReleaseReadiness(checks);

    await persistReleasePreflight(db, {
      projectId,
      releasePlanId,
      checks,
      readiness: readiness.kind,
      checkedAt: new Date()
    });

    return {
      projectId,
      releasePlanId,
      readiness: readiness.kind,
      checks
    };
  }

  async approveDeploy(projectId: string, releasePlanId: string, userId?: string) {
    const db = this.database.db;

    if (!db) {
      throw new ServiceUnavailableException("Release persistence is required to approve release deploys.");
    }

    if (!isPersistedId(releasePlanId)) {
      throw new BadRequestException("Release deploy approval requires a persisted release plan id.");
    }

    if (!userId || !isPersistedId(userId)) {
      throw new BadRequestException("Release deploy approval requires an authenticated persisted user id.");
    }

    const approvedAt = new Date();

    await db.transaction(async (tx) => {
      const plan = await lockReleasePlan(tx, projectId, releasePlanId);

      if (!approvableReleaseStatusSet.has(plan.status)) {
        throw new ConflictException("Release plan is not in an approvable state.");
      }

      const checks = await loadReleaseChecks(tx, releasePlanId);

      if (checks.length === 0 || decideReleaseReadiness(checks).kind === "blocked") {
        throw new BadRequestException("Release preflight must pass before approval.");
      }

      const [approvedPlan] = await tx
        .update(releasePlans)
        .set({
          status: "approved_for_deploy",
          approvedAt,
          updatedAt: approvedAt
        })
        .where(
          and(
            eq(releasePlans.id, releasePlanId),
            eq(releasePlans.projectId, projectId),
            inArray(releasePlans.status, approvableReleaseStatuses)
          )
        )
        .returning({ id: releasePlans.id });

      if (!approvedPlan) {
        throw new ConflictException("Release plan is not in an approvable state.");
      }

      await tx.insert(approvals).values({
        releasePlanId,
        userId,
        status: "approved",
        decidedAt: approvedAt
      });

      const releaseItemRows = await tx
        .select({ pageVersionId: releasePlanItems.pageVersionId })
        .from(releasePlanItems)
        .where(and(eq(releasePlanItems.releasePlanId, releasePlanId), isNotNull(releasePlanItems.pageVersionId)));
      const releasePageVersionIds = [
        ...new Set(
          releaseItemRows
            .map((row) => row.pageVersionId)
            .filter((pageVersionId): pageVersionId is string => Boolean(pageVersionId))
        )
      ].sort();

      if (releasePageVersionIds.length > 0) {
        for (const pageVersionId of releasePageVersionIds) {
          await tx.execute(sql`SELECT "id" FROM "page_versions" WHERE "id" = ${pageVersionId} FOR UPDATE`);
        }

        await tx
          .update(pageVersions)
          .set({
            status: "release_candidate",
            updatedAt: approvedAt
          })
          .where(and(inArray(pageVersions.id, releasePageVersionIds), eq(pageVersions.status, "approved")));
      }
    });

    return {
      projectId,
      releasePlanId,
      status: "approved_for_deploy",
      approvedAt: approvedAt.toISOString()
    };
  }
}
