# Workers and queues

- Bound concurrency explicitly. Never run unbounded `Promise.all` over user-controlled input.
- Every outbound call has a timeout and an `AbortSignal`; a timeout must cancel the losing operation.
- Retry only idempotent operations, with a limit and backoff. Never retry forever inside one step.
- Preserve partial fan-out results with `Promise.allSettled` when completed work remains useful.
- Never hold a database transaction open across a network call.
- Register worker error listeners and shut down workers before shared Redis/DB resources.
- Check idempotency in both the BullMQ job ID and durable audit/ledger state.
- Before an external mutation, persist intent and define retry and crash-window behavior.
- Persist enough state for recovery; production cross-process handoff uses durable storage.
- A retry path that deletes and reinserts rows for the same run id uses a transaction or a staging/swap pattern; readers must never observe partial success.
- `rediss://` connection URLs get explicit TLS configuration on the Redis/BullMQ connection.
- Status honesty: `queued`, `completed`, `failed`, `dry_run`, `not_configured`, and `pending` describe the side effect that actually happened. Never return `queued` without a real enqueue, and never create rows that claim `queued` when the executing queue infrastructure is not configured. Durable intent, run, and reservation rows written before enqueue are the required pattern where gap recovery and terminalization exist.
- Worker changes require a dry-run or representative typed fixture smoke check when feasible.

Deep invariants for durable runs, execution epochs, heartbeats, and evidence binding: `.ai-project-rules/06-backend-workers-mastra.md` and `.ai-project-rules/15-architecture-regression-guards.md`.
