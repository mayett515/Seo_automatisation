---
lane: analytics
domain: evidence
state: scaffold
enforces: []
missing: ["worker handler", "no producer - nothing enqueues into this queue"]
consumes: [tracking-event]
produces: []
terminal: []
external: [tracking-event]
reason: "Worker W8 of the original topology (architecture/04-worker-architecture.md). Tracking ingestion was instead built as a synchronous API boundary that persists directly, so no job is ever enqueued here. Whether a separate aggregation lane is still wanted is undecided and nothing records the choice."
trigger: "Event volume that makes synchronous persistence untenable, or the experiment loop needing pre-aggregated windows. Otherwise remove the queue declaration with a recorded reason."
proof: ""
---

## Is

Nothing at runtime. The queue name is declared and a BullMQ worker is started
for it (`apps/worker/src/main.ts:38`), but it is absent from `ApiQueueName`, so
no HTTP path can reach it and no producer exists.

The work the plan gave this lane happens elsewhere: the tracking boundary
accepts events and persists them directly, answering with an explicit
`persisted` or `dry_run` mode rather than a queue receipt.

## Is not

- Not the tracking boundary itself. Ingestion, rate limiting and origin binding
  live in the API tracking module; this lane was meant to be the processor
  behind it.
- Not the reason visitor data is safe. The privacy rules are held by the event
  contract (`packages/contracts/src/tracking.ts:27`), which admits only event
  name, project, page, route and component, and forces `route` to be path-only.
