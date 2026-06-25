# Database And ORM

This is where you come to lift a proven way for an application to talk to a database safely, ergonomically, and fast — instead of hand-rolling the layer where three pressures collide: *type safety* (the query should fail at compile time, not at 3 a.m. in production), *control over the generated SQL* (no surprise N+1 queries or table scans), and *operational concerns* (connection pooling, migrations, transactions, retries on serialization failure). The repos here cover every point on that spectrum — from "write raw SQL, get types for free" (sqlc, Kysely) to "describe a schema, get a full ORM" (Prisma, TypeORM, GORM) — so you can grab the trade-off that fits and skip the ones that bite.

None of these is one thing. Drizzle is a query-builder core, a separate migration kit (`drizzle-kit`), and a set of validator generators; Prisma is a Rust query engine, a schema language, and a client generator. Don't fork the monolith — walk in for the migration planner, the connection pool, the dialect abstraction, or the prepared-statement cache, because *that* specific module is the portable part worth taking.

---

## 1. Type-Safe Query Builders & ORMs

These give you compile-time-checked queries to lift, ranging from thin SQL builders to full object-relational mappers.

### Query Builders & ORMs

| Link | Good For | What to steal |
| --- | --- | --- |
| [drizzle-team/drizzle-orm](https://github.com/drizzle-team/drizzle-orm) | Lightweight TypeScript ORM with SQL-like syntax and zero runtime ORM cost. | Steal the schema-as-code model, the dialect abstraction (`drizzle-orm/pg-core` vs `mysql-core`), prepared statements, and how relational queries avoid N+1. |
| [prisma/prisma](https://github.com/prisma/prisma) | Schema-first ORM with a generated, fully-typed client. | Steal the `schema.prisma` DSL, the generated client, the migration engine, and how the (historically Rust) query engine batches and plans queries. |
| [kysely-org/kysely](https://github.com/kysely-org/kysely) | Type-safe SQL query builder (no ORM magic, pure SQL semantics). | Steal how a TypeScript type for your DB schema flows through `selectFrom().where()` to produce a fully-typed result, and the dialect/plugin system. |
| [typeorm/typeorm](https://github.com/typeorm/typeorm) | Decorator-based ORM (Active Record & Data Mapper) for TS/JS. | Steal the entity decorator metadata, the `QueryRunner` transaction abstraction, and the migration generation diffing. |
| [go-gorm/gorm](https://github.com/go-gorm/gorm) | The dominant Go ORM with associations, hooks, and migrations. | Steal the chainable session API, the callback/plugin pipeline, and `AutoMigrate` schema diffing. |

---

## 2. Drivers, Codegen & Specialized Stores

Closer to the wire, and just as liftable: raw drivers, SQL-to-code generators, and extensions for vector/semantic search.

### Drivers & Specialized Tooling

| Link | Good For | What to steal |
| --- | --- | --- |
| [sqlc-dev/sqlc](https://github.com/sqlc-dev/sqlc) | Generating type-safe Go/TS/Python code *from* hand-written SQL. | Steal how it parses SQL with a real parser, infers parameter/result types from the schema, and emits idiomatic typed methods — inverting the ORM relationship. |
| [porsager/postgres](https://github.com/porsager/postgres) | Fast, minimal Postgres driver for Node with tagged-template queries. | Steal the tagged-template parameterization (auto-escaping), the connection pool, and the cursor/streaming API for large result sets. |
| [pgvector/pgvector](https://github.com/pgvector/pgvector) | Vector similarity search inside Postgres (embeddings). | Steal the `vector` type, the HNSW vs IVFFlat index trade-offs, and the distance operators (`<->`, `<=>`, `<#>`) for ANN search. |

---

## 3. The Anatomy of Large Repos: Decomposing "Stealable" Modules

A database library is really several libraries: a dialect layer, a query compiler, a migration planner, and a pool. Pry them apart — the most valuable thing in Drizzle's repo is not "the ORM," it is the migration-diffing logic in `drizzle-kit` and the SQL-template compiler in the core.

### Decomposed Module Index

| Intent | Product / Repo | Target Module / Directory | What to steal |
| --- | --- | --- | --- |
| **Migration Diffing & Generation** | Drizzle | [`drizzle-kit`](https://github.com/drizzle-team/drizzle-orm/tree/main/drizzle-kit) | How a desired schema snapshot is diffed against the current one to *generate* SQL migration files (`CREATE`/`ALTER`/`DROP`). |
| **Dialect Abstraction** | Drizzle | [`drizzle-orm/src/pg-core`](https://github.com/drizzle-team/drizzle-orm/tree/main/drizzle-orm/src/pg-core) | How one query API targets Postgres, MySQL, and SQLite by isolating dialect-specific SQL generation behind a shared core. |
| **SQL Parsing → Type Inference** | sqlc | [`internal/compiler`](https://github.com/sqlc-dev/sqlc/tree/main/internal/compiler) | How a SQL string is parsed into an AST, resolved against the catalog (schema), and turned into typed parameters and result columns. |
| **Catalog / Schema Model** | sqlc | [`internal/sql/catalog`](https://github.com/sqlc-dev/sqlc/tree/main/internal/sql/catalog) | How a database schema is represented in memory so queries can be type-checked before they ever hit a real database. |
| **Validator Generation** | Drizzle | [`drizzle-zod`](https://github.com/drizzle-team/drizzle-orm/tree/main/drizzle-zod) | How a single table definition derives runtime Zod insert/select schemas — one source of truth for DB *and* API validation. |
| **ANN Index Implementation** | pgvector | [`src/hnsw.c`](https://github.com/pgvector/pgvector/blob/master/src/hnsw.c) | How an approximate-nearest-neighbor graph index is implemented as a native Postgres index access method in C. |
| **Migration Pipeline** | GORM | [`migrator`](https://github.com/go-gorm/gorm/tree/master/migrator) | How `AutoMigrate` introspects existing tables and emits only the additive DDL needed to converge to the model. |

---

## Functional Patterns

- **Parameterized Queries Everywhere**: Never string-concatenate user input into SQL. Drivers like `porsager/postgres` use tagged templates so interpolated values *always* become bind parameters — SQL injection becomes structurally impossible.
- **Schema as the Single Source of Truth**: Define the schema once (in `schema.prisma`, a Drizzle table object, or SQL DDL) and *derive* everything else — TypeScript types, migrations, runtime validators — from it.
- **Migrations as Versioned, Reviewable Artifacts**: Generate SQL migration files from a schema diff, commit them, and apply them in order. Never mutate production schema by hand.
- **Transaction Boundaries with Retry**: Wrap multi-statement work in a transaction; on serialization/deadlock failure (Postgres `40001`/`40P01`), retry the whole closure with backoff rather than leaving partial state.
- **Connection Pooling**: A fixed pool of warm connections is shared across requests; the app borrows and returns connections instead of opening one per query.

## Code Snippets To Steal

**1. A type-safe relational query (Drizzle)** — the result type is inferred from the schema, and the join avoids N+1:

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { users, posts } from "./schema";

const db = drizzle(pool);

// `rows` is fully typed: { id, name, posts: { id, title }[] } — no manual annotation.
const rows = await db.query.users.findMany({
  where: eq(users.active, true),
  with: { posts: { columns: { id: true, title: true } } }, // single query, not N+1
  limit: 20,
});
```

**2. A migration definition + diff workflow (Drizzle Kit)** — schema is code; the migration is generated, not written by hand:

```ts
// schema.ts — the single source of truth
import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

```bash
# drizzle-kit diffs schema.ts against the last snapshot and EMITS the SQL migration file.
npx drizzle-kit generate   # -> drizzle/0001_add_users.sql
npx drizzle-kit migrate    # applies pending migrations in order
```

**3. A transaction with serialization-failure retry** — the durable pattern for concurrent writes under SERIALIZABLE:

```ts
const RETRYABLE = new Set(["40001", "40P01"]); // serialization_failure, deadlock_detected

export async function withRetry<T>(db, fn: (tx) => Promise<T>, attempts = 5): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await db.transaction(fn); // commits on resolve, rolls back on throw
    } catch (err: any) {
      if (i < attempts - 1 && RETRYABLE.has(err.code)) {
        await new Promise((r) => setTimeout(r, 2 ** i * 25 + Math.random() * 25)); // jittered backoff
        continue;
      }
      throw err;
    }
  }
}
```

**4. Parameterized vector (ANN) search (pgvector + porsager/postgres)** — injection-safe interpolation and a nearest-neighbor query:

```ts
import postgres from "postgres";
const sql = postgres(); // pooled

// `<=>` is cosine distance; `embedding` interpolates as a BIND PARAM, never raw SQL.
const matches = await sql`
  SELECT id, content
  FROM documents
  ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
  LIMIT 5
`;
```

## The Lift

- **Schema-Diff Migration Generation**: Comparing a desired schema snapshot to the live schema to emit only the necessary DDL (Drizzle Kit, GORM `migrator`).
- **SQL-First Type Inference**: Parsing hand-written SQL against a catalog to generate typed bindings — the inverse of ORM codegen (sqlc).
- **Dialect Isolation**: Keeping query semantics shared while pushing Postgres/MySQL/SQLite differences into a thin per-dialect layer.
- **Retryable Transaction Wrappers**: A reusable closure that detects serialization/deadlock errors and replays the transaction with jittered backoff.
- **Single-Source Validation**: Deriving runtime validators (Zod) and API types from the same table definition that drives the database.

## Search Inside

`pgTable`, `drizzle`, `db.query`, `findMany`, `with:`, `eq(`, `drizzle-kit generate`, `schema.prisma`, `selectFrom`, `QueryRunner`, `AutoMigrate`, `migrator`, `catalog`, `internal/compiler`, `<=>`, `<->`, `vector`, `hnsw`, `transaction(`, `40001`, `tagged template`, `connection pool`.
