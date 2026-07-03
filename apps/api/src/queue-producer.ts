import { randomUUID } from "node:crypto";
import { Global, Injectable, Module, type OnModuleDestroy } from "@nestjs/common";
import { createRedisConnection } from "@localseo/adapters";
import { parseAppEnv } from "@localseo/config";
import type { QueueName } from "@localseo/contracts";
import { jobRuns } from "@localseo/db";
import { Queue, type JobsOptions } from "bullmq";
import { and, eq, inArray, sql } from "drizzle-orm";
import { DatabaseService } from "./database/database.service.js";

const env = parseAppEnv(process.env);

export type ApiQueueName = Extract<
  QueueName,
  "pre-audit" | "website-import" | "opportunity-scout" | "deploy" | "rollback"
>;

type QueueRegistry = Partial<Record<ApiQueueName, Queue>>;

type QueueAuditInput = {
  projectId?: string;
  leadId?: string;
  type: string;
  inputRef?: string;
  actorType: "user" | "system";
  actorUserId?: string;
  triggerSource?: string;
};

type EnqueueInput = {
  queueName: ApiQueueName;
  jobName: string;
  jobId: string;
  data: Record<string, unknown>;
  options?: JobsOptions;
  audit?: QueueAuditInput;
};

@Injectable()
export class QueueProducerService implements OnModuleDestroy {
  private readonly queues: QueueRegistry;

  constructor(private readonly database: DatabaseService) {
    const redisConnection = env.REDIS_URL ? createRedisConnection(env.REDIS_URL) : undefined;
    this.queues = redisConnection
      ? {
          "pre-audit": new Queue("pre-audit", { connection: redisConnection }),
          "website-import": new Queue("website-import", { connection: redisConnection }),
          "opportunity-scout": new Queue("opportunity-scout", { connection: redisConnection }),
          deploy: new Queue("deploy", { connection: redisConnection }),
          rollback: new Queue("rollback", { connection: redisConnection })
        }
      : {};
  }

  isQueueConfigured(queueName: ApiQueueName): boolean {
    return Boolean(this.queues[queueName]);
  }

  async enqueue(input: EnqueueInput): Promise<boolean> {
    const queue = this.queues[input.queueName];
    const attempts = typeof input.options?.attempts === "number" ? input.options.attempts : 3;

    if (!queue) {
      await this.recordJobRun(input, "dry_run");
      return false;
    }

    const existingJob = await queue.getJob(input.jobId);

    if (existingJob) {
      const existingJobState = await existingJob.getState();

      if (shouldCoalesceExistingBullMqJob(existingJobState)) {
        return true;
      }

      await existingJob.remove();
      await this.archiveJobRun(input);
    }

    await this.archiveTerminalJobRun(input);

    const jobRunId = await this.recordJobRun(input, "queued");

    try {
      await queue.add(
        input.jobName,
        {
          ...input.data,
          maxAttempts: attempts,
          ...(jobRunId ? { jobRunId } : {})
        },
        {
          ...input.options,
          attempts,
          jobId: input.jobId,
          backoff: input.options?.backoff ?? {
            type: "exponential",
            delay: 1000
          }
        }
      );
    } catch (error) {
      await this.markJobRunFailed(jobRunId, error);
      throw error;
    }

    return true;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(Object.values(this.queues).map((queue) => queue.close()));
  }

  private async recordJobRun(input: EnqueueInput, status: "queued" | "dry_run"): Promise<string | undefined> {
    const db = this.database.db;

    if (!db || !input.audit) {
      return undefined;
    }

    const jobRunId = randomUUID();
    const [inserted] = await db
      .insert(jobRuns)
      .values({
        id: jobRunId,
        projectId: input.audit.projectId,
        leadId: input.audit.leadId,
        externalJobId: input.jobId,
        queueName: input.queueName,
        type: input.audit.type,
        status,
        inputRef: input.audit.inputRef,
        actorType: input.audit.actorType,
        actorUserId: input.audit.actorUserId,
        triggerSource: input.audit.triggerSource
      })
      .onConflictDoNothing({
        target: [jobRuns.externalJobId, jobRuns.queueName]
      })
      .returning({ id: jobRuns.id });

    if (inserted) {
      return inserted.id;
    }

    const [existing] = await db
      .select({ id: jobRuns.id })
      .from(jobRuns)
      .where(and(eq(jobRuns.externalJobId, input.jobId), eq(jobRuns.queueName, input.queueName)))
      .limit(1);

    return existing?.id;
  }

  private async archiveJobRun(input: EnqueueInput): Promise<void> {
    const db = this.database.db;

    if (!db || !input.audit) {
      return;
    }

    await db
      .update(jobRuns)
      .set({
        externalJobId: sql<string>`${jobRuns.externalJobId} || ':archived:' || ${jobRuns.id}::text`,
        updatedAt: new Date()
      })
      .where(and(eq(jobRuns.externalJobId, input.jobId), eq(jobRuns.queueName, input.queueName)));
  }

  private async archiveTerminalJobRun(input: EnqueueInput): Promise<void> {
    const db = this.database.db;

    if (!db || !input.audit) {
      return;
    }

    await db
      .update(jobRuns)
      .set({
        externalJobId: sql<string>`${jobRuns.externalJobId} || ':archived:' || ${jobRuns.id}::text`,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(jobRuns.externalJobId, input.jobId),
          eq(jobRuns.queueName, input.queueName),
          inArray(jobRuns.status, ["completed", "failed", "cancelled", "dry_run"])
        )
      );
  }

  private async markJobRunFailed(jobRunId: string | undefined, error: unknown): Promise<void> {
    const db = this.database.db;

    if (!db || !jobRunId) {
      return;
    }

    await db
      .update(jobRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        updatedAt: new Date(),
        failureJson: {
          message: normalizeQueueFailureMessage(error)
        }
      })
      .where(eq(jobRuns.id, jobRunId));
  }
}

function normalizeQueueFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : "queue_add_failed";
}

export function shouldCoalesceExistingBullMqJob(state: string): boolean {
  return (
    state === "active" ||
    state === "waiting" ||
    state === "waiting-children" ||
    state === "delayed" ||
    state === "prioritized"
  );
}

@Global()
@Module({
  providers: [QueueProducerService],
  exports: [QueueProducerService]
})
export class QueueProducerModule {}
