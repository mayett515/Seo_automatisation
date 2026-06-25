import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DatabaseClient = ReturnType<typeof createDatabaseClient>["db"];

export function createDatabaseClient(databaseUrl: string) {
  const sql = postgres(databaseUrl, {
    max: 5
  });

  const db = drizzle(sql, { schema });

  return {
    db,
    sql,
    close: () => sql.end()
  };
}
