# Opportunity domain

## What it is for

The engine finds local chances from combinations of place, service, competition,
search intent, ranking status, business value, and effort. Its output is what
the customer plays with: which places are easy wins, which are long campaigns,
and where the surroundings should be taken before the hard market is attacked.

Lanes: `opportunity-scout`, `opportunity-research`, `local-analysis`.

Product source: `product/06-local-seo-engine.md`,
`product/10-gamification-map-bundles.md`.

## Invariants

### D1 - An opportunity is a named lane, not a score

The customer must be able to ask why. "Quick win" and "strategic market" can be
explained; a summed number cannot. The plan's four difficulty types map onto
named lanes for exactly this reason.

### D2 - Weak candidates stay on the internal radar

Poor averages and thin candidates are kept internally rather than shown
prominently. Showing everything equally is a way of lying quietly.

### D3 - Competitor data is analysis input, never a copy source

Difficulty and gaps may be derived from competitors. Their content may not.
