import { randomUUID } from "node:crypto";
import { Global, Inject, Injectable, Module, type OnModuleDestroy } from "@nestjs/common";
import { createRedisConnection } from "@localseo/adapters";
import { parseAppEnv } from "@localseo/config";
import type { JobName, QueueName } from "@localseo/contracts";
import { jobRuns, type DatabaseClient } from "@localseo/db";
import { Queue, type JobsOptions } from "bullmq";
import { and, eq, inArray, sql } from "@localseo/db/query";
import { DatabaseService } from "./database/database.service.js";

const env = parseAppEnv(process.env);

export type ApiQueueName = Extract<
  QueueName,
  | "pre-audit"
  | "website-import"
  | "opportunity-scout"
  | "opportunity-research"
  | "page-generation"
  | "media-processing"
  | "serp-scout"
  | "technical-audit"
  | "deploy"
  | "rollback"
  | "release-verification"
  | "report"
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
  jobName: JobName;
  jobId: string;
  data: Record<string, unknown>;
  options?: JobsOptions;
  audit?: QueueAuditInput;
};

type DatabaseTransaction = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];
type DatabaseExecutor = DatabaseClient | DatabaseTransaction;

// queue.add failures are reported as a value so the surrounding transaction can
// commit the failed audit row instead of rolling it back.
type EnqueueOutcome = { ok: true } | { ok: false; error: unknown };

@Injectable()
export class QueueProducerService implements OnModuleDestroy {
  private readonly queues: QueueRegistry;
  private readonly enqueueChains = new Map<string, Promise<void>>();

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {
    const redisConnection = env.REDIS_URL ? createRedisConnection(env.REDIS_URL) : undefined;
    this.queues = redisConnection
      ? {
          "pre-audit": new Queue("pre-audit", { connection: redisConnection }),
          "website-import": new Queue("website-import", { connection: redisConnection }),
          "opportunity-scout": new Queue("opportunity-scout", { connection: redisConnection }),
          "opportunity-research": new Queue("opportunity-research", { connection: redisConnection }),
          "page-generation": new Queue("page-generation", { connection: redisConnection }),
          "media-processing": new Queue("media-processing", { connection: redisConnection }),
          "serp-scout": new Queue("serp-scout", { connection: redisConnection }),
          "technical-audit": new Queue("technical-audit", { connection: redisConnection }),
          deploy: new Queue("deploy", { connection: redisConnection }),
          rollback: new Queue("rollback", { connection: redisConnection }),
          "release-verification": new Queue("release-verification", { connection: redisConnection }),
          report: new Queue("report", { connection: redisConnection })
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
      await this.recordJobRun(this.database.db, input, "dry_run");
      return false;
    }

    const outcome = await this.serializeEnqueue(input, (db) => this.replaceOrCoalesceJob(queue, input, attempts, db));

    if (!outcome.ok) {
      throw outcome.error;
    }

    return true;
  }

  // Two concurrent enqueues of the same job id must not both pass the coalesce
  // check: the loser would remove the job the winner just added. Enqueues are
  // serialized per (queueName, jobId) in-process, and across instances via a
  // Postgres advisory lock held for the whole check/remove/record/add sequence.
  private async serializeEnqueue(
    input: EnqueueInput,
    task: (db: DatabaseExecutor | undefined) => Promise<EnqueueOutcome>
  ): Promise<EnqueueOutcome> {
    const key = `${input.queueName}:${input.jobId}`;
    const previous = this.enqueueChains.get(key) ?? Promise.resolve();
    const current = previous.then(() => this.runEnqueueTransaction(input, task));
    const settled = current.then(
      () => undefined,
      () => undefined
    );
    this.enqueueChains.set(key, settled);
    void settled.then(() => {
      if (this.enqueueChains.get(key) === settled) {
        this.enqueueChains.delete(key);
      }
    });

    return current;
  }

  private async runEnqueueTransaction(
    input: EnqueueInput,
    task: (db: DatabaseExecutor | undefined) => Promise<EnqueueOutcome>
  ): Promise<EnqueueOutcome> {
    const db = this.database.db;

    if (!db || !input.audit) {
      return task(db);
    }

    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.queueName}), hashtext(${input.jobId}))`);
      return task(tx);
    });
  }

  private async replaceOrCoalesceJob(
    queue: Queue,
    input: EnqueueInput,
    attempts: number,
    db: DatabaseExecutor | undefined
  ): Promise<EnqueueOutcome> {
    const existingJob = await queue.getJob(input.jobId);

    if (existingJob) {
      const existingJobState = await existingJob.getState();

      if (shouldCoalesceExistingBullMqJob(existingJobState)) {
        return { ok: true };
      }

      await existingJob.remove();
    }

    // Only terminal rows may be archived. A row that is still running keeps its
    // external id, so recordJobRun reuses it via the unique-index conflict and
    // the worker's status updates stay attached to the same audit row.
    await this.archiveTerminalJobRun(db, input);

    const jobRunId = await this.recordJobRun(db, input, "queued");

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
      await this.markJobRunFailed(db, jobRunId, error);
      return { ok: false, error };
    }

    return { ok: true };
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(Object.values(this.queues).map((queue) => queue.close()));
  }

  private async recordJobRun(
    db: DatabaseExecutor | undefined,
    input: EnqueueInput,
    status: "queued" | "dry_run"
  ): Promise<string | undefined> {
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

  private async archiveTerminalJobRun(db: DatabaseExecutor | undefined, input: EnqueueInput): Promise<void> {
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

  private async markJobRunFailed(
    db: DatabaseExecutor | undefined,
    jobRunId: string | undefined,
    error: unknown
  ): Promise<void> {
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
