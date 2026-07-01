# 0014 - Rollback Trigger Policy

Date: 2026-07-01
Status: Accepted

## Context

ADR 0011 made rollback restore execution a deterministic worker lifecycle. ADR 0013 added the rollback operation vocabulary and pending rollback reconciler: the worker writes `restore_in_flight` before provider restore, provider `queued` results become queryable `rollback_pending`, the reconciler never re-posts restore, and `rolled_back` is written only after exact provider-published identity proof.

That closes the mechanical reliability gap for manual rollback. It does not decide whether the system should autonomously mutate a customer's live site when post-deploy verification recommends rollback.

The decision domains touched here are:

- product control and customer approval,
- deterministic worker handoff,
- provider mutation idempotency,
- rollback-loop prevention,
- operator audit and notifications,
- release verification truth,
- deployment operations and feature flags.

Current facts:

- `verify()` is operator/API initiated; there is no automatic deploy-to-verify-to-rollback loop today.
- `execution_failed` verification infrastructure failures do not map to `rollback_recommended`.
- Manual rollback execution is scoped, audited, and now reconciled when provider restore is pending.
- Rollback source preparation may fall back to `provider_succeeded` when no verified-good source exists. That is acceptable for manual recovery evidence, but not enough for automatic production mutation.

## Decision

Rollback from `rollback_recommended` remains explicit human/operator action for MVP.

Automatic rollback is deliberately deferred. When it is introduced, it must be a per-project opt-in capability, default off. A global flag is not the right safety boundary because the blast radius is a specific customer's live site.

The system can now roll back reliably and truthfully. It still requires a human to decide whether to roll back for MVP.

## Required Gates Before Automatic Rollback

Automatic rollback must not ship until all of these conditions are true:

1. The trigger is genuine observed `rollback_recommended`.
   - Never auto-trigger on `execution_failed`, `not_started`, missing evidence, or verifier infrastructure failure.

2. The rollback source is verified-good.
   - Auto-trigger may use only `live_healthy` or `live_with_warnings` rollback sources.
   - It must refuse the manual fallback source status `provider_succeeded`.

3. The blocker signal is reproduced or debounced.
   - A single transient 5xx, CDN propagation edge, sitemap fetch issue, canonical timing issue, or tracking marker race must not autonomously mutate production.
   - The exact reproduction policy can be decided later, but one observed blocker sample is not enough.

4. There is a single-flight and circuit-breaker policy.
   - At most one automatic rollback may be active for a release/target deployment.
   - The trigger must refuse to enqueue while rollback evidence is `restore_in_flight` or `rollback_pending`.
   - If an automatic rollback itself lands in `rollback_recommended`, `manual_reconciliation_required`, or another ambiguous state, automation stops and escalates to a human.
   - The system must never auto-rollback a rollback.

5. The deterministic worker remains the only provider mutation owner.
   - Automatic rollback may only enqueue the existing rollback job path.
   - Mastra/AI can explain, recommend, or summarize; it must not call provider mutation ports or enqueue automatic rollback.

6. Audit identifies the trigger.
   - Job audit/evidence must distinguish `system_auto` from user/operator rollback.
   - The rollback operation must still carry `operationAttemptId` and provider identity evidence.

7. The customer/operator has opted in per project.
   - Default behavior is manual-only.
   - Opt-in must be visible and revocable.
   - UI/reporting must explain that automatic rollback can change the live site.

## Future Smallest Safe Implementation

If automatic rollback is later accepted, it should be a deterministic enqueue decision, not a new provider mutation path.

The smallest acceptable boundary:

```text
verified reproduced rollback_recommended
+ per-project auto-rollback opt-in
+ verified-good rollback source exists
+ no active rollback operation
+ per-release attempt cap not exceeded
-> enqueue existing rollback job with trigger_source = system_auto
```

If any invariant fails, leave the release in manual/operator rollback flow.

The rollback worker and pending rollback reconciler remain unchanged owners of provider restore mutation and provider-published identity reconciliation.

## Required Tests Before Automatic Rollback

If automatic rollback is implemented later, the merge must include tests proving:

- reproduced `rollback_recommended` with verified-good source and project opt-in enqueues exactly one rollback job,
- `execution_failed`, `not_started`, and missing verifier evidence never enqueue automatic rollback,
- a rollback source that is only `provider_succeeded` is refused for automatic rollback,
- a non-reproducing blocker does not auto-trigger,
- active `restore_in_flight` or `rollback_pending` evidence blocks a second auto-trigger,
- an auto-rollback result that becomes `rollback_recommended` or manual does not trigger another automatic rollback,
- project opt-in defaults off and manual rollback remains unaffected,
- operator manual rollback and automatic trigger races do not double-enqueue,
- audit/evidence records `trigger_source = "system_auto"` and operation identity.

## Consequences

What becomes clearer:

- Manual MVP rollback is a deliberate safety policy, not an unfinished implementation gap.
- The pending rollback reconciler is a prerequisite for automatic rollback, not a justification for shipping it.
- Product autonomy is a separate gate from infrastructure reliability.
- Future implementation can reuse the existing rollback job and reconciler instead of creating another provider mutation path.

Costs accepted:

- MVP requires a human/operator to press rollback after `rollback_recommended`.
- Recovery may be slower than fully automatic self-healing.
- The system must surface rollback recommendation clearly enough that manual action is practical.

## Alternatives Considered

### Enable Automatic Rollback Immediately

Rejected for MVP. The reconciler makes rollback execution truthful and idempotent enough for manual operation, but automatic rollback introduces product decision risk: false positives, CDN/DNS propagation timing, rollback loops, unverified fallback targets, and autonomous customer-site mutation.

### Global Feature Flag

Rejected as the primary boundary. A global flag is useful for internal rollout control, but customer-site mutation risk is per project. Automatic rollback must require per-project opt-in.

### Automatic Rollback Using `provider_succeeded` Fallback Sources

Rejected. `provider_succeeded` means provider-restorable but not verified-good. A human can choose that fallback in a recovery situation; automation must not.

### Mastra/AI Triggered Rollback

Rejected. AI may explain or recommend rollback, but deterministic application code must own enqueue decisions and workers must own provider mutations.

## Regression Guard

- Do not auto-trigger rollback in MVP.
- Do not treat `rollback_recommended` as permission for autonomous production mutation without per-project opt-in.
- Do not auto-trigger on verifier execution failure.
- Do not auto-trigger rollback to a source that is only `provider_succeeded`.
- Do not bypass the existing rollback worker and pending rollback reconciler.
- Do not let Mastra/AI enqueue rollback or call provider mutation ports.
- Do not permit rollback loops.
- Do not make automatic rollback a global-only configuration.

## Related Files

- `docs/architecture/decisions/0011-rollback-restore-execution-lifecycle.md`
- `docs/architecture/decisions/0012-production-readiness-policy-batch.md`
- `docs/architecture/decisions/0013-rollback-operation-vocabulary-and-storage-model.md`
- `docs/architecture/backend-foundation-status.md`
- `docs/architecture/lifecycle-truth-hardening-backlog.md`
- `apps/api/src/modules/releases.module.ts`
- `apps/worker/src/handlers/rollback.ts`
- `packages/domain/src/index.ts`
- `packages/seo/src/index.ts`
