# 0013 - Rollback Operation Vocabulary And Storage Model

Date: 2026-07-01
Status: Accepted

## Context

ADR 0011 introduced rollback restore execution as a deterministic worker lifecycle. ADR 0012 deferred automatic rollback until provider-pending rollback reconciliation exists and explicitly rejected checking rollback completion by blindly re-posting provider restore mutations.

The pending rollback reconciler needs a small state machine before it needs a new table. Today rollback execution evidence is stored in JSON on `rollback_points.evidenceJson.rollbackExecution` and `deployments.evidenceJson.rollback`, while the queryable lifecycle marker lives on `deployments.status`. That is acceptable for the next slice, but it creates a migration risk: if JSON evidence uses ad-hoc words now, a later `rollback_operations` table will need semantic translation of historical blobs instead of a structural lift.

The useful external pattern is not a full workflow engine or a DDL shape. It is the recovery-point vocabulary used by idempotency and controller systems:

- Brandur's idempotency/recovery-point model names checkpoints so retries resume from known phases.
- Medusa's idempotency key model stores request identity, lock state, response state, and a `recovery_point`.
- Crossplane records external-create pending/succeeded/failed markers and stops when pending is newer than terminal evidence.
- Temporal separates the business workflow identity from individual run identity and allows one open execution per workflow key with many historical runs.

For this repo, `targetDeploymentId` is the business operation key and `operationAttemptId` is the current run/attempt key.

## Decision

Pin the canonical rollback operation vocabulary now, even though the storage remains JSON plus `deployments.status` for the pending reconciler slice.

Canonical persisted rollback operation statuses:

```text
restore_in_flight
rollback_pending
completed
provider_failed
manual_reconciliation_required
superseded
```

For the current JSON/status storage model, the reachable statuses are:

```text
restore_in_flight
rollback_pending
completed
provider_failed
manual_reconciliation_required
```

`superseded` is reserved for the future `rollback_operations` table. It represents an operation-vs-operation relationship where another legitimate rollback operation for the same target deployment became current or completed first. It must not be emitted by the JSON/status-only reconciler because that model stores only one current operation per deployment.

`stale_noop` is not a persisted status. It is a function outcome or metric label for a reconciler race where a guarded write affects zero rows because another worker already completed the same truth. A stale no-op should not be written as rollback operation state.

Use this lifecycle:

```text
restore_in_flight
  -> rollback_pending
  -> completed
  -> provider_failed
  -> manual_reconciliation_required
```

Do not introduce `restore_accepted` in this slice. A provider `queued` / accepted-but-not-published response transitions directly to `rollback_pending`.

### Status Meanings

`restore_in_flight` means local intent was persisted before the provider restore mutation was attempted, and provider completion is not confirmed. It is a real automation stop marker, not cosmetic evidence.

`rollback_pending` means the provider accepted or returned a pending restore result with enough provider identity evidence to reconcile by reading provider-published state later.

`completed` means provider-published identity matched the intended restored deploy and the guarded terminal database write succeeded.

`provider_failed` means the provider returned an explicit terminal rollback failure result. Network timeouts, HTTP request failures, worker crashes, or unknown provider outcomes are not `provider_failed`; they remain `restore_in_flight` or move to `manual_reconciliation_required` when they cannot be confirmed safely.

`manual_reconciliation_required` means automation stopped because the system cannot prove whether the intended rollback completed safely, the evidence is malformed, the provider-published identity conflicts with the intended rollback target, or guarded local state no longer matches.

`superseded` is future-only and requires first-class operation rows. It is not reachable while rollback operation storage is only the current deployment row plus JSON evidence.

### Ownership Rules

The rollback worker owns provider restore mutation. The pending rollback reconciler owns read-only observation and guarded terminal writes. The reconciler must not call `rollbackDeploy()`.

`restore_in_flight` is owned by job re-entry. On retry, if the rollback point or deployment evidence shows `restore_in_flight` or `rollback_pending`, the worker must not re-post `rollbackDeploy()`. It should read provider-published state through `getPublishedDeploy` and either:

- complete the rollback if exact intended provider identity is published,
- return or leave `rollback_pending` if there is pending provider evidence to reconcile,
- or mark `manual_reconciliation_required` when the state cannot be confirmed safely.

A terminal job attempt must not leave a rollback operation stranded in `restore_in_flight`. On the final retry attempt, an unconfirmable `restore_in_flight` operation must move to `manual_reconciliation_required` so it is visible to operators and excluded from unsafe provider mutation retries.

`provider_failed` is only for explicit provider terminal-failure responses. This mirrors the deploy provider policy from ADR 0012: provider-backed timeout or unknown outcomes remain reconcilable/manual instead of being converted into false terminal failures.

Unexpected published identity conflicts in the JSON/status model must resolve to `manual_reconciliation_required`, not `superseded`. Examples include a third deploy being published, the target deployment no longer matching expected provider identity, or the release plan no longer being rollback-eligible for a reason other than this rollback completing.

### Evidence Shape

The pending reconciler slice should write the canonical vocabulary into both rollback evidence blobs:

```text
rollback_points.evidenceJson.rollbackExecution.status
deployments.evidenceJson.rollback.status
```

It should also write the same `operationAttemptId` into both evidence blobs. The JSON model stores only one current rollback attempt per target deployment. It does not preserve attempt history by design. Attempt-level history is one of the triggers for promoting this design to a table.

Current drift must be cleaned up while implementing the reconciler:

```text
pending -> rollback_pending
failed  -> provider_failed
```

`completed` remains the terminal success vocabulary.

### Future Table Direction

A future `rollback_operations` table is the right storage model when rollback attempts become first-class historical records. The eventual DDL is illustrative, not binding, but the table should preserve these concepts:

```text
rollback_operations
  id
  project_id
  release_plan_id
  target_deployment_id
  rollback_point_id
  operation_attempt_id
  status
  source_provider_deploy_id
  target_provider_deploy_id
  restored_provider_deploy_id
  published_provider_deploy_id
  provider
  hosting_site_id
  live_url
  requested_by_type
  requested_by_user_id
  trigger_source
  last_checked_at
  completed_at
  manual_reason
  evidence_json
  created_at
  updated_at
```

When the table exists, it should be able to enforce one active rollback operation per target deployment with a partial unique index over active statuses. The exact DDL should be decided when the table is implemented.

Table implementation is deferred until at least one of these triggers exists:

- multiple rollback attempts or history must be preserved per deployment,
- operator UI needs attempt-level audit,
- the system needs DB-enforced uniqueness on active rollback operations,
- manual reconciliation becomes a workflow rather than a stop state,
- automatic rollback can trigger while another rollback may still be pending.

Automatic rollback must not ship on JSON/status-only storage if overlapping attempts are possible.

## Consequences

What becomes safer:

- The pending rollback reconciler can be implemented without creating a table while still writing future-compatible evidence.
- Future migration from JSON evidence to `rollback_operations` can be mostly structural because state names are already canonical.
- `restore_in_flight` cannot become an orphan state; job retry owns it and terminal attempts must promote unconfirmable work to manual reconciliation.
- Timeouts and unknown provider outcomes remain distinct from explicit provider terminal failure.
- The system keeps one active rollback operation per target deployment until a table exists, matching the current deployment-row source of truth.

Costs accepted:

- The JSON model stores only the current attempt, not historical attempts.
- Some state is still spread across `deployments.status`, deployment evidence JSON, and rollback point evidence JSON until the table trigger arrives.
- `superseded` is reserved vocabulary that current code must not emit.
- A future table migration may still need structural backfill, but it should not need status-name translation for new evidence written after this decision.

## Alternatives Considered

### Build `rollback_operations` Now

Rejected for the pending reconciler slice. The immediate correctness gaps are status eligibility, re-entry mutation safety, provider-published identity checks, and deploy-lifecycle isolation. Creating a table now would widen the slice into storage redesign before attempt history or DB-enforced operation uniqueness is required.

### Keep Ad-Hoc JSON Statuses Until The Table Exists

Rejected. This creates vocabulary drift and makes future migration harder. The current slice should write the future operation dialect even though storage remains JSON.

### Persist `stale_noop`

Rejected. A stale no-op is a function result from a guarded write race, not a lifecycle state. Persisting it would confuse operation truth with worker execution outcome.

### Use `superseded` For Published-Deploy Mismatches Now

Rejected. Without first-class operation rows, there is no other rollback operation to be superseded by. Published identity mismatches in the JSON/status model are manual reconciliation cases.

### Treat Restore Timeout As `provider_failed`

Rejected. A timeout does not prove the provider rejected or failed the restore. It may have accepted the mutation after the local process lost visibility. Unknown outcomes must remain in-flight/pending/manual, not terminal provider failure.

### Add `restore_accepted`

Rejected for this slice. It does not create a distinct decision point from `rollback_pending`. Provider accepted-but-not-published evidence should transition directly to `rollback_pending`.

## Regression Guard

- Do not write rollback evidence status `pending` or `failed`; use `rollback_pending` and `provider_failed`.
- Do not call provider restore when current evidence is `restore_in_flight` or `rollback_pending`.
- Do not leave final-attempt rollback work in `restore_in_flight`.
- Do not mark restore timeouts, network errors, or worker crashes as `provider_failed`.
- Do not emit or persist `superseded` until `rollback_operations` exists.
- Do not persist `stale_noop` as operation status.
- Do not let the reconciler call `rollbackDeploy()`; it may only read provider-published identity.
- Do not mark `completed` unless `getPublishedDeploy` proves the intended provider deploy is currently published and the guarded terminal write succeeds.
- Do not ship automatic rollback on JSON/status-only storage if overlapping attempts are possible.

## Related Files

- `apps/worker/src/handlers/rollback.ts`
- `apps/worker/src/handlers/deploy.ts`
- `apps/api/src/modules/releases.module.ts`
- `packages/adapters/src/index.ts`
- `packages/adapters/src/netlify-site-hosting.ts`
- `packages/contracts/src/index.ts`
- `packages/db/src/schema.ts`
- `docs/architecture/decisions/0009-deploy-provider-reconciliation-and-operation-state.md`
- `docs/architecture/decisions/0011-rollback-restore-execution-lifecycle.md`
- `docs/architecture/decisions/0012-production-readiness-policy-batch.md`
