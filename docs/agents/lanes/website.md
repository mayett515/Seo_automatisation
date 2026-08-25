# Website domain

## What it is for

The customer's own existing website is imported and rebuilt as a fast, modern
version that keeps their brand and improves it for local demand. The customer
sees a preview, comments on components, and only then does anything go live.

Lanes: `website-import`.

Product source: `product/04-main-website-rebuild.md`.

## Invariants

### D1 - We rebuild the customer's own site, never a competitor's

Competitor data is analysis input. It is never a source to copy from, and the
product is never described as cloning.

### D2 - Staging is never indexable

Preview and staging deployments carry `noindex,nofollow`, and canonicals never
point at a preview domain.

_Enforced outside the lanes:_ apps/api/src/modules/projects.module.ts:562 - preview responses carry robots noindex

### D3 - The main site goes live only after the customer approves it

The preview exists so that the decision is real, not a formality.

_Enforced outside the lanes:_ the release domain owns the approval gate; see release.md D1
