# Database and repositories

- Repositories return domain types, not database row types.
- Query construction stays inside repositories; callers pass validated criteria, not SQL fragments.
- Not-found is an expected value. Repositories fetch and store; they do not decide business policy.
- Decide database nullability and domain optionality independently at the mapper.
- Keep query cost visible; avoid generic abstractions that hide expensive access.
- Applied migrations are append-only. Fix forward with a new migration.
- Every migration states rollback behavior or why it is irreversible.
- New constraints and non-null columns include a backfill plan for non-empty production tables.
- Never keep a database transaction open while awaiting a network provider.
