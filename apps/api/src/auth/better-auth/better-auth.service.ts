import { Injectable } from "@nestjs/common";
import { parseAppEnv, type AppEnv } from "@localseo/config";
import { accounts, sessions, users, verifications, type DatabaseClient } from "@localseo/db";
import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { fromNodeHeaders } from "better-auth/node";
import Redis from "ioredis";
import type { IncomingHttpHeaders } from "node:http";
import { DatabaseService } from "../../database/database.service.js";
import { RedisService } from "../../redis/redis.service.js";
import type { AuthenticatedRequestContext } from "../types/authenticated-request.js";

const env = parseAppEnv(process.env);
const localDevelopmentAuthSecret = "local-development-better-auth-secret-not-for-production";

const betterAuthSchema = {
  users,
  user: users,
  sessions,
  session: sessions,
  accounts,
  account: accounts,
  verifications,
  verification: verifications
};

type LocalSeoAuth = ReturnType<typeof createLocalSeoAuth>;
type BetterAuthSecondaryStorage = {
  get(key: string): Promise<string | null>;
  getAndDelete(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  increment(key: string, ttlSeconds?: number): Promise<number>;
};

@Injectable()
export class BetterAuthService {
  readonly auth: LocalSeoAuth | undefined;

  constructor(database: DatabaseService, redis: RedisService) {
    this.auth = database.db
      ? createLocalSeoAuth(database.db, env, createBetterAuthRedisStorage(redis.client))
      : undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.auth);
  }

  async getSessionFromHeaders(headers: IncomingHttpHeaders): Promise<AuthenticatedRequestContext | null> {
    if (!this.auth) {
      return null;
    }

    const result = await this.auth.api.getSession({
      headers: fromNodeHeaders(headers)
    });

    if (!result) {
      return null;
    }

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name
      },
      session: {
        id: result.session.id,
        userId: result.session.userId,
        expiresAt: result.session.expiresAt
      },
      source: "better_auth"
    };
  }
}

function createLocalSeoAuth(
  db: DatabaseClient,
  appEnv: AppEnv,
  secondaryStorage: BetterAuthSecondaryStorage | undefined
) {
  return betterAuth({
    baseURL: appEnv.BETTER_AUTH_URL ?? appEnv.API_PUBLIC_URL,
    secret: appEnv.BETTER_AUTH_SECRET ?? localDevelopmentAuthSecret,
    trustedOrigins: uniqueOrigins([appEnv.WEB_ORIGIN, appEnv.API_PUBLIC_URL, appEnv.BETTER_AUTH_URL]),
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: betterAuthSchema,
      usePlural: true,
      transaction: true
    }),
    emailAndPassword: {
      enabled: true
    },
    user: {
      modelName: "users"
    },
    session: {
      modelName: "sessions",
      storeSessionInDatabase: true,
      preserveSessionInDatabase: true
    },
    account: {
      modelName: "accounts"
    },
    verification: {
      modelName: "verifications"
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: appEnv.NODE_ENV === "production" ? 60 : 300,
      storage: secondaryStorage ? "secondary-storage" : "memory"
    },
    secondaryStorage,
    advanced: {
      useSecureCookies: appEnv.NODE_ENV === "production",
      disableCSRFCheck: false,
      disableOriginCheck: false,
      database: {
        generateId: "uuid"
      }
    }
  });
}

function uniqueOrigins(origins: Array<string | undefined>): string[] {
  return [...new Set(origins.filter((origin): origin is string => Boolean(origin)))];
}

function createBetterAuthRedisStorage(redis: Redis | undefined): BetterAuthSecondaryStorage | undefined {
  if (!redis) {
    return undefined;
  }

  const keyFor = (key: string) => `better-auth:${key}`;

  return {
    get: (key) => redis.get(keyFor(key)),
    getAndDelete: (key) => redis.getdel(keyFor(key)),
    set: async (key, value, ttlSeconds) => {
      if (ttlSeconds) {
        await redis.set(keyFor(key), value, "EX", ttlSeconds);
        return;
      }

      await redis.set(keyFor(key), value);
    },
    delete: async (key) => {
      await redis.del(keyFor(key));
    },
    increment: async (key, ttlSeconds) => {
      const redisKey = keyFor(key);
      const value = await redis.incr(redisKey);

      if (ttlSeconds && value === 1) {
        await redis.expire(redisKey, ttlSeconds);
      }

      return value;
    }
  };
}
