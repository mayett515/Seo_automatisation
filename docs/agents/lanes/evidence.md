# Evidence domain

## What it is for

Everything the product later claims has to come from somewhere. This domain
acquires and diagnoses truth about the customer's visibility: search performance
from Google, ranking snapshots, technical findings on the site, and behaviour
from the customer's own visitors. It produces the substrate that opportunity,
report, and analyst work stand on, which is why its honesty rules are the
strictest in the system.

Lanes: `gsc-sync`, `serp-scout`, `technical-audit`, `analytics`.

Product source: `product/11-tracking-experiments-retention.md`,
`architecture/09-observability-security-privacy.md`.

## Invariants

### D1 - A measurement is an answer to a request at a point in time

Observations are written onto the row that asked for them and carry the window
they belong to. A free-standing measurement with no request behind it cannot be
compared with anything, and comparison over time is the whole point: "Dachau is
moving" is a difference between two moments, not a property of one.

### D2 - A failed measurement is an outcome, not an absence

A failure is recorded as a failure, so a caller can tell "asked and got nothing"
from "never asked". A silent tracking failure reported as success is forbidden
outright.

### D3 - Data from a stand-in adapter never becomes a customer claim

Where a mock or fixture supplies values, the lane proves its own mechanics and
nothing else. This is G1 at its sharpest.

### D4 - Visitor tracking stores no form content and no personal data

No form values, no names, e-mail addresses or phone numbers taken from inputs,
no session replay without consent, and no mixing of data across projects.

_Enforced outside the lanes:_ packages/contracts/src/tracking.ts:27 - the event contract admits no form content and forces route to be path-only
