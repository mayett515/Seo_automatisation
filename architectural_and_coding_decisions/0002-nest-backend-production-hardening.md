# 0002 - Nest Backend Production Hardening

Date: 2026-06-25

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

`GscService` still constructs several infrastructure dependencies:

- DB handle
- Search Console adapter
- token cipher
- BullMQ queue

That should become custom providers and composition-root wiring, but it should be done as one focused backend slice.

### Auth And Tenant Guards

The API is not production-safe until routes are protected by:

```text
current user -> project/customer membership -> permission check -> handler
```

This should be implemented with Nest guards and must happen before real customer GSC data flows through the system.

### Fake Queued Non-GSC Jobs

GSC sync now checks for a real queue before returning `queued`.

Other scaffold endpoints still return queued-looking placeholders:

- website import
- pre-audit
- release deploy

Those should become real queue producers or be explicitly marked as dry-run/demo in a future queue-producer slice.

### Readiness

The current health endpoint is a liveness-style endpoint. Production should split:

```text
/health/live
/health/ready
```

Readiness should check DB, Redis, queue ability, and required provider config.

### Production Builds

Current API/worker build scripts still primarily typecheck. A later deployment slice should decide:

- `tsc` emit
- `tsup`/esbuild bundling
- or intentionally running TypeScript with `tsx`

For AWS Fargate, a real deployable artifact is preferable.

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
