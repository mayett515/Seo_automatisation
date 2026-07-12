# 0017 - Page Registry And PageJson Source Of Truth

Date: 2026-07-06
Status: Accepted

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

The accepted review also surfaced two then-current scaffold facts that the page lane had to reconcile:

- the existing static HTML renderer lives in `packages/domain` and is invoked by the Netlify adapter,
- current release preflight and current static rendering duck-type different loose `pageJson` keys, including a robots/noindex vocabulary mismatch.

Those paths were acceptable scaffold code before PageJson v1. The slice-7 renderer/preflight migration has since moved static rendering into `packages/page-registry`, made the deploy worker persist rendered `StaticSiteArtifact` files, and retargeted release preflight to parsed PageJson and registry-derived SEO facts.

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

`component_instances` must not become a competing renderer source. If kept, it is a projection generated from `pageJson`, not an editable render model.

`component_templates` must not become runtime registry truth. It is a dormant table from the initial scaffold; the MVP registry is code-owned.

Notes anchor directly to `(pageVersionId, sectionId, fieldPath?)` in `page_section_notes`, not to projection row identity. `component_notes.componentInstanceId` remains scaffold/projection-adjacent and must not become the product source of truth because projection regeneration could orphan notes.

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

The first PageJson contract slice enforces this with a recursive forbidden-key and unsafe-string scan in `packages/contracts`. That scan is an interim belt-and-suspenders guard, not the durable registry boundary. The durable boundary is the next registry slice: each section type gets a schema-owned props allow-list and renderer-owned behavior.

Approved page versions are immutable. New AI work creates new proposals or versions. The DB boundary enforces this with `page_versions_prevent_immutable_update`, `page_versions_prevent_immutable_delete`, and an approval-evidence CHECK constraint: once a row is approved, release-candidate, released, or superseded, structural edits to `page_proposal_id`, `version_number`, or `page_json` are rejected, the frozen artifact cannot be deleted, and frozen statuses require `approved_at`.

Controlled Page Studio editing is append-only and command-based. The API accepts named structured commands for section-prop replacement, legal movement, registry-owned variant switching, and controlled section replacement; it does not accept JSON Patch, arbitrary PageJson replacement, HTML, CSS, or executable code. A replacement command supplies only the current section id plus a target registry key, variant, and complete props. Domain and registry truth derive the replacement type, schema version, and legal zone; the command preserves the stable section id, order, and page slot, clears stale section evidence, and records human replacement provenance. Target and variant selection remain local UI staging until explicit confirmation submits the command. Every accepted edit creates the immediate next `page_versions` row in `preview`, records `based_on_version_id` plus the persisted editing user, and marks the page plus directly edited section with human generation provenance. A page-proposal row lock serializes edit and review decisions, so only the latest version may be edited or reviewed and two concurrent commands cannot both derive from the same base. The database validates direct same-proposal lineage and treats PageJson, version identity, lineage, and editor provenance as append-only even while a row is still a preview; lifecycle status and approval evidence remain the controlled mutable fields. Editing an approved or released artifact branches to a new preview row; it never changes the frozen source row. Section-prop commands are complete object replacements, so registry-owned editor metadata must preserve every field the operator did not intentionally remove. Section notes remain attached to their original page version and are not silently copied to the child. The review UI surfaces unresolved blockers from a bounded predecessor chain as display-only historical context; only blockers on the concrete current version participate in the authoritative approval gate.

AI section-copy revision is a suggestion workflow, not a second editing path. Registry editor metadata explicitly marks the copy fields an AI may revise; path, phone, business-identity, evidence, layout, and structural fields remain outside that allow-list. The API pins each request to one latest page version and section, persists one unresolved suggestion plus its `section_text_generation` run, and queues deterministic worker transport. The worker loads a bounded evidence packet, calls the named read-evidence/draft-content policy, accepts only the pinned section id and registry-approved copy fields, merges them into the stored props, and reruns registry, Page Studio composition, and preview-render gates before marking the suggestion ready. It does not create a page version. The operator may cancel queued/generating work, edit and explicitly apply ready structured props through the existing `update_section_props` command, or dismiss a ready suggestion. Cancellation locks run then suggestion, terminalizes unfinished run truth as `operator_cancelled`, and prevents a late worker completion from resurrecting the suggestion; it does not promise that an already-started external provider request can be aborted. Exact application records agent provenance with the durable run id; operator-modified application records human provenance. Suggestion application and N+1 persistence are one transaction, and a stale base remains a normal latest-version conflict rather than silently rebasing model output.

Media uses project-scoped asset references, not URLs. ADR 0020 fixes the boundary: Postgres owns asset identity/lifecycle/actor evidence, private object storage owns uploaded and normalized bytes, and PageJson may carry only a strict placement reference with an opaque asset id, content-vs-decorative alt semantics, and an optional normalized focal point. Uploads remain private quarantine objects until a deterministic, recoverable worker validates decoded content, strips metadata, and writes immutable derivatives. Preview and deploy must resolve the same manifest through the same renderer core and emit the same root-relative asset paths. Media backend, binary artifact, and visual-control implementation remain separate follow-up slices.

Page version approval is a durable human/operator decision on one concrete `pageVersionId`. The API owns the transition from `preview` or `changes_requested` to `approved` or back to `changes_requested`, requires `page:approve`, parses and registry-validates the stored PageJson, blocks approval while unresolved `approval_blocker` section notes exist, sets `page_versions.approvedAt` only on approval, and writes an `approvals` audit row. Approval and unresolved `approval_blocker` note creation serialize on the same page-version row so approval cannot race with a new blocker. Approval does not enqueue deploy or mutate providers; release planning, release preflight, deploy, and verification remain separate deterministic steps.

Release-plan creation is the first consumer of approved page versions. It may create draft release plans and pending release items only from project-owned `page_versions.status = "approved"` rows with `approved_at` evidence. It must reject preview, changes-requested, release-candidate, released, superseded, missing, cross-project, or approval-evidence-missing page versions. Release planning does not approve deploy, enqueue deploy, mutate providers, or mark a release live.

Deploy approval and post-deploy verification project the page-version lifecycle. Persisted deploy approval moves included approved page versions to `release_candidate`. A live verification outcome moves the included release items' page versions to `released` and supersedes older released versions of the same page proposal. Failed or rollback-recommended verification does not mark a candidate as released. Failed, rolled-back, or cancelled not-yet-deployed release plans restore included `release_candidate` versions to `approved` so the frozen artifact can be replanned. Cancellation requires a persisted actor and writes an audit row so routine cancellation is distinguishable from provider or verification failure.

Structured `PageProposalJson` should persist as a proposal artifact, not only as `agent_runs.outputJson`. The default direction is a future `page_proposals.proposalJson` JSONB column, with existing flat proposal columns treated as query/projection fields. `agent_runs.outputJson` remains reasoning audit, not the UI's proposal source of truth.

`page_versions.pageJson` is a JSONB column whose TypeScript `$type` is only a compile-time hint. Consumers that turn page JSON into release artifacts, previews, deploys, or customer-visible output must parse with `PageJsonSchema` at the boundary.

The current release renderer is a scaffold path. The Page Registry implementation must migrate production rendering so that:

```text
page-registry static renderer
-> release artifact builder / worker creates rendered StaticSiteFile[]
-> object storage keeps the rendered artifact
-> SiteHostingPort adapter uploads bytes only
```

Provider adapters must not import `packages/page-registry`, `packages/domain` renderers, or React renderers to create production HTML.

Preview and deploy must share the same rendering core. Approval must approve the same structural page and renderer output that deploy will ship.

Customer-page rendering uses a small internal CSS/theme system owned by the page-registry lane. It does not use Next.js or Tailwind as the customer-page runtime/style source for MVP. The operator application may continue to use React and TanStack for control surfaces, but approved customer pages are deterministic static HTML/CSS emitted from PageJson and registry entries.

The renderer owns CSS class names, CSS custom properties, data attributes, and layout primitives. PageJson stores structured business/content/style choices only, such as section type, registry key, variant, zone, order, media references, CTA emphasis, density, and future theme preset identifiers. PageJson must not store utility classes, Tailwind classes, arbitrary tokens, inline styles, raw CSS, or framework component references.

The first renderer/theme implementation should stay inside `packages/page-registry` until static deploy rendering, preview rendering, and Page Studio all need a shared public style API. A future `packages/page-theme` split is acceptable only after that duplication exists. The CSS foundation should favor standards-based primitives:

```text
CSS custom properties for semantic tokens
cascade layers for reset/tokens/base/primitives/components/sections/variants
small internal layout primitives such as stack, cluster, container, grid, sidebar, frame, and bleed
renderer-owned data attributes for validated section variants and states
```

`packages/seo` remains the page-level QA/preflight owner, but it must consume registry-validated PageJson and registry-derived facts instead of loose key duck-typing or contract-only parsing. Preflight and rendering must agree on the same resolved values for title, canonical, robots, JSON-LD, H1, FAQ, area served, internal links, sitemap readiness, and uniqueness.

Robots/indexability is resolved at release time. PageJson may carry content intent, but the final rendered robots value is owned by the release action and deploy context:

```text
preview/staging    -> noindex
live create/update -> index only after approval and release preflight allow it
noindex action     -> requires explicit directive artifact support before production use
redirect/remove    -> requires explicit directive artifact support before production use
```

Release preflight validates the resolved robots value and also blocks release actions that do not yet materialize to rendered page files or explicit directive artifacts. Render parity tests must prove the renderer emits the values preflight accepted.

## Consequences

This preserves the current controlled-automation architecture:

- contracts describe the serializable page artifact,
- registry code owns section prop schemas and render behavior,
- domain code owns legal movements and editor decisions,
- API and workers own persistence and release handoff,
- Page Studio exposes only legal actions.

It also gives the next implementation slice a concrete target:

1. Add PageJson/PageProposalJson contracts. Done in the first Page Registry slice.
2. Add contracts-owned page version status vocabulary and action-conditional release artifact validation. Done in the first Page Registry slice.
3. Decide and migrate the structured proposal artifact home, defaulting to `page_proposals.proposalJson`. Done in the first Page Registry slice.
4. Create `packages/page-registry` with a small Local SEO section set. Done in the second Page Registry slice.
5. Add pure registry validation. Done in the second Page Registry slice.
6. Add page-studio movement and composition helpers: required frame sections, legal ordering, legal movement, replacement, and variant switching. Done in the third Page Registry slice.
7. Retarget release preflight and static rendering to typed PageJson, including the internal CSS foundation. Done in the fourth Page Registry slice.
   7a. Harden preflight/render parity after review: preflight must call registry validation before deriving facts; literal `class` keys are rejected by the PageJson safety scan; non-rendering actions are blocked until directive artifacts exist. Done in the fourth Page Registry hardening slice.
8. Add preview rendering that shares the static renderer core and theme tokens. Done in the fifth Page Registry slice.
9. Wire project-scoped proposal/version reads and the minimal preview API/UI foundation. Done in the sixth Page Registry slice.
10. Add section notes anchored to stable section ids. Done in the seventh Page Registry slice.
11. Freeze approved versions and revalidate PageJson during release preflight. Done in the eighth Page Registry slice.
12. Add Opportunity Explorer Page Proposal trigger and run-status UI on top of the durable `page_brief_draft` queue path. Done in the ninth Page Registry slice.
13. Add durable page version approval/request-changes flow with `approval_blocker` enforcement and `approvals` audit rows. Done in the tenth Page Registry slice.
14. Add a real-provider Page Proposal smoke harness, canonical registry-prop prompt example, and worker-owned generation provenance. Done in the Page Proposal provider-smoke slice; credentialed execution remains operational follow-up.
15. Add the controlled Page Studio edit/versioning backend: explicit commands, pure domain application, registry/composition/render gates, append-only N+1 lineage, persisted actor evidence, and latest-version serialization across edit/review. Done in the first controlled Page Studio editing slice and used as the prerequisite for step 16.
16. Add the first visual Page Studio workspace: registry-owned property controls, domain-derived movement legality, registry-derived variants, stale-base navigation, rendered preview parity, structured section notes, and bounded predecessor-blocker context. Done in the visual Page Studio slice.
17. Add controlled section replacement through the existing command/version boundary: registry-derived legal targets and prop controls, local staging, explicit confirmation, server-derived structure, stable slot identity/order, and the existing contract/registry/composition/render gates. Done in the controlled section-replacement slice and used as the command-boundary precedent for step 18.
18. Add bounded AI section-copy revision: registry-owned copy-field allow-lists, one pinned durable suggestion/run, worker-owned validation and recovery, explicit review/edit/apply or dismiss, and provenance derived from exact-versus-modified application. Done in the section-copy revision slice; media remains a separate infrastructure lane governed by ADR 0020.
19. Decide the media asset boundary before adding controls: project-scoped opaque references, private quarantine upload, deterministic worker normalization, immutable derivatives, reference-protected retention, and preview/deploy manifest parity. Accepted in ADR 0020; the backend ingestion/processing foundation is implemented, while renderer parity and UI controls remain separate slices.

The first registry is intentionally small and currently covers the deployable Local SEO service-area skeleton:

```text
Header
Hero
ServiceIntro
ServiceDescription
BenefitsGrid
FAQ
ServiceAreaList
FinalCTA
Footer
```

Richer sections such as problem/solution blocks, service grids, trust reviews, galleries, before-after, maps, nearby places, and references can follow after the source-of-truth path is proven and their source data exists.

The first migrations in this lane added a unique index on `(pageProposalId, versionNumber)` and the database immutability trigger that prevents approved versions from being structurally mutated in place.

## Alternatives Considered

### Freeform Website Builder

Rejected. Builder.io, Plasmic, Webflow, Framer, and Gutenberg are useful references for props, slots, variants, locks, and property controls, but the Local SEO product must not become a freeform builder. The product needs controlled SEO pages, preview, notes, approval, release, and verification.

### Component Instances As Render Truth

Rejected. A normalized `component_instances` render model would duplicate `page_versions.pageJson` and create drift risk. It may still be useful as a projection for notes, outlines, search, or UI anchors, but `pageJson` remains the artifact that gets approved and released.

### Runtime Registry Table First

Rejected for MVP. A database-backed registry creates authoring, migration, tenancy, caching, and release questions before the first page proposal exists. Code-owned registry entries are simpler and reviewable.

This rejection includes the existing dormant `component_templates` table. Do not populate it as registry truth unless a future ADR supersedes this one.

### Arbitrary Agent HTML

Rejected. Agent-generated HTML/CSS/React cannot be safely validated against local SEO, approval, release, and rollback rules. The model must operate inside structured contracts.

### Tailwind Or Next.js Customer-Page Runtime

Rejected for MVP. Tailwind is useful for application UI speed, and Next.js is useful for app and site runtimes, but the customer-page lane needs deterministic deploy artifacts, registry-owned rendering, stable CSS output, preview/deploy parity, and no utility-class vocabulary in PageJson. The internal renderer should emit static HTML/CSS from typed PageJson and code-owned registry entries. A future ADR may revisit the runtime if customer-page needs outgrow static rendering.

### Runtime CSS-In-JS For Customer Pages

Rejected for MVP. Runtime CSS-in-JS would couple the deploy artifact to a JavaScript runtime and make renderer/preflight parity harder. Customer pages should ship static CSS generated from code-owned tokens, section prop schemas, variants, and renderer-owned data attributes.

## Regression Guard

Future work must not:

- build Page Studio before Page Registry and preview validation exist,
- let `component_instances` become a second source of render truth,
- populate `component_templates` as registry truth,
- mutate an approved `page_versions.pageJson` in place,
- accept arbitrary PageJson replacement or JSON Patch as a Page Studio editing boundary,
- create ambiguous or cross-proposal page-version lineage,
- let stale versions be edited or reviewed after a newer version exists,
- allow unresolved `approval_blocker` notes to race with or appear on approved page versions,
- accept raw HTML, React, CSS, JavaScript, class names, or inline styles from model output,
- store Tailwind/utility classes, runtime CSS-in-JS rules, arbitrary theme tokens, or user/model CSS in PageJson,
- store page truth in rendered markup or comments,
- attach notes to unstable section order,
- bypass registry validation during preview, approval, release preflight, or deploy,
- let release preflight pass a registry-validity failure that the renderer would reject,
- let `noindex`, `redirect`, or `remove` actions pass production preflight before their directive artifacts exist,
- let provider adapters render page HTML,
- make customer-page deploy artifacts depend on Next.js, Tailwind, or a browser-side styling runtime without superseding this ADR,
- let preflight accept SEO evidence that the renderer does not emit.

## Related Files

- `docs/architecture/agent-first-mvp-roadmap.md`
- `docs/architecture/frontend-ui-and-page-registry.md`
- `docs/architecture/page-studio-layout-zone-editor.md`
- `docs/architecture/website-import-rebuild-preview.md`
- `packages/db/src/schema.ts`
- `packages/contracts/src/index.ts`
- `packages/seo/src/index.ts`
- `C:/big eater/page-registry-page-studio-stealer-findings-2026-07-06.md`
- `C:/big eater/page-studio/business-site-pattern-mining-findings-2026-07-07.md`
- `C:/big eater/page-studio/internal-css-theme-decision-2026-07-07.md`
- `C:/big eater/page-studio/business-site-deep-mining-pattern-cards-2026-07-07.md`
- `C:/big eater/css-system-pattern-mining/css-system-stealer-findings-2026-07-07.md`
