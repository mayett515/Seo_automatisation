import { randomUUID } from "node:crypto";
import type { PublishedDeploySnapshot, RollbackDeployResult, SiteHostingPort } from "@localseo/adapters";
import {
  RollbackJobDataSchema,
  type DeploymentStatus,
  type ReleasePlanStatus,
  type RollbackJobData
} from "@localseo/contracts";
import { classifyRollbackReconciliation } from "@localseo/domain";
import { deployments, mainWebsites, releasePlans, rollbackPoints } from "@localseo/db";
import { and, eq, inArray, not } from "drizzle-orm";
import type { Job } from "bullmq";
import { isFinalJobAttempt, type WorkerDb, type WorkerDbHandle } from "../job-run.js";

type RollbackPlanRow = typeof releasePlans.$inferSelect;
type RollbackPointRow = typeof rollbackPoints.$inferSelect;
type RollbackDeploymentRow = typeof deployments.$inferSelect;

type RollbackContext = {
  plan: RollbackPlanRow;
  rollbackPoint?: RollbackPointRow;
  deployment?: RollbackDeploymentRow;
  hostingSiteId?: string;
};

type PendingRollbackEvidence = {
  status: "restore_in_flight" | "rollback_pending";
  operationAttemptId: string;
  rollbackPointId: string;
  sourceProviderDeployId: string;
  targetProviderDeployId: string;
  restoredProviderDeployId?: string;
};

export type PendingRollbackReconcileResult = {
  checked: number;
  succeeded: number;
  pending: number;
  manualRequired: number;
  staleNoop: number;
};

type RollbackRepository = {
  loadContext(data: RollbackJobData): Promise<RollbackContext | undefined>;
  recordRollbackIntent(input: {
    data: RollbackJobData;
    rollbackPoint: RollbackPointRow;
    deployment: RollbackDeploymentRow;
    operationAttemptId: string;
  }): Promise<void>;
  markRollbackSucceeded(input: {
    data: RollbackJobData;
    rollbackPoint: RollbackPointRow;
    deployment: RollbackDeploymentRow;
    result: RollbackDeployResult;
    operationAttemptId?: string;
    deploymentStatusGuard?: readonly DeploymentStatus[];
  }): Promise<RollbackDeploymentRow>;
  markRollbackPending(input: {
    data: RollbackJobData;
    rollbackPoint: RollbackPointRow;
    deployment: RollbackDeploymentRow;
    result: RollbackDeployResult;
    operationAttemptId: string;
  }): Promise<void>;
  markManualReconciliationRequired(input: {
    data: RollbackJobData;
    rollbackPoint?: RollbackPointRow;
    deployment?: RollbackDeploymentRow;
    reason: string;
    message?: string;
    publishedDeploy?: PublishedDeploySnapshot;
  }): Promise<void>;
  recordRollbackAttempt(input: {
    data: RollbackJobData;
    status: "provider_failed";
    result?: RollbackDeployResult;
    error?: unknown;
    operationAttemptId?: string;
  }): Promise<void>;
};

const rollbackSourceStatuses = [
  "provider_succeeded",
  "live_healthy",
  "live_with_warnings",
  "rollback_recommended",
  "failed"
] as const satisfies DeploymentStatus[];
const rollbackExecutionDeploymentStatuses = [
  ...rollbackSourceStatuses,
  "rollback_pending"
] as const satisfies DeploymentStatus[];
const rollbackPendingStatuses = ["rollback_pending"] as const satisfies DeploymentStatus[];
const rollbackPlanReadyStatuses = ["failed"] as const satisfies ReleasePlanStatus[];

export class RollbackConfigurationError extends Error {}

export class RollbackEvidenceError extends Error {}

export class RollbackProviderPendingError extends Error {}

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
    siteHosting,
    isFinalAttempt: isFinalJobAttempt(job)
  });
}

export async function executeRollback(input: {
  data: RollbackJobData;
  jobId: string;
  repository: RollbackRepository;
  siteHosting: SiteHostingPort;
  isFinalAttempt?: boolean;
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

  const existingOperation = pendingRollbackEvidenceFromContext(context);

  if (existingOperation) {
    return reconcileExistingRollbackOperation({
      data: input.data,
      jobId: input.jobId,
      context,
      operation: existingOperation,
      repository: input.repository,
      siteHosting: input.siteHosting,
      isFinalAttempt: input.isFinalAttempt ?? false
    });
  }

  if (hasActiveRollbackOperationStatus(context)) {
    await input.repository.markManualReconciliationRequired({
      data: input.data,
      rollbackPoint: context.rollbackPoint,
      deployment: context.deployment,
      reason: "malformed_active_rollback_operation_evidence"
    });
    throw new RollbackEvidenceError("Active rollback operation evidence is malformed");
  }

  const operationAttemptId = randomUUID();

  await input.repository.recordRollbackIntent({
    data: input.data,
    rollbackPoint: context.rollbackPoint,
    deployment: context.deployment,
    operationAttemptId
  });

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
    if (input.isFinalAttempt) {
      await input.repository.markManualReconciliationRequired({
        data: input.data,
        rollbackPoint: context.rollbackPoint,
        deployment: context.deployment,
        reason: "restore_in_flight_unconfirmed",
        message: normalizeRollbackFailureMessage(error)
      });
    }

    throw error;
  }

  if (result.status === "completed") {
    let deployment: RollbackDeploymentRow;

    try {
      deployment = await input.repository.markRollbackSucceeded({
        data: input.data,
        rollbackPoint: context.rollbackPoint,
        deployment: context.deployment,
        result,
        operationAttemptId
      });
    } catch (error) {
      await input.repository.markManualReconciliationRequired({
        data: input.data,
        rollbackPoint: context.rollbackPoint,
        deployment: context.deployment,
        reason: "completed_rollback_persistence_failed",
        message: normalizeRollbackFailureMessage(error)
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

  if (result.status === "queued") {
    if (!result.providerDeployId) {
      if (input.isFinalAttempt) {
        await input.repository.markManualReconciliationRequired({
          data: input.data,
          rollbackPoint: context.rollbackPoint,
          deployment: context.deployment,
          reason: "queued_restore_missing_provider_deploy_id"
        });
      }

      throw new RollbackProviderPendingError("Provider rollback is queued without a restored deploy id");
    }

    await input.repository.markRollbackPending({
      data: input.data,
      rollbackPoint: context.rollbackPoint,
      deployment: context.deployment,
      result,
      operationAttemptId
    });

    return {
      jobId: input.jobId,
      projectId: input.data.projectId,
      releasePlanId: input.data.releasePlanId,
      deploymentId: context.deployment.id,
      rollbackPointId: input.data.rollbackPointId,
      providerDeployId: result.providerDeployId,
      status: "rollback_pending"
    };
  }

  if (isNotConfiguredRollbackResult(result)) {
    await input.repository.markManualReconciliationRequired({
      data: input.data,
      rollbackPoint: context.rollbackPoint,
      deployment: context.deployment,
      reason: "rollback_provider_not_configured"
    });
    throw new RollbackConfigurationError("Rollback provider is not configured");
  }

  await input.repository.recordRollbackAttempt({
    data: input.data,
    status: "provider_failed",
    result,
    operationAttemptId
  });

  throw new RollbackProviderFailedError("Provider rollback failed");
}

async function reconcileExistingRollbackOperation(input: {
  data: RollbackJobData;
  jobId: string;
  context: RollbackContext;
  operation: PendingRollbackEvidence;
  repository: RollbackRepository;
  siteHosting: SiteHostingPort;
  isFinalAttempt: boolean;
}): Promise<Record<string, unknown>> {
  if (!input.context.rollbackPoint || !input.context.deployment || !input.context.hostingSiteId) {
    throw new RollbackEvidenceError("Rollback context is incomplete for operation reconciliation");
  }

  let publishedDeploy: PublishedDeploySnapshot | undefined;

  try {
    publishedDeploy = await input.siteHosting.getPublishedDeploy({ hostingSiteId: input.context.hostingSiteId });
  } catch (error) {
    if (input.operation.status === "restore_in_flight" && input.isFinalAttempt) {
      await input.repository.markManualReconciliationRequired({
        data: input.data,
        rollbackPoint: input.context.rollbackPoint,
        deployment: input.context.deployment,
        reason: "published_deploy_read_failed",
        message: normalizeRollbackFailureMessage(error)
      });
      throw new RollbackEvidenceError("Rollback provider state could not be read");
    }

    if (input.operation.status === "rollback_pending") {
      const intendedProviderDeployId =
        input.operation.restoredProviderDeployId ?? input.operation.sourceProviderDeployId;
      return rollbackPendingResult(input.jobId, input.data, input.context.deployment.id, intendedProviderDeployId);
    }

    throw error;
  }

  const intendedProviderDeployId = input.operation.restoredProviderDeployId ?? input.operation.sourceProviderDeployId;

  if (!publishedDeploy) {
    if (input.operation.status === "restore_in_flight" && input.isFinalAttempt) {
      await input.repository.markManualReconciliationRequired({
        data: input.data,
        rollbackPoint: input.context.rollbackPoint,
        deployment: input.context.deployment,
        reason: "published_deploy_unavailable"
      });
      throw new RollbackEvidenceError("Rollback provider state could not be confirmed");
    }

    if (input.operation.status === "rollback_pending") {
      return rollbackPendingResult(input.jobId, input.data, input.context.deployment.id, intendedProviderDeployId);
    }

    throw new RollbackProviderPendingError("Rollback provider state is not yet confirmable");
  }

  const decision = classifyRollbackReconciliation({
    intendedProviderDeployId,
    targetProviderDeployId: input.operation.targetProviderDeployId,
    publishedProviderDeployId: publishedDeploy.providerDeployId,
    publishedStatus: publishedDeploy.status
  });

  if (decision.kind === "completed") {
    const deployment = await input.repository.markRollbackSucceeded({
      data: input.data,
      rollbackPoint: input.context.rollbackPoint,
      deployment: input.context.deployment,
      result: {
        status: "completed",
        providerDeployId: decision.publishedProviderDeployId,
        liveUrl: publishedDeploy.liveUrls[0] ?? input.context.rollbackPoint.liveUrl ?? undefined,
        evidence: {
          source: "rollback_reconciler",
          publishedDeploy: publishedDeploy.evidence ?? null
        }
      },
      operationAttemptId: input.operation.operationAttemptId,
      deploymentStatusGuard: rollbackPendingStatuses
    });

    return {
      jobId: input.jobId,
      projectId: input.data.projectId,
      releasePlanId: input.data.releasePlanId,
      deploymentId: deployment.id,
      rollbackPointId: input.data.rollbackPointId,
      providerDeployId: decision.publishedProviderDeployId,
      status: "rolled_back",
      liveUrl: publishedDeploy.liveUrls[0] ?? input.context.rollbackPoint.liveUrl ?? undefined
    };
  }

  if (decision.kind === "manual_required") {
    await input.repository.markManualReconciliationRequired({
      data: input.data,
      rollbackPoint: input.context.rollbackPoint,
      deployment: input.context.deployment,
      reason: decision.reason,
      publishedDeploy
    });
    throw new RollbackEvidenceError("Rollback published deploy identity requires manual reconciliation");
  }

  if (input.operation.status === "restore_in_flight" && input.isFinalAttempt) {
    await input.repository.markManualReconciliationRequired({
      data: input.data,
      rollbackPoint: input.context.rollbackPoint,
      deployment: input.context.deployment,
      reason: decision.reason,
      publishedDeploy
    });
    throw new RollbackEvidenceError("Rollback provider state stayed unconfirmed through the final attempt");
  }

  if (input.operation.status === "rollback_pending") {
    return rollbackPendingResult(input.jobId, input.data, input.context.deployment.id, intendedProviderDeployId);
  }

  throw new RollbackProviderPendingError("Rollback provider state is not yet confirmable");
}

export async function reconcilePendingRollbacks(input: {
  db: WorkerDb;
  siteHosting: SiteHostingPort;
  limit?: number;
}): Promise<PendingRollbackReconcileResult> {
  const limit = input.limit ?? 25;
  const repository = createDrizzleRollbackRepository(input.db);
  const rows = await input.db
    .select()
    .from(deployments)
    .where(
      and(
        eq(deployments.status, "rollback_pending"),
        not(eq(deployments.providerOperationStatus, "manual_reconciliation_required"))
      )
    )
    .limit(limit);
  const result: PendingRollbackReconcileResult = {
    checked: rows.length,
    succeeded: 0,
    pending: 0,
    manualRequired: 0,
    staleNoop: 0
  };

  for (const deployment of rows) {
    if (!deployment.releasePlanId) {
      result.manualRequired += 1;
      continue;
    }

    const operation = pendingRollbackEvidenceFromDeployment(deployment.evidenceJson);

    if (!operation) {
      await repository.markManualReconciliationRequired({
        data: rollbackJobDataFromDeployment(deployment, ""),
        deployment,
        reason: "missing_rollback_operation_evidence"
      });
      result.manualRequired += 1;
      continue;
    }

    const data = rollbackJobDataFromDeployment(deployment, operation.rollbackPointId);
    const context = await repository.loadContext(data);

    if (!context?.rollbackPoint || !context.deployment || !context.hostingSiteId) {
      await repository.markManualReconciliationRequired({
        data,
        deployment,
        reason: "pending_rollback_context_missing"
      });
      result.manualRequired += 1;
      continue;
    }

    let publishedDeploy: PublishedDeploySnapshot | undefined;

    try {
      publishedDeploy = await input.siteHosting.getPublishedDeploy({ hostingSiteId: context.hostingSiteId });
    } catch {
      result.pending += 1;
      continue;
    }

    if (!publishedDeploy) {
      result.pending += 1;
      continue;
    }

    const intendedProviderDeployId = operation.restoredProviderDeployId ?? operation.sourceProviderDeployId;
    const decision = classifyRollbackReconciliation({
      intendedProviderDeployId,
      targetProviderDeployId: operation.targetProviderDeployId,
      publishedProviderDeployId: publishedDeploy.providerDeployId,
      publishedStatus: publishedDeploy.status
    });

    if (decision.kind === "completed") {
      try {
        await repository.markRollbackSucceeded({
          data,
          rollbackPoint: context.rollbackPoint,
          deployment: context.deployment,
          result: {
            status: "completed",
            providerDeployId: decision.publishedProviderDeployId,
            liveUrl: publishedDeploy.liveUrls[0] ?? context.rollbackPoint.liveUrl ?? undefined,
            evidence: {
              source: "rollback_reconciler",
              publishedDeploy: publishedDeploy.evidence ?? null
            }
          },
          operationAttemptId: operation.operationAttemptId,
          deploymentStatusGuard: rollbackPendingStatuses
        });
        result.succeeded += 1;
      } catch {
        if (await rollbackAlreadyCompletedForOperation(input.db, data, operation.operationAttemptId)) {
          result.staleNoop += 1;
          continue;
        }

        await repository.markManualReconciliationRequired({
          data,
          rollbackPoint: context.rollbackPoint,
          deployment: context.deployment,
          reason: "rollback_reconcile_guard_mismatch",
          publishedDeploy
        });
        result.manualRequired += 1;
      }
      continue;
    }

    if (decision.kind === "manual_required") {
      await repository.markManualReconciliationRequired({
        data,
        rollbackPoint: context.rollbackPoint,
        deployment: context.deployment,
        reason: decision.reason,
        publishedDeploy
      });
      result.manualRequired += 1;
      continue;
    }

    result.pending += 1;
  }

  return result;
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
            inArray(deployments.status, rollbackExecutionDeploymentStatuses),
            not(eq(deployments.providerOperationStatus, "manual_reconciliation_required"))
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

    async recordRollbackIntent(input) {
      const sourceProviderDeployId = input.rollbackPoint.providerDeployId;
      const targetProviderDeployId = input.deployment.providerDeployId;
      const attemptedAt = new Date();

      if (!sourceProviderDeployId || !targetProviderDeployId) {
        throw new RollbackEvidenceError("Rollback provider evidence changed before rollback intent could be persisted");
      }

      const currentRollbackPointEvidence = recordFromUnknown(input.rollbackPoint.evidenceJson);
      const [rollbackPoint] = await db
        .update(rollbackPoints)
        .set({
          evidenceJson: {
            ...currentRollbackPointEvidence,
            rollbackExecution: {
              status: "restore_in_flight",
              operationAttemptId: input.operationAttemptId,
              rollbackPointId: input.data.rollbackPointId,
              sourceProviderDeployId,
              targetProviderDeployId,
              attemptedAt: attemptedAt.toISOString()
            }
          },
          updatedAt: attemptedAt
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
        throw new RollbackEvidenceError("Rollback point changed before rollback intent could be persisted");
      }
    },

    async markRollbackSucceeded(input) {
      const restoredProviderDeployId = input.result.providerDeployId ?? input.rollbackPoint.providerDeployId;
      const restoredLiveUrl = input.result.liveUrl ?? input.rollbackPoint.liveUrl;
      const sourceProviderDeployId = input.rollbackPoint.providerDeployId;
      const targetProviderDeployId = input.deployment.providerDeployId;
      const executedAt = new Date();
      const deploymentStatusGuard = input.deploymentStatusGuard ?? rollbackSourceStatuses;

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
                operationAttemptId: input.operationAttemptId,
                providerResultStatus: input.result.status,
                providerDeployId: restoredProviderDeployId,
                sourceProviderDeployId,
                targetProviderDeployId,
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
                operationAttemptId: input.operationAttemptId,
                providerResultStatus: input.result.status,
                providerDeployId: restoredProviderDeployId,
                rollbackPointId: input.data.rollbackPointId,
                sourceProviderDeployId,
                targetProviderDeployId,
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
              inArray(deployments.status, deploymentStatusGuard)
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

    async markRollbackPending(input) {
      const restoredProviderDeployId = input.result.providerDeployId;
      const sourceProviderDeployId = input.rollbackPoint.providerDeployId;
      const targetProviderDeployId = input.deployment.providerDeployId;
      const attemptedAt = new Date();

      if (!restoredProviderDeployId || !sourceProviderDeployId || !targetProviderDeployId) {
        throw new RollbackEvidenceError("Rollback provider evidence changed before pending state could be persisted");
      }

      await db.transaction(async (tx) => {
        const currentRollbackPointEvidence = recordFromUnknown(input.rollbackPoint.evidenceJson);
        const [rollbackPoint] = await tx
          .update(rollbackPoints)
          .set({
            evidenceJson: {
              ...currentRollbackPointEvidence,
              rollbackExecution: {
                status: "rollback_pending",
                operationAttemptId: input.operationAttemptId,
                providerResultStatus: input.result.status,
                providerDeployId: restoredProviderDeployId,
                rollbackPointId: input.data.rollbackPointId,
                sourceProviderDeployId,
                targetProviderDeployId,
                restoredProviderDeployId,
                liveUrl: input.result.liveUrl ?? null,
                attemptedAt: attemptedAt.toISOString(),
                evidence: input.result.evidence ?? null
              }
            },
            updatedAt: attemptedAt
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
          throw new RollbackEvidenceError("Rollback point changed before rollback pending state could be persisted");
        }

        const currentDeploymentEvidence = recordFromUnknown(input.deployment.evidenceJson);
        const [deployment] = await tx
          .update(deployments)
          .set({
            status: "rollback_pending",
            providerOperationStatus: "recorded",
            evidenceJson: {
              ...currentDeploymentEvidence,
              rollback: {
                status: "rollback_pending",
                operationAttemptId: input.operationAttemptId,
                providerResultStatus: input.result.status,
                providerDeployId: restoredProviderDeployId,
                rollbackPointId: input.data.rollbackPointId,
                sourceProviderDeployId,
                targetProviderDeployId,
                restoredProviderDeployId,
                liveUrl: input.result.liveUrl ?? null,
                attemptedAt: attemptedAt.toISOString(),
                evidence: input.result.evidence ?? null
              }
            },
            updatedAt: attemptedAt
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
          .returning({ id: deployments.id });

        if (!deployment) {
          throw new RollbackEvidenceError("Rollback target changed before rollback pending state could be persisted");
        }
      });
    },

    async markManualReconciliationRequired(input) {
      const markedAt = new Date();
      const rollbackPoint =
        (await loadRollbackPoint(db, input.data.projectId, input.data.releasePlanId, input.data.rollbackPointId)) ??
        input.rollbackPoint;
      const deployment =
        (await loadDeployment(db, input.data.projectId, input.data.releasePlanId, input.data.deploymentId)) ??
        input.deployment;

      if (rollbackPoint) {
        const currentRollbackPointEvidence = recordFromUnknown(rollbackPoint.evidenceJson);
        const existingExecution = recordFromUnknown(currentRollbackPointEvidence.rollbackExecution);
        if (existingExecution.status !== "completed") {
          await db
            .update(rollbackPoints)
            .set({
              evidenceJson: {
                ...currentRollbackPointEvidence,
                rollbackExecution: {
                  ...existingExecution,
                  status: "manual_reconciliation_required",
                  rollbackPointId: input.data.rollbackPointId,
                  manualReason: input.reason,
                  message: input.message,
                  publishedProviderDeployId: input.publishedDeploy?.providerDeployId ?? null,
                  publishedStatus: input.publishedDeploy?.status ?? null,
                  lastCheckedAt: markedAt.toISOString(),
                  evidence: input.publishedDeploy?.evidence ?? existingExecution.evidence ?? null
                }
              },
              updatedAt: markedAt
            })
            .where(
              and(
                eq(rollbackPoints.id, input.data.rollbackPointId),
                eq(rollbackPoints.projectId, input.data.projectId),
                eq(rollbackPoints.releasePlanId, input.data.releasePlanId)
              )
            );
        }
      }

      if (deployment) {
        const currentDeploymentEvidence = recordFromUnknown(deployment.evidenceJson);
        const existingRollback = recordFromUnknown(currentDeploymentEvidence.rollback);
        await db
          .update(deployments)
          .set({
            providerOperationStatus: "manual_reconciliation_required",
            evidenceJson: {
              ...currentDeploymentEvidence,
              rollback: {
                ...existingRollback,
                status: "manual_reconciliation_required",
                rollbackPointId: input.data.rollbackPointId,
                manualReason: input.reason,
                message: input.message,
                publishedProviderDeployId: input.publishedDeploy?.providerDeployId ?? null,
                publishedStatus: input.publishedDeploy?.status ?? null,
                lastCheckedAt: markedAt.toISOString(),
                evidence: input.publishedDeploy?.evidence ?? existingRollback.evidence ?? null
              }
            },
            updatedAt: markedAt
          })
          .where(
            and(
              eq(deployments.id, input.data.deploymentId),
              eq(deployments.projectId, input.data.projectId),
              eq(deployments.releasePlanId, input.data.releasePlanId),
              not(eq(deployments.status, "rolled_back"))
            )
          );
      }
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
              operationAttemptId: input.operationAttemptId,
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

function pendingRollbackEvidenceFromContext(context: RollbackContext): PendingRollbackEvidence | undefined {
  return (
    pendingRollbackEvidenceFromDeployment(context.deployment?.evidenceJson) ??
    pendingRollbackEvidenceFromRollbackPoint(context.rollbackPoint?.evidenceJson)
  );
}

function hasActiveRollbackOperationStatus(context: RollbackContext): boolean {
  return (
    hasActiveRollbackStatus(recordFromUnknown(recordFromUnknown(context.deployment?.evidenceJson).rollback)) ||
    hasActiveRollbackStatus(recordFromUnknown(recordFromUnknown(context.rollbackPoint?.evidenceJson).rollbackExecution))
  );
}

function hasActiveRollbackStatus(value: Record<string, unknown>): boolean {
  return value.status === "restore_in_flight" || value.status === "rollback_pending";
}

function pendingRollbackEvidenceFromDeployment(value: unknown): PendingRollbackEvidence | undefined {
  const rollback = recordFromUnknown(recordFromUnknown(value).rollback);
  return pendingRollbackEvidenceFromRecord(rollback);
}

function pendingRollbackEvidenceFromRollbackPoint(value: unknown): PendingRollbackEvidence | undefined {
  const rollbackExecution = recordFromUnknown(recordFromUnknown(value).rollbackExecution);
  return pendingRollbackEvidenceFromRecord(rollbackExecution);
}

function pendingRollbackEvidenceFromRecord(value: Record<string, unknown>): PendingRollbackEvidence | undefined {
  const status = value.status;

  if (status !== "restore_in_flight" && status !== "rollback_pending") {
    return undefined;
  }

  const operationAttemptId = stringFromUnknown(value.operationAttemptId);
  const rollbackPointId = stringFromUnknown(value.rollbackPointId);
  const sourceProviderDeployId = stringFromUnknown(value.sourceProviderDeployId);
  const targetProviderDeployId = stringFromUnknown(value.targetProviderDeployId);

  if (!operationAttemptId || !rollbackPointId || !sourceProviderDeployId || !targetProviderDeployId) {
    return undefined;
  }

  return {
    status,
    operationAttemptId,
    rollbackPointId,
    sourceProviderDeployId,
    targetProviderDeployId,
    restoredProviderDeployId: stringFromUnknown(value.restoredProviderDeployId)
  };
}

function rollbackJobDataFromDeployment(deployment: RollbackDeploymentRow, rollbackPointId: string): RollbackJobData {
  if (!deployment.releasePlanId) {
    throw new RollbackEvidenceError("Pending rollback deployment is missing release plan id");
  }

  return {
    projectId: deployment.projectId,
    releasePlanId: deployment.releasePlanId,
    deploymentId: deployment.id,
    rollbackPointId
  };
}

function rollbackPendingResult(
  jobId: string,
  data: RollbackJobData,
  deploymentId: string,
  providerDeployId: string
): Record<string, unknown> {
  return {
    jobId,
    projectId: data.projectId,
    releasePlanId: data.releasePlanId,
    deploymentId,
    rollbackPointId: data.rollbackPointId,
    providerDeployId,
    status: "rollback_pending"
  };
}

async function loadRollbackPoint(
  db: WorkerDb,
  projectId: string,
  releasePlanId: string,
  rollbackPointId: string
): Promise<RollbackPointRow | undefined> {
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

  return rollbackPoint;
}

async function loadDeployment(
  db: WorkerDb,
  projectId: string,
  releasePlanId: string,
  deploymentId: string
): Promise<RollbackDeploymentRow | undefined> {
  const [deployment] = await db
    .select()
    .from(deployments)
    .where(
      and(
        eq(deployments.id, deploymentId),
        eq(deployments.projectId, projectId),
        eq(deployments.releasePlanId, releasePlanId)
      )
    )
    .limit(1);

  return deployment;
}

async function rollbackAlreadyCompletedForOperation(
  db: WorkerDb,
  data: RollbackJobData,
  operationAttemptId: string
): Promise<boolean> {
  const deployment = await loadDeployment(db, data.projectId, data.releasePlanId, data.deploymentId);

  if (deployment?.status !== "rolled_back") {
    return false;
  }

  const rollbackEvidence = recordFromUnknown(recordFromUnknown(deployment.evidenceJson).rollback);
  return rollbackEvidence.status === "completed" && rollbackEvidence.operationAttemptId === operationAttemptId;
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

function stringFromUnknown(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeRollbackFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : "rollback_failed";
}

function isNotConfiguredRollbackResult(result: RollbackDeployResult): boolean {
  return recordFromUnknown(result.evidence).adapter === "not_configured";
}
