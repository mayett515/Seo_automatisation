import { Injectable } from "@nestjs/common";
import { parseAppEnv, type AppEnv } from "@localseo/config";
import { accounts, sessions, users, verifications, type DatabaseClient } from "@localseo/db";
import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { fromNodeHeaders } from "better-auth/node";
import type { IncomingHttpHeaders } from "node:http";
import { DatabaseService } from "../../database/database.service.js";
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

@Injectable()
export class BetterAuthService {
  readonly auth: LocalSeoAuth | undefined;

  constructor(database: DatabaseService) {
    this.auth = database.db ? createLocalSeoAuth(database.db, env) : undefined;
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

function createLocalSeoAuth(db: DatabaseClient, appEnv: AppEnv) {
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
      modelName: "sessions"
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
      storage: "memory"
    },
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
