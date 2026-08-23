---
paths:
  - "apps/api/src/**/*.ts"
  - "apps/worker/src/**/*.ts"
---

# NestJS on Fastify

The API is NestJS on the Fastify adapter — Express idioms are wrong here.
`tsc` never proves DI: after provider/controller changes, module wiring is
verified at runtime (smoke-verify skill).

## Providers and composition root

- Infrastructure construction (DB clients, queues, ciphers, provider SDK
  adapters, config-derived clients) lives in providers or the composition
  root with explicit tokens — never scattered through feature services.
  A constructor creating several external dependencies is a refactor signal.
- One shared database provider per process; never a new pool per feature or
  per readiness probe.
- The provider that opens a resource closes it (lifecycle hooks on shutdown).
- Controllers stay parse-delegate-return; responses that cross to the
  frontend are schema-owned contract objects.

## Health

- `/health/live` = process is up; `/health/ready` = DB, Redis, queues, and
  required providers actually respond. Never mark a dependency up because its
  env var exists, and never report queue-backed features ready when Redis is
  absent.

## Status honesty (project decision — keep)

`queued`, `completed`, `failed`, `dry_run`, `not_configured`, `pending`
describe the side effect that really happened. Never return `queued` without
a real enqueue; if queue infrastructure is missing, return an explicit
unavailable state or throw service-unavailable — never a success-looking
response. Never create persisted job/sync rows before confirming the queue
infrastructure that will execute them exists.
