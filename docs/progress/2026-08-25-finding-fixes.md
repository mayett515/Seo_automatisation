# 2026-08-25 - Codex finding fixes

Implementation of the ten Codex findings plus the two extras from the follow-up
adjudication. The original review remains in `2026-08-25.md`. This log is the
change record, not a second scoring of the repository.

## Honesty (2, 3, extras)

- `getRelease` no longer returns a fabricated draft. Invalid ids are 400,
  missing persistence is 503, missing rows stay 404.
- `listNotes` reads `release_notes` and returns an empty array when none exist.
- `listRollbackPoints` no longer invents a sample rollback artifact; empty
  collection when none exist.
- `preflight` no longer runs against empty invented evidence.
- Invalid release-plan UUIDs on deploy/rollback/verify are 400, not dry-run.
- `isPersistedId` lives once in `apps/api/src/persisted-id.ts` and is
  re-exported from the pages aggregate store.
- Unused report-table imports in `packages/db/src/schema/relations.ts` removed.

## Navigation (1)

- Authenticated nav uses the current route `projectId` via `useProjectId`.
- `demo-project` is used only when `allowsLocalScaffoldUi()` is true.
- Screens that previously fell back to `demo-project` now show
  "Select a project to continue" when no routed/scaffold id exists.
- API paths throw if a mutation or enabled query runs without a project id.

## Domain / types (4, 8, 9, 10)

- Website import service extraction accepts an injected vocabulary; default
  seed remains the existing local-service list.
- Area extraction requires a location route pattern or corroborating page
  text; blog/impressum-style segments are stop-listed.
- Recovery failure input nests `recovery: { expectedRecoveryCount, staleBefore }`
  so the stale-before cast is gone.
- `TrackingKeyListResponseSchema` is the shared list envelope; the frontend
  parser is gone.
- Queue audit `type` is `JobType`. The producer integration fixture now uses
  `deploy` instead of the previously untyped `deploy_release` literal.

## Ports / cohesion (7, 6, 5)

- Removed unused `SiteHostingPort.createDeploy` and `restoreDeploy` (and the
  Netlify convenience wrappers). Adapter tests drive begin/upload/get.
- Split `@localseo/ai` into `opportunity-scout.ts`, `page-proposal.ts`,
  `section-copy.ts` with a compatible barrel.
- Split `ReleasesService` behind planning/read/preflight/execution/rollback
  capabilities and `release-aggregate-store.ts`. Public facade and routes
  unchanged. Guard literals were re-homed; none deleted.

## What this is not

These fixes do not add a project picker, a dry-run `ReleasePlan` variant, a
generic website NLP extractor, or a new hosting restore API. Deploy without
queue infrastructure remains an explicit `dry_run` status.

## Verification

Unpiped unit gates after the change set:

- `corepack pnpm format:check` — passed
- `corepack pnpm exec tsx tools/check-text-health.ts` — Text health check passed.
- `corepack pnpm exec tsx tools/check-architecture-regression-guards.ts` — Architecture regression guard check passed.
- Targeted typecheck: contracts, domain, db, ai, adapters, api, web, worker — passed
- Tests: contracts 61, domain (incl. website-import facts), ai 58, adapters 66, api 89, web 18, worker 125 — all pass

Not run: `test:integration` (Docker), browser verification of the nav empty state, full `corepack pnpm check` / build.
