import { randomUUID } from "node:crypto";
import { Global, Injectable, Module, type OnModuleDestroy } from "@nestjs/common";
import { createRedisConnection } from "@localseo/adapters";
import { parseAppEnv } from "@localseo/config";
import { jobRuns } from "@localseo/db";
import { Queue, type JobsOptions } from "bullmq";
import { eq } from "drizzle-orm";
import { DatabaseService } from "./database/database.service.js";

const env = parseAppEnv(process.env);

export type ApiQueueName = "pre-audit" | "website-import" | "deploy";

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
          deploy: new Queue("deploy", { connection: redisConnection })
        }
      : {};
  }

  async enqueue(input: EnqueueInput): Promise<boolean> {
    const queue = this.queues[input.queueName];

    if (!queue) {
      await this.recordJobRun(input, "dry_run");
      return false;
    }

    const jobRunId = await this.recordJobRun(input, "queued");

    try {
      await queue.add(
        input.jobName,
        {
          ...input.data,
          ...(jobRunId ? { jobRunId } : {})
        },
        {
          jobId: input.jobId,
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 1000
          },
          ...input.options
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
    await db.insert(jobRuns).values({
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
    });

    return jobRunId;
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

@Global()
@Module({
  providers: [QueueProducerService],
  exports: [QueueProducerService]
})
export class QueueProducerModule {}
