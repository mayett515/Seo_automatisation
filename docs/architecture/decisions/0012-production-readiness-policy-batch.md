# 0012 - Production Readiness Policy Batch

Date: 2026-07-01
Status: Accepted

## Context

PR #4 aligned deploy lifecycle status policy between API preflight and the deploy worker. PR #5 added safe provider errors, adapter timeout boundaries, and GSC connection failure state.

The remaining production-readiness findings from GPT/Opus reviews are now mostly policy and recovery questions, not evidence that the current baseline lies:

- public tracking falls back to process-local rate limits when Redis is unavailable,
- rollback from `rollback_recommended` is still operator-triggered,
- provider-pending rollback results are recorded but not reconciled to completion,
- GSC reconnect-required failures should remain precise through worker retries,
- `releasePlans.status` is still a coarse stored projection.

The repo inspiration pass reinforced the same direction: keep the modular monolith, keep production mutations deterministic, use explicit queues/reconcilers for recovery, and add approval/review queues before risky automation.

The targeted follow-up source scan added concrete support for this posture: common Node rate-limit libraries fail closed by default or warn that in-memory insurance is per process, BullMQ has an explicit unrecoverable-error path, and provider POST retry safety should not be assumed without an idempotency guarantee or reconciliation model.

## Decision

This ADR records the production policy direction before implementation.

### Tracking Redis Outage Posture

For production public tracking ingestion, Redis-backed rate limits are part of the write-protection boundary.

If Redis is unavailable or rate-limit commands fail:

- pre-validation public request limits may degrade to a smaller process-local soft throttle only if they do not prove write acceptance and do not touch persisted project data,
- accepted-event project/key limits should fail closed,
- the API should return an explicit unavailable/rate-limit failure rather than `accepted: true`,
- non-critical coalescing, such as tracking-key `lastUsedAt`, may drop or defer work without failing the accepted event path.

Local development and explicit test scaffolds may keep a broader process-local fallback, but that must not look like the production posture. Production event persistence depends on the accepted-event write-protection buckets, not the soft pre-validation throttle.

### Rollback Trigger Policy

For MVP, rollback remains explicit operator action after `rollback_recommended`.

The system may recommend rollback and show the prepared rollback point, but it must not automatically enqueue rollback solely because verification recommends it.

Automatic rollback can be reconsidered only after:

- pending rollback reconciliation exists,
- reconnect/timeout/provider-pending behavior is observable,
- UI/reporting can distinguish provider failure, verification failure, rollback pending, and rolled back,
- a human-approval or product policy gate is recorded.

### Pending Rollback Reconciliation

Provider-pending rollback results should be reconciled by observing provider state and persisted rollback evidence. The reconciler must not blindly re-post the restore mutation just to check completion.

The rollback operation lifecycle should remain deterministic:

```text
operator/API request -> rollback job -> provider restore attempt -> pending/completed/failed evidence -> reconciler observes pending -> terminal state or manual reconciliation
```

If the provider cannot prove completion from the stored rollback evidence, the system should stop in a manual reconciliation state rather than overclaim `rolled_back`.

### GSC Reconnect-Required Failures

Decrypt failures and invalid refresh-token failures are terminal for the current connection. Worker retries should not overwrite precise reconnect-required reasons with generic `gsc_connection_not_ready`.

Transient refresh failures and Search Console query failures can remain retryable while preserving connection `failureJson` and sync-run truth.

Implementation should use the worker's terminal-error path for reconnect-required GSC failures so BullMQ does not retry them into a later generic `gsc_connection_not_ready` failure.

### Deploy Provider-Backed Final Attempt Outcomes

If a deploy already has `providerDeployId` evidence and the failure is timeout/unknown during upload or final provider read, keep the row reconcilable instead of marking it as an ordinary final-attempt provider failure.

Only mark failed when the provider explicitly reports a failed/rolled-back state, or when the failure happened before provider mutation evidence existed.

### Release Status Projection

Keep `releasePlans.status` as a stored coarse projection for now because workers use stored predicates for guarded writes.

Future UI/reporting work should migrate toward single-writer stored projections, such as approval, deploy/provider, health, and rollback state. Do not replace stored guard state with read-time-only derivation.

## Consequences

This gives production behavior a clear safety bias:

- public tracking protects the database and shared rate-limit boundary before analytics continuity,
- rollback automation cannot outrun rollback reconciliation,
- reconnect-required GSC failures stay operator-visible,
- provider-backed deploys with unknown timeout outcomes remain reconcilable,
- status refactoring remains a later lifecycle UI/reporting milestone rather than a prerequisite for the current backend baseline.

Costs accepted:

- Redis outages may drop or reject public tracking events in production,
- rollback remains manual until the reconciler and policy gate exist,
- provider-backed timeout outcomes may remain pending/manual longer instead of being declared failed quickly,
- some structural cleanup waits behind production semantics.

## Alternatives Considered

- **Fail open to in-memory tracking limits in production.** Rejected as the default because public ingestion is unauthenticated and process-local limits multiply by API instance count.
- **Fail closed for every pre-validation request during Redis outage.** Not required as the blanket rule. A smaller process-local soft throttle is acceptable before validation if it never returns accepted write truth and never protects persisted writes alone.
- **Auto-rollback immediately on `rollback_recommended`.** Deferred because pending restore reconciliation and manual-vs-auto product policy are not finished.
- **Retry provider rollback by re-posting restore on pending/timeout.** Rejected because it confuses observation with mutation and can hide provider uncertainty.
- **Mark provider-backed final-attempt timeout outcomes as ordinary failed deploys.** Rejected for production hardening because the provider may later complete successfully. Prefer reconciliation/manual evidence over an irreversible failed projection.
- **Read-time-only derived release status.** Rejected because worker guards need stored predicates for transactional `UPDATE ... WHERE ...` safety.
- **Broad queue registry/package split first.** Deferred. The repo can move toward clearer queue/contract families incrementally, but policy semantics come first.

## Regression Guard

- Do not return `accepted: true` for production tracking when the event was not persisted or durably queued.
- Do not silently fall back to per-process accepted-event tracking limits in production.
- Do not enqueue rollback automatically from `rollback_recommended` until the rollback reconciler and approval/policy gate exist.
- Do not mark `rolled_back` until provider completion is persisted and guarded.
- Do not overwrite reconnect-required GSC connection failure reasons with generic retry fallout.
- Do not turn provider-backed deploy timeout/unknown outcomes into ordinary final failed rows when reconciliation evidence exists.
- Do not replace stored worker guard columns with read-time-only views.

## Related Files

- `.ai-stealer-findings/2026-07-01-repo-inspiration-production-decisions.md`
- `apps/api/src/modules/tracking.module.ts`
- `apps/api/src/modules/releases.module.ts`
- `apps/worker/src/handlers/rollback.ts`
- `apps/worker/src/handlers/gsc-sync.ts`
- `apps/worker/src/handlers/handlers.ts`
- `docs/architecture/backend-foundation-status.md`
- `docs/architecture/lifecycle-truth-hardening-backlog.md`
- `docs/architecture/decisions/0009-deploy-provider-reconciliation-and-operation-state.md`
- `docs/architecture/decisions/0010-http-verification-and-release-status-projection.md`
- `docs/architecture/decisions/0011-rollback-restore-execution-lifecycle.md`
