# 0011 - Rollback Restore Execution Lifecycle

Date: 2026-06-30
Status: Accepted

## Context

Foundation Milestone 2 made live-health verification real. A deployment can now reach `rollback_recommended` when observed HTTP evidence finds a blocker. Before this decision, rollback remained a stubbed capability: the system could detect a bad live release but had no deterministic backend path to restore a known rollback point.

The product rule stays strict: provider success is not live-health truth, and a release must not be marked `rolled_back` until a deterministic worker has executed and persisted the rollback side effect.

## Decision

Introduce rollback execution as a deterministic worker lifecycle.

The API endpoint only authorizes, scopes, and enqueues rollback:

```text
POST /projects/:projectId/releases/:releasePlanId/rollback/execute
```

It requires `rollback:execute`, validates that the rollback point belongs to the scoped project and release plan, creates a `rollback` queue job, and records a `job_runs` audit row. It does not mark the release rolled back.

The rollback worker owns the production mutation:

```text
rollback job
-> reload release plan, rollback point, pinned target deployment, and hosting site evidence from Postgres
-> call SiteHostingPort.rollbackDeploy(...)
-> if provider rollback completes, transactionally update rollback point evidence, deployment, and release plan
```

`releasePlans.status = "rolled_back"` is written only after the worker receives completed provider rollback evidence and persists it. Provider pending/failure results are recorded on the rollback point with provider-neutral status, provider deploy id, live URL, and adapter evidence, but do not overclaim success. Definitive provider-failed rollback results are terminal worker failures; network exceptions remain retryable according to the queue policy.

The Netlify adapter implements rollback by restoring the selected deploy through Netlify's restore endpoint. Netlify details stay inside the adapter; the worker consumes the provider-neutral `SiteHostingPort.rollbackDeploy` operation.

Release preflight now prepares rollback points when the database has a safe provider-backed prior deployment source for the project. The preflight helper records the source deployment id, provider deploy id, live URL, derived rollback artifact key, and evidence into `rollback_points` for the new release before evaluating `rollback_point_ready`. Source selection prefers verified-good deployments (`live_healthy`, `live_with_warnings`), falls back to `provider_succeeded` when no verified-good source exists, and excludes `rollback_recommended`, `verifying`, and `failed`. Rollback point rows without provider deploy evidence are not counted as deploy-ready. Duplicate preparation for the same release/source identity is guarded by a unique database index on `(release_plan_id, deployment_id, provider_deploy_id)` plus conflict-safe preflight insertion.

## Consequences

What becomes safer:

- A release with `rollback_recommended` now has an audited deterministic recovery path.
- The API cannot falsely claim rollback completion just because a request was accepted.
- The worker re-checks project, release, rollback point, pinned target deployment, and hosting-site evidence from the database before mutating the provider.
- The final transaction guards that the target deployment and release plan are still rollback-eligible after provider I/O.
- Rollback success updates `rollback_points.evidenceJson`, `deployments.status`, and `releasePlans.status` in one database transaction.
- Rollback evidence records both the restored provider deploy id and the provider deploy id that was rolled back from, so audit consumers can explain the before/after provider state.
- A new release with prior provider-backed deploy evidence can now become rollback-ready through normal preflight instead of depending on test fixtures or manual rollback point rows.

Trade-offs:

- Rollback point preparation is a DB-only preflight baseline; it does not call providers and it only applies the current source policy: verified-good first, provider-succeeded fallback, unsafe sources excluded.
- Provider `queued` rollback results are recorded as pending and the worker does not immediately re-post the restore mutation. A richer rollback reconciler can be added if a provider exposes long-running rollback states often enough.
- The rollback-ready release-plan set currently contains only `failed`. If future product policy allows rollback while another status is active, the API gate, worker pre-provider gate, and final transaction guard must be expanded together.
- `releasePlans.status` is still a coarse projection. `rolled_back` means the rollback worker completed, while the detailed rollback evidence lives on the deployment and rollback point.

## Alternatives Considered

### Mark Rolled Back In The API

Rejected. Enqueueing a job is not executing a rollback. This would create the same kind of false lifecycle truth the deploy and verification milestones were designed to remove.

### Hide Rollback Inside Verification

Rejected. Verification observes live health. Rollback mutates the provider. Keeping them separate preserves auditability, retry behavior, permissions, and future human approval choices.

### Roll Back By Re-Deploying The Last Artifact

Deferred. The current persisted rollback point already stores provider deploy evidence. Provider-native restore is the smaller, more truthful baseline. Artifact re-deploy can be introduced later if a provider lacks native restore or if rollback artifacts must be regenerated.

## Regression Guard

- Do not set `releasePlans.status = "rolled_back"` before provider rollback completion is persisted.
- Do not let the API route mutate deployment or release-plan rollback success state.
- Do not execute rollback for a rollback point outside the scoped project and release plan.
- Do not let a stale rollback job mark a deployment or release plan `rolled_back` after either state changed.
- Do not retry provider rollback by blindly re-posting the restore mutation after a provider-pending response.
- Do not retry definitive provider-failed rollback responses as ordinary transient failures.
- Do not drop provider-neutral rollback result fields from pending or failed rollback evidence; future reconciliation should not have to parse adapter-specific evidence blobs.
- Do not treat missing provider deploy evidence as retryable provider failure; it is a terminal evidence error.
- Do not collapse rollback failure into deploy failure. Persist rollback execution evidence separately.

## Related Files

- `apps/api/src/modules/releases.module.ts`
- `apps/api/src/queue-producer.ts`
- `apps/worker/src/handlers/rollback.ts`
- `apps/worker/src/handlers.ts`
- `packages/adapters/src/index.ts`
- `packages/adapters/src/netlify-site-hosting.ts`
- `packages/contracts/src/index.ts`
- `docs/testing/lifecycle-integration-coverage.md`
- `.ai-project-rules/04-deployment-agent.md`
