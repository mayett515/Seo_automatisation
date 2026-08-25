---
lane: serp-scout
domain: evidence
state: partial
enforces: [G1, G2, D3]
missing: ["real SERP provider adapter; the handler runs against packages/adapters/src/mock-serp-scout.ts"]
consumes: [serp-snapshot-request]
produces: [serp-snapshot]
terminal: [serp-snapshot]
external: [serp-snapshot-request]
reason: "ADR 0015 chose a no-paid-SERP-API proof strategy for the MVP, so the lane was built end to end against a mock adapter rather than left unbuilt."
trigger: "A decision to pay for a SERP provider, or a proof requirement the mock cannot satisfy. Roadmap slice 7 records live provider adapters as deferred."
proof: apps/worker/src/handlers/serp-scout.integration.ts
---

## Is

- **G1** → `packages/adapters/src/mock-serp-scout.ts:33` is the reason this lane
  currently **limits** rather than supplies evidence: while the mock adapter is
  configured, nothing downstream may present a snapshot from this lane as an
  observed position. The lane proves its own mechanics; it does not prove that a
  ranking was seen.
- **G2** → `apps/worker/src/handlers/serp-scout.ts:150`. A failed observation is
  written back as a failure code on the requesting row rather than left pending,
  so a caller can tell "asked and got nothing" from "never asked".
- A snapshot is an answer to a request, not a free-standing record: the outcome
  is written onto the row that asked for it. A snapshot with no request behind it
  has no meaning in this domain.

## Is not

- Does not decide which keywords or competitors are worth watching. Opportunity
  planning owns that; this lane answers a question it is given.
- Not the technical audit. Site-side findings belong to `technical-audit`
  (`apps/worker/src/handlers/technical-audit.ts`).
- Not a source of customer-facing claims in its current state — see G1. This is
  the rule the `partial` state exists to carry, and the one that would silently
  break if a reader took `state` to mean "works".
