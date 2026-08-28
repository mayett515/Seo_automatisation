---
lane: analytics
domain: evidence
state: scaffold
missing: ["worker handler", "no producer - nothing enqueues into this queue"]
reason: "Worker W8 of the original topology (architecture/04-worker-architecture.md). Tracking ingestion was instead built as a synchronous API boundary that persists directly, so no job is ever enqueued here. Whether a separate aggregation lane is still wanted is undecided and nothing records the choice."
trigger: "Event volume that makes synchronous persistence untenable, or the experiment loop needing pre-aggregated windows. Otherwise remove the queue declaration with a recorded reason."
proof: ""
---

## Is

Nothing at runtime. The queue name is declared and a BullMQ worker is started
for it (`apps/worker/src/main.ts`, the `queueNames.map` worker loop), but it is
absent from `sharedApiQueueNames`, so the shared API producer will not enqueue
into it.

That is the whole of what the registry proves. "No producer anywhere" is a
wider claim and rests on a sweep rather than on a check: the literal
`"analytics"` occurs only in the two registries and the canonical job-name map
(`packages/contracts/src/jobs.ts`), in a test that names the lane unhandled,
and in a lane-inventory fixture — at no enqueue site. A queue named through a
variable would evade that sweep, so the claim is a reviewed observation, not a
guarded fact.

The work the plan gave this lane happens elsewhere: the tracking boundary
accepts events and persists them directly, answering with an explicit
`persisted` or `dry_run` mode rather than a queue receipt.

## Is not

- Not the tracking boundary itself. Ingestion, rate limiting and origin binding
  live in the API tracking module; this lane was meant to be the processor
  behind it.
- Not the reason visitor data is safe. The privacy rules are held by the event
  contract (`packages/contracts/src/tracking.ts:TrackingEventSchema`), which
  admits only event name, project, page, route and component, and forces
  `route` to be path-only.
