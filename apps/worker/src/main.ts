import { parseAppEnv } from "@localseo/config";
import { Worker, type ConnectionOptions } from "bullmq";
import { handleJob } from "./handlers";
import { queueNames } from "./queue-names";

const env = parseAppEnv(process.env);

if (!env.REDIS_URL) {
  console.log("REDIS_URL is not set. Worker host booted in dry-run mode.");
  console.log(`Registered queues: ${queueNames.join(", ")}`);
  process.exit(0);
}

const redisUrl = new URL(env.REDIS_URL);
const connection: ConnectionOptions = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || "6379"),
  username: redisUrl.username || undefined,
  password: redisUrl.password || undefined,
  maxRetriesPerRequest: null
};

const workers = queueNames.map(
  (queueName) =>
    new Worker(queueName, handleJob, {
      connection
    })
);

console.log(`Worker host started with ${workers.length} queues.`);
