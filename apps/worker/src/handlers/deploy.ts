import { createHash } from "node:crypto";
import {
  isProviderRequestError,
  NotConfiguredSiteHostingAdapter,
  type BeginDeployResult,
  type DeployReleaseResult,
  type MediaAssetStoragePort,
  type ObjectStoragePort,
  type ProviderDeploySnapshot,
  type ProviderUploadResumeToken,
  type SiteHostingPort
} from "@localseo/adapters";
import {
  DeployJobDataSchema,
  PageJsonSchema,
  ReleaseItemActionSchema,
  StaticSiteArtifactSchema,
  type ApprovedReleaseArtifact,
  type DeployJobData,
  type DeploymentStatus,
  type PageJson,
  type PageVersionStatus,
  type ReleaseCheck,
  type ReleaseItemAction,
  type ReleasePlan,
  type StaticSiteFile
} from "@localseo/contracts";
import { buildReleaseDeploymentKey, canDeployRelease } from "@localseo/domain";
import { buildPageMediaVariantPath, renderApprovedReleaseArtifact } from "@localseo/page-registry";
import {
  approvals,
  demoteReleaseCandidatePageVersionsForPlan,
  deployments,
  mainWebsites,
  loadResolvedPageVersionMediaVariants,
  pageVersions,
  releaseChecks,
  releasePlanItems,
  releasePlans,
  rollbackPoints
} from "@localseo/db";
import type { ResolvedPageVersionMediaVariantRecord } from "@localseo/db";
import type { Job } from "bullmq";
import { and, eq, inArray, isNotNull, not, or, sql } from "drizzle-orm";
import { isFinalJobAttempt, type WorkerDb, type WorkerDbHandle } from "../job-run.js";

export type DeploymentRow = typeof deployments.$inferSelect;
export type ReleasePlanRow = typeof releasePlans.$inferSelect;

export type DeployContext = {
  plan: ReleasePlanRow;
  checks: ReleaseCheck[];
  hasApproval: boolean;
  hostingSiteId?: string;
  releaseItems: ReleaseArtifactItem[];
  mediaVariants: ResolvedPageVersionMediaVariantRecord[];
  rollbackPointCount: number;
  priorSuccessfulDeploymentCount: number;
  existingDeployment?: DeploymentRow;
};

export type ReleaseArtifactItem = {
  id: string;
  pageVersionId: string | null;
  pageVersionStatus: PageVersionStatus | null;
  pageVersionApprovedAt: Date | null;
  targetUrl: string;
  targetSubdomain: string | null;
  action: ReleaseItemAction;
  pageJson: PageJson | null;
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
    result: Extract<DeployReleaseResult, { status: "ready" }>;
    evidence: Record<string, unknown>;
  }): Promise<DeploymentRow>;
  markProviderPending(input: {
    data: DeployJobData;
    result: Extract<DeployReleaseResult, { status: "pending" }>;
    evidence: Record<string, unknown>;
  }): Promise<DeploymentRow>;
  markProviderDeployStarted(input: {
    data: DeployJobData;
    result: Extract<BeginDeployResult, { status: "started" }>;
    evidence: Record<string, unknown>;
  }): Promise<DeploymentRow>;
  markProviderUploadCompleted(input: {
    data: DeployJobData;
    providerDeployId: string;
    evidence?: Record<string, unknown>;
  }): Promise<DeploymentRow>;
  markProviderMutationInFlight(input: {
    data: DeployJobData;
    evidence: Record<string, unknown>;
  }): Promise<DeploymentRow>;
  markManualReconciliationRequired(input: {
    data: DeployJobData;
    message: string;
    evidence?: Record<string, unknown>;
  }): Promise<DeploymentRow>;
  markReleaseLive(data: DeployJobData): Promise<void>;
  markFailed(data: DeployJobData, error: unknown): Promise<void>;
};

export type PendingDeploymentReconcileResult = {
  checked: number;
  succeeded: number;
  pending: number;
  failed: number;
};

const rollbackSourceDeploymentStatusValues = [
  "provider_succeeded",
  "live_healthy",
  "live_with_warnings"
] as const satisfies DeploymentStatus[];
const releaseLiveProjectableDeploymentStatusValues = [
  "live_healthy",
  "live_with_warnings"
] as const satisfies DeploymentStatus[];
const replayableProviderDeploymentStatusValues = [
  ...rollbackSourceDeploymentStatusValues,
  "verifying",
  "rollback_recommended",
  "rolled_back"
] as const satisfies DeploymentStatus[];
const deployFailureProtectedDeploymentStatusValues = replayableProviderDeploymentStatusValues;
const replayableProviderDeploymentStatuses = new Set<DeploymentStatus>(replayableProviderDeploymentStatusValues);
const releaseLiveProjectableDeploymentStatuses = new Set<DeploymentStatus>(
  releaseLiveProjectableDeploymentStatusValues
);

const defaultSiteHosting = new NotConfiguredSiteHostingAdapter();

export class DeployConfigurationError extends Error {}

export class DeployEvidenceError extends Error {}

export class ProviderDeployIdPersistenceError extends Error {}

export class ProviderUploadStatePersistenceError extends Error {}

export class ManualReconciliationRequiredError extends Error {}

export class ProviderDeployPendingError extends Error {}

export class ProviderDeployTerminalStatusError extends Error {
  readonly status: "failed" | "rolled_back";

  constructor(status: "failed" | "rolled_back") {
    super(`Provider deploy finished as ${status}`);
    this.name = "ProviderDeployTerminalStatusError";
    this.status = status;
  }
}

export async function handleDeployJob(
  job: Job,
  dbHandle: WorkerDbHandle | undefined,
  siteHosting: SiteHostingPort = defaultSiteHosting,
  objectStorage: ObjectStoragePort & Pick<MediaAssetStoragePort, "readPrivateObject">
): Promise<Record<string, unknown>> {
  const data = parseDeployJobData(job.data);

  if (!dbHandle) {
    throw new Error("DATABASE_URL is required for deploy jobs");
  }

  return executeDeploy({
    data,
    isFinalAttempt: isFinalJobAttempt(job, data.maxAttempts),
    jobId: job.id ?? data.deploymentKey,
    objectStorage,
    repository: createDrizzleDeployRepository(dbHandle.db),
    siteHosting
  });
}

export async function executeDeploy(input: {
  data: DeployJobData;
  isFinalAttempt?: boolean;
  jobId: string;
  objectStorage: ObjectStoragePort & Pick<MediaAssetStoragePort, "readPrivateObject">;
  repository: DeployRepository;
  siteHosting: SiteHostingPort;
}): Promise<Record<string, unknown>> {
  const isFinalAttempt = input.isFinalAttempt ?? true;
  let hasProviderDeployEvidence = false;

  try {
    const context = await input.repository.loadContext(input.data);

    if (!context) {
      throw new Error(`Release plan not found for deploy job: ${input.data.releasePlanId}`);
    }

    const existingDeployment = context.existingDeployment;

    if (existingDeployment && isReplayableProviderDeployment(existingDeployment)) {
      return replayProviderDeployment(input, existingDeployment);
    }

    if (existingDeployment && requiresManualReconciliation(existingDeployment)) {
      throw new ManualReconciliationRequiredError("Provider operation requires manual reconciliation");
    }

    if (existingDeployment?.providerDeployId) {
      hasProviderDeployEvidence = true;
      return await reconcileExistingProviderDeploy({
        data: input.data,
        deployment: existingDeployment,
        jobId: input.jobId,
        repository: input.repository,
        siteHosting: input.siteHosting
      });
    }

    if (existingDeployment && hasInFlightProviderOperation(existingDeployment)) {
      await input.repository.markManualReconciliationRequired({
        data: input.data,
        message: "Provider mutation was in flight without a recorded providerDeployId",
        evidence: {
          source: "deploy_worker_existing_in_flight_guard",
          deploymentId: existingDeployment.id
        }
      });
      throw new ManualReconciliationRequiredError(
        "Provider mutation was in flight without a recorded providerDeployId; manual reconciliation is required"
      );
    }

    const deployablePlan = toDeployablePlan(context.plan);

    if (
      !deployablePlan ||
      context.checks.length === 0 ||
      !context.hasApproval ||
      context.releaseItems.length === 0 ||
      !hasRollbackEvidence(context) ||
      !canDeployRelease(deployablePlan, context.checks)
    ) {
      throw new DeployEvidenceError("Release is not deployable from persisted worker evidence");
    }

    const approvedArtifact = buildApprovedReleaseArtifact(input.data, context);
    const renderedArtifact = renderApprovedReleaseArtifact(approvedArtifact);
    const mediaFiles = await buildReleaseMediaFiles(context.mediaVariants, input.objectStorage);
    const staticSiteArtifact = StaticSiteArtifactSchema.parse({
      files: [...renderedArtifact.files, ...mediaFiles]
    });
    const approvedArtifactKey = buildReleaseArtifactKey(input.data.releasePlanId);
    const buildArtifactKey = buildStaticSiteArtifactKey(input.data.releasePlanId);
    const evidence = buildDeployEvidence(context, {
      approvedArtifactKey,
      renderedFileCount: staticSiteArtifact.files.length,
      staticSiteArtifactKey: buildArtifactKey
    });

    await input.objectStorage.putJson({
      key: approvedArtifactKey,
      value: approvedArtifact
    });
    await input.objectStorage.putJson({
      key: buildArtifactKey,
      value: staticSiteArtifact
    });

    const deployment = await input.repository.startDeployment({
      data: input.data,
      context,
      evidence
    });

    if (isReplayableProviderDeployment(deployment)) {
      return replayProviderDeployment(input, deployment);
    }

    if (deployment.providerDeployId) {
      hasProviderDeployEvidence = true;
      return await reconcileExistingProviderDeploy({
        data: input.data,
        deployment,
        jobId: input.jobId,
        repository: input.repository,
        siteHosting: input.siteHosting
      });
    }

    if (requiresManualReconciliation(deployment)) {
      throw new ManualReconciliationRequiredError("Provider operation requires manual reconciliation");
    }

    if (hasInFlightProviderOperation(deployment)) {
      await input.repository.markManualReconciliationRequired({
        data: input.data,
        message: "Provider mutation was in flight without a recorded providerDeployId",
        evidence: {
          source: "deploy_worker_started_in_flight_guard",
          deploymentId: deployment.id
        }
      });
      throw new ManualReconciliationRequiredError(
        "Provider mutation was in flight without a recorded providerDeployId; manual reconciliation is required"
      );
    }

    await input.repository.markProviderMutationInFlight({
      data: input.data,
      evidence
    });

    let started: BeginDeployResult;

    try {
      started = await input.siteHosting.beginDeploy({
        deploymentId: deployment.id,
        projectId: input.data.projectId,
        releasePlanId: input.data.releasePlanId,
        deploymentKey: input.data.deploymentKey,
        jobRunId: input.data.jobRunId,
        buildArtifactKey,
        hostingSiteId: context.hostingSiteId,
        evidence
      });
    } catch (error) {
      await input.repository.markManualReconciliationRequired({
        data: input.data,
        message: "Provider deploy begin failed after provider mutation was marked in flight",
        evidence: {
          source: "deploy_worker_begin_failed",
          deploymentId: deployment.id,
          failure: normalizeFailureMessage(error)
        }
      });
      throw new ManualReconciliationRequiredError(
        "Provider deploy begin failed after provider mutation was marked in flight; manual reconciliation is required"
      );
    }

    if (started.status === "not_configured") {
      throw new DeployConfigurationError(started.message);
    }

    try {
      await input.repository.markProviderDeployStarted({
        data: input.data,
        result: started,
        evidence
      });
    } catch (error) {
      if (error instanceof ManualReconciliationRequiredError) {
        throw error;
      }

      try {
        await input.repository.markManualReconciliationRequired({
          data: input.data,
          message: "Provider deploy id could not be persisted after provider begin succeeded",
          evidence: {
            source: "deploy_worker_provider_id_persist_failed",
            deploymentId: deployment.id,
            providerDeployId: started.providerDeployId,
            failure: normalizeFailureMessage(error)
          }
        });
        throw new ManualReconciliationRequiredError(
          "Provider deploy id could not be persisted after provider begin succeeded; manual reconciliation is required"
        );
      } catch (manualError) {
        if (manualError instanceof ManualReconciliationRequiredError) {
          throw manualError;
        }

        throw new ProviderDeployIdPersistenceError(
          `Provider deploy ${started.providerDeployId} could not be persisted; retry must not mark deployment failed`
        );
      }
    }
    hasProviderDeployEvidence = true;

    const upload = await input.siteHosting.uploadDeployFiles({
      projectId: input.data.projectId,
      releasePlanId: input.data.releasePlanId,
      deploymentKey: input.data.deploymentKey,
      buildArtifactKey,
      providerDeployId: started.providerDeployId,
      resumeToken: started.resumeToken
    });
    try {
      await input.repository.markProviderUploadCompleted({
        data: input.data,
        providerDeployId: started.providerDeployId,
        evidence: upload.evidence
      });
    } catch (error) {
      if (error instanceof ManualReconciliationRequiredError) {
        throw error;
      }

      throw new ProviderUploadStatePersistenceError(
        `Provider deploy ${started.providerDeployId} upload completion could not be persisted; retry must not mark deployment failed`
      );
    }
    const snapshot = await input.siteHosting.getDeploy({ providerDeployId: started.providerDeployId });

    if (snapshot.status === "failed" || snapshot.status === "rolled_back") {
      throw new ProviderDeployTerminalStatusError(snapshot.status);
    }

    if (snapshot.status !== "ready") {
      const result: Extract<DeployReleaseResult, { status: "pending" }> = {
        status: "pending",
        providerDeployId: snapshot.providerDeployId,
        liveUrls: snapshot.liveUrls,
        evidence: {
          providerSnapshot: snapshot.evidence ?? null,
          begin: started.evidence ?? null,
          upload: upload.evidence ?? null
        }
      };
      await input.repository.markProviderPending({
        data: input.data,
        result,
        evidence
      });
      throw new ProviderDeployPendingError("Provider deploy is pending");
    }

    const result: Extract<DeployReleaseResult, { status: "ready" }> = {
      status: "ready",
      providerDeployId: snapshot.providerDeployId,
      liveUrls: snapshot.liveUrls,
      evidence: {
        providerSnapshot: snapshot.evidence ?? null,
        begin: started.evidence ?? null,
        upload: upload.evidence ?? null
      }
    };
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
    if (shouldMarkDeployFailed(error, isFinalAttempt, { hasProviderDeployEvidence })) {
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

export function buildStaticSiteArtifactKey(releasePlanId: string): string {
  return `releases/${releasePlanId}/static-site-artifact.json`;
}

export async function buildReleaseMediaFiles(
  variants: ResolvedPageVersionMediaVariantRecord[],
  storage: Pick<MediaAssetStoragePort, "readPrivateObject">
): Promise<StaticSiteFile[]> {
  const files = new Map<string, StaticSiteFile>();

  for (const variant of variants) {
    const path = buildPageMediaVariantPath({
      assetId: variant.assetId,
      sha256: variant.checksumSha256,
      width: variant.width
    });
    const existing = files.get(path);
    if (existing) {
      continue;
    }

    let body: Uint8Array;
    try {
      body = await storage.readPrivateObject({ key: variant.storageKey, maxBytes: variant.bytes });
    } catch {
      throw new DeployEvidenceError(`Release media bytes are unavailable: ${path}`);
    }
    if (body.byteLength !== variant.bytes || sha256Hex(body) !== variant.checksumSha256) {
      throw new DeployEvidenceError(`Release media bytes do not match the approved manifest: ${path}`);
    }

    files.set(path, {
      path,
      contentType: variant.contentType,
      encoding: "base64",
      body: Buffer.from(body).toString("base64")
    });
  }

  return [...files.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function sha256Hex(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createDrizzleDeployRepository(db: WorkerDb): DeployRepository {
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
        .select({
          id: releasePlanItems.id,
          pageVersionId: releasePlanItems.pageVersionId,
          pageVersionStatus: pageVersions.status,
          pageVersionApprovedAt: pageVersions.approvedAt,
          targetUrl: releasePlanItems.targetUrl,
          targetSubdomain: releasePlanItems.targetSubdomain,
          action: releasePlanItems.action,
          pageJson: pageVersions.pageJson
        })
        .from(releasePlanItems)
        .leftJoin(pageVersions, eq(pageVersions.id, releasePlanItems.pageVersionId))
        .where(eq(releasePlanItems.releasePlanId, data.releasePlanId));
      const mediaVariants = await loadResolvedPageVersionMediaVariants(db, {
        projectId: data.projectId,
        pageVersionIds: itemRows.flatMap((item) => (item.pageVersionId ? [item.pageVersionId] : []))
      });
      const rollbackRows = await db
        .select({ id: rollbackPoints.id })
        .from(rollbackPoints)
        .where(
          and(
            eq(rollbackPoints.projectId, data.projectId),
            eq(rollbackPoints.releasePlanId, data.releasePlanId),
            isNotNull(rollbackPoints.providerDeployId)
          )
        );
      const priorDeploymentRows = await db
        .select({ id: deployments.id })
        .from(deployments)
        .where(
          and(
            eq(deployments.projectId, data.projectId),
            not(eq(deployments.releasePlanId, data.releasePlanId)),
            inArray(deployments.status, rollbackSourceDeploymentStatusValues)
          )
        );
      const [website] = await db
        .select({ hostingSiteId: mainWebsites.hostingSiteId })
        .from(mainWebsites)
        .where(eq(mainWebsites.projectId, data.projectId))
        .limit(1);
      const [existingDeployment] = await db
        .select()
        .from(deployments)
        .where(eq(deployments.deploymentKey, data.deploymentKey))
        .limit(1);

      return {
        plan,
        hasApproval: Boolean(approval),
        checks: checkRows.map(mapReleaseCheck),
        hostingSiteId: website?.hostingSiteId ?? undefined,
        releaseItems: itemRows.map(mapReleaseArtifactItem),
        mediaVariants,
        rollbackPointCount: rollbackRows.length,
        priorSuccessfulDeploymentCount: priorDeploymentRows.length,
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
          .where(
            and(
              eq(deployments.deploymentKey, input.data.deploymentKey),
              or(
                inArray(deployments.status, ["pending", "deploying"]),
                and(eq(deployments.status, "failed"), eq(deployments.providerOperationStatus, "not_started"))
              ),
              not(eq(deployments.providerOperationStatus, "manual_reconciliation_required"))
            )
          )
          .returning();

        const [currentDeployment] = deployment
          ? [deployment]
          : await tx.select().from(deployments).where(eq(deployments.deploymentKey, input.data.deploymentKey)).limit(1);

        if (!currentDeployment) {
          throw new Error("Failed to create deployment ledger row");
        }

        if (currentDeployment.status === "deploying" && !requiresManualReconciliation(currentDeployment)) {
          await tx
            .update(releasePlans)
            .set({
              status: "deploying",
              updatedAt: new Date()
            })
            .where(
              and(eq(releasePlans.id, input.data.releasePlanId), eq(releasePlans.projectId, input.data.projectId))
            );
        }

        return currentDeployment;
      });
    },

    async markProviderSucceeded(input) {
      return db.transaction(async (tx) => {
        const [deployment] = await tx
          .update(deployments)
          .set({
            status: "provider_succeeded",
            providerDeployId: input.result.providerDeployId,
            providerOperationStatus: "recorded",
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
          .where(
            and(
              eq(deployments.deploymentKey, input.data.deploymentKey),
              not(eq(deployments.providerOperationStatus, "manual_reconciliation_required"))
            )
          )
          .returning();

        if (!deployment) {
          throw new Error("Failed to update deployment provider result");
        }

        return deployment;
      });
    },

    async markProviderPending(input) {
      return db.transaction(async (tx) => {
        const [deployment] = await tx
          .update(deployments)
          .set({
            status: "deploying",
            providerDeployId: input.result.providerDeployId,
            providerOperationStatus: "recorded",
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
          .where(
            and(
              eq(deployments.deploymentKey, input.data.deploymentKey),
              not(eq(deployments.providerOperationStatus, "manual_reconciliation_required"))
            )
          )
          .returning();

        if (!deployment) {
          throw new Error("Failed to update pending deployment provider result");
        }

        return deployment;
      });
    },

    async markProviderDeployStarted(input) {
      return db.transaction(async (tx) => {
        const [deployment] = await tx
          .update(deployments)
          .set({
            status: "deploying",
            providerDeployId: input.result.providerDeployId,
            providerOperationStatus: "recorded",
            liveUrl: input.result.liveUrls[0] ?? null,
            evidenceJson: {
              ...input.evidence,
              provider: {
                status: input.result.status,
                providerDeployId: input.result.providerDeployId,
                liveUrls: input.result.liveUrls,
                resumeToken: input.result.resumeToken ?? null,
                evidence: input.result.evidence ?? null
              }
            },
            updatedAt: new Date()
          })
          .where(
            and(
              eq(deployments.deploymentKey, input.data.deploymentKey),
              not(eq(deployments.providerOperationStatus, "manual_reconciliation_required"))
            )
          )
          .returning();

        if (!deployment) {
          const [currentDeployment] = await tx
            .select()
            .from(deployments)
            .where(eq(deployments.deploymentKey, input.data.deploymentKey))
            .limit(1);

          if (currentDeployment && requiresManualReconciliation(currentDeployment)) {
            throw new ManualReconciliationRequiredError("Provider operation requires manual reconciliation");
          }

          throw new ProviderDeployIdPersistenceError("Failed to record started provider deploy");
        }

        return deployment;
      });
    },

    async markProviderUploadCompleted(input) {
      return db.transaction(async (tx) => {
        const [currentDeployment] = await tx
          .select()
          .from(deployments)
          .where(eq(deployments.deploymentKey, input.data.deploymentKey))
          .limit(1);

        if (!currentDeployment) {
          throw new Error("Cannot mark upload complete for missing deployment");
        }

        if (requiresManualReconciliation(currentDeployment)) {
          throw new ManualReconciliationRequiredError("Provider operation requires manual reconciliation");
        }

        const currentEvidence = recordFromUnknown(currentDeployment.evidenceJson);
        const currentProviderEvidence = recordFromUnknown(currentEvidence.provider);
        const [deployment] = await tx
          .update(deployments)
          .set({
            evidenceJson: {
              ...currentEvidence,
              provider: {
                ...currentProviderEvidence,
                resumeToken: null,
                upload: {
                  status: "completed",
                  completedAt: new Date().toISOString(),
                  evidence: input.evidence ?? null
                }
              }
            },
            updatedAt: new Date()
          })
          .where(
            and(
              eq(deployments.deploymentKey, input.data.deploymentKey),
              eq(deployments.providerDeployId, input.providerDeployId),
              not(eq(deployments.providerOperationStatus, "manual_reconciliation_required"))
            )
          )
          .returning();

        if (!deployment) {
          throw new ProviderUploadStatePersistenceError("Failed to record completed provider upload");
        }

        return deployment;
      });
    },

    async markProviderMutationInFlight(input) {
      return db.transaction(async (tx) => {
        const [deployment] = await tx
          .update(deployments)
          .set({
            providerOperationStatus: "in_flight",
            evidenceJson: {
              ...input.evidence,
              providerMutation: {
                status: "in_flight",
                markedAt: new Date().toISOString()
              }
            },
            updatedAt: new Date()
          })
          .where(
            and(
              eq(deployments.deploymentKey, input.data.deploymentKey),
              eq(deployments.providerOperationStatus, "not_started")
            )
          )
          .returning();

        if (deployment) {
          return deployment;
        }

        const [currentDeployment] = await tx
          .select()
          .from(deployments)
          .where(eq(deployments.deploymentKey, input.data.deploymentKey))
          .limit(1);

        if (currentDeployment && requiresManualReconciliation(currentDeployment)) {
          throw new ManualReconciliationRequiredError("Provider operation requires manual reconciliation");
        }

        if (currentDeployment) {
          const currentEvidence = recordFromUnknown(currentDeployment.evidenceJson);
          const [manualDeployment] = await tx
            .update(deployments)
            .set({
              providerOperationStatus: "manual_reconciliation_required",
              evidenceJson: {
                ...currentEvidence,
                manualReconciliation: {
                  message: "Provider mutation could not be started from the current operation state",
                  markedAt: new Date().toISOString(),
                  evidence: {
                    source: "deploy_worker_provider_mutation_conflict",
                    providerOperationStatus: currentDeployment.providerOperationStatus
                  }
                }
              },
              updatedAt: new Date()
            })
            .where(eq(deployments.deploymentKey, input.data.deploymentKey))
            .returning();

          if (manualDeployment) {
            throw new ManualReconciliationRequiredError(
              "Provider mutation cannot be started from the current operation state"
            );
          }
        }

        throw new ManualReconciliationRequiredError(
          "Provider mutation cannot be started from the current operation state"
        );
      });
    },

    async markManualReconciliationRequired(input) {
      return db.transaction(async (tx) => {
        const [currentDeployment] = await tx
          .select()
          .from(deployments)
          .where(eq(deployments.deploymentKey, input.data.deploymentKey))
          .limit(1);

        if (!currentDeployment) {
          throw new Error("Cannot mark missing deployment for manual reconciliation");
        }

        const currentEvidence = recordFromUnknown(currentDeployment.evidenceJson);
        const [deployment] = await tx
          .update(deployments)
          .set({
            providerOperationStatus: "manual_reconciliation_required",
            evidenceJson: {
              ...currentEvidence,
              manualReconciliation: {
                message: input.message,
                markedAt: new Date().toISOString(),
                evidence: input.evidence ?? null
              }
            },
            updatedAt: new Date()
          })
          .where(eq(deployments.deploymentKey, input.data.deploymentKey))
          .returning();

        if (!deployment) {
          throw new Error("Failed to mark deployment for manual reconciliation");
        }

        return deployment;
      });
    },

    async markReleaseLive(data) {
      await db
        .update(releasePlans)
        .set({
          status: "live",
          deployedAt: sql`coalesce(${releasePlans.deployedAt}, now())`,
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
      const providerOperationStatus = providerOperationFailureStatus(error);

      await db.transaction(async (tx) => {
        await tx
          .insert(deployments)
          .values({
            projectId: data.projectId,
            releasePlanId: data.releasePlanId,
            deploymentKey: data.deploymentKey,
            status: "failed",
            providerOperationStatus,
            evidenceJson: evidence
          })
          .onConflictDoNothing();

        const [deployment] = await tx
          .update(deployments)
          .set({
            status: "failed",
            providerOperationStatus,
            evidenceJson: evidence,
            updatedAt: new Date()
          })
          .where(
            and(
              eq(deployments.deploymentKey, data.deploymentKey),
              not(inArray(deployments.status, deployFailureProtectedDeploymentStatusValues)),
              not(eq(deployments.providerOperationStatus, "manual_reconciliation_required"))
            )
          )
          .returning({ id: deployments.id });

        if (!deployment) {
          return;
        }

        await tx
          .update(releasePlans)
          .set({
            status: "failed",
            updatedAt: new Date()
          })
          .where(and(eq(releasePlans.id, data.releasePlanId), eq(releasePlans.projectId, data.projectId)));

        await demoteReleaseCandidatePageVersionsForPlan(tx, {
          projectId: data.projectId,
          releasePlanId: data.releasePlanId,
          updatedAt: new Date()
        });
      });
    }
  };
}

export async function reconcilePendingDeployments(input: {
  db: WorkerDb;
  siteHosting: SiteHostingPort;
  limit?: number;
}): Promise<PendingDeploymentReconcileResult> {
  const limit = input.limit ?? 25;
  const repository = createDrizzleDeployRepository(input.db);
  const rows = await input.db
    .select()
    .from(deployments)
    .where(
      and(
        eq(deployments.status, "deploying"),
        isNotNull(deployments.providerDeployId),
        not(eq(deployments.providerOperationStatus, "manual_reconciliation_required"))
      )
    )
    .limit(limit);
  const result: PendingDeploymentReconcileResult = {
    checked: rows.length,
    succeeded: 0,
    pending: 0,
    failed: 0
  };

  for (const deployment of rows) {
    if (!deployment.releasePlanId) {
      continue;
    }

    const data = {
      projectId: deployment.projectId,
      releasePlanId: deployment.releasePlanId,
      deploymentKey: deployment.deploymentKey
    };

    try {
      await reconcileExistingProviderDeploy({
        data,
        deployment,
        jobId: `deploy_reconcile:${deployment.deploymentKey}`,
        repository,
        siteHosting: input.siteHosting
      });
      result.succeeded += 1;
    } catch (error) {
      if (error instanceof ProviderDeployPendingError) {
        result.pending += 1;
        continue;
      }

      if (error instanceof ManualReconciliationRequiredError) {
        continue;
      }

      if (error instanceof ProviderUploadStatePersistenceError || error instanceof ProviderDeployIdPersistenceError) {
        result.pending += 1;
        continue;
      }

      if (shouldKeepProviderBackedDeploymentReconcilable(error)) {
        result.pending += 1;
        continue;
      }

      if (!(error instanceof ProviderDeployTerminalStatusError)) {
        throw error;
      }

      await repository.markFailed(data, error);
      result.failed += 1;
    }
  }

  return result;
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

  const snapshot = await getProviderSnapshotAfterUploadResume({
    data: input.data,
    deployment: input.deployment,
    providerDeployId,
    repository: input.repository,
    siteHosting: input.siteHosting
  });

  if (snapshot.status === "ready") {
    const deployment = await input.repository.markProviderSucceeded({
      data: input.data,
      result: {
        status: "ready",
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
    throw new ProviderDeployTerminalStatusError(snapshot.status);
  }

  await input.repository.markProviderPending({
    data: input.data,
    result: {
      status: "pending",
      providerDeployId: snapshot.providerDeployId,
      liveUrls: snapshot.liveUrls,
      evidence: snapshot.evidence
    },
    evidence: {
      source: "deploy_worker_reconcile",
      providerSnapshot: snapshot
    }
  });

  throw new ProviderDeployPendingError(`Provider deploy is still ${snapshot.status}`);
}

async function getProviderSnapshotAfterUploadResume(input: {
  data: DeployJobData;
  deployment: DeploymentRow;
  providerDeployId: string;
  repository: DeployRepository;
  siteHosting: SiteHostingPort;
}): Promise<ProviderDeploySnapshot> {
  const initialSnapshot = await input.siteHosting.getDeploy({ providerDeployId: input.providerDeployId });

  if (
    initialSnapshot.status === "ready" ||
    initialSnapshot.status === "failed" ||
    initialSnapshot.status === "rolled_back"
  ) {
    return initialSnapshot;
  }

  const resumeToken = providerResumeTokenFromDeployment(input.deployment);

  if (!resumeToken) {
    return initialSnapshot;
  }

  const upload = await input.siteHosting.uploadDeployFiles({
    projectId: input.data.projectId,
    releasePlanId: input.data.releasePlanId,
    deploymentKey: input.data.deploymentKey,
    buildArtifactKey: buildStaticSiteArtifactKey(input.data.releasePlanId),
    providerDeployId: input.providerDeployId,
    resumeToken
  });
  await input.repository.markProviderUploadCompleted({
    data: input.data,
    providerDeployId: input.providerDeployId,
    evidence: upload.evidence
  });

  return input.siteHosting.getDeploy({ providerDeployId: input.providerDeployId });
}

function mapReleaseCheck(row: typeof releaseChecks.$inferSelect): ReleaseCheck {
  return {
    checkKey: row.checkKey,
    scope: toReleaseCheckScope(row.scope),
    severity: row.severity,
    result: row.result,
    message: row.message,
    evidence: row.evidenceJson ?? undefined
  };
}

function mapReleaseArtifactItem(row: {
  id: string;
  pageVersionId: string | null;
  pageVersionStatus: string | null;
  pageVersionApprovedAt: Date | null;
  targetUrl: string;
  targetSubdomain: string | null;
  action: string;
  pageJson: Record<string, unknown> | null;
}): ReleaseArtifactItem {
  assertDeployableReleaseArtifactItem(row);
  const action = ReleaseItemActionSchema.parse(row.action);
  const pageJson = row.pageJson ? PageJsonSchema.parse(row.pageJson) : null;

  return {
    id: row.id,
    pageVersionId: row.pageVersionId,
    pageVersionStatus: toPageVersionStatus(row.pageVersionStatus),
    pageVersionApprovedAt: row.pageVersionApprovedAt,
    targetUrl: row.targetUrl,
    targetSubdomain: row.targetSubdomain,
    action,
    pageJson
  };
}

function requiresPageVersionArtifact(action: string): boolean {
  const parsed = ReleaseItemActionSchema.safeParse(action);

  if (!parsed.success) {
    throw new DeployEvidenceError(`Release item action '${action}' is not supported.`);
  }

  return parsed.data === "create" || parsed.data === "update";
}

const deployablePageVersionStatuses = new Set<string>(["approved", "release_candidate"]);

function assertDeployableReleaseArtifactItem(item: {
  id: string;
  pageVersionId: string | null;
  pageVersionStatus: string | null;
  pageVersionApprovedAt: Date | null;
  action: string;
  pageJson: Record<string, unknown> | null;
}): void {
  if (!requiresPageVersionArtifact(item.action)) {
    return;
  }

  if (!item.pageVersionId) {
    throw new DeployEvidenceError(`Release item ${item.id} is missing a page version.`);
  }

  if (!deployablePageVersionStatuses.has(item.pageVersionStatus ?? "")) {
    throw new DeployEvidenceError(`Release item ${item.id} references an unapproved page version.`);
  }

  if (!item.pageVersionApprovedAt) {
    throw new DeployEvidenceError(`Release item ${item.id} references a page version without approval evidence.`);
  }

  if (!item.pageJson) {
    throw new DeployEvidenceError(`Release item ${item.id} references a page version without pageJson.`);
  }

  const pageJsonResult = PageJsonSchema.safeParse(item.pageJson);

  if (!pageJsonResult.success) {
    throw new DeployEvidenceError(`Release item ${item.id} references invalid pageJson.`);
  }
}

function toPageVersionStatus(status: string | null): PageVersionStatus | null {
  if (status === null) {
    return null;
  }

  if (
    status === "draft" ||
    status === "preview" ||
    status === "changes_requested" ||
    status === "approved" ||
    status === "release_candidate" ||
    status === "released" ||
    status === "superseded"
  ) {
    return status;
  }

  throw new DeployEvidenceError(`Page version status '${status}' is not supported.`);
}

function toDeployablePlan(plan: ReleasePlanRow): ReleasePlan | undefined {
  if (plan.status !== "approved_for_deploy" && plan.status !== "deploying") {
    return undefined;
  }

  return {
    releasePlanId: plan.id,
    projectId: plan.projectId,
    status: "approved_for_deploy",
    riskLevel: toReleaseRiskLevel(plan.riskLevel),
    blockerCount: plan.blockerCount,
    warningCount: plan.warningCount
  };
}

function buildDeployEvidence(
  context: DeployContext,
  artifactEvidence: {
    approvedArtifactKey: string;
    renderedFileCount: number;
    staticSiteArtifactKey: string;
  }
): Record<string, unknown> {
  return {
    source: "deploy_worker",
    releasePlanStatusAtStart: context.plan.status,
    releaseItemCount: context.releaseItems.length,
    approvedArtifactKey: artifactEvidence.approvedArtifactKey,
    staticSiteArtifactKey: artifactEvidence.staticSiteArtifactKey,
    renderedFileCount: artifactEvidence.renderedFileCount,
    rollbackPointCount: context.rollbackPointCount,
    priorSuccessfulDeploymentCount: context.priorSuccessfulDeploymentCount,
    hasApproval: context.hasApproval,
    hasHostingSiteId: Boolean(context.hostingSiteId),
    checks: context.checks.map((check) => ({
      checkKey: check.checkKey,
      severity: check.severity,
      result: check.result
    }))
  };
}

function buildApprovedReleaseArtifact(data: DeployJobData, context: DeployContext): ApprovedReleaseArtifact {
  return {
    projectId: data.projectId,
    releasePlanId: data.releasePlanId,
    deploymentKey: data.deploymentKey,
    createdAt: new Date().toISOString(),
    pages: context.releaseItems.map((item) => {
      assertDeployableReleaseArtifactItem(item);

      return {
        releasePlanItemId: item.id,
        pageVersionId: item.pageVersionId,
        targetUrl: item.targetUrl,
        targetSubdomain: item.targetSubdomain,
        action: item.action,
        pageJson: item.pageJson
      };
    })
  };
}

function toReleaseCheckScope(scope: string): ReleaseCheck["scope"] {
  if (
    scope === "page" ||
    scope === "project" ||
    scope === "domain" ||
    scope === "sitemap" ||
    scope === "tracking" ||
    scope === "gsc"
  ) {
    return scope;
  }

  throw new Error(`Unknown release check scope from database: ${scope}`);
}

function toReleaseRiskLevel(riskLevel: string): ReleasePlan["riskLevel"] {
  if (riskLevel === "low" || riskLevel === "medium" || riskLevel === "high") {
    return riskLevel;
  }

  throw new Error(`Unknown release risk level from database: ${riskLevel}`);
}

async function replayProviderDeployment(
  input: Pick<Parameters<typeof executeDeploy>[0], "data" | "jobId" | "repository">,
  deployment: DeploymentRow
): Promise<Record<string, unknown>> {
  if (isReleaseLiveProjectableDeployment(deployment)) {
    await input.repository.markReleaseLive(input.data);
  }

  return {
    jobId: input.jobId,
    projectId: input.data.projectId,
    releasePlanId: input.data.releasePlanId,
    deploymentId: deployment.id,
    deploymentKey: deployment.deploymentKey,
    providerDeployId: deployment.providerDeployId ?? undefined,
    status: "already_deployed"
  };
}

function isReplayableProviderDeployment(deployment: DeploymentRow): boolean {
  return replayableProviderDeploymentStatuses.has(deployment.status);
}

function isReleaseLiveProjectableDeployment(deployment: DeploymentRow): boolean {
  return releaseLiveProjectableDeploymentStatuses.has(deployment.status);
}

function hasRollbackEvidence(
  context: Pick<DeployContext, "rollbackPointCount" | "priorSuccessfulDeploymentCount">
): boolean {
  return context.rollbackPointCount > 0 || context.priorSuccessfulDeploymentCount === 0;
}

function hasInFlightProviderOperation(deployment: DeploymentRow): boolean {
  return deployment.providerOperationStatus === "in_flight" && !deployment.providerDeployId;
}

function requiresManualReconciliation(deployment: DeploymentRow): boolean {
  return deployment.providerOperationStatus === "manual_reconciliation_required";
}

function providerResumeTokenFromDeployment(deployment: DeploymentRow): ProviderUploadResumeToken | undefined {
  const evidence = recordFromUnknown(deployment.evidenceJson);
  const provider = recordFromUnknown(evidence.provider);

  if (recordFromUnknown(provider.upload).status === "completed") {
    return undefined;
  }

  const resumeToken = recordFromUnknown(provider.resumeToken);

  return Object.keys(resumeToken).length > 0 ? resumeToken : undefined;
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : "deploy_worker_failed";
}

function shouldMarkDeployFailed(
  error: unknown,
  isFinalAttempt: boolean,
  input: { hasProviderDeployEvidence: boolean } = { hasProviderDeployEvidence: false }
): boolean {
  if (
    error instanceof ProviderDeployPendingError ||
    error instanceof ManualReconciliationRequiredError ||
    error instanceof ProviderDeployIdPersistenceError ||
    error instanceof ProviderUploadStatePersistenceError
  ) {
    return false;
  }

  if (error instanceof DeployConfigurationError || error instanceof DeployEvidenceError) {
    return true;
  }

  if (error instanceof ProviderDeployTerminalStatusError) {
    return true;
  }

  if (input.hasProviderDeployEvidence) {
    return false;
  }

  return isFinalAttempt;
}

function shouldKeepProviderBackedDeploymentReconcilable(error: unknown): boolean {
  return isProviderRequestError(error);
}

function providerOperationFailureStatus(error: unknown): "not_started" | "failed" {
  if (error instanceof DeployConfigurationError || error instanceof DeployEvidenceError) {
    return "not_started";
  }

  return "failed";
}
