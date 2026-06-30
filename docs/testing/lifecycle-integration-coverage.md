# Lifecycle Integration Coverage

## Purpose

Foundation Milestone 3 proves persisted backend lifecycle truth through real database boundaries. These tests are not a feature milestone. They exist to catch lies that unit mocks can miss: rows that overclaim success, tenant filters that fail open, transactions that only partially persist evidence, and retry/reconcile paths that overwrite safety states.

The current rule is simple: integration tests should assert the database state an operator or future UI would read after the use case finishes or fails.

## Running Locally

Integration tests require a disposable PostgreSQL database. The harness resets the `public` schema before applying migrations, so never point `TEST_DATABASE_URL` at a development or production database.

```powershell
$env:TEST_DATABASE_URL="postgres://postgres:postgres@localhost:5432/local_seo_test"
corepack pnpm --filter @localseo/api test:integration
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

The first integration slice covers `ReleasesService.verify()` with a real migrated database and a deterministic fake `VerificationPort`.

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

### Deploy Worker DB

Prove with a real database that:

- `manual_reconciliation_required` rows cannot be overwritten by retry, reconcile, provider pending/success, or failure paths,
- upload resume evidence survives retry/reconcile,
- provider pending remains reconcilable and is not mislabeled failed,
- provider success does not become live-health truth before verification,
- the reconciler skips manual rows.

### Queue And Job Audit

Prove that:

- duplicate enqueue does not create duplicate active audit rows,
- terminal re-enqueue archives or separates prior audit rows truthfully,
- job state transitions remain honest across retry and terminal errors,
- queue unavailable paths do not return fake queued success.

### Tracking Ingestion

Prove that:

- valid project-scoped keys persist events for the correct project,
- revoked keys reject and write nothing,
- origin mismatch rejects and writes nothing,
- cross-tenant key/project mismatch cannot write events,
- rate limits are applied after validation,
- accepted production tracking means persisted or durably queued.

## Out Of Scope For This Milestone

Do not include these in Lifecycle Integration Coverage:

- real Netlify calls,
- browser/Playwright verification,
- Google Search Console calls,
- rollback execution,
- Mastra or AI reasoning behavior,
- full public-internet end-to-end deploys.

Those belong to later foundation milestones after the database/API/worker lifecycle is proven.
