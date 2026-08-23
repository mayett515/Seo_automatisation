---
paths:
  - "**/db/**/*.ts"
  - "**/repositories/**/*.ts"
  - "**/*.repository.ts"
  - "**/migrations/**/*.ts"
  - "**/migrations/**/*.sql"
  - "**/*.prisma"
---

# Data Access

The domain must not be able to tell which database it is running against.

- Repositories return domain types, not row types. A generated row type never
  reaches core logic — map at the repository.
- Query building stays in the repository; callers pass criteria, not SQL.
  Never build a query from unvalidated input.
- Not-found is a value the caller handles, not an exception.
- A repository never decides business policy — eligibility and policy live in
  pure functions; the repository fetches and stores.
- Database nullability is not domain optionality: a nullable column can still
  back a required domain field (and vice versa) — decide at the mapping.
- Don't hide SQL behind repository abstractions so generic that query cost
  becomes invisible.

## Migrations (project decisions — keep)

- Applied migrations are append-only; fix forward with a new migration.
- A migration states its rollback, or states in the file why it is
  irreversible.
- No `NOT NULL` column or new constraint without a backfill plan in the same
  change — assume the table is non-empty in production.
