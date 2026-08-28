# Website domain

## What it is for

The customer's own existing website is imported and rebuilt as a fast, modern
version that keeps their brand and improves it for local demand. The customer
sees a preview, comments on components, and only then does anything go live.

The pack's Clone/Rebuild Worker does five things in sequence: crawl and extract
assets/content, recognize components, generate a React/Vite project, improve
SEO/speed/CTA/mobile, and deploy a staging preview. Only the first is built
today as the `website-import` lane (crawl + snapshot, tested in
`apps/worker/src/handlers.test.ts`). The component-recognition,
project-generation, improvement, and staging-preview steps have no owner and no
recorded reason for being absent - they are technical/product debt, not a
deliberately recorded decision. Deferred until either the rebuild half is
built or its deferral is recorded with a reason and trigger.

Lanes: `website-import`.

Product source: `product/04-main-website-rebuild.md`.

## Invariants

### D1 - We rebuild the customer's own site, never a competitor's

Competitor data is analysis input. It is never a source to copy from, and the
product is never described as cloning.

### D2 - Staging is never indexable

Preview and staging deployments carry `noindex,nofollow`, and canonicals never
point at a preview domain.

_Mechanised at:_ apps/api/src/modules/projects.module.ts:ProjectsService - preview responses carry robots noindex

### D3 - The main site goes live only after the customer approves it

The preview exists so that the decision is real, not a formality.
