---
name: smoke-verify
description: Runtime smoke verification after backend, worker, database, or frontend route changes — start the changed surface and prove it responds before handoff. Use after Nest provider/controller changes, route changes, worker changes, or schema migrations — "smoke test this", "verify it runs", "check the wiring". NOT a test-suite run (tests run anyway) and NOT a regression review (use anti-regression); this skill only proves the changed surface starts and responds at runtime.
---

# Smoke Verify

`tsc` proves types; it never proves runtime wiring. NestJS dependency
injection, Fastify plugin order, route registration, and worker startup can
all fail at runtime with a green typecheck. This skill closes that gap with
the cheapest possible runtime proof.

## Procedure

1. Identify the changed surface from the diff: API route/provider, worker
   handler, DB schema, or frontend route.
2. **API change**: start the API, hit `/health` (or `/health/ready`), then
   the changed route with a representative request. A 500 or a DI error on
   boot is the finding.
3. **Frontend route change**: start the dev server, request the changed
   route, check the console for render errors.
4. **Worker change**: run the worker in dry-run mode or process one typed
   fixture job where feasible.
5. **Schema change**: generate the migration and read the SQL — classify it
   additive or destructive, and say which.
6. Run typecheck and build, plus `git diff --check`, before handoff.
7. Report what was smoke-checked and what was not runnable locally (missing
   infra), explicitly. An unrunnable check is reported, never skipped
   silently.
