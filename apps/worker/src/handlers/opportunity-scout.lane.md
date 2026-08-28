---
lane: opportunity-scout
domain: opportunity
state: built
missing: []
reason: ""
trigger: ""
proof: apps/worker/src/handlers/opportunity-scout.integration.ts
---

## Is

- **D1** -> candidates carry a named lane rather than a bare number, so a
  customer can be told why something is a quick win and something else is a long
  campaign.
- **D2** -> weak candidates are held rather than surfaced. The signal statuses
  `internal_radar` and `near_term_target`
  (`packages/contracts/src/gsc.ts:gscOpportunitySignalStatuses`) implement the
  plan's rule that poor averages stay internal instead of being shown next to
  real wins.
- **G1** -> every candidate is derived from stored evidence, never from a guess
  about a market.

## Is not

- Does not do open-ended research. Reasoning-heavy investigation of a candidate
  is `opportunity-research`, which runs under the evidence ledger.
- Does not approve anything. A candidate becomes work only when a human accepts
  it.
- Does not write pages. Turning an accepted opportunity into a page version is
  the page domain.
