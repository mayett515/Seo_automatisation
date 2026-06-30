import type { RollbackDeployResult, SiteHostingPort } from "@localseo/adapters";
import {
  RollbackJobDataSchema,
  type DeploymentStatus,
  type ReleasePlanStatus,
  type RollbackJobData
} from "@localseo/contracts";
import { deployments, mainWebsites, releasePlans, rollbackPoints } from "@localseo/db";
import { and, eq, inArray } from "drizzle-orm";
import type { Job } from "bullmq";
import type { WorkerDb, WorkerDbHandle } from "../job-run.js";

type RollbackPlanRow = typeof releasePlans.$inferSelect;
type RollbackPointRow = typeof rollbackPoints.$inferSelect;
type RollbackDeploymentRow = typeof deployments.$inferSelect;

type RollbackContext = {
  plan: RollbackPlanRow;
  rollbackPoint?: RollbackPointRow;
  deployment?: RollbackDeploymentRow;
  hostingSiteId?: string;
};

type RollbackRepository = {
  loadContext(data: RollbackJobData): Promise<RollbackContext | undefined>;
  markRollbackSucceeded(input: {
    data: RollbackJobData;
    rollbackPoint: RollbackPointRow;
    deployment: RollbackDeploymentRow;
    result: RollbackDeployResult;
  }): Promise<RollbackDeploymentRow>;
  recordRollbackAttempt(input: {
    data: RollbackJobData;
    status: "pending" | "failed";
    result?: RollbackDeployResult;
    error?: unknown;
  }): Promise<void>;
};

const rollbackSourceStatuses = [
  "provider_succeeded",
  "live_healthy",
  "live_with_warnings",
  "rollback_recommended",
  "failed"
] as const satisfies DeploymentStatus[];
const rollbackPlanReadyStatuses = ["failed"] as const satisfies ReleasePlanStatus[];

export class RollbackConfigurationError extends Error {}

export class RollbackEvidenceError extends Error {}

export class RollbackProviderFailedError extends Error {}

export async function handleRollbackJob(
  job: Job,
  dbHandle: WorkerDbHandle | undefined,
  siteHosting: SiteHostingPort
): Promise<Record<string, unknown>> {
  const data = parseRollbackJobData(job.data);

  if (!dbHandle) {
    throw new Error("DATABASE_URL is required for rollback jobs");
  }

  return executeRollback({
    data,
    jobId: job.id ?? rollbackJobId(data),
    repository: createDrizzleRollbackRepository(dbHandle.db),
    siteHosting
  });
}

export async function executeRollback(input: {
  data: RollbackJobData;
  jobId: string;
  repository: RollbackRepository;
  siteHosting: SiteHostingPort;
}): Promise<Record<string, unknown>> {
  const context = await input.repository.loadContext(input.data);

  if (!context) {
    throw new RollbackEvidenceError(`Release plan not found for rollback job: ${input.data.releasePlanId}`);
  }

  if (context.plan.status === "rolled_back") {
    return {
      jobId: input.jobId,
      projectId: input.data.projectId,
      releasePlanId: input.data.releasePlanId,
      rollbackPointId: input.data.rollbackPointId,
      status: "already_rolled_back"
    };
  }

  if (context.plan.status !== "failed") {
    throw new RollbackEvidenceError("Release plan is not eligible for rollback execution");
  }

  if (!context.rollbackPoint) {
    throw new RollbackEvidenceError("Rollback point is not available for this release plan");
  }

  if (!context.rollbackPoint.providerDeployId) {
    throw new RollbackEvidenceError("Rollback point is missing provider deploy evidence");
  }

  if (!context.deployment) {
    throw new RollbackEvidenceError("No rollback-eligible deployment is available for this release plan");
  }

  if (!context.deployment.providerDeployId) {
    throw new RollbackEvidenceError("Rollback target deployment is missing provider deploy evidence");
  }

  if (!context.hostingSiteId) {
    throw new RollbackConfigurationError("Project hosting site id is required for rollback execution");
  }

  let result: RollbackDeployResult;

  try {
    result = await input.siteHosting.rollbackDeploy({
      projectId: input.data.projectId,
      releasePlanId: input.data.releasePlanId,
      rollbackPointId: input.data.rollbackPointId,
      hostingSiteId: context.hostingSiteId,
      providerDeployId: context.rollbackPoint.providerDeployId
    });
  } catch (error) {
    await input.repository.recordRollbackAttempt({
      data: input.data,
      status: "failed",
      error
    });
    throw error;
  }

  if (result.status === "completed") {
    let deployment: RollbackDeploymentRow;

    try {
      deployment = await input.repository.markRollbackSucceeded({
        data: input.data,
        rollbackPoint: context.rollbackPoint,
        deployment: context.deployment,
        result
      });
    } catch (error) {
      await input.repository.recordRollbackAttempt({
        data: input.data,
        status: "failed",
        result,
        error
      });
      throw error;
    }

    return {
      jobId: input.jobId,
      projectId: input.data.projectId,
      releasePlanId: input.data.releasePlanId,
      deploymentId: deployment.id,
      rollbackPointId: input.data.rollbackPointId,
      providerDeployId: result.providerDeployId ?? context.rollbackPoint.providerDeployId,
      status: "rolled_back",
      liveUrl: result.liveUrl ?? context.rollbackPoint.liveUrl ?? undefined
    };
  }

  await input.repository.recordRollbackAttempt({
    data: input.data,
    status: result.status === "queued" ? "pending" : "failed",
    result
  });

  if (result.status === "queued") {
    return {
      jobId: input.jobId,
      projectId: input.data.projectId,
      releasePlanId: input.data.releasePlanId,
      deploymentId: context.deployment.id,
      rollbackPointId: input.data.rollbackPointId,
      providerDeployId: result.providerDeployId ?? context.rollbackPoint.providerDeployId,
      status: "rollback_pending"
    };
  }

  if (isNotConfiguredRollbackResult(result)) {
    throw new RollbackConfigurationError("Rollback provider is not configured");
  }

  throw new RollbackProviderFailedError("Provider rollback failed");
}

export function createDrizzleRollbackRepository(db: WorkerDb): RollbackRepository {
  return {
    async loadContext(data) {
      const [plan] = await db
        .select()
        .from(releasePlans)
        .where(and(eq(releasePlans.id, data.releasePlanId), eq(releasePlans.projectId, data.projectId)))
        .limit(1);

      if (!plan) {
        return undefined;
      }

      const [rollbackPoint] = await db
        .select()
        .from(rollbackPoints)
        .where(
          and(
            eq(rollbackPoints.id, data.rollbackPointId),
            eq(rollbackPoints.projectId, data.projectId),
            eq(rollbackPoints.releasePlanId, data.releasePlanId)
          )
        )
        .limit(1);
      const [deployment] = await db
        .select()
        .from(deployments)
        .where(
          and(
            eq(deployments.id, data.deploymentId),
            eq(deployments.projectId, data.projectId),
            eq(deployments.releasePlanId, data.releasePlanId),
            inArray(deployments.status, rollbackSourceStatuses)
          )
        )
        .limit(1);
      const [website] = await db
        .select({ hostingSiteId: mainWebsites.hostingSiteId })
        .from(mainWebsites)
        .where(eq(mainWebsites.projectId, data.projectId))
        .limit(1);

      return {
        plan,
        rollbackPoint,
        deployment,
        hostingSiteId: website?.hostingSiteId ?? undefined
      };
    },

    async markRollbackSucceeded(input) {
      const restoredProviderDeployId = input.result.providerDeployId ?? input.rollbackPoint.providerDeployId;
      const restoredLiveUrl = input.result.liveUrl ?? input.rollbackPoint.liveUrl;
      const sourceProviderDeployId = input.rollbackPoint.providerDeployId;
      const targetProviderDeployId = input.deployment.providerDeployId;
      const executedAt = new Date();

      if (!sourceProviderDeployId || !targetProviderDeployId) {
        throw new RollbackEvidenceError("Rollback provider evidence changed before rollback state could be persisted");
      }

      return db.transaction(async (tx) => {
        const currentRollbackPointEvidence = recordFromUnknown(input.rollbackPoint.evidenceJson);
        const [rollbackPoint] = await tx
          .update(rollbackPoints)
          .set({
            evidenceJson: {
              ...currentRollbackPointEvidence,
              rollbackExecution: {
                status: "completed",
                providerResultStatus: input.result.status,
                providerDeployId: restoredProviderDeployId,
                rolledBackFromProviderDeployId: targetProviderDeployId,
                executedAt: executedAt.toISOString(),
                restoredProviderDeployId,
                liveUrl: restoredLiveUrl ?? null,
                evidence: input.result.evidence ?? null
              }
            },
            updatedAt: executedAt
          })
          .where(
            and(
              eq(rollbackPoints.id, input.data.rollbackPointId),
              eq(rollbackPoints.projectId, input.data.projectId),
              eq(rollbackPoints.releasePlanId, input.data.releasePlanId),
              eq(rollbackPoints.providerDeployId, sourceProviderDeployId)
            )
          )
          .returning({ id: rollbackPoints.id });

        if (!rollbackPoint) {
          throw new RollbackEvidenceError("Rollback point changed before rollback state could be persisted");
        }

        const currentDeploymentEvidence = recordFromUnknown(input.deployment.evidenceJson);
        const [deployment] = await tx
          .update(deployments)
          .set({
            status: "rolled_back",
            providerDeployId: restoredProviderDeployId,
            liveUrl: restoredLiveUrl ?? input.deployment.liveUrl,
            evidenceJson: {
              ...currentDeploymentEvidence,
              rollback: {
                status: "completed",
                providerResultStatus: input.result.status,
                providerDeployId: restoredProviderDeployId,
                rollbackPointId: input.data.rollbackPointId,
                rolledBackFromProviderDeployId: targetProviderDeployId,
                executedAt: executedAt.toISOString(),
                restoredProviderDeployId,
                liveUrl: restoredLiveUrl ?? null,
                evidence: input.result.evidence ?? null
              }
            },
            updatedAt: executedAt
          })
          .where(
            and(
              eq(deployments.id, input.deployment.id),
              eq(deployments.projectId, input.data.projectId),
              eq(deployments.releasePlanId, input.data.releasePlanId),
              eq(deployments.providerDeployId, targetProviderDeployId),
              inArray(deployments.status, rollbackSourceStatuses)
            )
          )
          .returning();

        if (!deployment) {
          throw new RollbackEvidenceError("Rollback target changed before rollback state could be persisted");
        }

        const [releasePlan] = await tx
          .update(releasePlans)
          .set({
            status: "rolled_back",
            updatedAt: executedAt
          })
          .where(
            and(
              eq(releasePlans.id, input.data.releasePlanId),
              eq(releasePlans.projectId, input.data.projectId),
              inArray(releasePlans.status, rollbackPlanReadyStatuses)
            )
          )
          .returning({ id: releasePlans.id });

        if (!releasePlan) {
          throw new RollbackEvidenceError("Release plan changed before rollback state could be persisted");
        }

        return deployment;
      });
    },

    async recordRollbackAttempt(input) {
      const [rollbackPoint] = await db
        .select()
        .from(rollbackPoints)
        .where(
          and(
            eq(rollbackPoints.id, input.data.rollbackPointId),
            eq(rollbackPoints.projectId, input.data.projectId),
            eq(rollbackPoints.releasePlanId, input.data.releasePlanId)
          )
        )
        .limit(1);

      if (!rollbackPoint) {
        return;
      }

      const currentEvidence = recordFromUnknown(rollbackPoint.evidenceJson);
      await db
        .update(rollbackPoints)
        .set({
          evidenceJson: {
            ...currentEvidence,
            rollbackExecution: {
              status: input.status,
              providerResultStatus: input.result?.status ?? null,
              providerDeployId: input.result?.providerDeployId ?? null,
              liveUrl: input.result?.liveUrl ?? null,
              attemptedAt: new Date().toISOString(),
              message: input.error ? normalizeRollbackFailureMessage(input.error) : undefined,
              evidence: input.result?.evidence ?? null
            }
          },
          updatedAt: new Date()
        })
        .where(
          and(
            eq(rollbackPoints.id, input.data.rollbackPointId),
            eq(rollbackPoints.projectId, input.data.projectId),
            eq(rollbackPoints.releasePlanId, input.data.releasePlanId)
          )
        );
    }
  };
}

export function parseRollbackJobData(data: unknown): RollbackJobData {
  return RollbackJobDataSchema.parse(data);
}

export function rollbackJobId(data: Pick<RollbackJobData, "releasePlanId" | "rollbackPointId">): string {
  return `rollback:${data.releasePlanId}:${data.rollbackPointId}`;
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

function normalizeRollbackFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : "rollback_failed";
}

function isNotConfiguredRollbackResult(result: RollbackDeployResult): boolean {
  return recordFromUnknown(result.evidence).adapter === "not_configured";
}
