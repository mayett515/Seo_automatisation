import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type DatabaseClient = ReturnType<typeof createDatabaseClient>["db"];

export type DatabaseClientOptions = {
  max?: number;
  idleTimeoutSeconds?: number;
  connectTimeoutSeconds?: number;
};

export function createDatabaseClient(databaseUrl: string, options: DatabaseClientOptions = {}) {
  const sql = postgres(databaseUrl, {
    max: options.max ?? 5,
    idle_timeout: options.idleTimeoutSeconds,
    connect_timeout: options.connectTimeoutSeconds
  });

  const db = drizzle(sql, { schema });

  return {
    db,
    sql,
    close: () => sql.end()
  };
}
