# Lifecycle Integration Coverage

## Purpose

Foundation Milestone 3 proves persisted backend lifecycle truth through real database boundaries. These tests are not a feature milestone. They exist to catch lies that unit mocks can miss: rows that overclaim success, tenant filters that fail open, transactions that only partially persist evidence, and retry/reconcile paths that overwrite safety states.

The current rule is simple: integration tests should assert the database state an operator or future UI would read after the use case finishes or fails.

## Running Locally

Integration tests require a disposable PostgreSQL database. The harness resets the `public` schema before applying migrations, so never point `TEST_DATABASE_URL` at a development or production database.

```powershell
$env:TEST_DATABASE_URL="postgres://postgres:postgres@localhost:5432/local_seo_test"
corepack pnpm test:integration
```

Safety guard:

- The database name must contain `test` or `integration`.
- If a different disposable database name is intentional, set `LOCALSEO_ALLOW_TEST_DB_RESET=true`.
- If `TEST_DATABASE_URL` is not set, the integration suite skips instead of failing the normal unit-test gate.

On this workstation, PostgreSQL is installed as a user-space runtime under `%USERPROFILE%\.localseo-tools` instead of as a Windows service. This avoids Docker Desktop/WSL overhead and avoids requiring an elevated shell.

Useful local commands:

```powershell
$bin = Join-Path $env:USERPROFILE ".localseo-tools\postgresql-17.10\pgsql\bin"
$data = Join-Path $env:USERPROFILE ".localseo-tools\pgdata-17"

# Start the local test server after reboot.
& (Join-Path $bin "pg_ctl.exe") -D $data -l (Join-Path $data "postgres.log") -o "-p 5432" start

# Check readiness.
& (Join-Path $bin "pg_isready.exe") -h localhost -p 5432 -U postgres

# Stop it when not needed.
& (Join-Path $bin "pg_ctl.exe") -D $data stop
```

Local environment recommendation:

- CI should use containerized PostgreSQL and Redis services for reproducibility.
- This workstation has limited RAM and disk headroom, so native PostgreSQL is the better local default than Docker Desktop.
- Docker Desktop should be installed only if the machine can comfortably spare the WSL2 memory and disk overhead.

## Current Coverage

### Release Verification

File:

- [releases.integration.ts](/C:/localseoproject/apps/api/src/modules/releases.integration.ts)

Harness:

- [integration-database.ts](/C:/localseoproject/packages/db/test-support/integration-database.ts)

Implemented tests:

1. Healthy verification persists a `release_verifications` row, persists child `release_verification_checks`, updates `deployments.status` and `deployments.verificationStatus` to `live_healthy`, and projects `releasePlans.status` to `live`.
2. Rollback-level verification persists blocker details, updates the deployment to `rollback_recommended`, and projects the release plan to the current coarse `failed` state.
3. Verifier execution failure is converted into persisted failed verification evidence; it must not leave the deployment in `verifying` or `running`.
4. Cross-project verification is rejected and writes no verification rows for the other project.

Verified local run:

```text
$env:TEST_DATABASE_URL="postgres://postgres:postgres@localhost:5432/local_seo_test"
corepack pnpm --filter @localseo/api test:integration

tests 4 | pass 4 | fail 0
```

These tests intentionally use a fake verification port. HTML parsing, canonical normalization, sitemap parsing, and JSON-LD extraction remain adapter unit-test responsibilities.

### Deploy Worker

File:

- [deploy.integration.ts](/C:/localseoproject/apps/worker/src/handlers/deploy.integration.ts)

Implemented tests:

1. Full deploy execution persists provider success while leaving `verificationStatus = not_started`.
2. Retry cannot overwrite `manual_reconciliation_required`.
3. `in_flight` without a provider deploy id escalates to manual reconciliation.
4. Retry/reconcile resumes upload from persisted provider resume evidence without starting another provider deploy.
5. The pending-deploy reconciler skips manual rows even when they have `providerDeployId`.

Verified local run:

```text
$env:TEST_DATABASE_URL="postgres://postgres:postgres@localhost:5432/local_seo_test"
corepack pnpm --filter @localseo/worker test:integration

tests 5 | pass 5 | fail 0
```

### Queue And Job Audit

File:

- [queue-producer.integration.ts](/C:/localseoproject/apps/api/src/queue-producer.integration.ts)

Implemented tests:

1. Missing queue infrastructure records an explicit `dry_run` audit row.
2. Duplicate active jobs coalesce without duplicate active `job_runs`.
3. Terminal re-enqueue archives the old audit row and creates a new queued row.
4. Queue add failure marks the queued audit row `failed` with failure evidence.

These tests use a stateful fake BullMQ queue with a real database because the DB audit truth is the project-owned behavior. Full Redis/BullMQ worker processing remains out of scope for this milestone slice.

### Tracking Ingestion

File:

- [tracking.integration.ts](/C:/localseoproject/apps/api/src/modules/tracking.integration.ts)

Implemented tests:

1. Valid publishable key + allowed origin persists an event for the correct project.
2. Revoked keys reject and write no events.
3. Origin mismatches reject before accepted-event rate-limit accounting and persistence.
4. Cross-project key reuse rejects and writes no events.
5. `lastUsedAt` updates are coalesced while accepted events still persist.

## Harness Design

The integration harness:

- creates one Drizzle/Postgres handle from `TEST_DATABASE_URL`,
- drops and recreates the `public` schema,
- applies the real Drizzle SQL migrations from `packages/db/migrations/meta/_journal.json`,
- truncates all public tables between tests with `restart identity cascade`.

This keeps integration tests close to production schema behavior without using production providers or live network calls.

## Coarse Release Plan Projection

`releasePlans.status = "failed"` is currently a coarse projection. It can mean the deploy itself failed, or it can mean the provider deploy succeeded but post-deploy verification found a rollback-level blocker.

Precise lifecycle truth lives in:

- `deployments.status`,
- `deployments.verificationStatus`,
- `release_verifications`,
- `release_verification_checks`.

Future UI and reporting work must read those detail rows before explaining a release as simply "failed".

## Remaining Coverage

The next integration areas should stay focused on operator truth and DB constraints.

### Still Useful In Deploy Worker DB

Further tests can prove:

- provider pending remains reconcilable and is not mislabeled failed,
- final-attempt pending stays reconcilable,
- `markFailed` cannot overwrite manual rows through the real repository,
- failed pre-provider rows with the same deployment key follow the intended strict/manual behavior.

### Still Useful In Queue And Job Audit

Further tests can prove:

- job state transitions remain honest across retry and terminal errors,
- worker-side `job_runs` updates by `jobRunId` and fallback external job id,
- enqueue/audit partial-failure behavior when Redis and Postgres disagree.

### Still Useful In Tracking Ingestion

Further tests can prove:

- rate limits are applied after validation,
- malformed project ids reject before UUID-backed database lookup,
- HTTP/controller header wiring matches service-level behavior.

## Out Of Scope For This Milestone

Do not include these in Lifecycle Integration Coverage:

- real Netlify calls,
- browser/Playwright verification,
- Google Search Console calls,
- rollback execution,
- Mastra or AI reasoning behavior,
- full public-internet end-to-end deploys.

Those belong to later foundation milestones after the database/API/worker lifecycle is proven.
