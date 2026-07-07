# Lifecycle Truth Hardening Backlog

Date: 2026-06-30
Status: Accepted follow-up notes

This note records review findings from the DeepSeek logic/state audit and the Opus triage that should shape the next backend hardening patch. It is intentionally separate from ADR 0011 because these items are broader lifecycle-truth work, not rollback executor wiring.

## Completed Hardening Follow-Ups

### Verification Execution Failure Is Not Live-Page Failure

`verify()` now persists verifier infrastructure failures as `execution_failed`. The deployment keeps its provider/live health status instead of being downgraded to observed failed health, and `releasePlans.status` is not projected to `failed` for a verifier crash.

Why: operator truth. A healthy site should not look rollback-worthy just because the verifier infrastructure failed.

### Verification Target URLs Must Stay On The Deployment Host

Release-plan item target routes are now validated as relative paths when release plans are created, and `verify()` defensively rejects absolute or protocol-relative target routes before calling the verifier adapter.

Why: both security and evidence truth. Post-deploy verification must observe the release's own live URLs, not an arbitrary host.

### HTTP Verifier Redirects Must Stay On The Deployment Host

The HTTP verifier now follows redirects manually and rejects redirect hops that leave the original deployment origin. This applies to both live page fetches and sitemap fetches.

Why: initial target URL validation is not enough if deployed content can redirect the verifier to an internal or off-host URL.

### HTTP Verifier Uses Bounded Deterministic Source Checks

The HTTP verifier now bounds concurrent live-route fetches and records additional source-level SEO evidence for title/meta description, primary H1, and local SEO JSON-LD schema types. These checks are warning-level deterministic evidence; they do not create rollback recommendations by themselves.

Why: before adding browser execution, the HTTP verifier should exhaust cheap and stable source checks. Bounded fetch concurrency also prevents large release plans from creating unbounded network pressure.

### GSC Sync Has DB-Backed Mutation Coverage

The GSC sync worker now has real Postgres integration coverage for successful Search Analytics import, empty-result cleanup, and Search Console query failure persistence. The tests use a fake Search Console port and fake token decryptor, but the `gsc_sync_runs`, `gsc_search_analytics_rows`, `gsc_opportunity_signals`, and `gsc_connections` mutations run through the real schema.

Why: GSC sync is a production mutation path with delete+insert analytics behavior and opportunity-signal derivation. Unit tests already covered parsing and signal classification; DB-backed tests now prove the operator-visible sync truth.

### Rollback Point Preparation Uses Safe Source Selection

Release preflight prepares rollback points from verified-good prior deployments first (`live_healthy`, `live_with_warnings`) and falls back to `provider_succeeded` only when no verified-good source exists. It does not prepare rollback points from `rollback_recommended`, `verifying`, or `failed` deployments.

Why: rollback-to sources and rollback-from targets have opposite health requirements. A known-bad deployment can be a rollback target, but it must not be the source that gets restored.

### Rollback Point Preparation Is Idempotent For A Source Identity

Rollback point preparation now has a database uniqueness guard for the same `(release_plan_id, deployment_id, provider_deploy_id)` source identity, and the preflight insert uses conflict-safe insertion. Concurrent preflight calls that target the same source cannot create duplicate provider-backed rollback options.

Why: preflight was already written as "skip if a provider-backed point exists," but that check happened before insert. The database now owns the duplicate guard for the race shape that matters.

### Deploy Worker Uses The Same Safe Rollback-Source Set As Preflight

The deploy worker's final rollback-evidence guard now counts prior deployments with the same safe source statuses as API preflight: `provider_succeeded`, `live_healthy`, and `live_with_warnings`. Prior `rollback_recommended`, `verifying`, and `failed` deployments do not force rollback evidence that preflight could not prepare safely. Deploy replay also treats already-recorded `rollback_recommended`, `verifying`, or `rolled_back` rows as no-op provider replays instead of projecting the release back to `live`.

Why: API preflight and worker execution must agree about when rollback evidence is required. A known-bad or unknown-health prior deployment cannot be a rollback-to source, and a stale deploy retry must not turn observed bad health back into a live projection.

### Provider Failures Are Redacted And Timeout-Bounded

The Netlify and Google Search Console adapters now throw typed provider request errors that include safe provider, operation, status, timeout, and structured provider reason codes without storing raw response bodies. Both adapters wrap provider HTTP calls in `AbortController` timeouts. GSC sync failures now classify decrypt, invalid refresh-token, transient refresh, and query failures separately; reconnect-required failures mark the GSC connection `error`, while transient/query failures keep the connection connected but visible through `failureJson`.

Why: provider response bodies can contain sensitive diagnostic data, and unbounded provider calls can stall worker retry/shutdown behavior. GSC connection state must tell operators when reconnect is required instead of leaving a broken connection looking healthy.

### ADR 0012 Production Policy Guards Are Implemented

The accepted production-readiness policy now has code-level guards for the slices that do not require pending rollback reconciler design:

- reconnect-required GSC sync failures are classified as terminal worker errors and rethrown to BullMQ as unrecoverable, preserving the precise reconnect-required connection failure instead of retrying into a generic not-ready state,
- accepted tracking events use Redis-backed write-protection limits in strict/production mode and fail closed with `503` when those limits are unavailable, while pre-validation request limits remain a soft local throttle,
- provider-backed deploy timeout or unknown read/upload outcomes remain reconcilable after final attempts and during the periodic deploy reconciler; an explicit provider terminal `failed` or `rolled_back` snapshot marks the deployment failed immediately and stops BullMQ retries.

Why: ADR 0012 intentionally separated policy decisions from implementation. These guards encode the decided production posture without changing rollback automation semantics.

### Pending Rollback Reconciliation Is Read-Only And Queryable

Provider `queued` rollback results now transition the target deployment to `rollback_pending` with ADR 0013 rollback-operation evidence. The worker writes `restore_in_flight` before the provider restore POST, stores an `operationAttemptId`, and does not re-post restore when a retry sees `restore_in_flight` or `rollback_pending`.

The periodic rollback reconciler reads `deployments.status = "rollback_pending"`, reloads the rollback point by the `rollbackPointId` stored in deployment evidence, reads the provider's current published deploy identity, and only marks `rolled_back` through the guarded rollback success transaction when the intended provider deploy is currently published. Provider read failures and still-published target deployments leave the row pending; third-deploy identity mismatches or malformed evidence move the deployment to `providerOperationStatus = "manual_reconciliation_required"`. Duplicate completion races are counted as `staleNoop` and do not overwrite terminal success evidence with manual reconciliation.

Why: rollback restore is an external mutation with ambiguous completion behavior. The system should mutate the provider once, persist evidence, and reconcile by observation instead of repeating restore calls or overclaiming `rolled_back`.

### Rollback Trigger Policy Is Manual-Only For MVP

ADR 0014 accepts explicit human/operator rollback as the MVP trigger policy. Automatic rollback is deliberately deferred and must later be per-project opt-in, default off, verified-good-source-only, debounced, single-flight, loop-protected, and audited as `system_auto`.

Why: the pending rollback reconciler makes rollback execution reliable and truthful, but it does not decide whether the product should autonomously mutate a customer's live site after a machine-derived verification signal. Product autonomy and provider-operation reliability are separate gates.

### Search Console OAuth Start Is Port-Owned

`SearchConsolePort` now exposes the full `createAuthorizationRequest(...)` operation. `GscService` depends on `SearchConsolePort | undefined` instead of `GoogleSearchConsoleAdapter | undefined`, while the API composition root still wires the concrete Google adapter. PKCE/state signing stays in the adapter, and Redis nonce/code-verifier persistence stays in the API-owned `GscOAuthStateStore`.

Why: the API use case is "start Search Console OAuth and return redirect intent plus state/code verifier to persist." The purpose-named port now describes that boundary, so tests/fakes and the API module no longer need concrete Google adapter internals.

### Browser Tracking Runtime Verification Is Warning-Level

The HTTP verifier now accepts an optional browser runtime. Production API startup requires browser verification to be enabled. The Playwright-backed browser verifier observes whether tracking requests fire during rendered-page execution while blocking cross-origin browser requests after observation. Missing tracking execution is warning-level evidence; browser launch, timeout, or runtime failures are skipped warning evidence and never rollback blockers.

Why: browser execution is useful for proving script behavior but is also a flaky infrastructure dependency. It must deepen verification evidence without converting browser infrastructure failure into observed live-page failure.

### GSC Post-Deploy Handoff Is Diagnostic Evidence

Release verification now appends GSC-scoped checks when a Search Console connection exists. The API refreshes the stored connection token, submits `/sitemap.xml`, and runs bounded URL Inspection diagnostics for verified target URLs. Missing configuration or connection state becomes skipped/failed warning evidence, reconnect-required token failures mark the GSC connection `error`, and no GSC handoff result can create a rollback recommendation.

Why: Search Console is an internal indexing and diagnostics radar. Sitemap submission and URL Inspection should be recorded with post-deploy evidence, but indexing uncertainty must not be treated as customer-facing success proof or live-page failure.

### Tracking Rate-Limit Redis Buckets Are Atomic

Tracking rate-limit increments now use one Redis Lua operation that increments the bucket and sets the TTL when the bucket is first created.

Why: the previous `INCR` then `EXPIRE` sequence could leave a TTL-less bucket if the second Redis call failed. Atomic bucket creation keeps the strict production fail-closed posture without poisoning future requests.

### Browser Smoke Tests Cover Frontend Route And Auth Basics

The repository now has a Playwright browser-smoke command and CI job. It starts the Vite app in local scaffold mode and verifies the mission-control shell, route navigation, and login/sign-up screen states without requiring a live API or seeded account.

Why: route/auth regressions are runtime-sensitive and should not rely on TypeScript compilation alone.

## Accepted For Future Hardening

### Release Plan Status Should Eventually Split By Ownership

`releasePlans.status` is currently a coarse projection that covers approval, deploy, health, failure, and rollback concepts. Provider success no longer projects this status to `live`; only post-deploy verification outcomes do. The detail records already preserve the precise truth, but future UI/reporting will be simpler and safer if these responsibilities are separated.

Follow-up direction:

- Consider separate approval, deploy, and health/rollback projections when the UI starts depending on lifecycle explanation.
- Keep one writer per projection: approval API owns approval truth, deploy worker owns provider mutation truth, verifier owns live-health truth, rollback worker owns restore truth.

Why: avoid overloading one column with several meanings and reduce the chance that UI/reporting treats provider success as verified health.

### Restore In-Flight Orphan Sweep

`restore_in_flight` is intentionally owned by rollback job retry, not the periodic rollback reconciler. A hard crash or lost job before the final retry can still strand rollback intent evidence in JSON while no periodic worker polls it.

Follow-up direction:

- Add a stale `restore_in_flight` sweep only if job loss or operational visibility requires it.
- The sweep must not call provider restore again; it may only read provider-published identity and then complete, leave pending, or move to manual reconciliation.

Why: this is an underclaim and visibility issue, not an overclaim. ADR 0013's retry-owned model is correct, but a future staleness sweep would close the remaining lost-job edge.

### Job-Path Rollback Completion Race Audit Noise

The periodic rollback reconciler handles duplicate completion as a `staleNoop`, but an operator-triggered rollback job that loses a completion race can still record noisy failed job audit even when the durable deployment truth is already `rolled_back`.

Follow-up direction:

- Apply the same completed-operation check to the job-path reconcile branch if this audit noise appears in practice.
- Do not weaken the guarded success transaction; the durable rollback truth is already protected.

Why: the state remains truthful, but audit rows should not imply a failed rollback job when another worker already completed the same operation.

## Deferred Or Rejected

### Deploy State Machine Rewrite

The deploy worker does contain repeated guard patterns and could benefit from extracting decision helpers. A big-bang state-machine rewrite is deferred.

Why: `executeDeploy` has been hardened through several subtle retry, resume, and manual-reconciliation bugs. Any structural migration must first encode those fixes as transition tests and proceed incrementally.

### Queue Audit Rewrite

The queue audit path has theoretical race shapes, but the current BullMQ job-id coalescing plus database audit constraints cover the main invariants. Keep the terminal re-enqueue behavior; do not remove the `getJob/remove` path without proving legitimate re-enqueue still works.

Why: simplifying by relying only on BullMQ `jobId` dedupe would break the intended terminal re-enqueue flow.

### Tracking Hash Performance

SHA-256 hashing of short tracking keys is not a meaningful bottleneck for the current product stage.

Why: this is not a correctness issue and does not justify replacing the current hashed-key design.

## Relationship To Milestone 4 And Follow-Ups

The original Milestone 4 hardening commit landed rollback-executor-specific changes:

- terminal classification for definitive provider rollback failure,
- API pre-rejection for rollback points without provider deploy evidence,
- provider-neutral pending/failed rollback evidence,
- successful rollback evidence that records the provider deploy id rolled back from.

The broader verification hardening items have since landed as follow-up patches. The release-status split remains future work.

## Rollback Point Preparation Follow-Up

The first post-Milestone-4 follow-up wired DB-only rollback point preparation into release preflight:

- preflight prepares a rollback point for the new release from a safe provider-backed prior deployment when no usable rollback point exists,
- source selection prefers verified-good deployments and excludes known-bad or unknown-health deployments,
- duplicate preparation for the same release/source is suppressed by a database uniqueness/conflict guard,
- placeholder rollback point rows without `providerDeployId` no longer satisfy API preflight,
- the deploy worker's final safety check also counts only provider-backed rollback points as usable rollback evidence and uses the same safe prior-deployment status set as API preflight.

Why this was done before the broader status-column refactor: rollback execution was otherwise waiting on inputs that only tests created. Preparing rollback points closes that functional loop without changing provider mutation ownership, while the larger release-status split remains a separate lifecycle-truth design task.
