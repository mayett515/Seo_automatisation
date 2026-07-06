# 0017 - Page Registry And PageJson Source Of Truth

Date: 2026-07-06
Status: Proposed

## Context

The Page Registry and Page Studio lane is the next major product surface after the Opportunity Explorer and evidence lanes. It turns accepted opportunities into structured local SEO pages that can be previewed, commented on, approved, released, deployed, and verified.

The Big Eater page-registry research pass reviewed the current repo docs, existing DB schema, product knowledge packs, and external block/editor systems such as Payload Blocks, Storyblok components, Sanity Portable Text, Gutenberg `block.json`, shadcn registry metadata, Builder.io, Plasmic, Webflow, and Framer.

The useful conclusion is not to copy a generic website builder. The useful pattern is:

```text
structured block registry
+ append-only page versions
+ section-level notes
+ schema-owned props
+ constrained editor actions
+ release preflight validation
```

The repo already has the release spine that this should plug into:

```text
page_proposals
-> page_versions.pageJson
-> approvals
-> release_plan_items.pageVersionId
-> approved release artifact
-> deploy worker
-> verification worker
```

Existing schema tables also include `component_templates`, `component_instances`, and `component_notes`. Without a clear ownership decision, those tables could become a competing source of truth for rendered pages.

## Decision

Build Page Registry before Page Studio.

The Page Registry lane uses these ownership boundaries:

```text
packages/contracts
  Serializable PageJson and PageProposalJson contracts, section type and zone
  vocabularies, evidence refs, page-version and approval DTOs.

packages/page-registry
  Section definitions, prop schemas, variants, registry metadata, schema
  migrations, validation helpers, and preview/static renderers behind safe
  subpath exports.

packages/domain/src/page-studio
  Pure decisions for movement, replacement, variant switching, validation,
  diffing, and publish-readiness.

packages/ai
  Page brief and page proposal prompt builders plus output QA.

apps/api
  Project-scoped page proposal, page version, section note, approval, and
  release-handoff endpoints.

apps/worker
  Page proposal worker, preview validation worker, release artifact builder,
  and deploy/release handoff.

apps/web
  Preview first, structured forms second, constrained Page Studio later.
```

`page_versions.pageJson` is the source of truth for page structure and rendering.

`component_instances` must not become a competing renderer source. If kept, it is a projection or note-anchor table generated from `pageJson`. `component_notes` should anchor to stable section ids and optional field paths, not to array position or rendered markup.

The registry is code-owned for MVP. Do not add a runtime component registry table until operators actually need mutable registry entries or tenant-specific components.

Every page section needs stable identity:

```text
PageSectionInstance
  id               stable section instance id
  type             closed SectionType vocabulary
  registryKey      registry entry key
  schemaVersion    prop schema version
  zone             closed PageZone vocabulary
  order            render order inside legal zone
  variant          closed variant key from registry entry
  props            validated by the registry entry
  evidenceRefs     EvidenceRef[] where the section makes evidence-backed claims
  generation       optional agent/template/human provenance
```

The AI lane may emit only structured `PageProposalJson`/`PageJson` that validates against contracts and registry rules. It must not emit arbitrary HTML, React, CSS, JavaScript, raw markup, class names, inline styles, or freeform layout instructions as product truth.

Approved page versions are immutable. New AI work creates new proposals or versions.

## Consequences

This preserves the current controlled-automation architecture:

- contracts describe the serializable page artifact,
- registry code owns section prop schemas and render behavior,
- domain code owns legal movements and editor decisions,
- API and workers own persistence and release handoff,
- Page Studio exposes only legal actions.

It also gives the next implementation slice a concrete target:

1. Add PageJson/PageProposalJson contracts.
2. Create `packages/page-registry` with a small Local SEO section set.
3. Add pure registry validation and page-studio movement helpers.
4. Add preview rendering for registry-backed page versions.
5. Wire project-scoped proposal/version reads.
6. Add section notes anchored to stable section ids.
7. Freeze approved versions and revalidate pageJson during release preflight.

The first registry can be small:

```text
Header
Hero
ServiceIntro
ProblemSolution
ServiceDescription
BenefitsGrid
TrustReviews
FAQ
ServiceAreaList
FinalCTA
Footer
```

Richer sections such as galleries, before-after, maps, nearby places, and references can follow after the source-of-truth path is proven.

## Alternatives Considered

### Freeform Website Builder

Rejected. Builder.io, Plasmic, Webflow, Framer, and Gutenberg are useful references for props, slots, variants, locks, and property controls, but the Local SEO product must not become a freeform builder. The product needs controlled SEO pages, preview, notes, approval, release, and verification.

### Component Instances As Render Truth

Rejected. A normalized `component_instances` render model would duplicate `page_versions.pageJson` and create drift risk. It may still be useful as a projection for notes, outlines, search, or UI anchors, but `pageJson` remains the artifact that gets approved and released.

### Runtime Registry Table First

Rejected for MVP. A database-backed registry creates authoring, migration, tenancy, caching, and release questions before the first page proposal exists. Code-owned registry entries are simpler and reviewable.

### Arbitrary Agent HTML

Rejected. Agent-generated HTML/CSS/React cannot be safely validated against local SEO, approval, release, and rollback rules. The model must operate inside structured contracts.

## Regression Guard

Future work must not:

- build Page Studio before Page Registry and preview validation exist,
- let `component_instances` become a second source of render truth,
- mutate an approved `page_versions.pageJson` in place,
- accept raw HTML, React, CSS, JavaScript, class names, or inline styles from model output,
- store page truth in rendered markup or comments,
- attach notes to unstable section order,
- bypass registry validation during preview, approval, release preflight, or deploy.

## Related Files

- `docs/architecture/agent-first-mvp-roadmap.md`
- `docs/architecture/frontend-ui-and-page-registry.md`
- `docs/architecture/page-studio-layout-zone-editor.md`
- `docs/architecture/website-import-rebuild-preview.md`
- `packages/db/src/schema.ts`
- `packages/contracts/src/index.ts`
- `packages/seo/src/index.ts`
- `C:/big eater/page-registry-page-studio-stealer-findings-2026-07-06.md`
