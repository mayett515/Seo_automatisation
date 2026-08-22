---
name: smoke-verify
description: Prove that a changed API, worker, database, or frontend route starts and responds at runtime. Use after dependency-injection, route, worker, migration, or runtime-wiring changes; this complements tests and does not replace a regression review.
---

# Runtime smoke verification

TypeScript cannot prove dependency injection, plugin order, route registration, worker startup, or infrastructure connectivity.

1. Identify the changed runtime surface from the diff.
2. For an API change, start the API, check liveness/readiness, and exercise the changed route with a representative request.
3. For a frontend route, start the app, open or request that route, and inspect runtime/console failures.
4. For a worker, use dry-run mode or process one typed fixture job where safe and feasible.
5. For a schema change, generate and read the migration SQL. Classify it as additive, destructive, or compatibility-sensitive.
6. Run the relevant typecheck/build plus `git diff --check` before handoff.
7. Report exactly what ran, observable results, and anything blocked by unavailable infrastructure.

Never silently skip an unrunnable check and never claim runtime verification from typecheck alone.
