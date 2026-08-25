import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { MediaAssetStoragePort } from "@localseo/adapters";
import {
  ReleaseCheckSchema,
  ReleaseItemActionSchema,
  ReleasePlanSchema,
  PageJsonSchema,
  type DeploymentStatus,
  type PageJson,
  type ReleaseCheck,
  type ReleasePlan,
  type ReleaseVerificationStatus
} from "@localseo/contracts";
import { type DeployDecision } from "@localseo/domain";
import { type ReleasePreflightEvidence } from "@localseo/seo";
import {
  approvals,
  demoteReleaseCandidatePageVersionsForPlan,
  deployments,
  pageProposals,
  pageVersions,
  projectTrackingKeys,
  releaseChecks,
  releasePlanItems,
  releasePlans,
  releaseVerificationChecks,
  releaseVerifications,
  rollbackPoints,
  type DatabaseClient
} from "@localseo/db";
import { and, desc, eq, inArray, isNotNull, isNull, ne, not, sql } from "@localseo/db/query";
import { isPersistedId } from "../../persisted-id.js";
import {
  loadPreviewMediaManifests,
  verifyPreviewMediaManifestsBytes,
  type PreviewMediaManifest
} from "../../preview-media.js";

export type Db = DatabaseClient;
export type DatabaseTransaction = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];

export const approvableReleaseStatuses = ["ready", "ready_with_warnings"] as const satisfies ReleasePlan["status"][];
export const approvableReleaseStatusSet = new Set<ReleasePlan["status"]>(approvableReleaseStatuses);
export const preflightableReleasePlanStatuses = [
  "draft",
  "ready",
  "ready_with_warnings",
  "blocked",
  "approved_for_deploy"
] as const satisfies ReleasePlan["status"][];
export const preflightableReleasePlanStatusSet = new Set<ReleasePlan["status"]>(preflightableReleasePlanStatuses);
export const cancellableReleasePlanStatuses = [
  "draft",
  "ready",
  "ready_with_warnings",
  "blocked",
  "approved_for_deploy"
] as const satisfies ReleasePlan["status"][];
export const activeReleasePlanStatuses = [
  "draft",
  "ready",
  "ready_with_warnings",
  "blocked",
  "approved_for_deploy",
  "deploying",
  "live"
] as const satisfies ReleasePlan["status"][];
const rollbackVerifiedSourceDeploymentStatuses = [
  "live_healthy",
  "live_with_warnings"
] as const satisfies DeploymentStatus[];
const rollbackFallbackSourceDeploymentStatuses = ["provider_succeeded"] as const satisfies DeploymentStatus[];
const rollbackSourceDeploymentStatuses = [
  "provider_succeeded",
  "live_healthy",
  "live_with_warnings"
] as const satisfies DeploymentStatus[];
export const rollbackExecutionReadyStatuses = [
  "provider_succeeded",
  "live_healthy",
  "live_with_warnings",
  "rollback_recommended",
  "failed"
] as const satisfies DeploymentStatus[];

export function mapReleasePlan(plan: typeof releasePlans.$inferSelect): ReleasePlan {
  return ReleasePlanSchema.parse({
    releasePlanId: plan.id,
    projectId: plan.projectId,
    status: plan.status,
    riskLevel: plan.riskLevel,
    blockerCount: plan.blockerCount,
    warningCount: plan.warningCount
  });
}

export function rollbackJobId(releasePlanId: string, rollbackPointId: string): string {
  return `rollback:${releasePlanId}:${rollbackPointId}`;
}

export function normalizeRelativeReleaseTargetRoute(targetUrl: string): string {
  const trimmed = targetUrl.trim();

  if (
    trimmed.length === 0 ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\") ||
    /^[a-z][a-z\d+\-.]*:/iu.test(trimmed)
  ) {
    throw new BadRequestException("Release verification target routes must be relative paths.");
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function normalizeQueueFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "queue_enqueue_failed";
  return message.slice(0, 500);
}

// Returns the narrowed handle: callers need the persistence check AND the
// non-undefined type, and one owner for both keeps a "no database" branch
// from reappearing downstream with a different answer.
export async function assertReleasePlanForProject(
  db: Db | undefined,
  projectId: string,
  releasePlanId: string
): Promise<Db> {
  if (!isPersistedId(releasePlanId)) {
    throw new BadRequestException("Release plan id must be a UUID.");
  }

  if (!db) {
    throw new ServiceUnavailableException("Release persistence is required for persisted release plans.");
  }

  await loadReleasePlanForProject(db, projectId, releasePlanId);
  return db;
}

export async function loadReleasePlanForProject(
  db: Db,
  projectId: string,
  releasePlanId: string
): Promise<typeof releasePlans.$inferSelect> {
  const [plan] = await db
    .select()
    .from(releasePlans)
    .where(and(eq(releasePlans.id, releasePlanId), eq(releasePlans.projectId, projectId)))
    .limit(1);

  if (!plan) {
    throw new NotFoundException("Release plan was not found for this project.");
  }

  return plan;
}

export async function lockReleasePlan(
  tx: DatabaseTransaction,
  projectId: string,
  releasePlanId: string
): Promise<typeof releasePlans.$inferSelect> {
  await tx.execute(
    sql`SELECT "id" FROM "release_plans" WHERE "id" = ${releasePlanId} AND "project_id" = ${projectId} FOR UPDATE`
  );

  const [plan] = await tx
    .select()
    .from(releasePlans)
    .where(and(eq(releasePlans.id, releasePlanId), eq(releasePlans.projectId, projectId)))
    .limit(1);

  if (!plan) {
    throw new NotFoundException("Release plan was not found for this project.");
  }

  return plan;
}

export async function loadReleaseChecks(db: Db | DatabaseTransaction, releasePlanId: string): Promise<ReleaseCheck[]> {
  const rows = await db.select().from(releaseChecks).where(eq(releaseChecks.releasePlanId, releasePlanId));

  return rows.map((row) =>
    ReleaseCheckSchema.parse({
      checkKey: row.checkKey,
      scope: row.scope,
      severity: row.severity,
      result: row.result,
      message: row.message,
      evidence: row.evidenceJson ?? undefined
    })
  );
}

export async function hasApprovedRelease(db: Db, releasePlanId: string): Promise<boolean> {
  const [approval] = await db
    .select({ id: approvals.id })
    .from(approvals)
    .where(and(eq(approvals.releasePlanId, releasePlanId), eq(approvals.status, "approved")))
    .limit(1);

  return Boolean(approval);
}

export async function persistReleasePreflight(
  db: Db,
  input: {
    projectId: string;
    releasePlanId: string;
    checks: ReleaseCheck[];
    readiness: DeployDecision["kind"];
    checkedAt: Date;
  }
): Promise<void> {
  await db.transaction(async (tx) => {
    const plan = await lockReleasePlan(tx, input.projectId, input.releasePlanId);

    if (!preflightableReleasePlanStatusSet.has(plan.status)) {
      throw new ConflictException("Release plan is not in a preflightable state.");
    }

    await tx.delete(releaseChecks).where(eq(releaseChecks.releasePlanId, input.releasePlanId));

    if (input.checks.length > 0) {
      await tx.insert(releaseChecks).values(
        input.checks.map((check) => ({
          releasePlanId: input.releasePlanId,
          checkKey: check.checkKey,
          scope: check.scope,
          severity: check.severity,
          result: check.result,
          message: check.message,
          evidenceJson: check.evidence
        }))
      );
    }

    const [updatedPlan] = await tx
      .update(releasePlans)
      .set({
        status: input.readiness,
        blockerCount: input.checks.filter((check) => check.severity === "blocker" && check.result === "failed").length,
        warningCount: input.checks.filter((check) => check.severity === "warning" && check.result === "failed").length,
        updatedAt: input.checkedAt
      })
      .where(
        and(
          eq(releasePlans.id, input.releasePlanId),
          eq(releasePlans.projectId, input.projectId),
          inArray(releasePlans.status, preflightableReleasePlanStatuses)
        )
      )
      .returning({ id: releasePlans.id });

    if (!updatedPlan) {
      throw new ConflictException("Release plan is not in a preflightable state.");
    }

    if (plan.status === "approved_for_deploy") {
      await demoteReleaseCandidatePageVersionsForPlan(tx, {
        projectId: input.projectId,
        releasePlanId: input.releasePlanId,
        updatedAt: input.checkedAt
      });
    }
  });
}

export async function loadPreparedReleasePreflightEvidence(
  db: Db,
  mediaStorage: Pick<MediaAssetStoragePort, "readPrivateObject">,
  projectId: string,
  releasePlanId: string
): Promise<ReleasePreflightEvidence> {
  await prepareRollbackPointForReleasePreflight(db, projectId, releasePlanId);
  return loadReleasePreflightEvidence(db, mediaStorage, projectId, releasePlanId);
}

export async function loadRollbackPointForRelease(
  db: Db,
  projectId: string,
  releasePlanId: string,
  rollbackPointId: string
): Promise<typeof rollbackPoints.$inferSelect> {
  const [rollbackPoint] = await db
    .select()
    .from(rollbackPoints)
    .where(
      and(
        eq(rollbackPoints.id, rollbackPointId),
        eq(rollbackPoints.projectId, projectId),
        eq(rollbackPoints.releasePlanId, releasePlanId)
      )
    )
    .limit(1);

  if (!rollbackPoint) {
    throw new BadRequestException("Rollback point is not available for this release plan.");
  }

  if (!rollbackPoint.providerDeployId) {
    throw new BadRequestException("Rollback point is missing provider deploy evidence.");
  }

  return rollbackPoint;
}

export async function loadDeploymentForRollbackExecution(
  db: Db,
  projectId: string,
  releasePlanId: string
): Promise<typeof deployments.$inferSelect> {
  const [deployment] = await db
    .select()
    .from(deployments)
    .where(
      and(
        eq(deployments.projectId, projectId),
        eq(deployments.releasePlanId, releasePlanId),
        isNotNull(deployments.providerDeployId),
        inArray(deployments.status, rollbackExecutionReadyStatuses)
      )
    )
    .orderBy(desc(deployments.updatedAt))
    .limit(1);

  if (!deployment) {
    throw new BadRequestException("No rollback-eligible deployment is available for this release plan.");
  }

  // ADR 0009: manual reconciliation is a terminal stop sign for automation.
  // The worker would fail this rollback closed; refuse it upfront instead.
  if (deployment.providerOperationStatus === "manual_reconciliation_required") {
    throw new ConflictException(
      "Deployment provider state requires manual reconciliation before rollback can be executed."
    );
  }

  return deployment;
}

export async function loadReleasePlanForRollbackExecution(
  db: Db,
  projectId: string,
  releasePlanId: string
): Promise<typeof releasePlans.$inferSelect> {
  const [releasePlan] = await db
    .select()
    .from(releasePlans)
    .where(
      and(eq(releasePlans.id, releasePlanId), eq(releasePlans.projectId, projectId), eq(releasePlans.status, "failed"))
    )
    .limit(1);

  if (!releasePlan) {
    throw new BadRequestException("Release plan is not eligible for rollback execution.");
  }

  return releasePlan;
}

export async function loadDeploymentForVerification(
  db: Db,
  projectId: string,
  releasePlanId: string,
  deploymentId?: string
): Promise<typeof deployments.$inferSelect> {
  const verificationReadyStatuses = [
    "provider_succeeded",
    "verifying",
    "live_healthy",
    "live_with_warnings",
    "rollback_recommended"
  ] as const satisfies DeploymentStatus[];

  const filters = [
    eq(deployments.projectId, projectId),
    eq(deployments.releasePlanId, releasePlanId),
    inArray(deployments.status, verificationReadyStatuses)
  ];

  if (deploymentId) {
    if (!isPersistedId(deploymentId)) {
      throw new BadRequestException("Deployment id must be a UUID.");
    }

    filters.push(eq(deployments.id, deploymentId));
  }

  const [deployment] = await db
    .select()
    .from(deployments)
    .where(and(...filters))
    .orderBy(desc(deployments.updatedAt))
    .limit(1);

  if (!deployment) {
    throw new BadRequestException("No provider-succeeded deployment is available for verification.");
  }

  return deployment;
}

export async function findActiveReleaseVerification(db: Db, deploymentId: string) {
  const [row] = await db
    .select()
    .from(releaseVerifications)
    .where(and(eq(releaseVerifications.deploymentId, deploymentId), eq(releaseVerifications.status, "running")))
    .limit(1);

  return row;
}

export async function markReleaseVerificationQueueFailure(
  db: Db,
  verificationId: string,
  message: string
): Promise<void> {
  const checkedAt = new Date();

  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(releaseVerifications)
      .set({
        status: "execution_failed",
        summary: "Post-deploy verification could not be queued.",
        checkedAt,
        evidenceJson: {
          source: "release_verify_endpoint",
          queueFailure: { message }
        },
        updatedAt: new Date()
      })
      .where(and(eq(releaseVerifications.id, verificationId), eq(releaseVerifications.status, "running")))
      .returning({ id: releaseVerifications.id });

    if (!updated) {
      return;
    }

    await tx.insert(releaseVerificationChecks).values({
      verificationId,
      checkKey: "verification_queue_check",
      scope: "project",
      severity: "warning",
      result: "failed",
      message: "Post-deploy verification could not be queued.",
      evidenceJson: {
        queueFailure: { message }
      },
      checkedAt
    });
  });
}

export async function assertReleasePagesMediaAvailable(
  db: Pick<DatabaseClient, "select">,
  storage: Pick<MediaAssetStoragePort, "readPrivateObject">,
  projectId: string,
  pages: readonly { pageVersionId: string; pageJson: unknown }[]
): Promise<Map<string, string>> {
  const parsedPages = parseReleasePageJsons(pages);

  try {
    const manifests = await loadPreviewMediaManifests(db, projectId, parsedPages);
    await verifyPreviewMediaManifestsBytes(storage, manifests.values());
    return new Map([...manifests.entries()].map(([pageVersionId, manifest]) => [pageVersionId, manifest.sha256]));
  } catch (error) {
    throw new BadRequestException(
      "Release page media references are unavailable or do not match the immutable project manifest.",
      { cause: error }
    );
  }
}

export async function assertReleasePagesMediaManifestUnchanged(
  db: Pick<DatabaseClient, "select">,
  projectId: string,
  pages: readonly { pageVersionId: string; pageJson: unknown }[],
  verifiedManifestSha256ByPageVersionId: ReadonlyMap<string, string>
): Promise<void> {
  const parsedPages = parseReleasePageJsons(pages);

  let manifests: Map<string, PreviewMediaManifest>;
  try {
    manifests = await loadPreviewMediaManifests(db, projectId, parsedPages);
  } catch (error) {
    throw new BadRequestException(
      "Release page media references are unavailable or do not match the immutable project manifest.",
      { cause: error }
    );
  }

  for (const page of parsedPages) {
    const currentManifestSha256 = manifests.get(page.pageVersionId)?.sha256;
    const verifiedManifestSha256 = verifiedManifestSha256ByPageVersionId.get(page.pageVersionId);
    if (!verifiedManifestSha256 || currentManifestSha256 !== verifiedManifestSha256) {
      throw new BadRequestException(
        "Release page media references are unavailable or do not match the immutable project manifest."
      );
    }
  }
}

function parseReleasePageJsons(
  pages: readonly { pageVersionId: string; pageJson: unknown }[]
): { pageVersionId: string; pageJson: PageJson }[] {
  return pages.map((page) => {
    const pageJson = PageJsonSchema.safeParse(page.pageJson);
    if (!pageJson.success) {
      throw new BadRequestException("Release page version does not contain valid PageJson.");
    }
    return { pageVersionId: page.pageVersionId, pageJson: pageJson.data };
  });
}

async function assertReleasePageMediaAvailable(
  db: Pick<DatabaseClient, "select">,
  storage: Pick<MediaAssetStoragePort, "readPrivateObject">,
  projectId: string,
  pageVersionId: string,
  pageJsonInput: unknown
): Promise<string> {
  const hashes = await assertReleasePagesMediaAvailable(db, storage, projectId, [
    { pageVersionId, pageJson: pageJsonInput }
  ]);
  const sha256 = hashes.get(pageVersionId);
  if (!sha256) {
    throw new BadRequestException(
      "Release page media references are unavailable or do not match the immutable project manifest."
    );
  }
  return sha256;
}

async function loadReleasePreflightEvidence(
  db: Db,
  mediaStorage: Pick<MediaAssetStoragePort, "readPrivateObject">,
  projectId: string,
  releasePlanId: string
): Promise<ReleasePreflightEvidence> {
  const pageRows = await db
    .select({
      pageVersionId: releasePlanItems.pageVersionId,
      action: releasePlanItems.action,
      targetUrl: releasePlanItems.targetUrl,
      approvedAt: pageVersions.approvedAt,
      pageJson: pageVersions.pageJson,
      sitemapReady: pageProposals.sitemapReady,
      uniquenessRationale: pageProposals.uniquenessRationale
    })
    .from(releasePlanItems)
    .leftJoin(pageVersions, eq(releasePlanItems.pageVersionId, pageVersions.id))
    .leftJoin(pageProposals, eq(pageVersions.pageProposalId, pageProposals.id))
    .where(eq(releasePlanItems.releasePlanId, releasePlanId));
  const rollbackRows = await db
    .select({ id: rollbackPoints.id })
    .from(rollbackPoints)
    .where(
      and(
        eq(rollbackPoints.projectId, projectId),
        eq(rollbackPoints.releasePlanId, releasePlanId),
        isNotNull(rollbackPoints.providerDeployId)
      )
    );
  const priorDeploymentRows = await db
    .select({ id: deployments.id })
    .from(deployments)
    .where(
      and(
        eq(deployments.projectId, projectId),
        ne(deployments.releasePlanId, releasePlanId),
        inArray(deployments.status, rollbackSourceDeploymentStatuses)
      )
    );
  const activeTrackingKeyRows = await db
    .select({
      id: projectTrackingKeys.id,
      allowedOrigins: projectTrackingKeys.allowedOrigins
    })
    .from(projectTrackingKeys)
    .where(
      and(
        eq(projectTrackingKeys.projectId, projectId),
        eq(projectTrackingKeys.status, "active"),
        isNull(projectTrackingKeys.revokedAt)
      )
    );

  return {
    pages: await Promise.all(
      pageRows.map(async (row) => {
        const action = ReleaseItemActionSchema.parse(row.action);
        let mediaManifestValid = action !== "create" && action !== "update";

        if (row.pageVersionId && row.pageJson && (action === "create" || action === "update")) {
          try {
            await assertReleasePageMediaAvailable(db, mediaStorage, projectId, row.pageVersionId, row.pageJson);
            mediaManifestValid = true;
          } catch {
            mediaManifestValid = false;
          }
        }

        return {
          pageVersionId: row.pageVersionId,
          action,
          targetUrl: row.targetUrl,
          approvedAt: row.approvedAt,
          pageJson: row.pageJson,
          mediaManifestValid,
          sitemapReady: row.sitemapReady ?? false,
          uniquenessRationale: row.uniquenessRationale ?? null
        };
      })
    ),
    rollbackPointCount: rollbackRows.length,
    priorSuccessfulDeploymentCount: priorDeploymentRows.length,
    usableTrackingKeyCount: activeTrackingKeyRows.filter((row) => hasUsableTrackingOrigins(row.allowedOrigins)).length
  };
}

async function prepareRollbackPointForReleasePreflight(
  db: Db,
  projectId: string,
  releasePlanId: string
): Promise<void> {
  const [existingRollbackPoint] = await db
    .select({ id: rollbackPoints.id })
    .from(rollbackPoints)
    .where(
      and(
        eq(rollbackPoints.projectId, projectId),
        eq(rollbackPoints.releasePlanId, releasePlanId),
        isNotNull(rollbackPoints.providerDeployId)
      )
    )
    .limit(1);

  if (existingRollbackPoint) {
    return;
  }

  const sourceDeployment =
    (await loadRollbackSourceDeployment(db, projectId, releasePlanId, rollbackVerifiedSourceDeploymentStatuses)) ??
    (await loadRollbackSourceDeployment(db, projectId, releasePlanId, rollbackFallbackSourceDeploymentStatuses));

  if (!sourceDeployment?.providerDeployId) {
    return;
  }

  const preparedAt = new Date();

  await db
    .insert(rollbackPoints)
    .values({
      projectId,
      releasePlanId,
      deploymentId: sourceDeployment.id,
      artifactKey: `rollback/${releasePlanId}/${sourceDeployment.id}.json`,
      providerDeployId: sourceDeployment.providerDeployId,
      liveUrl: sourceDeployment.liveUrl,
      evidenceJson: {
        source: "release_preflight_rollback_point_preparation",
        preparedAt: preparedAt.toISOString(),
        sourceDeploymentId: sourceDeployment.id,
        sourceReleasePlanId: sourceDeployment.releasePlanId,
        sourceDeploymentKey: sourceDeployment.deploymentKey,
        sourceDeploymentStatus: sourceDeployment.status,
        sourceVerificationStatus: sourceDeployment.verificationStatus
      }
    })
    .onConflictDoNothing({
      target: [rollbackPoints.releasePlanId, rollbackPoints.deploymentId, rollbackPoints.providerDeployId]
    });
}

async function loadRollbackSourceDeployment(
  db: Db,
  projectId: string,
  releasePlanId: string,
  statuses: readonly DeploymentStatus[]
): Promise<
  | {
      id: string;
      releasePlanId: string | null;
      deploymentKey: string;
      providerDeployId: string | null;
      liveUrl: string | null;
      status: DeploymentStatus;
      verificationStatus: ReleaseVerificationStatus;
    }
  | undefined
> {
  const [sourceDeployment] = await db
    .select({
      id: deployments.id,
      releasePlanId: deployments.releasePlanId,
      deploymentKey: deployments.deploymentKey,
      providerDeployId: deployments.providerDeployId,
      liveUrl: deployments.liveUrl,
      status: deployments.status,
      verificationStatus: deployments.verificationStatus
    })
    .from(deployments)
    .where(
      and(
        eq(deployments.projectId, projectId),
        ne(deployments.releasePlanId, releasePlanId),
        isNotNull(deployments.providerDeployId),
        // ADR 0009: manual reconciliation outranks a recorded providerDeployId,
        // so a stranded deployment is never a rollback source.
        not(eq(deployments.providerOperationStatus, "manual_reconciliation_required")),
        inArray(deployments.status, statuses)
      )
    )
    .orderBy(desc(deployments.updatedAt))
    .limit(1);

  return sourceDeployment;
}

function hasUsableTrackingOrigins(allowedOrigins: string[]): boolean {
  return allowedOrigins.some((origin) => {
    try {
      const parsed = new URL(origin);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  });
}
