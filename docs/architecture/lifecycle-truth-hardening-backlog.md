# Lifecycle Truth Hardening Backlog

Date: 2026-06-30
Status: Accepted follow-up notes

This note records review findings from the DeepSeek logic/state audit and the Opus triage that should shape the next backend hardening patch. It is intentionally separate from ADR 0011 because these items are broader lifecycle-truth work, not rollback executor wiring.

## Accepted For The Next Hardening Patch

### Verification Execution Failure Is Not Live-Page Failure

Current behavior converts a verifier execution failure into failed verification evidence so the deployment is not stranded. That solved the stuck-state problem, but it still overloads the meaning of failure: a timeout or verifier bug is not the same as observing a broken canonical, noindex, or HTTP failure on the live page.

Follow-up direction:

- Add a distinct execution-error/unknown verification outcome.
- Persist the infrastructure failure as evidence without pretending the live page itself failed a verifier check.
- Avoid downgrading release/deployment state as if the page was proven unhealthy when the verifier did not complete.

Why: operator truth. A healthy site should not look rollback-worthy just because the verifier infrastructure failed.

### Verification Target URLs Must Stay On The Deployment Host

`new URL(targetUrl, baseLiveUrl)` accepts absolute and protocol-relative `targetUrl` values. If a release plan item ever stores `https://other.example/page` or `//other.example/page`, verification can fetch a different host than the deployment host.

Follow-up direction:

- Validate release-plan item target routes as relative paths at creation/update boundaries.
- Defensively reject or normalize absolute/protocol-relative target URLs before verification fetches.
- Keep the verifier constrained to the intended deployment host.

Why: both security and evidence truth. Post-deploy verification must observe the release's own live URLs, not an arbitrary host.

### Release Plan Status Should Eventually Split By Ownership

`releasePlans.status` is currently a coarse projection that covers approval, deploy, health, failure, and rollback concepts. The detail records already preserve the precise truth, but future UI/reporting will be simpler and safer if these responsibilities are separated.

Follow-up direction:

- Consider separate approval, deploy, and health/rollback projections when the UI starts depending on lifecycle explanation.
- Keep one writer per projection: approval API owns approval truth, deploy worker owns provider mutation truth, verifier owns live-health truth, rollback worker owns restore truth.

Why: avoid overloading one column with several meanings and reduce the chance that UI/reporting treats provider success as verified health.

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

## Relationship To Milestone 4

Milestone 4 hardening landed only rollback-executor-specific changes:

- terminal classification for definitive provider rollback failure,
- API pre-rejection for rollback points without provider deploy evidence,
- provider-neutral pending/failed rollback evidence,
- successful rollback evidence that records the provider deploy id rolled back from.

The broader verification and release-status items above should be a separate follow-up patch after Milestone 4 review/commit.

## Rollback Point Preparation Follow-Up

The first post-Milestone-4 follow-up wired DB-only rollback point preparation into release preflight:

- preflight prepares a rollback point for the new release from the latest provider-backed prior deployment when no usable rollback point exists,
- placeholder rollback point rows without `providerDeployId` no longer satisfy API preflight,
- the deploy worker's final safety check also counts only provider-backed rollback points as usable rollback evidence.

Why this was done before the broader status-column refactor: rollback execution was otherwise waiting on inputs that only tests created. Preparing rollback points closes that functional loop without changing provider mutation ownership, while the larger release-status split remains a separate lifecycle-truth design task.
