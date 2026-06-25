import { createRedisConnection } from "@localseo/adapters";
import { parseAppEnv } from "@localseo/config";
import { Worker } from "bullmq";
import { closeWorkerResources, handleJob } from "./handlers.js";
import { queueNames } from "./queue-names.js";

const env = parseAppEnv(process.env);

if (!env.REDIS_URL) {
  console.log("REDIS_URL is not set. Worker host booted in dry-run mode.");
  console.log(`Registered queues: ${queueNames.join(", ")}`);
  process.exit(0);
}

const connection = createRedisConnection(env.REDIS_URL);

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

console.log(`Worker host started with ${workers.length} queues.`);

let isShuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`Worker host received ${signal}; closing workers.`);

  try {
    await Promise.all(workers.map((worker) => worker.close()));
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
