import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { createRedisConnection } from "@localseo/adapters";
import { parseAppEnv } from "@localseo/config";
import Redis from "ioredis";

const env = parseAppEnv(process.env);

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly redis: Redis | undefined = env.REDIS_URL
    ? new Redis(createRedisConnection(env.REDIS_URL))
    : undefined;

  constructor() {
    this.redis?.on("error", (error) => {
      this.logger.warn(`Redis client error: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  get client(): Redis | undefined {
    return this.redis;
  }

  isConfigured(): boolean {
    return Boolean(this.redis);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit();
  }
}
