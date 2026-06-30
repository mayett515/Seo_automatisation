import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { createDatabaseClient } from "../src/client.js";

type DatabaseHandle = ReturnType<typeof createDatabaseClient>;
type SqlClient = DatabaseHandle["sql"];

type DrizzleJournal = {
  entries?: Array<{ tag?: unknown }>;
};

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../migrations");

export async function createIntegrationTestDatabase(databaseUrl: string): Promise<DatabaseHandle> {
  assertDisposableDatabaseUrl(databaseUrl);
  const handle = createDatabaseClient(databaseUrl, { max: 1, idleTimeoutSeconds: 5, connectTimeoutSeconds: 5 });

  await resetPublicSchema(handle.sql);
  await applyMigrations(handle.sql);

  return handle;
}

export async function truncateIntegrationTables(sql: SqlClient): Promise<void> {
  const rows = await sql<{ tablename: string }[]>`
    select tablename
    from pg_tables
    where schemaname = 'public'
  `;
  const tableNames = rows.map((row) => quoteIdentifier(row.tablename));

  if (tableNames.length === 0) {
    return;
  }

  await sql.unsafe(`truncate table ${tableNames.join(", ")} restart identity cascade`);
}

async function resetPublicSchema(sql: SqlClient): Promise<void> {
  await sql.unsafe("drop schema if exists public cascade");
  await sql.unsafe("create schema public");
}

async function applyMigrations(sql: SqlClient): Promise<void> {
  const journal = JSON.parse(await readFile(resolve(migrationsDir, "meta/_journal.json"), "utf8")) as DrizzleJournal;
  const tags = (journal.entries ?? [])
    .map((entry) => entry.tag)
    .filter((tag): tag is string => typeof tag === "string" && tag.length > 0);

  for (const tag of tags) {
    const migration = await readFile(resolve(migrationsDir, `${tag}.sql`), "utf8");
    const statements = migration
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);

    for (const statement of statements) {
      await sql.unsafe(statement);
    }
  }
}

function assertDisposableDatabaseUrl(databaseUrl: string): void {
  const name = databaseName(databaseUrl);

  if (process.env.LOCALSEO_ALLOW_TEST_DB_RESET === "true") {
    return;
  }

  if (!/(^|[_-])(test|integration)([_-]|$)/iu.test(name)) {
    throw new Error(
      `Refusing to reset database "${name}". Use a database name containing "test" or "integration", or set LOCALSEO_ALLOW_TEST_DB_RESET=true.`
    );
  }
}

function databaseName(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    const name = url.pathname.replace(/^\/+/u, "");
    return name.length > 0 ? name : "unknown";
  } catch {
    throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL.");
  }
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
