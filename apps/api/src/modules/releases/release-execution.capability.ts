import { randomUUID } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import { DeployJobDataSchema, QueueJobSchema, queueJobNames } from "@localseo/contracts";
import {
  buildReleaseDeploymentKey,
  canDeployRelease,
  deployStartingReleasePlanStatuses
} from "@localseo/domain";
import { releasePlans } from "@localseo/db";
import { and, eq, inArray } from "@localseo/db/query";
import { isPersistedId } from "../../persisted-id.js";
import { DatabaseService } from "../../database/database.service.js";
import { QueueProducerService } from "../../queue-producer.js";
import {
  hasApprovedRelease,
  loadReleaseChecks,
  loadReleasePlanForProject,
  mapReleasePlan
} from "./release-aggregate-store.js";

const deployJobAttempts = 20;
const deployJobBackoffDelayMs = 15_000;

export class ReleaseExecutionCapability {
  constructor(
    private readonly database: DatabaseService,
    private readonly queues: QueueProducerService
  ) {}

  async deploy(projectId: string, releasePlanId: string, userId?: string) {
    const db = this.database.db;

    if (!isPersistedId(releasePlanId)) {
      throw new BadRequestException("Release plan id must be a UUID.");
    }

    if (!db) {
      return QueueJobSchema.parse({
        projectId,
        releasePlanId,
        jobId: randomUUID(),
        type: "deploy",
        status: "dry_run",
        inputRef: releasePlanId,
        createdBy: userId,
        message: "Release persistence is not configured. This is an explicit dry-run response.",
        createdAt: new Date().toISOString()
      });
    }

    const plan = mapReleasePlan(await loadReleasePlanForProject(db, projectId, releasePlanId));
    const checks = await loadReleaseChecks(db, releasePlanId);

    if (checks.length === 0 || !canDeployRelease(plan, checks) || !(await hasApprovedRelease(db, releasePlanId))) {
      throw new BadRequestException("Release must pass preflight and be approved before deploy.");
    }

    const deploymentKey = buildReleaseDeploymentKey(releasePlanId);
    const jobId = deploymentKey;

    const enqueued = await this.queues.enqueue({
      queueName: "deploy",
      jobName: queueJobNames.deploy,
      jobId,
      data: DeployJobDataSchema.parse({
        projectId,
        releasePlanId,
        deploymentKey,
        triggeredByUserId: userId ?? null,
        triggerSource: "user_action"
      }),
      options: {
        attempts: deployJobAttempts,
        backoff: {
          type: "fixed",
          delay: deployJobBackoffDelayMs
        },
        removeOnComplete: true,
        removeOnFail: true
      },
      audit: {
        projectId,
        type: "deploy",
        inputRef: releasePlanId,
        actorType: userId ? "user" : "system",
        actorUserId: userId,
        triggerSource: "user_action"
      }
    });

    if (enqueued) {
      const [deployingPlan] = await db
        .update(releasePlans)
        .set({
          status: "deploying",
          updatedAt: new Date()
        })
        .where(
          and(
            eq(releasePlans.id, releasePlanId),
            eq(releasePlans.projectId, projectId),
            inArray(releasePlans.status, deployStartingReleasePlanStatuses)
          )
        )
        .returning({ id: releasePlans.id });

      if (!deployingPlan) {
        throw new BadRequestException("Release plan changed before deploy could start.");
      }
    }

    return QueueJobSchema.parse({
      projectId,
      releasePlanId,
      jobId,
      type: "deploy",
      status: enqueued ? "queued" : "dry_run",
      inputRef: releasePlanId,
      createdBy: userId,
      message: enqueued ? undefined : "Deploy queue is not configured. This is an explicit dry-run response.",
      createdAt: new Date().toISOString()
    });
  }
}
