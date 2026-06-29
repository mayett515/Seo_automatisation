import { createDatabaseClient } from "@localseo/db";
import { parseAppEnv } from "@localseo/config";
import type { Job } from "bullmq";
import { DeployConfigurationError, DeployEvidenceError, handleDeployJob } from "./handlers/deploy.js";
import { handleGscSyncJob } from "./handlers/gsc-sync.js";
import {
  isFinalJobAttempt,
  markJobRunCompleted,
  markJobRunFailed,
  markJobRunRetrying,
  markJobRunRunning
} from "./job-run.js";

const env = parseAppEnv(process.env);
const sharedDbHandle = env.DATABASE_URL ? createDatabaseClient(env.DATABASE_URL) : undefined;

export async function handleJob(job: Job): Promise<Record<string, unknown>> {
  await markJobRunRunning(sharedDbHandle?.db, job);

  try {
    const result = await routeJob(job);
    await markJobRunCompleted(sharedDbHandle?.db, job);
    return result;
  } catch (error) {
    if (isFinalJobAttempt(job) || isTerminalWorkerError(error)) {
      await markJobRunFailed(sharedDbHandle?.db, job, error);
    } else {
      await markJobRunRetrying(sharedDbHandle?.db, job, error);
    }

    throw error;
  }
}

export async function closeWorkerResources(): Promise<void> {
  await sharedDbHandle?.close();
}

export async function routeJob(job: Job): Promise<Record<string, unknown>> {
  if (job.queueName === "deploy" || job.name === "deploy") {
    return handleDeployJob(job, sharedDbHandle);
  }

  if (job.queueName === "gsc-sync" || job.name === "gsc_sync") {
    return handleGscSyncJob(job, sharedDbHandle, env);
  }

  throw new Error(`Worker job is not implemented: ${job.queueName}:${job.name}`);
}

export { classifyOpportunitySignals, parseGscSyncJobData } from "./handlers/gsc-sync.js";

export function isTerminalWorkerError(error: unknown): boolean {
  return error instanceof DeployConfigurationError || error instanceof DeployEvidenceError;
}
