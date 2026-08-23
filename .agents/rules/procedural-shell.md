---
paths:
  - "apps/**/src/**/*.ts"
  - "packages/adapters/src/**/*.ts"
  - "src/handlers/**/*.ts"
  - "src/workers/**/*.ts"
  - "src/adapters/**/*.ts"
---

# Procedural Shell

Shell code acts. It reads plainly top to bottom, in the order things happen,
and delegates every decision to the core.

- Load state, ask the core for a decision, act on the returned value. Every
  branch in the shell should be a decision the core returned.
- No business rules in the shell; if a policy appears inside a conditional,
  extract it as a named core function first.
- Normalize every provider error into the repo's error union at this layer.
  Provider error types never escape into core logic.
- Never swallow a failure to keep a happy path readable, and never report
  success when an effect failed.
- Resist premature extraction: boring, explicit sequences beat clever
  indirection here.

```ts
const decision = decideRefund(order, request);
switch (decision.kind) {
  case 'approve':  return paymentApi.refund(decision.amount);
  case 'escalate': return escalationQueue.add(decision);
  case 'reject':   return { ok: false, reason: decision.reason };
}
```
