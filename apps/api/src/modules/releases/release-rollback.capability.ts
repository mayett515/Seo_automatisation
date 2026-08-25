import { randomUUID } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import {
  ExecuteRollbackRequestSchema,
  QueueJobSchema,
  ReleaseVerificationJobDataSchema,
  ReleaseVerificationQueueResponseSchema,
  RollbackJobDataSchema,
  VerifyReleaseRequestSchema,
  queueJobNames,
  type ReleaseVerificationQueueResponse
} from "@localseo/contracts";
import { isDatabaseUniqueViolation, releaseVerifications } from "@localseo/db";
import { isPersistedId } from "../../persisted-id.js";
import { DatabaseService } from "../../database/database.service.js";
import { QueueProducerService } from "../../queue-producer.js";
import {
  assertReleasePlanForProject,
  findActiveReleaseVerification,
  loadDeploymentForRollbackExecution,
  loadDeploymentForVerification,
  loadReleasePlanForRollbackExecution,
  loadRollbackPointForRelease,
  markReleaseVerificationQueueFailure,
  normalizeQueueFailureMessage,
  rollbackJobId
} from "./release-aggregate-store.js";

const rollbackJobAttempts = 5;
const rollbackJobBackoffDelayMs = 15_000;
const releaseVerificationJobAttempts = 3;
const releaseVerificationJobBackoffDelayMs = 10_000;

export class ReleaseRollbackCapability {
  constructor(
    private readonly database: DatabaseService,
    private readonly queues: QueueProducerService
  ) {}

  async executeRollback(projectId: string, releasePlanId: string, userId: string | undefined, body: unknown) {
    await assertReleasePlanForProject(this.database.db, projectId, releasePlanId);
    const parsed = ExecuteRollbackRequestSchema.safeParse(body ?? {});

    if (!parsed.success) {
      throw new BadRequestException("Rollback execution requires a valid rollbackPointId.");
    }

    const input = parsed.data;
    const db = this.database.db;
    const jobId = rollbackJobId(releasePlanId, input.rollbackPointId);

    if (!isPersistedId(input.rollbackPointId)) {
      throw new BadRequestException("Rollback point id must be a UUID.");
    }

    if (!isPersistedId(releasePlanId)) {
      throw new BadRequestException("Release plan id must be a UUID.");
    }

    if (!db) {
      return QueueJobSchema.parse({
        projectId,
        releasePlanId,
        jobId,
        type: "rollback",
        status: "dry_run",
        inputRef: input.rollbackPointId,
        createdBy: userId,
        message: "Release persistence is not configured. This is an explicit dry-run response.",
        createdAt: new Date().toISOString()
      });
    }

    await loadRollbackPointForRelease(db, projectId, releasePlanId, input.rollbackPointId);
    await loadReleasePlanForRollbackExecution(db, projectId, releasePlanId);
    const deployment = await loadDeploymentForRollbackExecution(db, projectId, releasePlanId);

    const enqueued = await this.queues.enqueue({
      queueName: "rollback",
      jobName: queueJobNames.rollback,
      jobId,
      data: RollbackJobDataSchema.parse({
        projectId,
        releasePlanId,
        deploymentId: deployment.id,
        rollbackPointId: input.rollbackPointId,
        triggeredByUserId: userId ?? null,
        triggerSource: "user_action"
      }),
      options: {
        attempts: rollbackJobAttempts,
        backoff: {
          type: "fixed",
          delay: rollbackJobBackoffDelayMs
        },
        removeOnComplete: true,
        removeOnFail: true
      },
      audit: {
        projectId,
        type: "rollback",
        inputRef: input.rollbackPointId,
        actorType: userId ? "user" : "system",
        actorUserId: userId,
        triggerSource: "user_action"
      }
    });

    return QueueJobSchema.parse({
      projectId,
      releasePlanId,
      jobId,
      type: "rollback",
      status: enqueued ? "queued" : "dry_run",
      inputRef: input.rollbackPointId,
      createdBy: userId,
      message: enqueued ? undefined : "Rollback queue is not configured. This is an explicit dry-run response.",
      createdAt: new Date().toISOString()
    });
  }

  async verify(
    projectId: string,
    releasePlanId: string,
    userId: string | undefined,
    body: unknown
  ): Promise<ReleaseVerificationQueueResponse> {
    await assertReleasePlanForProject(this.database.db, projectId, releasePlanId);
    const parsed = VerifyReleaseRequestSchema.safeParse(body ?? {});

    if (!parsed.success) {
      throw new BadRequestException("Release verification requires a valid optional deploymentId.");
    }

    const input = parsed.data;
    const db = this.database.db;

    if (!isPersistedId(releasePlanId)) {
      throw new BadRequestException("Release plan id must be a UUID.");
    }

    if (!db) {
      return ReleaseVerificationQueueResponseSchema.parse({
        jobId: `release-verification:${releasePlanId}:dry-run`,
        projectId,
        releasePlanId,
        deploymentId: input.deploymentId,
        type: "release_verification",
        status: "dry_run",
        message: "Release persistence is required before post-deploy verification can run.",
        createdAt: new Date().toISOString()
      });
    }

    const deployment = await loadDeploymentForVerification(db, projectId, releasePlanId, input.deploymentId);
    const active = await findActiveReleaseVerification(db, deployment.id);

    if (active) {
      return ReleaseVerificationQueueResponseSchema.parse({
        jobId: active.id,
        projectId,
        releasePlanId,
        deploymentId: deployment.id,
        verificationId: active.id,
        type: "release_verification",
        status: "already_active",
        inputRef: active.id,
        message: "Release verification is already running for this deployment.",
        createdAt: active.createdAt.toISOString()
      });
    }

    const verificationId = randomUUID();
    const jobId = verificationId;

    try {
      await db.insert(releaseVerifications).values({
        id: verificationId,
        releasePlanId,
        deploymentId: deployment.id,
        status: "running",
        summary: "Post-deploy verification is queued.",
        evidenceJson: {
          source: "release_verify_endpoint",
          state: "queued"
        }
      });
    } catch (error) {
      if (isDatabaseUniqueViolation(error)) {
        const conflictingRun = await findActiveReleaseVerification(db, deployment.id);
        if (conflictingRun) {
          return ReleaseVerificationQueueResponseSchema.parse({
            jobId: conflictingRun.id,
            projectId,
            releasePlanId,
            deploymentId: deployment.id,
            verificationId: conflictingRun.id,
            type: "release_verification",
            status: "already_active",
            inputRef: conflictingRun.id,
            message: "Release verification is already running for this deployment.",
            createdAt: conflictingRun.createdAt.toISOString()
          });
        }
      }

      throw error;
    }

    let enqueued: boolean;

    try {
      enqueued = await this.queues.enqueue({
        queueName: "release-verification",
        jobName: queueJobNames["release-verification"],
        jobId,
        data: ReleaseVerificationJobDataSchema.parse({
          projectId,
          releasePlanId,
          deploymentId: deployment.id,
          verificationId,
          triggeredByUserId: userId ?? null,
          triggerSource: "user_action"
        }),
        options: {
          attempts: releaseVerificationJobAttempts,
          backoff: {
            type: "exponential",
            delay: releaseVerificationJobBackoffDelayMs
          }
        },
        audit: {
          projectId,
          type: "release_verification",
          inputRef: verificationId,
          actorType: userId ? "user" : "system",
          actorUserId: userId,
          triggerSource: "user_action"
        }
      });
    } catch (error) {
      await markReleaseVerificationQueueFailure(db, verificationId, normalizeQueueFailureMessage(error));
      throw error;
    }

    if (!enqueued) {
      await markReleaseVerificationQueueFailure(
        db,
        verificationId,
        "Release verification queue was not configured after run creation."
      );
    }

    return ReleaseVerificationQueueResponseSchema.parse({
      jobId,
      projectId,
      releasePlanId,
      deploymentId: deployment.id,
      verificationId,
      type: "release_verification",
      status: enqueued ? "queued" : "dry_run",
      inputRef: verificationId,
      message: enqueued
        ? undefined
        : "Release verification queue is not configured. This is an explicit dry-run response.",
      createdAt: new Date().toISOString()
    });
  }
}
