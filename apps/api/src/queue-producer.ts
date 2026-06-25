import { Global, Injectable, Module, type OnModuleDestroy } from "@nestjs/common";
import { createRedisConnection } from "@localseo/adapters";
import { parseAppEnv } from "@localseo/config";
import { Queue, type JobsOptions } from "bullmq";

const env = parseAppEnv(process.env);

export type ApiQueueName = "pre-audit" | "website-import" | "deploy";

type QueueRegistry = Partial<Record<ApiQueueName, Queue>>;

type EnqueueInput = {
  queueName: ApiQueueName;
  jobName: string;
  jobId: string;
  data: Record<string, unknown>;
  options?: JobsOptions;
};

@Injectable()
export class QueueProducerService implements OnModuleDestroy {
  private readonly queues: QueueRegistry;

  constructor() {
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
      return false;
    }

    await queue.add(input.jobName, input.data, {
      jobId: input.jobId,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000
      },
      ...input.options
    });

    return true;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(Object.values(this.queues).map((queue) => queue.close()));
  }
}

@Global()
@Module({
  providers: [QueueProducerService],
  exports: [QueueProducerService]
})
export class QueueProducerModule {}
