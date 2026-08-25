---
lane: opportunity-research
domain: opportunity
state: built
enforces: [G1, G2, D1]
missing: []
consumes: [opportunity-candidates]
produces: [opportunity-research-findings]
terminal: [opportunity-research-findings]
external: []
reason: ""
trigger: ""
proof: apps/worker/src/opportunity-research-scheduler.integration.ts
---

## Is

- **G1** -> findings are bound to the evidence ledger, so a later claim can name
  what it rests on. This is the lane where an agent is closest to inventing
  something, which is why the ledger exists.
- **G2** -> a research run that produced nothing usable terminates as failed
  rather than leaving an active row that looks like work in progress. Bounded
  recovery covers the crash case (ADR 0018).
- **D1** -> output stays in the named-lane vocabulary rather than producing a
  score that nobody can defend to a customer.

## Is not

- Not free-running. It is scheduled and bounded; an agent may not decide to keep
  going.
- Does not deploy or publish. Nothing it produces reaches a customer without
  passing the page and release domains.
- Not the source of ranking truth. Positions come from `gsc-sync`; this lane
  interprets.

Also covered by `apps/worker/src/agent-ledger.integration.ts`,
`apps/worker/src/work-recovery.integration.ts` and
`apps/api/src/modules/opportunity-research.integration.ts`.
