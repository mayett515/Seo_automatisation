import { randomUUID } from "node:crypto";
import type { MediaAssetStoragePort } from "@localseo/adapters";
import { BadRequestException, ConflictException, ServiceUnavailableException } from "@nestjs/common";
import { CreateReleasePlanRequestSchema, type ReleasePlan } from "@localseo/contracts";
import { decideReleasePlanTargetAdmission } from "@localseo/domain";
import {
  approvals,
  demoteReleaseCandidatePageVersionsForPlan,
  pageVersionProjectScope,
  pageProposals,
  pageVersions,
  releasePlanItems,
  releasePlans
} from "@localseo/db";
import { and, eq, inArray, sql } from "@localseo/db/query";
import { isPersistedId } from "../../persisted-id.js";
import { DatabaseService } from "../../database/database.service.js";
import {
  activeReleasePlanStatuses,
  assertReleasePagesMediaAvailable,
  assertReleasePagesMediaManifestUnchanged,
  cancellableReleasePlanStatuses,
  mapReleasePlan,
  normalizeRelativeReleaseTargetRoute
} from "./release-aggregate-store.js";

export class ReleasePlanningCapability {
  constructor(
    private readonly database: DatabaseService,
    private readonly mediaStorage: Pick<MediaAssetStoragePort, "readPrivateObject">
  ) {}

  async createPlan(projectId: string, body: unknown, createdByUserId?: string): Promise<ReleasePlan> {
    const parsed = CreateReleasePlanRequestSchema.safeParse(body ?? {});

    if (!parsed.success) {
      throw new BadRequestException(
        "Release plan creation requires unique page-version targets pinned to their expected revisions."
      );
    }

    const input = parsed.data;
    const requestedTargets = input.pageVersions
      .map((target) => ({ ...target, pageVersionId: target.pageVersionId.toLowerCase() }))
      .sort((left, right) =>
        left.pageVersionId < right.pageVersionId ? -1 : left.pageVersionId > right.pageVersionId ? 1 : 0
      );
    const requestedPageVersionIds = requestedTargets.map((target) => target.pageVersionId);
    const expectedTargetByPageVersionId = new Map(
      requestedTargets.map((target) => [target.pageVersionId, target.expected] as const)
    );
    const releasePlanId = randomUUID();
    const db = this.database.db;

    if (!db) {
      throw new ServiceUnavailableException("Release persistence is required to create release plans.");
    }

    if (!isPersistedId(projectId)) {
      throw new BadRequestException("Release plans require a persisted project id.");
    }

    if (!createdByUserId || !isPersistedId(createdByUserId)) {
      throw new BadRequestException("Release plan creation requires an authenticated persisted user id.");
    }

    if (requestedPageVersionIds.some((pageVersionId) => !isPersistedId(pageVersionId))) {
      throw new BadRequestException("Release page version ids must be UUIDs.");
    }

    // Media bytes are verified against storage before any row locks are taken so the
    // transaction never spans network calls. The remaining window is closed by the
    // DB-only manifest hash re-check inside the transaction below.
    const projectScope = pageVersionProjectScope(projectId);
    const preVerificationRows = await db
      .select({ pageVersionId: pageVersions.id, pageJson: pageVersions.pageJson })
      .from(pageVersions)
      .innerJoin(pageProposals, projectScope.joinCondition)
      .where(and(projectScope.projectCondition, inArray(pageVersions.id, requestedPageVersionIds)));

    if (preVerificationRows.length !== requestedPageVersionIds.length) {
      throw new BadRequestException("Every release page version must belong to this project.");
    }

    const verifiedManifestSha256ByPageVersionId = await assertReleasePagesMediaAvailable(
      db,
      this.mediaStorage,
      projectId,
      preVerificationRows
    );

    const insertedPlan = await db.transaction(async (tx) => {
      for (const pageVersionId of requestedPageVersionIds) {
        await tx.execute(sql`
          SELECT pv."id"
          FROM "page_versions" pv
          INNER JOIN "page_proposals" pp ON pv."page_proposal_id" = pp."id"
          WHERE pp."project_id" = ${projectId}
            AND pv."id" = ${pageVersionId}
          FOR UPDATE OF pv
        `);
      }

      const pageVersionRows = await tx
        .select({
          pageVersionId: pageVersions.id,
          pageVersionStatus: pageVersions.status,
          pageVersionRowVersion: pageVersions.rowVersion,
          pageVersionApprovedAt: pageVersions.approvedAt,
          pageJson: pageVersions.pageJson,
          targetUrl: pageProposals.route
        })
        .from(pageVersions)
        .innerJoin(pageProposals, projectScope.joinCondition)
        .where(and(projectScope.projectCondition, inArray(pageVersions.id, requestedPageVersionIds)));

      if (pageVersionRows.length !== requestedPageVersionIds.length) {
        throw new BadRequestException("Every release page version must belong to this project.");
      }

      for (const row of pageVersionRows) {
        const expected = expectedTargetByPageVersionId.get(row.pageVersionId);
        if (!expected) {
          throw new Error("Release plan target admission lost its expected revision.");
        }

        const decision = decideReleasePlanTargetAdmission({
          expected,
          current: {
            status: row.pageVersionStatus,
            rowVersion: row.pageVersionRowVersion,
            hasApprovalEvidence: Boolean(row.pageVersionApprovedAt)
          }
        });

        if (decision.kind === "stale") {
          throw new ConflictException("Page version changed after the release plan request was prepared.");
        }

        if (decision.kind === "deny") {
          switch (decision.reason) {
            case "not_approved":
            case "approval_evidence_missing":
              throw new BadRequestException(
                "Release plans can only include approved page versions with approval evidence."
              );
            default: {
              const exhaustiveReason: never = decision.reason;
              throw new Error(`Unhandled release plan target denial: ${String(exhaustiveReason)}`);
            }
          }
        }
      }

      const validatedPageVersionRows = pageVersionRows.map((row) => ({
        ...row,
        targetUrl: normalizeRelativeReleaseTargetRoute(row.targetUrl)
      }));

      await assertReleasePagesMediaManifestUnchanged(
        tx,
        projectId,
        validatedPageVersionRows,
        verifiedManifestSha256ByPageVersionId
      );

      const activePlanRows = await tx
        .select({
          pageVersionId: releasePlanItems.pageVersionId,
          releasePlanId: releasePlanItems.releasePlanId
        })
        .from(releasePlanItems)
        .innerJoin(releasePlans, eq(releasePlanItems.releasePlanId, releasePlans.id))
        .where(
          and(
            eq(releasePlans.projectId, projectId),
            inArray(releasePlanItems.pageVersionId, requestedPageVersionIds),
            inArray(releasePlans.status, activeReleasePlanStatuses)
          )
        );

      if (activePlanRows.length > 0) {
        throw new BadRequestException(
          "Approved page versions already in an active release plan cannot be planned again."
        );
      }

      const [createdPlan] = await tx
        .insert(releasePlans)
        .values({
          id: releasePlanId,
          projectId,
          createdByUserId,
          status: "draft",
          summary: `Release plan for ${requestedPageVersionIds.length} approved page version(s).`,
          riskLevel: "low",
          blockerCount: 0,
          warningCount: 0
        })
        .returning();

      if (!createdPlan) {
        throw new Error("Failed to persist release plan");
      }

      await tx.insert(releasePlanItems).values(
        validatedPageVersionRows.map((row) => ({
          releasePlanId,
          pageVersionId: row.pageVersionId,
          targetUrl: row.targetUrl,
          action: "create" as const,
          status: "pending"
        }))
      );

      return createdPlan;
    });

    return mapReleasePlan(insertedPlan);
  }

  async cancelPlan(projectId: string, releasePlanId: string, userId?: string): Promise<ReleasePlan> {
    const db = this.database.db;

    if (!db) {
      throw new ServiceUnavailableException("Release persistence is required to cancel release plans.");
    }

    if (!isPersistedId(releasePlanId)) {
      throw new BadRequestException("Release cancellation requires a persisted release plan id.");
    }

    if (!userId || !isPersistedId(userId)) {
      throw new BadRequestException("Release cancellation requires an authenticated persisted user id.");
    }

    const cancelledAt = new Date();

    const cancelledPlan = await db.transaction(async (tx) => {
      const [updatedPlan] = await tx
        .update(releasePlans)
        .set({
          status: "failed",
          updatedAt: cancelledAt
        })
        .where(
          and(
            eq(releasePlans.id, releasePlanId),
            eq(releasePlans.projectId, projectId),
            inArray(releasePlans.status, cancellableReleasePlanStatuses)
          )
        )
        .returning();

      if (!updatedPlan) {
        throw new ConflictException("Release plan is not cancellable.");
      }

      await tx.insert(approvals).values({
        releasePlanId,
        userId,
        status: "rejected",
        decisionNote: "release_plan_cancelled",
        decidedAt: cancelledAt
      });

      await demoteReleaseCandidatePageVersionsForPlan(tx, {
        projectId,
        releasePlanId,
        updatedAt: cancelledAt
      });

      return updatedPlan;
    });

    return mapReleasePlan(cancelledPlan);
  }
}
