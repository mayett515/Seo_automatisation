import { ServiceUnavailableException, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { parseAppEnv } from "@localseo/config";
import { createDatabaseClient, type DatabaseClient } from "@localseo/db";

const env = parseAppEnv(process.env);

type DbHandle = ReturnType<typeof createDatabaseClient>;
type SqlClient = DbHandle["sql"];
type DatabaseProbeStatus = "up" | "down" | "not_configured";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly handle: DbHandle | undefined = env.DATABASE_URL
    ? createDatabaseClient(env.DATABASE_URL, {
        max: env.DATABASE_POOL_MAX,
        idleTimeoutSeconds: env.DATABASE_IDLE_TIMEOUT_SECONDS,
        connectTimeoutSeconds: env.DATABASE_CONNECT_TIMEOUT_SECONDS
      })
    : undefined;

  get db(): DatabaseClient | undefined {
    return this.handle?.db;
  }

  get sql(): SqlClient | undefined {
    return this.handle?.sql;
  }

  isConfigured(): boolean {
    return Boolean(this.handle);
  }

  requireDb(): DatabaseClient {
    if (!this.handle) {
      throw new ServiceUnavailableException("DATABASE_URL is required before this operation can use persistence.");
    }

    return this.handle.db;
  }

  async ping(timeoutMs = env.DATABASE_PING_TIMEOUT_MS): Promise<DatabaseProbeStatus> {
    if (!this.handle) {
      return "not_configured";
    }

    try {
      await withTimeout(this.handle.sql`select 1`, timeoutMs, "Database readiness ping timed out");
      return "up";
    } catch {
      return "down";
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.handle?.close();
  }
}

async function withTimeout<T>(work: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
