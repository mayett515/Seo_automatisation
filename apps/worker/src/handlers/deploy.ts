import { NotConfiguredSiteHostingAdapter, type DeployReleaseResult, type SiteHostingPort } from "@localseo/adapters";
import {
  DeployJobDataSchema,
  ReleaseCheckSchema,
  ReleasePlanSchema,
  type DeployJobData,
  type DeploymentStatus,
  type ReleaseCheck,
  type ReleasePlan
} from "@localseo/contracts";
import { buildReleaseDeploymentKey, canDeployRelease } from "@localseo/domain";
import { approvals, deployments, releaseChecks, releasePlanItems, releasePlans, rollbackPoints } from "@localseo/db";
import type { Job } from "bullmq";
import { and, eq } from "drizzle-orm";
import type { WorkerDb, WorkerDbHandle } from "../job-run.js";

export type DeploymentRow = typeof deployments.$inferSelect;
export type ReleasePlanRow = typeof releasePlans.$inferSelect;

export type DeployContext = {
  plan: ReleasePlanRow;
  checks: ReleaseCheck[];
  hasApproval: boolean;
  releaseItemCount: number;
  rollbackPointCount: number;
  existingDeployment?: DeploymentRow;
};

export type DeployRepository = {
  loadContext(data: DeployJobData): Promise<DeployContext | undefined>;
  startDeployment(input: {
    data: DeployJobData;
    context: DeployContext;
    evidence: Record<string, unknown>;
  }): Promise<DeploymentRow>;
  markProviderSucceeded(input: {
    data: DeployJobData;
    result: Extract<DeployReleaseResult, { status: "created" }>;
    evidence: Record<string, unknown>;
  }): Promise<DeploymentRow>;
  markReleaseLive(data: DeployJobData): Promise<void>;
  markFailed(data: DeployJobData, error: unknown): Promise<void>;
};

const successfulDeploymentStatuses = new Set<DeploymentStatus>([
  "provider_succeeded",
  "verifying",
  "live_healthy",
  "live_with_warnings",
  "rollback_recommended"
]);

const defaultSiteHosting = new NotConfiguredSiteHostingAdapter();

class ProviderDeployPendingError extends Error {}

export async function handleDeployJob(
  job: Job,
  dbHandle: WorkerDbHandle | undefined,
  siteHosting: SiteHostingPort = defaultSiteHosting
): Promise<Record<string, unknown>> {
  const data = parseDeployJobData(job.data);

  if (!dbHandle) {
    throw new Error("DATABASE_URL is required for deploy jobs");
  }

  return executeDeploy({
    data,
    jobId: job.id ?? data.deploymentKey,
    repository: createDrizzleDeployRepository(dbHandle.db),
    siteHosting
  });
}

export async function executeDeploy(input: {
  data: DeployJobData;
  jobId: string;
  repository: DeployRepository;
  siteHosting: SiteHostingPort;
}): Promise<Record<string, unknown>> {
  try {
    const context = await input.repository.loadContext(input.data);

    if (!context) {
      throw new Error(`Release plan not found for deploy job: ${input.data.releasePlanId}`);
    }

    const existingDeployment = context.existingDeployment;

    if (existingDeployment && isSuccessfulDeployment(existingDeployment)) {
      await input.repository.markReleaseLive(input.data);
      return {
        jobId: input.jobId,
        projectId: input.data.projectId,
        releasePlanId: input.data.releasePlanId,
        deploymentId: existingDeployment.id,
        deploymentKey: existingDeployment.deploymentKey,
        providerDeployId: existingDeployment.providerDeployId ?? undefined,
        status: "already_deployed"
      };
    }

    if (existingDeployment?.providerDeployId) {
      return reconcileExistingProviderDeploy({
        data: input.data,
        deployment: existingDeployment,
        jobId: input.jobId,
        repository: input.repository,
        siteHosting: input.siteHosting
      });
    }

    const deployablePlan = toDeployablePlan(context.plan);

    if (
      !deployablePlan ||
      context.checks.length === 0 ||
      !context.hasApproval ||
      context.releaseItemCount === 0 ||
      context.rollbackPointCount === 0 ||
      !canDeployRelease(deployablePlan, context.checks)
    ) {
      throw new Error("Release is not deployable from persisted worker evidence");
    }

    const evidence = buildDeployEvidence(context);
    const deployment = await input.repository.startDeployment({
      data: input.data,
      context,
      evidence
    });

    const result = await input.siteHosting.createDeploy({
      projectId: input.data.projectId,
      releasePlanId: input.data.releasePlanId,
      deploymentKey: input.data.deploymentKey,
      jobRunId: input.data.jobRunId,
      buildArtifactKey: buildReleaseArtifactKey(input.data.releasePlanId),
      evidence
    });

    if (result.status === "not_configured") {
      throw new Error(result.message);
    }

    const updatedDeployment = await input.repository.markProviderSucceeded({
      data: input.data,
      result,
      evidence
    });

    return {
      jobId: input.jobId,
      projectId: input.data.projectId,
      releasePlanId: input.data.releasePlanId,
      deploymentId: updatedDeployment.id,
      deploymentKey: updatedDeployment.deploymentKey,
      providerDeployId: result.providerDeployId,
      status: "provider_succeeded",
      liveUrls: result.liveUrls,
      startedDeploymentId: deployment.id
    };
  } catch (error) {
    if (!(error instanceof ProviderDeployPendingError)) {
      await input.repository.markFailed(input.data, error);
    }

    throw error;
  }
}

export function parseDeployJobData(data: unknown): DeployJobData {
  const parsed = DeployJobDataSchema.parse(data);
  const expectedDeploymentKey = buildReleaseDeploymentKey(parsed.releasePlanId);

  if (parsed.deploymentKey !== expectedDeploymentKey) {
    throw new Error("Deploy job deploymentKey does not match releasePlanId");
  }

  return parsed;
}

export function buildReleaseArtifactKey(releasePlanId: string): string {
  return `releases/${releasePlanId}/approved-artifact.json`;
}

function createDrizzleDeployRepository(db: WorkerDb): DeployRepository {
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

      const [approval] = await db
        .select({ id: approvals.id })
        .from(approvals)
        .where(and(eq(approvals.releasePlanId, data.releasePlanId), eq(approvals.status, "approved")))
        .limit(1);
      const checkRows = await db
        .select()
        .from(releaseChecks)
        .where(eq(releaseChecks.releasePlanId, data.releasePlanId));
      const itemRows = await db
        .select({ id: releasePlanItems.id })
        .from(releasePlanItems)
        .where(eq(releasePlanItems.releasePlanId, data.releasePlanId));
      const rollbackRows = await db
        .select({ id: rollbackPoints.id })
        .from(rollbackPoints)
        .where(and(eq(rollbackPoints.projectId, data.projectId), eq(rollbackPoints.releasePlanId, data.releasePlanId)));
      const [existingDeployment] = await db
        .select()
        .from(deployments)
        .where(eq(deployments.deploymentKey, data.deploymentKey))
        .limit(1);

      return {
        plan,
        hasApproval: Boolean(approval),
        checks: checkRows.map(mapReleaseCheck),
        releaseItemCount: itemRows.length,
        rollbackPointCount: rollbackRows.length,
        existingDeployment
      };
    },

    async startDeployment(input) {
      return db.transaction(async (tx) => {
        await tx
          .insert(deployments)
          .values({
            projectId: input.data.projectId,
            releasePlanId: input.data.releasePlanId,
            deploymentKey: input.data.deploymentKey,
            status: "deploying",
            evidenceJson: input.evidence
          })
          .onConflictDoNothing();

        const [deployment] = await tx
          .update(deployments)
          .set({
            status: "deploying",
            evidenceJson: input.evidence,
            updatedAt: new Date()
          })
          .where(eq(deployments.deploymentKey, input.data.deploymentKey))
          .returning();

        if (!deployment) {
          throw new Error("Failed to create deployment ledger row");
        }

        await tx
          .update(releasePlans)
          .set({
            status: "deploying",
            updatedAt: new Date()
          })
          .where(and(eq(releasePlans.id, input.data.releasePlanId), eq(releasePlans.projectId, input.data.projectId)));

        return deployment;
      });
    },

    async markProviderSucceeded(input) {
      return db.transaction(async (tx) => {
        const [deployment] = await tx
          .update(deployments)
          .set({
            status: "provider_succeeded",
            providerDeployId: input.result.providerDeployId,
            liveUrl: input.result.liveUrls[0] ?? null,
            evidenceJson: {
              ...input.evidence,
              provider: {
                status: input.result.status,
                liveUrls: input.result.liveUrls,
                evidence: input.result.evidence ?? null
              }
            },
            updatedAt: new Date()
          })
          .where(eq(deployments.deploymentKey, input.data.deploymentKey))
          .returning();

        if (!deployment) {
          throw new Error("Failed to update deployment provider result");
        }

        await tx
          .update(releasePlans)
          .set({
            status: "live",
            deployedAt: new Date(),
            updatedAt: new Date()
          })
          .where(and(eq(releasePlans.id, input.data.releasePlanId), eq(releasePlans.projectId, input.data.projectId)));

        return deployment;
      });
    },

    async markReleaseLive(data) {
      await db
        .update(releasePlans)
        .set({
          status: "live",
          updatedAt: new Date()
        })
        .where(and(eq(releasePlans.id, data.releasePlanId), eq(releasePlans.projectId, data.projectId)));
    },

    async markFailed(data, error) {
      const evidence = {
        failure: {
          message: normalizeFailureMessage(error)
        },
        failedAt: new Date().toISOString()
      };

      await db.transaction(async (tx) => {
        await tx
          .update(deployments)
          .set({
            status: "failed",
            evidenceJson: evidence,
            updatedAt: new Date()
          })
          .where(eq(deployments.deploymentKey, data.deploymentKey));
        await tx
          .update(releasePlans)
          .set({
            status: "failed",
            updatedAt: new Date()
          })
          .where(and(eq(releasePlans.id, data.releasePlanId), eq(releasePlans.projectId, data.projectId)));
      });
    }
  };
}

async function reconcileExistingProviderDeploy(input: {
  data: DeployJobData;
  deployment: DeploymentRow;
  jobId: string;
  repository: DeployRepository;
  siteHosting: SiteHostingPort;
}): Promise<Record<string, unknown>> {
  const providerDeployId = input.deployment.providerDeployId;

  if (!providerDeployId) {
    throw new Error("Cannot reconcile deployment without providerDeployId");
  }

  const snapshot = await input.siteHosting.getDeploy({ providerDeployId });

  if (snapshot.status === "ready") {
    const deployment = await input.repository.markProviderSucceeded({
      data: input.data,
      result: {
        status: "created",
        providerDeployId: snapshot.providerDeployId,
        liveUrls: snapshot.liveUrls,
        evidence: snapshot.evidence
      },
      evidence: {
        source: "deploy_worker_reconcile",
        providerSnapshot: snapshot
      }
    });

    return {
      jobId: input.jobId,
      projectId: input.data.projectId,
      releasePlanId: input.data.releasePlanId,
      deploymentId: deployment.id,
      deploymentKey: deployment.deploymentKey,
      providerDeployId: snapshot.providerDeployId,
      status: "provider_succeeded",
      liveUrls: snapshot.liveUrls,
      reconciled: true
    };
  }

  if (snapshot.status === "failed" || snapshot.status === "rolled_back") {
    throw new Error(`Provider deploy reconciled as ${snapshot.status}`);
  }

  throw new ProviderDeployPendingError(`Provider deploy is still ${snapshot.status}`);
}

function mapReleaseCheck(row: typeof releaseChecks.$inferSelect): ReleaseCheck {
  return ReleaseCheckSchema.parse({
    checkKey: row.checkKey,
    scope: row.scope,
    severity: row.severity,
    result: row.result,
    message: row.message,
    evidence: row.evidenceJson ?? undefined
  });
}

function toDeployablePlan(plan: ReleasePlanRow): ReleasePlan | undefined {
  if (plan.status !== "approved_for_deploy" && plan.status !== "deploying") {
    return undefined;
  }

  return ReleasePlanSchema.parse({
    releasePlanId: plan.id,
    projectId: plan.projectId,
    status: "approved_for_deploy",
    riskLevel: plan.riskLevel,
    blockerCount: plan.blockerCount,
    warningCount: plan.warningCount
  });
}

function buildDeployEvidence(context: DeployContext): Record<string, unknown> {
  return {
    source: "deploy_worker",
    releasePlanStatusAtStart: context.plan.status,
    releaseItemCount: context.releaseItemCount,
    rollbackPointCount: context.rollbackPointCount,
    hasApproval: context.hasApproval,
    checks: context.checks.map((check) => ({
      checkKey: check.checkKey,
      severity: check.severity,
      result: check.result
    }))
  };
}

function isSuccessfulDeployment(deployment: DeploymentRow): boolean {
  return successfulDeploymentStatuses.has(deployment.status);
}

function normalizeFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : "deploy_worker_failed";
}
