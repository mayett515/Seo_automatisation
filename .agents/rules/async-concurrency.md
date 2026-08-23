---
paths:
  - "apps/worker/**/*.ts"
  - "apps/**/src/**/queue*.ts"
  - "src/workers/**/*.ts"
  - "src/jobs/**/*.ts"
  - "src/queue/**/*.ts"
---

# Async and Concurrency

Applies to work that runs outside a request, in parallel, or long enough to
be cancelled.

- Every outbound call gets a timeout and an `AbortSignal`. A timeout that
  races but doesn't cancel leaves the loser running.
- Bound concurrency explicitly. An unbounded `Promise.all` over user input is
  a load test against your own provider.
- Retries only for idempotent operations, with a limit and backoff — never
  forever inside one step. Attempt local recovery once or twice, then
  propagate with context.
- Never swallow a cancellation and report success.
- Never hold a DB transaction open across a network call.
- A fan-out preserves partial results: use `Promise.allSettled` and report
  what succeeded and what is missing, instead of throwing away completed work.

```ts
const settled = await Promise.allSettled(tasks);
return {
  results: settled.flatMap(r => (r.status === 'fulfilled' ? [r.value] : [])),
  gaps:    settled.flatMap(r => (r.status === 'rejected' ? [describe(r.reason)] : [])),
};
```

## Worker lifecycle

- Every BullMQ worker registers an `error` listener and shuts down
  gracefully: workers close first, shared resources (Redis, DB pools) after.
- `rediss://` URLs get explicit TLS configuration on the connection.
- User-triggered jobs carry actor metadata (`actorType`, `actorId`, project,
  intent); scheduled jobs carry an explicit system actor.
- A retry path that deletes and reinserts rows for the same run id uses a
  transaction or staging/swap — readers must never observe partial success.

## Queue invariants (project decisions — keep)

- Idempotency is checked at **both** levels: the BullMQ job ID and the
  database audit/ledger row. A redelivery or duplicate enqueue must never
  create orphan audit rows.
- Before an external mutation, write local intent/ledger state, and define
  what happens on retry and on crash mid-window.
- Persist enough state that a crashed run resumes instead of restarting.
- Cross-process handoff in production uses durable storage. Local filesystem
  handoff is for local/test only.
- Provider-side accepted/uploaded/building states are never treated as
  live-health truth; health is confirmed independently.
