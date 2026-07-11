# 0018 - DB-Before-Queue Work Recovery Policy

Date: 2026-07-07
Status: Accepted

## Context

The project uses Postgres durable rows for product truth and BullMQ/Redis for work transport. This has worked well for deploy, rollback, GSC sync, Opportunity Scout, technical audit, and release verification, but the architecture needs an explicit answer for stuck work:

- a durable run row can be committed while Redis enqueue fails;
- a BullMQ job can vanish or exhaust retries while the product row remains `queued` or `running`;
- a worker can crash after marking product work in progress;
- provider mutations can leave remote state uncertain;
- a future Page Proposal worker will add another durable AI workflow on top of the same pattern.

The 2026-07-07 Big Eater recovery research reviewed DB-backed queues, Redis workers, and durable workflow engines. The common useful semantics are leases, visibility-timeout thinking, idempotency keys, dead-letter/manual retry vocabulary, and recovery scans. The research did not justify replacing BullMQ with another runtime.

## Decision

BullMQ remains the transport layer. Postgres durable run rows remain product truth.

Every durable workflow must define recovery behavior for these cases:

1. DB row exists but enqueue failed.
2. DB row exists and the Redis/BullMQ job is missing.
3. Worker marked the durable row running but stopped making progress.
4. Worker crashed after an external provider mutation may have happened.
5. Queue retries exhausted while product truth remains non-terminal.

Recovery must be workflow-specific, not one generic "retry everything" loop.

Workflow categories:

- Pure read/analyze work, such as Opportunity Scout and deterministic audits, may usually be re-enqueued with the same run id/job id if stale. Terminal persistence must be idempotent and guarded.
- Read work that writes artifacts, such as website import or SERP snapshots, may be re-enqueued only when artifact keys and persistence are run-id scoped and idempotent; otherwise it must fail visibly or require manual review after a bounded recovery count.
- Provider handoff warning work, such as GSC sitemap submission inside release verification, may be retried or recorded as warning evidence. It must not by itself project rollback or failed release health.
- Provider mutation work, such as deploy and rollback, must not be blindly re-posted by a generic recovery scanner. Recovery must read provider state through the appropriate reconciler or mark manual reconciliation.
- Terminal projection work, such as release verification health projection, must have one owner and commit product truth transactionally.

`job_runs` remains queue/audit telemetry. Durable domain rows such as `agent_runs`, `release_verifications`, `technical_audit_runs`, `website_import_runs`, `gsc_sync_runs`, `deployments`, and rollback evidence remain product truth.

BullMQ `jobId` is transport help, not the only guard. The primary active-operation guard belongs in Postgres through status transitions, unique indexes, operation keys, or guarded updates.

The reusable domain model is a recovery decision, not a queue command. Implementations should first classify stale work in pure code and let a procedural shell apply the effect:

```ts
type WorkRecoveryDecision =
  | { kind: "noop"; reason: "terminal" | "fresh_worker" | "transport_job_active" }
  | { kind: "reenqueue"; jobId: string; reason: "missing_transport" | "stale_running" | "transport_failed" }
  | { kind: "mark_execution_failed"; reason: "recovery_exhausted" | "transport_completed_without_product_truth" }
  | { kind: "record_warning"; reason: "provider_handoff_recovery_exhausted" }
  | { kind: "reconcile_provider"; reason: "provider_mutation_uncertain" }
  | { kind: "manual_reconciliation"; reason: string };
```

That decision shape keeps product policy separate from Redis/BullMQ calls. It also prevents the most dangerous drift: treating a missing queue job as permission to repeat a provider mutation.

Implementation note, 2026-07-07:

- `packages/domain/src/work-recovery.ts` now contains the pure `classifyWorkRecovery(...)` policy skeleton.
- The classifier has no Postgres, Redis, BullMQ, provider, or worker dependencies.
- It distinguishes read/analyze, artifact capture, provider handoff warning, provider mutation, and projection/approval categories.
- It permits deterministic re-enqueue only for safe/idempotent categories, routes provider mutation uncertainty to provider reconciliation/manual handling, and keeps projection/approval recovery manual.
- `apps/worker/src/work-recovery.ts` is now the first procedural scanner around that policy. It reads stale Page Proposal `agent_runs` and `release_verifications`, combines durable `job_runs` evidence with BullMQ state, calls the classifier, and applies guarded effects.
- Recovery attempts are counted on the owning durable row, audited as system-triggered `job_runs`, and re-enqueued with the original deterministic run/verification id.
- Competing scanners claim an attempt through recovery-count and stale-timestamp predicates. A lost claim is a stale no-op, not a second enqueue.
- Unknown transport state is conservative `noop`. Completed transport without terminal product truth becomes a visible failure instead of an automatic replay.
- The scanner deliberately registers only `page-generation` and `release-verification`; deploy and rollback remain owned by provider-state reconcilers/manual reconciliation.
- Candidate discovery is isolated per registered lane, so one lane's query failure is recorded without suppressing the other lane for that scan.
- `WORK_RECOVERY_BATCH_SIZE` is a per-lane cap. With the two registered lanes, one scan can inspect at most twice that configured count.

## Consequences

This gives the project the useful durability semantics of workflow engines without introducing a second runtime model.

The first recovery implementation stays intentionally small:

- Page Proposal read/analyze work may re-add `jobId = runId` after a guarded claim;
- release verification may re-add `jobId = verificationId` because its provider handoff is warning-level/idempotent and its final product projection is transaction-guarded;
- bounded Page Proposal exhaustion becomes a visible failed agent run;
- bounded release-verification exhaustion becomes `execution_failed` plus warning evidence without claiming observed bad page health;
- transport-completed inconsistency and bounded exhaustion retain distinct release-verification evidence messages;
- an operator-facing active/dead-work view and additional safe workflow lanes remain later slices.

The project accepts that BullMQ enqueue is not transactional with Postgres. That gap is handled explicitly by durable run rows, enqueue-failure cleanup, and recovery scans.

The project also accepts that provider mutation recovery is slower and more conservative than read-only recovery. The database may underclaim temporarily, but it must not overclaim product success.

## Alternatives Considered

- Adopt Temporal, Inngest, Trigger.dev, DBOS, Graphile Worker, pg-boss, Solid Queue, or another workflow runtime now. Rejected because BullMQ + Postgres already handles the current scale and the missing part is policy/recovery, not a new executor.
- Move all jobs into Postgres. Deferred. It could reduce Redis/Postgres split-brain but would require a large queue-runtime migration and would not remove the need for provider-specific reconciliation.
- Rely only on BullMQ stalled-job handling. Rejected because BullMQ can repair Redis transport state, but it does not know whether product rows such as `release_verifications` or `agent_runs` are truthful.
- Add a generic retry-all recovery scanner. Rejected because deploy and rollback provider mutations require provider-state reconciliation, not blind re-posting.

## Regression Guard

Future worker slices must not:

- treat Redis/BullMQ state as product truth;
- return success only because a queue job completed;
- leave durable `queued` or `running` rows without a recovery or terminal policy;
- re-run provider mutation work from a generic stuck-job scanner;
- add a new durable workflow without naming its operation key, active-run guard, terminal states, and stale recovery behavior;
- hide terminal work failures only in logs or Redis dead-letter state.

When a workflow is fixed or hardened, add tests for DB/queue gaps:

- durable row created and enqueue throws;
- durable row active but BullMQ job missing;
- two recovery controllers race the same stale row;
- recovery limit exceeded;
- provider mutation rows route to reconciler/manual handling instead of duplicate mutation.

## Related Files

- `apps/api/src/queue-producer.ts`
- `apps/worker/src/job-run.ts`
- `apps/worker/src/work-recovery.ts`
- `apps/worker/src/work-recovery.integration.ts`
- `apps/worker/src/handlers/release-verification.ts`
- `apps/worker/src/handlers/deploy.ts`
- `apps/worker/src/handlers/rollback.ts`
- `packages/db/src/schema.ts`
- `packages/db/migrations/0032_low_boom_boom.sql`
- `docs/architecture/lifecycle-truth-hardening-backlog.md`
- `C:\big eater\db-backed-work-recovery\stuck-job-recovery-stealer-findings-2026-07-07.md`
