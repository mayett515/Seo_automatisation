---
lane: pre-audit
domain: intake
state: scaffold
missing:
  [
    "worker handler - the handler registry entry for this lane is null, because apps/worker/src/lane-handler-registration.ts:lanesWithRegisteredHandler does not list pre-audit",
    "persistence - createLead returns a parsed object and stores nothing, so D2 is unenforced",
    "G4 rate limit - the tracking boundary has one for its public endpoint, this has none",
    "G4 audit trace - no pre-audit run is recorded, so no audit attaches"
  ]
reason: "The product intent is documented and always was: the Pre-Audit Worker is node C of the complete loop in the knowledge pack (product/01-end-to-end-product.md) and Phase 0 of the product phases (01-PRODUCT-SNAPSHOT.md). The lane is unbuilt while phases 2 to 4 are built, and the enqueue defect (an HTTP request could enqueue a job nothing processes) was repaired by removing pre-audit from apiQueueNames and making start-pre-audit answer dry_run instead of queued. What remains is debt with no recorded reason: the intended G4 boundary (rate limit, audit, durable lead) is not built, and auth is not the intended fix."
trigger: "Build the Pre-Audit worker plus durable lead persistence, a rate limit, and an audit trace (G4), then re-add pre-audit to apiQueueNames. Do not add authentication to the public pre-sales capture; G4 is the intended boundary."
proof: ""
---

## Is

Two facts the checker verifies: this lane has no entry in the handler registry
(`apps/worker/src/lane-handler-registration.ts:lanesWithRegisteredHandler` does
not list it), and `apiQueueNames` does not admit it, so no HTTP request enqueues
into it.

What follows is prose and is checked by nobody. The rules this lane would carry
exist as intentions, with no code behind them:

- A prospect's site is assessed before anyone is asked for anything, and the
  resulting potential report is conservative rather than flattering (P3).
- A lead is a durable record, because a later audit must attach to something.
  `createLead` returns a value and keeps nothing.
- G4, the public-boundary rule: neither the rate limit nor the audit trace is
  built.

## Is not

- Not reachable from HTTP any more. `pre-audit` was removed from `apiQueueNames`
  and `start-pre-audit` now answers `dry_run` instead of `queued`
  (`apps/api/src/modules/leads.module.ts:LeadsModule`, the `start-pre-audit`
  route), so an HTTP request can no longer enqueue a job the worker provably
  cannot process.
- Not authenticated, and this stays deliberate: the intended public-boundary
  answer is G4 (rate limit, audit, durable lead), not an invented login wall on
  a route a stranger reaches before any account exists.
- Not a potential report either. The leads module's `getPotentialReport` route
  (`apps/api/src/modules/leads.module.ts:LeadsModule`) fabricates a draft for
  any id — the same pattern the 2026-08-25 review found and repaired for
  releases, left standing here.
