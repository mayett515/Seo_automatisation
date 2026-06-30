import { jobRuns, type createDatabaseClient } from "@localseo/db";
import type { Job } from "bullmq";
import { and, eq } from "drizzle-orm";

export type WorkerDbHandle = ReturnType<typeof createDatabaseClient>;
export type WorkerDb = WorkerDbHandle["db"];

type JobRunStatusPatch = {
  status: "running" | "completed" | "failed" | "retrying";
  startedAt?: Date;
  completedAt?: Date | null;
  failureJson?: Record<string, unknown> | null;
};

export async function markJobRunRunning(db: WorkerDb | undefined, job: Job): Promise<void> {
  await updateJobRun(db, job, {
    status: "running",
    startedAt: new Date(),
    completedAt: null,
    failureJson: null
  });
}

export async function markJobRunCompleted(db: WorkerDb | undefined, job: Job): Promise<void> {
  await updateJobRun(db, job, {
    status: "completed",
    completedAt: new Date()
  });
}

export async function markJobRunFailed(db: WorkerDb | undefined, job: Job, error: unknown): Promise<void> {
  await updateJobRun(db, job, {
    status: "failed",
    completedAt: new Date(),
    failureJson: {
      message: normalizeJobFailureMessage(error)
    }
  });
}

export async function markJobRunRetrying(db: WorkerDb | undefined, job: Job, error: unknown): Promise<void> {
  await updateJobRun(db, job, {
    status: "retrying",
    completedAt: null,
    failureJson: {
      message: normalizeJobFailureMessage(error)
    }
  });
}

async function updateJobRun(db: WorkerDb | undefined, job: Job, patch: JobRunStatusPatch): Promise<void> {
  if (!db) {
    return;
  }

  const lookup = jobRunLookupFromJob(job);

  if (!lookup) {
    return;
  }

  const updatedRows =
    lookup.kind === "id"
      ? await updateJobRunById(db, lookup.jobRunId, patch)
      : await updateJobRunByExternalId(db, lookup.externalJobId, lookup.queueName, patch);

  if (updatedRows.length === 0) {
    console.warn(`No job_run row matched worker job ${job.queueName}:${job.id ?? "unknown"}`);
  }
}

async function updateJobRunById(db: WorkerDb, jobRunId: string, patch: JobRunStatusPatch): Promise<{ id: string }[]> {
  return db
    .update(jobRuns)
    .set({
      ...patch,
      updatedAt: new Date()
    })
    .where(eq(jobRuns.id, jobRunId))
    .returning({ id: jobRuns.id });
}

async function updateJobRunByExternalId(
  db: WorkerDb,
  externalJobId: string | undefined,
  queueName: string,
  patch: JobRunStatusPatch
): Promise<{ id: string }[]> {
  if (!externalJobId) {
    return [];
  }

  return db
    .update(jobRuns)
    .set({
      ...patch,
      updatedAt: new Date()
    })
    .where(and(eq(jobRuns.externalJobId, externalJobId), eq(jobRuns.queueName, queueName)))
    .returning({ id: jobRuns.id });
}

export function jobRunLookupFromJob(
  job: Pick<Job, "data" | "id" | "queueName">
):
  | { kind: "id"; jobRunId: string }
  | { kind: "external"; externalJobId: string | undefined; queueName: string }
  | undefined {
  const jobRunId = jobRunIdFromJobData(job.data);

  if (jobRunId) {
    return { kind: "id", jobRunId };
  }

  if (job.id) {
    return { kind: "external", externalJobId: job.id, queueName: job.queueName };
  }

  return undefined;
}

function jobRunIdFromJobData(data: unknown): string | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }

  const value = (data as Record<string, unknown>).jobRunId;
  return typeof value === "string" ? value : undefined;
}

function normalizeJobFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown_worker_failure";
}

export function isFinalJobAttempt(job: Pick<Job, "attemptsMade" | "data" | "opts">, maxAttempts?: number): boolean {
  // BullMQ v5 exposes attemptsMade as zero-based completed failures; attempts includes the first run.
  const attempts =
    maxAttempts ?? maxAttemptsFromJobData(job.data) ?? (typeof job.opts.attempts === "number" ? job.opts.attempts : 1);
  return job.attemptsMade + 1 >= attempts;
}

function maxAttemptsFromJobData(data: unknown): number | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }

  const value = (data as Record<string, unknown>).maxAttempts;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}
