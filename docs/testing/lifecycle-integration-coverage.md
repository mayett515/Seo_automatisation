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

### Release Preflight Rollback Preparation

File:

- [releases.integration.ts](/C:/localseoproject/apps/api/src/modules/releases.integration.ts)

Implemented tests:

1. Preflight prepares a provider-backed rollback point for the new release from the latest verified-good prior deployment, then persists a passing `rollback_point_ready` check.
2. Preflight does not prepare a rollback point from a prior deployment that was already `rollback_recommended`.
3. Preflight skips rollback point preparation when all prior deployments are unsafe sources (`rollback_recommended`, `failed`, or `verifying`).
4. Preflight prefers an older verified-good source over a newer bad deployment.
5. Preflight falls back to a `provider_succeeded` source when no verified-good source exists.
6. The rollback source identity is idempotent at the database boundary: an exact duplicate `(release_plan_id, deployment_id, provider_deploy_id)` insert is conflict-suppressed instead of creating a second rollback option.
7. Rollback point rows without provider deploy evidence do not satisfy preflight; if no provider-backed prior deployment can be snapshotted, preflight stays blocked instead of queueing an unrecoverable deploy.

The deploy worker also counts only provider-backed rollback points as usable rollback evidence, so bypassing API preflight cannot treat placeholder rollback rows as deploy-safe.

### Release Deploy Approval

File:

- [releases.integration.ts](/C:/localseoproject/apps/api/src/modules/releases.integration.ts)

Implemented tests:

1. Deploy approval records persisted actor evidence and moves the release plan to `approved_for_deploy`.
2. Missing persisted actor evidence is rejected and writes no approval rows.
3. Rerunning preflight after deploy approval demotes the plan back to the latest readiness state and deploy is rejected until a fresh deploy approval is recorded.

### Release Plan Creation From Approved Page Versions

File:

- [releases.integration.ts](/C:/localseoproject/apps/api/src/modules/releases.integration.ts)

Implemented coverage:

1. Approved page versions with `approvedAt` evidence can create a `draft` release plan and `pending` `create` release items, and release-plan creation records the persisted creating user on `release_plans.created_by_user_id`.
2. Preview page versions are rejected.
3. Non-approved immutable page versions such as `release_candidate` are rejected.
4. Page versions from another project are rejected.
5. Absolute page proposal routes are rejected before release items are persisted.
6. Missing persisted actor evidence is rejected and writes no release plan or items.

These tests prove release planning is a durable planning action only: it selects already approved artifacts, writes draft plan/item rows, and does not approve deploy, enqueue deploy, or mutate providers.

### Release Verification

File:

- [releases.integration.ts](/C:/localseoproject/apps/api/src/modules/releases.integration.ts)

Harness:

- [integration-database.ts](/C:/localseoproject/packages/db/test-support/integration-database.ts)

Implemented API tests:

1. `POST /verify` creates a `release_verifications.status = running` row and enqueues `release-verification` with `jobId = verificationId`.
2. A second verify request for the same deployment returns `already_active` without enqueuing duplicate work.
3. Queue enqueue failure marks the pre-created verification `execution_failed` and writes a `verification_queue_check`.
4. Cross-project verification is rejected and writes no verification rows for the other project.
5. The queued verification row uses the project-scoped route `releasePlanId`.
6. A deployment id from another release plan or project is rejected and writes no verification rows.
7. Release verification queueing stays scoped to an authorized release plan and provider-backed deployment.

Implemented worker tests:

1. Healthy verification persists child `release_verification_checks`, updates `deployments.status` and `deployments.verificationStatus` to `live_healthy`, and projects `releasePlans.status` to `live`.
2. GSC sitemap handoff failure stays warning-level and projects `live_with_warnings`, not `rollback_recommended`.
3. Verifier infrastructure errors remain retryable before the final BullMQ attempt.
4. Final verifier infrastructure failure is persisted as `execution_failed` evidence without marking the deployment or release plan as observed failed health.
5. Absolute verification target routes are rejected in the worker execution path before the verifier adapter can fetch them.

This file contributes 6 release-plan creation tests, 10 rollback-preflight/deploy-approval tests, 7 API release verification queueing tests, 5 worker release verification projection tests, and 5 rollback queueing tests. The full API/worker integration commands also run queue/job audit and tracking/GSC integration tests.

### Rollback Queueing

File:

- [releases.integration.ts](/C:/localseoproject/apps/api/src/modules/releases.integration.ts)

Implemented tests:

1. `executeRollback()` scopes the rollback point to the authorized project and release plan, pins the current rollback-target deployment id into the job payload, queues a `rollback` job, and writes a `job_runs` audit row without marking the release rolled back in the API.
2. A rollback point from another project or release plan is rejected and writes no rollback job audit row.
3. A release plan that is not in the rollback-ready `failed` projection is rejected before enqueue.
4. A target deployment without provider deploy evidence is rejected before enqueue.
5. A rollback point without provider deploy evidence is rejected before enqueue.

These tests prove the API boundary. The provider mutation belongs to the worker tests below.

Verified local run:

```text
$env:TEST_DATABASE_URL="postgres://postgres:postgres@localhost:5432/local_seo_test"
corepack pnpm --filter @localseo/api test:integration

tests 29 | pass 29 | fail 0
```

These tests intentionally use a fake verification port. HTML parsing, canonical normalization, sitemap parsing, and JSON-LD extraction remain adapter unit-test responsibilities.

### Deploy Worker

File:

- [deploy.integration.ts](/C:/localseoproject/apps/worker/src/handlers/deploy.integration.ts)

Implemented tests:

1. Full deploy execution persists provider success while leaving `verificationStatus = not_started`.
2. Deploy execution is allowed without rollback point evidence when the only prior deployments are unsafe rollback sources (`rollback_recommended` or `verifying`), matching API preflight's safe-source definition.
3. Retry cannot overwrite `manual_reconciliation_required`.
4. `in_flight` without a provider deploy id escalates to manual reconciliation.
5. Retry/reconcile resumes upload from persisted provider resume evidence without starting another provider deploy.
6. The pending-deploy reconciler skips manual rows even when they have `providerDeployId`.
7. `markFailed` cannot overwrite `manual_reconciliation_required`.
8. Pending provider deploys remain reconcilable instead of being mislabeled failed.
9. Provider read failures during pending-deploy reconciliation remain reconcilable instead of being mislabeled failed.
10. Unexpected pending-deploy reconciliation errors are surfaced instead of being silently counted as pending.

This file contributes 10 deploy-worker tests to the worker integration command.

### Rollback Worker

File:

- [rollback.integration.ts](/C:/localseoproject/apps/worker/src/handlers/rollback.integration.ts)

Implemented tests:

1. Completed provider rollback marks the deployment and release plan `rolled_back`, writes rollback execution evidence, and records the provider deploy id that was rolled back from.
2. Provider rollback failure records normalized failed rollback execution evidence and is treated as a terminal provider failure, without marking the deployment or release plan rolled back.
3. Provider-pending rollback records `rollback_pending` evidence, updates the target deployment to queryable `rollback_pending`, and keeps the original bad provider deploy id pinned until terminal success.
4. The rollback reconciler marks `rolled_back` only when the provider-published deploy id matches the intended restored deploy.
5. Duplicate completion of the same pending rollback is treated as a `staleNoop` metric outcome and does not stamp manual reconciliation onto the already-rolled-back deployment.
6. Provider-published-deploy read failures leave rollback pending for a later cycle.
7. A still-published original target deployment leaves rollback pending instead of escalating to manual reconciliation.
8. Provider-published third-deploy identity mismatches mark the deployment `manual_reconciliation_required` without changing `rollback_pending`.
9. Retried rollback jobs do not re-post restore after `rollback_pending` was recorded.
10. Retried rollback jobs do not re-post restore when they see `restore_in_flight` evidence.
11. A release plan that is no longer rollback-eligible stops before provider restore.
12. Stale target deployment state after provider restore does not persist `rolled_back`.
13. A rollback job updates only the pinned target deployment, even when a newer deployment row exists.
14. `not_configured` rollback results become terminal configuration errors.
15. Missing rollback-point provider deploy evidence fails before calling the provider.

This file contributes 15 rollback-worker tests to the worker integration command.

### GSC Sync Worker

File:

- [gsc-sync.integration.ts](/C:/localseoproject/apps/worker/src/handlers/gsc-sync.integration.ts)

Implemented tests:

1. Successful sync refreshes access, queries Search Console through a fake port, replaces stale Search Analytics rows, inserts fresh rows, creates opportunity signals, marks the sync run completed, and clears connection failure state.
2. Empty syncs complete honestly, clear stale analytics/signals for the sync run, and do not create opportunity signals.
3. Refresh-token decrypt failure marks the sync run failed, marks the GSC connection `error`, and stores reconnect-required connection failure evidence.
4. Google OAuth `invalid_grant` refresh failure marks the sync run failed, marks the GSC connection `error`, and stores reconnect-required connection failure evidence.
5. Transient Google OAuth refresh failure marks the sync run failed and records connection failure evidence without flipping the connection out of `connected`.
6. Search Console query failure marks the sync run `failed`, records connection failure evidence, and does not mark the connection as synced.

These tests use a fake `SearchConsolePort` and fake token decryptor. The database writes, deletes, foreign keys, and transaction ordering are real; no live Google Search Console network calls are made.

Verified local worker integration run:

```text
$env:TEST_DATABASE_URL="postgres://postgres:postgres@localhost:5432/local_seo_test"
corepack pnpm --filter @localseo/worker test:integration

tests 31 | pass 31 | fail 0
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

### Page Proposal Reasoning Worker

Files:

- [page-proposal-example.test.ts](/C:/localseoproject/apps/worker/src/page-proposal-example.test.ts)
- [page-proposal.integration.ts](/C:/localseoproject/apps/worker/src/handlers/page-proposal.integration.ts)
- [page-proposal-smoke.md](/C:/localseoproject/docs/testing/page-proposal-smoke.md)

Implemented DB-free compatibility test:

1. The canonical prompt example parses through the Page Proposal contract, passes Page Registry validation and Page Studio composition, and renders through the shared editor-preview path. Registry drift therefore fails the normal worker unit loop rather than waiting for DB integration.

Implemented DB-backed tests:

1. A contract-valid mock response crosses deterministic QA, registry, composition, and preview-render gates before one draft proposal and one unapproved preview version persist transactionally.
2. The actual `OpenCodeGoReasoningAdapter` serializes `page_brief_draft`, `PageProposalJson`, and the exact no-production-mutation policy; its controlled HTTP response crosses the same gates, while the worker replaces model-provided generation provenance with the durable run id.

The credentialed provider run is an explicit operational smoke, not a CI secret-bearing test. Its runner uses the public API/queue path, requires `provider = opencode_go`, verifies draft/preview-only product truth, and prints sanitized summaries only.

### Bounded Stale-Work Recovery

File:

- [work-recovery.integration.ts](/C:/localseoproject/apps/worker/src/work-recovery.integration.ts)

Implemented tests:

1. A stale Page Proposal run with missing transport is claimed once, re-enqueued with `jobId = runId`, and receives a system-owned recovery `job_runs` row.
2. A stale release verification is re-enqueued with `jobId = verificationId` while deploy/rollback provider-mutation lanes remain outside the scanner.
3. Exhausted release-verification recovery becomes `execution_failed` with warning-level recovery evidence and matching deployment verification truth.
4. Exhausted Page Proposal recovery becomes a failed run with `work_recovery_exhausted` and no queue replay.
5. Completed live transport without terminal Page Proposal truth becomes `work_transport_inconsistent` instead of being replayed.
6. Completed `job_runs` audit still terminalizes inconsistent release-verification truth when BullMQ retention has removed the live transport job.
7. Transport that becomes active after the durable recovery claim coalesces the enqueue and records a cancelled recovery audit.
8. A failed recovery enqueue leaves the durable workflow active for the next bounded scan and records the failed queue attempt in `job_runs`.
9. Two concurrent scanners race one stale Page Proposal row, but the recovery-count/stale-time claim permits exactly one enqueue.

The scanner tests use real Postgres migrations and a stateful fake queue. This proves product-row claims and audit transactions without requiring Redis to manufacture the race timing.

### Controlled Page Studio Editing

File:

- [pages.integration.ts](/C:/localseoproject/apps/api/src/modules/pages.integration.ts)

Implemented tests:

1. Structured prop edits create an N+1 preview with persisted actor and base-version lineage while leaving the base PageJson unchanged.
2. Legal movement and variant commands chain only from the latest version.
3. Registry-invalid props, illegal movement, and illegal replacement fail without creating product rows.
4. Editing an approved version creates a new preview while preserving the frozen approved artifact.
5. Editing is project-scoped and requires persisted actor evidence.
6. Two concurrent edits from one base serialize so exactly one N+1 version is created.
7. DB triggers reject missing, cross-proposal, and non-immediate lineage and freeze lineage/actor evidence after approval.
8. Once a newer version exists, review of the stale base is rejected.
9. Edit-first lock ordering makes a concurrently waiting review stale after the N+1 version commits.
10. Review-first lock ordering approves the base before the waiting edit branches to a new preview.
11. Controlled replacement derives target structure from the registry, preserves the existing section slot, clears stale evidence, records human provenance, and leaves the base version unchanged.

These tests run the real migrations and transactions. They prove that Page Studio commands are append-only product decisions rather than in-place JSON mutation.

DB-free Page Registry and web tests additionally prove that registry editor metadata stays aligned with prop-schema keys and control kinds, latest-version selection does not depend on API arrival order, lineage traversal is bounded/cycle-safe, complete props normalization removes only explicitly optional blank fields, registry templates restore absent optional list controls without changing the durable schema, and replacement controls expose only domain-approved targets with schema-valid minimum form rows.

The Playwright replacement test runs the visual workspace at 390px and proves target/variant/prop staging makes no request, one explicit confirmation sends exactly one narrow `replace_section` command, the UI navigates to the N+1 preview, the shared preview reflects the replacement, and the page has no horizontal overflow.

### AI Section Copy Revision

Files:

- [pages.integration.ts](/C:/localseoproject/apps/api/src/modules/pages.integration.ts)
- [section-copy-suggestion.integration.ts](/C:/localseoproject/apps/worker/src/handlers/section-copy-suggestion.integration.ts)
- [work-recovery.integration.ts](/C:/localseoproject/apps/worker/src/work-recovery.integration.ts)

Implemented tests prove:

1. The API creates one unresolved suggestion/run per page-version section, enqueues deterministic `section_text_generation` transport, lists contract-parsed suggestion state, and returns an explicit no-product-row dry-run when transport is absent.
2. Protected sections and missing persisted actor evidence fail before queueing.
3. Exact application creates N+1 with durable agent-run provenance; operator-modified application creates N+1 with human provenance.
4. Ready dismissal and queued/generating cancellation persist actor evidence and permit a later replacement suggestion; cancellation also terminalizes unfinished run truth as `operator_cancelled`.
5. The worker accepts only the pinned section and registry-marked copy fields, preserves protected href props, reruns registry/composition/render gates, and marks only the suggestion ready without creating a page version.
6. Protected-field output fails terminally without creating a page version, and neither a retried worker nor a late provider failure can resurrect or overwrite an operator-cancelled suggestion.
7. Bounded recovery re-enqueues stale suggestion work with the same run/suggestion ids and atomically fails both rows after exhaustion.

DB-free contract, AI, registry, domain, adapter, and web-state tests additionally pin the strict output shape, bounded prompt/evidence packet, protected-field merge, AI-copy field metadata, exact-versus-modified provenance, task-aware mock output, and latest-suggestion selection. The 390px Playwright flow proves generate creates no version, ready output is reviewed in the structured form, and one explicit apply sends `suggestionId` through the existing edit command before navigating to N+1.

### Media Asset Backend Foundation

Files:

- [media.integration.ts](/C:/localseoproject/apps/api/src/modules/media.integration.ts)
- [media-processing.integration.ts](/C:/localseoproject/apps/worker/src/handlers/media-processing.integration.ts)
- [work-recovery.integration.ts](/C:/localseoproject/apps/worker/src/work-recovery.integration.ts)

Implemented tests prove:

1. Upload intent requires persisted actor, configured queue, project scope, bounded allow-listed metadata, and SHA-256 before a `pending_upload` row is accepted; API responses never expose storage keys.
2. Local/test binary upload enforces the persisted size/type/checksum, and completion moves the row to `processing` before one deterministic `media-processing` enqueue with `jobId = assetId`.
3. Provider metadata mismatch leaves the upload pending, and media-library reads remain tenant-scoped.
4. The worker recomputes the source checksum, decodes static raster content under byte/pixel limits, emits deterministic WebP variants, and promotes only the exact persisted derivative set to `ready`.
5. Database triggers reject incomplete ready transitions and all variant mutation after ready; deterministic checksum failure writes visible failed product truth without derivative rows.
6. Bounded recovery re-enqueues stale processing by the same asset id, terminalizes exhausted processing as `work_recovery_exhausted`, and expires 24-hour abandoned pending intents so quota cannot remain occupied forever, without touching deploy/rollback lanes.

DB-free contracts, filesystem-storage, worker, permission, and routing tests additionally pin strict request/response shapes, raw-byte metadata, derivative width behavior, editor authorization, and worker queue ownership. Page Studio media placement and controls remain intentionally outside this backend slice.

### Media Renderer, Preview, And Deploy Parity

Files:

- [page-json.test.ts](/C:/localseoproject/packages/contracts/src/page-json.test.ts)
- [netlify-site-hosting.test.ts](/C:/localseoproject/packages/adapters/src/netlify-site-hosting.test.ts)
- [preview-capability.test.ts](/C:/localseoproject/apps/api/src/preview-capability.test.ts)
- [pages.integration.ts](/C:/localseoproject/apps/api/src/modules/pages.integration.ts)
- [media.integration.ts](/C:/localseoproject/apps/api/src/modules/media.integration.ts)
- [deploy.integration.ts](/C:/localseoproject/apps/worker/src/handlers/deploy.integration.ts)
- [page-studio-replacement.spec.ts](/C:/localseoproject/apps/web/e2e/page-studio-replacement.spec.ts)

Implemented tests prove:

1. Static artifacts require explicit UTF-8 or canonical base64 files, reject unsafe/duplicate paths, and account against a 50 MiB decoded-byte budget.
2. Netlify calculates SHA1 over decoded bytes and uploads those same bytes rather than the base64 transport text.
3. Preview capabilities are signed, time-bounded, kind/project/version/manifest-bound, tamper-resistant, and production-cookie hardened.
4. The guarded preview metadata call returns no HTML body, issues the document capability, and the capability-authorized document rechecks the current manifest before issuing the `/assets` capability.
5. Preview asset delivery accepts only a manifest-authorized immutable path and verifies downloaded byte count plus SHA-256 before responding.
6. Deploy resolves the same project-scoped media projection, verifies immutable derivative bytes, and persists UTF-8 HTML plus base64 media in one self-contained artifact before provider handoff.
7. Chromium keeps the preview iframe at `sandbox=""`, loads the document URL instead of `srcDoc`, and preserves the existing Page Studio flow at desktop and mobile widths.
8. A real-network Chromium test proves the cross-site document capability is sent on sandboxed navigation and the document-issued `Secure; SameSite=None; Partitioned` `/assets` capability is sent by an image request from the opaque-origin iframe.

### Page Studio Media Placement

Primary executable evidence:

- [pages.integration.ts](/C:/localseoproject/apps/api/src/modules/pages.integration.ts)
- [releases.integration.ts](/C:/localseoproject/apps/api/src/modules/releases.integration.ts)
- [deploy.integration.ts](/C:/localseoproject/apps/worker/src/handlers/deploy.integration.ts)
- [index.test.ts](/C:/localseoproject/packages/page-registry/src/index.test.ts)
- [page-studio-replacement.spec.ts](/C:/localseoproject/apps/web/e2e/page-studio-replacement.spec.ts)

Covered behavior:

1. `ImageText` accepts only the strict opaque `PageMediaReference` shape; raw URLs/object keys and registry/editor metadata drift are rejected.
2. A version edit may newly select only ready project assets, retains an inherited archived reference through direct lineage, and persists the exact `page_version_media_assets` projection in the same N+1 transaction.
3. Approval verifies the referenced immutable bytes; release-plan creation rejects PageJson/projection mismatch; preflight persists a blocker when media evidence drifts; deploy rechecks and embeds the exact referenced bytes.
4. Rendering fails closed when PageJson references and the resolved manifest differ in either direction, while preview and deploy emit the same deterministic asset paths, responsive variants, alt semantics, and focal placement.
5. Page Proposal output cannot select project media, and section-copy validation resolves existing media without gaining a media-write path.
6. Chromium proves upload and durable library staging do not edit PageJson; one explicit `ImageText` confirmation submits one complete version command with content/decorative alt and focal-point data.

Physical quarantine/derivative byte-retention cleanup, richer media section families, remote import, stock search, and AI image generation remain deferred.

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

`releasePlans.status = "live"` and `releasePlans.status = "failed"` are currently coarse projections. `live` is projected only after post-deploy verification reports `live_healthy` or `live_with_warnings`; provider success alone remains deployment transport truth (`deployments.status = "provider_succeeded"`). `failed` can mean the deploy itself failed, or it can mean the provider deploy succeeded but post-deploy verification found a rollback-level blocker.

Verifier infrastructure errors are now separate from observed live-page failures: `deployments.verificationStatus = "execution_failed"` and the matching `release_verifications` row mean the verifier did not complete, not that the page was proven broken.

Precise lifecycle truth lives in:

- `deployments.status`,
- `deployments.verificationStatus`,
- `release_verifications`,
- `release_verification_checks`.

Future UI and reporting work must read those detail rows before explaining a release as simply "failed". The same rule applies before explaining a release as verified healthy: `releasePlans.status = "live"` alone is not enough; consumers must check deployment verification detail.

## Remaining Coverage

The next integration areas should stay focused on operator truth and DB constraints.

### Still Useful In Deploy Worker DB

Further tests can prove:

- final-attempt pending stays reconcilable,
- failed pre-provider rows with the same deployment key follow the intended strict/manual behavior.

### Still Useful In Rollback Execution

Further tests can prove:

- rollback queue deduplication across repeated operator clicks remains one active rollback job,
- final-attempt `restore_in_flight` escalation to manual reconciliation remains visible through `job_runs` as well as deployment/rollback evidence.

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

### Still Useful In GSC Sync

Further tests can prove:

- worker retry behavior keeps sync-run and `job_runs` lifecycle truth aligned,
- API/controller sync queueing preserves actor metadata and rejects unavailable GSC connections before enqueue,
- larger Search Analytics result sets continue to chunk inserts without dropping opportunity signals.

## Out Of Scope For This Milestone

Do not include these in Lifecycle Integration Coverage:

- real Netlify calls,
- live public-deploy browser verification,
- live Google Search Console calls,
- Mastra or AI reasoning behavior,
- full public-internet end-to-end deploys.

Those belong to later foundation milestones after the database/API/worker lifecycle is proven.
