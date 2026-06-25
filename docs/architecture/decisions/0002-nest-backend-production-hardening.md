# 0002 - Nest Backend Production Hardening

Date: 2026-06-25
Status: Accepted

## Why This Decision Exists

After the GSC and stack-boundary work, the next review moved from TypeScript correctness into backend production architecture:

- provider lifecycle
- queue truthfulness
- worker shutdown
- tenant guards
- readiness checks
- DB indexes
- real tests
- production builds

This is a good sign. The project is past toy-code problems and is now exposing real SaaS backend concerns.

## What Was Fixed Now

### Worker Shutdown

The worker host now:

- attaches BullMQ worker error listeners
- closes workers on `SIGTERM` and `SIGINT`
- closes shared worker DB resources after workers stop
- avoids leaving job workers and DB handles open during controlled shutdown

This follows BullMQ's guidance that `worker.close()` lets workers stop picking up new jobs and wait for current jobs to finish.

### GSC Query Indexes

GSC query patterns now have Drizzle indexes:

- latest connection by project/created time
- latest completed sync by project/status/completed time
- rows by sync run and impressions
- signals by sync run and created time

This prepares the GSC dataset for real Search Analytics volume.

### Nest Rule Bundle

Added a dedicated hidden Nest rule bundle:

```text
.ai-nest-rules/
```

It covers:

- providers and composition roots
- controllers, validation, and pipes
- queues, workers, lifecycle, and shutdown
- guards, auth, and tenancy
- health/readiness
- exceptions, logging, and redaction
- testing

The goal is to route future Nest work through official NestJS/BullMQ guidance before more backend patterns get copied casually.

## Stale Review Point

The review said `.env.example` looked like one line. Locally it is already one variable per line:

```text
NODE_ENV=development
PORT=4000
WEB_ORIGIN=http://localhost:5173
...
```

No fix was needed there.

## Deferred On Purpose

### Full Provider Refactor

`GscService` infrastructure dependencies now come from Nest providers:

- DB handle
- Search Console adapter
- token cipher
- BullMQ queue

The service still owns GSC use-case behavior, but provider construction moved to module-level provider factories and shutdown cleanup moved to `onModuleDestroy`.

### Auth And Tenant Guards

The API is not production-safe until routes are protected by:

```text
current user -> project/customer membership -> permission check -> handler
```

This should be implemented with Nest guards and must happen before real customer GSC data flows through the system.

### Fake Queued Non-GSC Jobs

GSC sync now checks for a real queue before returning `queued`.

Other scaffold endpoints now attempt a real BullMQ enqueue when Redis is configured:

- website import
- pre-audit
- release deploy

If Redis is not configured, they return explicit `dry_run` job contracts instead of queued-looking placeholders.

### Readiness

The API now exposes:

```text
/health
/health/live
/health/ready
```

`/health` remains backward-compatible for the frontend. `/health/live` is liveness. `/health/ready` reports whether required DB/Redis configuration exists.

Future readiness should perform real DB, Redis, queue ability, and required provider checks before traffic is considered safe.

### Production Builds

API, worker, and shared packages now emit `dist/` artifacts with TypeScript `tsc`.

Shared packages keep TypeScript source as the default development export and expose built JS through the `production` export condition. API/worker production start scripts run Node with `--conditions=production`.

This avoids introducing a bundler before decorator metadata and Nest DI are deliberately verified.

### Tests

Lint and typecheck are now real guardrails, but important behavior still needs tests:

- OAuth state signing/verifying
- GSC opportunity classification
- date-range defaults
- release readiness decisions
- worker job parsing
- idempotent retry behavior
- queue producer truthfulness

## Rule Of Thumb Going Forward

For backend work:

```text
Nest docs first
BullMQ docs for queue/worker behavior
Drizzle docs for DB schema/index/migration behavior
project rules decide product behavior
```

Do not let a route return a successful queued/deployed/verified-looking response unless the backing side effect really happened or the response is explicitly dry-run/demo.
