---
lane: gsc-sync
domain: evidence
state: built
missing: []
reason: ""
trigger: ""
proof: apps/worker/src/handlers/gsc-sync.integration.ts
---

## Is

- **D1** -> every row belongs to a sync run with `dateFrom` and `dateTo`
  (`packages/db/src/schema/gsc.ts:gscSyncRuns`). This is what makes "Dachau is
  moving" a computable difference between two moments rather than an impression:
  the lane stores moments, and comparison happens above it.
- **G1** -> rows carry query, page, clicks, impressions, CTR and position as
  fetched (`packages/db/src/schema/gsc.ts:gscSearchAnalyticsRows`). Everything a
  report later claims about ranking traces back here.
- **D2, G2** -> a sync that failed is recorded with a failed status rather than
  leaving the window silently empty, which would read as "nothing happened".
- The lane also produces a first diagnostic layer: `gscOpportunitySignals`
  classifies rows as `impressions_no_clicks`, `positions_11_100`,
  `wrong_page_service_location` or `service_location_query`
  (`packages/contracts/src/gsc.ts:gscOpportunitySignalTypes`), with a visibility
  state of `internal_radar`, `near_term_target`, `rejected` or `promoted`.

## Is not

- Does not decide what to do about a signal. Ranking a signal into an
  opportunity is the opportunity domain.
- Does not narrate. This lane's bounded-AI narrative fragments and the
  customer-facing status vocabulary the analyst prompt describes are produced
  by the `report` lane, not here.
- Not a substitute for the product's own tracking. Search Console says what
  Google saw; visitor behaviour comes from the tracking boundary.
- A sync request does not coalesce: `queueSync` mints a new job id, so a
  second request is a second `gsc_sync_runs` row and a second `job_runs` row.
  Delivery and the audit row belong to the shared producer; the API proof is
  `apps/api/src/modules/gsc.integration.ts`, not the worker proof above.
