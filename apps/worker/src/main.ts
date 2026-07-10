import { createRedisConnection } from "@localseo/adapters";
import { parseAppEnv } from "@localseo/config";
import { Queue, Worker } from "bullmq";
import {
  closeWorkerResources,
  handleJob,
  reconcileDeployments,
  reconcileRollbacks,
  recoverStaleWork
} from "./handlers.js";
import { queueNames } from "./queue-names.js";
import type { WorkRecoveryQueues } from "./work-recovery.js";

const env = parseAppEnv(process.env);
const lifecycleReconcileIntervalMs = 60_000;

if (!env.REDIS_URL) {
  console.log("REDIS_URL is not set. Worker host booted in dry-run mode.");
  console.log(`Registered queues: ${queueNames.join(", ")}`);
  process.exit(0);
}

const connection = createRedisConnection(env.REDIS_URL);
const recoveryQueues: WorkRecoveryQueues = {
  "page-generation": new Queue("page-generation", { connection }),
  "release-verification": new Queue("release-verification", { connection })
};

const workers = queueNames.map(
  (queueName) =>
    new Worker(queueName, handleJob, {
      connection
    })
);

for (const worker of workers) {
  worker.on("error", (error) => {
    console.error(`Worker ${worker.name} emitted an error`, normalizeWorkerError(error));
  });
}

let isReconcilingLifecycle = false;
const lifecycleReconcileInterval = setInterval(() => {
  if (isReconcilingLifecycle) {
    return;
  }

  isReconcilingLifecycle = true;
  void Promise.all([reconcileDeployments(), reconcileRollbacks(), recoverStaleWork(recoveryQueues)])
    .then(([, , recovery]) => {
      if (recovery.checked > 0 || recovery.errors > 0) {
        console.log("Bounded work recovery scan completed", recovery);
      }
    })
    .catch((error) => {
      console.error("Lifecycle reconciliation failed", normalizeWorkerError(error));
    })
    .finally(() => {
      isReconcilingLifecycle = false;
    });
}, lifecycleReconcileIntervalMs);

lifecycleReconcileInterval.unref();

console.log(`Worker host started with ${workers.length} queues.`);

let isShuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`Worker host received ${signal}; closing workers.`);

  try {
    clearInterval(lifecycleReconcileInterval);
    await Promise.all([
      ...workers.map((worker) => worker.close()),
      ...Object.values(recoveryQueues).map((queue) => queue.close())
    ]);
    await closeWorkerResources();
    console.log("Worker host shutdown completed.");
    process.exit(0);
  } catch (error) {
    console.error("Worker host shutdown failed", normalizeWorkerError(error));
    process.exit(1);
  }
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

function normalizeWorkerError(error: unknown): string {
  return error instanceof Error ? error.message : "unknown_worker_error";
}
