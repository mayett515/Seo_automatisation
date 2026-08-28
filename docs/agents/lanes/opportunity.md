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

### D1 - An opportunity must be explainable, whatever its key

The customer must be able to ask why. "Quick win" and "strategic market" can be
explained; the pack's single summed `opportunity_score` cannot. The pack
(`product/06-local-seo-engine.md`) _does_ define an `Opportunity Score` as the
sum of search-intent, business-value, visibility, competitor-weakness,
local-relevance, content-gap and inverse-effort factors. The implementation
later chose named lanes plus value bands over that single score; that is an
architecture decision, not a restatement of the pack. The product intent that
carries through both is explainability: a customer must be able to ask why a
chance is ranked the way it is.

### D2 - Weak candidates stay on the internal radar

Poor averages and thin candidates are kept internally rather than shown
prominently. Showing everything equally is a way of lying quietly.

### D3 - Competitor data is analysis input, never a copy source

Difficulty and gaps may be derived from competitors. Their content may not.
