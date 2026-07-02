# Finding: Frontend UI And Component Registry Direction

Date: 2026-07-01
Source: `C:\big eater\frontend-ui-component-registry-stealer-findings-2026-07-01.md`
License: No code copied. Sources are used for architecture and taxonomy patterns only.

## What We Needed

The next MVP slice needs a product-facing UI direction after the backend foundation work:

```text
Potential Searcher
-> Opportunity Explorer
-> page brief / proposal
-> preview and approval
-> deploy and verify
```

The research question was not "which component library should we install?" It was how to structure a TanStack mission-control app, local control-panel UI components, and a separate controlled registry for deployable customer-page sections.

## Most Important Distinction

There are two different component systems:

```text
@localseo/ui
  control-panel UI for the SaaS app
  app shell, status, evidence, workflow cards, tables, timelines, forms, map frames

page component registry
  controlled customer-site sections
  Hero, ServiceGrid, FAQ, ContactCTA, AreaMap, Footer, etc.
  schema-owned, versioned, previewed, approved, then deployed
```

These must not collapse into one vague "component library." The control panel and deployable customer pages have different users, runtime constraints, styling rules, and failure modes.

## What We Steal

- Use TanStack Router, Query, Form, Table, Virtual, and Store by responsibility, not as generic state machinery.
- Grow `@localseo/ui` as a thin local package around workflow primitives instead of importing a large visual design system.
- Build the customer-page registry schema-first: component type, variants, prop schema, allowed style tokens, SEO requirements, preview renderer, validation errors, and note anchors.
- Use map/chart/canvas/graph sources to choose visual grammar only when the Opportunity Explorer needs them.
- Make the Opportunity Explorer serious and business-oriented: nearby places, corridors, service-location opportunities, evidence, next actions, and deployment readiness.
- Show agent/workflow activity as evidence and tool events, not as a chat toy.

## TanStack Ownership

```text
TanStack Router
  route hierarchy, project params, page params, search params

TanStack Query
  server state, worker status, release status, GSC data, reports, polling

TanStack Form
  onboarding, notes, approvals, holds, rejections, rollback confirmations

TanStack Table
  keyword, opportunity, page, release-check, and report data grids

TanStack Virtual
  large keyword/opportunity/page lists when DOM size matters

TanStack Store
  local UI state only: selected panel, preview mode, map focus, split sizes
```

Server state belongs in TanStack Query, not in TanStack Store or local component state.

## Local UI Taxonomy

Initial `@localseo/ui` categories:

```text
app-shell
status
workflow
data-display
map-geo
timeline
preview-controls
forms
tokens
```

Domain-heavy composition stays in `apps/web/src/features/*`. The shared UI package should provide reusable building blocks, not release-state rules, API query logic, agent prompts, or provider details.

## Customer-Page Registry Taxonomy

Initial page registry candidates:

```text
Hero
ServiceDescription
ServiceGrid
TrustReviews
FAQ
ContactCTA
AreaMap
Footer
```

Each registry entry should define:

```text
type
variants
props schema
content slots
SEO requirements
allowed style/theme tokens
preview renderer
validation errors
customer note anchors
approval/versioning constraints
```

The registry exists to keep generated pages controlled. It is not a freeform website builder and must not accept arbitrary agent-generated HTML or unvalidated component props.

## Dependency Posture

Do not add libraries until the workflow needs them.

```text
Already core:
  TanStack Router, Query, Form, Table, Virtual, Store

Candidate later:
  Radix primitives for accessible dialogs, popovers, menus
  shadcn-style registry pattern as inspiration, not visual style
  MapLibre for real service-area/opportunity maps
  React Flow for node/relationship graph surfaces
  D3 or lower-level canvas only for custom visualization that maps/tables cannot handle
```

## MVP Recommendation

First useful product surface:

```text
Project Mission Control
-> Opportunity list/table
-> selected opportunity evidence panel
-> simple nearby-place/service-location surface
-> create page brief/proposal action
-> preview decision card
-> approval/hold/reject controls
-> worker timeline
```

Start with tables, cards, and a simple map placeholder. Add MapLibre or graph tooling only when real map interaction exists.

## What To Avoid

- A generic design-system project before product screens demand it.
- A chat-first UI for a workflow-heavy app.
- Copying visual design from another product.
- Server state in local UI stores.
- Canvas-only approval, deploy, or rollback controls.
- Toy gamification or fake achievements.
- GSC/search signals presented as customer-facing success proof.
- Agent/page components without prop schemas.

## How It Maps To Our Stack

```text
apps/web
  TanStack routes, feature screens, query option factories, forms, tables

packages/ui
  reusable control-panel components and tokens

packages/page-registry
  future schema-first customer-page component registry

packages/contracts
  shared page JSON, opportunity, approval, and agent-run event contracts when they cross process/package boundaries

packages/seo and packages/domain
  deterministic opportunity/page quality decisions
```

## Decision

Accepted as MVP frontend direction. Promote the distilled architecture into `docs/architecture/frontend-ui-and-page-registry.md` and keep implementation incremental.
