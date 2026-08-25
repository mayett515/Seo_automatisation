---
lane: rollback
domain: release
state: built
enforces: [G2, D1, D4]
missing: []
consumes: [rollback-point, rollback-request]
produces: [rollback-outcome]
terminal: [rollback-outcome]
external: [rollback-point, rollback-request]
reason: ""
trigger: ""
proof: apps/worker/src/handlers/rollback.integration.ts
---

## Is

- **D1** -> a rollback executes a human decision. ADR 0014 keeps the trigger
  manual for the MVP and puts automatic rollback behind explicit opt-in gates,
  so this lane never decides on its own that a release should be undone.
- **G2** -> a rollback that did not complete is reported as not completed. The
  reconciler exists so that a half-finished provider operation reaches a named
  state instead of an optimistic one.
- **D4** -> completing a rollback says the provider accepted it, not that the
  site is healthy again. Health remains the verification lane's claim.

## Is not

- Does not decide when to roll back. Operator or API initiated only.
- Does not delete history. A rollback is a new state, not an erasure of the
  deployment that preceded it.
