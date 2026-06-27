import { Injectable } from "@nestjs/common";
import { RedisService } from "../redis/redis.service.js";

const keyPrefix = "oauth:gsc:state:";

export type GscOAuthNonceRecord = {
  provider: "google_search_console";
  nonce: string;
  projectId: string;
  customerId: string;
  userId: string;
  sessionId?: string;
  redirectTo?: string;
  codeVerifier: string;
  expiresAt: string;
};

type RedisLike = {
  set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>;
  getdel(key: string): Promise<string | null>;
};

@Injectable()
export class GscOAuthStateStore {
  private readonly redis: RedisLike | undefined;

  constructor(redisService?: RedisService) {
    this.redis = redisService?.client;
  }

  isConfigured(): boolean {
    return Boolean(this.redis);
  }

  async store(record: GscOAuthNonceRecord, now = new Date()): Promise<boolean> {
    if (!this.redis) {
      return false;
    }

    const ttlSeconds = Math.max(1, Math.ceil((Date.parse(record.expiresAt) - now.getTime()) / 1000));
    await this.redis.set(keyFor(record.nonce), JSON.stringify(record), "EX", ttlSeconds);
    return true;
  }

  async consume(nonce: string): Promise<GscOAuthNonceRecord | undefined> {
    if (!this.redis) {
      return undefined;
    }

    const value = await this.redis.getdel(keyFor(nonce));

    if (!value) {
      return undefined;
    }

    return parseRecord(value);
  }
}

function keyFor(nonce: string): string {
  return `${keyPrefix}${nonce}`;
}

function parseRecord(value: string): GscOAuthNonceRecord | undefined {
  try {
    const record = JSON.parse(value) as Partial<GscOAuthNonceRecord>;

    if (
      record.provider !== "google_search_console" ||
      !record.nonce ||
      !record.projectId ||
      !record.customerId ||
      !record.userId ||
      !record.codeVerifier ||
      !record.expiresAt
    ) {
      return undefined;
    }

    return {
      provider: record.provider,
      nonce: record.nonce,
      projectId: record.projectId,
      customerId: record.customerId,
      userId: record.userId,
      sessionId: record.sessionId,
      redirectTo: record.redirectTo,
      codeVerifier: record.codeVerifier,
      expiresAt: record.expiresAt
    };
  } catch {
    return undefined;
  }
}
