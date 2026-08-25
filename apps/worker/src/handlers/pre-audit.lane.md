---
lane: pre-audit
domain: intake
state: scaffold
enforces: []
missing:
  [
    "worker handler - the dispatcher falls through and throws at apps/worker/src/handlers.ts:341",
    "persistence - createLead returns a parsed object and stores nothing (apps/api/src/modules/leads.module.ts:20)",
    "G4 authorization - LeadsController is the only controller without UseGuards, and no global guard exists",
    "G4 rate limit - the tracking boundary has one for its public endpoint, this has none",
    "G4 audit trace - the enqueue passes no audit input, so recordJobRun returns early (apps/api/src/queue-producer.ts:205)",
    "G2 - the API answers status queued for work the worker provably cannot process"
  ]
consumes: [lead]
produces: []
terminal: []
external: [lead]
reason: "The product intent is documented and always was: the Pre-Audit Worker is node C of the complete loop in the knowledge pack (product/01-end-to-end-product.md) and Phase 0 of the product phases (01-PRODUCT-SNAPSHOT.md). What is undocumented is the engineering state - why the lane is registered as runnable while unbuilt, when phases 2 to 4 are built. The topology diagram docs/diagrams/07-worker-queue-topology.mmd draws the worker as if it existed."
trigger: "An open decision: either build handler, persistence, guards and rate limit, or remove the module from AppModule and park the queue declaration with a recorded reason."
proof: ""
---

## Is

`enforces` is empty, and that is the finding. Every rule this lane would need to
carry exists only as an intention, with no address in the code:

- A prospect's site is assessed before anyone is asked for anything, and the
  resulting potential report is conservative rather than flattering (P3) —
  **no enforcing code**.
- A lead is a durable record, because a later audit must attach to something —
  **no enforcing code**; `createLead` returns a value and keeps nothing.
- G4, the public-boundary rule — **violated, not merely unenforced**.

A lane whose `Is` cannot name a single address is a lane that does not exist,
however completely it is wired.

## Is not

- Not a dry run. Without a database the documented `dry_run` path in ADR 0002
  applies, but with `REDIS_URL` set the API answers `status: "queued"` for work
  that provably cannot happen (`apps/worker/src/handlers.ts:341` throws). That is
  a G2 violation, not a gap.
- Not authenticated, and this is the sharpest edge. Thirteen other modules guard
  their routes and there is no global guard, so the enqueue is a public write into
  the job infrastructure with a caller-chosen id and no `job_runs` trace.
- Not a potential report either. `getPotentialReport`
  (`apps/api/src/modules/leads.module.ts:49`) fabricates a draft for any id — the
  same pattern the 2026-08-25 review found and repaired for releases, left
  standing here.
