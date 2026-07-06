# Frontend UI And Page Registry Architecture

Status: Accepted MVP direction

This document defines the frontend product shape after the backend foundation milestone. It exists to keep the MVP UI focused on real customer value instead of drifting into a generic design-system or chat UI project.

## MVP Product Loop

```text
website import / GSC / tracking / SERP / competitor / field evidence
-> AI Opportunity Scout
-> Opportunity Explorer
-> page brief / proposal
-> preview and notes
-> approval
-> release preflight
-> deploy and verify
-> report and next opportunity
```

The customer-facing value is not "AI generated a page." The value is that the app shows where local SEO opportunities are, why they matter, what evidence and competitor observations support them, and what controlled action follows.

Roadmap reference: [Agent-First MVP Roadmap](agent-first-mvp-roadmap.md).

Page Studio reference: [Page Studio Layout-Zone Editor](page-studio-layout-zone-editor.md).

## Two Component Systems

There are two separate component systems.

```text
@localseo/ui
  Internal control-panel UI.
  Used by the SaaS app for shells, status, evidence, workflow cards, tables,
  timelines, forms, map frames, preview controls, and reports.

page component registry
  Deployable customer-site sections.
  Used by generated page proposals, previews, customer notes, approved page
  versions, and release artifacts.
```

They must not be merged into one vague "component library." The control panel and customer-site pages have different users, runtime constraints, styling needs, approval rules, and failure modes.

## TanStack Responsibility Map

Use TanStack primitives by responsibility:

```text
TanStack Router
  route hierarchy, project params, page params, search params

TanStack Query
  server state, worker status, release status, GSC data, tracking summaries,
  reports, polling, and invalidation

TanStack Form
  onboarding, notes, approvals, holds, rejections, rollback confirmations,
  tracking-key rotation, and settings forms

TanStack Table
  keywords, opportunities, pages, release checks, reports, tracking rows

TanStack Virtual
  large keyword, opportunity, page, and event lists when DOM size matters

TanStack Store
  local UI state only: selected panel, preview mode, splitter size, map focus,
  transient filters before they become route/search params
```

Server state belongs in TanStack Query. TanStack Store must not become a hidden cache for project, release, GSC, tracking, or report truth.

## Control-Panel UI Taxonomy

`packages/ui` should grow as a thin local control-panel package. It should provide reusable UI building blocks, not product state machines or API queries.

Recommended categories:

```text
packages/ui/src/
  app-shell/
    AppShell
    ProjectSwitcher
    SideNav
    TopStatusBar
    CommandActionBar
    RightPanel
    BottomActivityFeed

  status/
    StatusPill
    HealthBadge
    RiskBadge
    WarningStack
    BlockerList
    VerificationCheckRow
    EvidenceCard
    ConfidenceLabel

  workflow/
    ApprovalCard
    DecisionCard
    NoteComposer
    HoldRejectControls
    RollbackActionPanel
    NextActionPanel
    ReleaseReadinessPanel

  data-display/
    MetricCard
    TrendSparkline
    KeywordTableShell
    OpportunityTableShell
    ReportSection
    EmptyState
    LoadingState

  map-geo/
    OpportunityMapFrame
    NearbyPlaceNode
    CorridorClusterView
    ServiceAreaLayer
    CompetitorMarker
    MapLegend

  timeline/
    WorkerTimeline
    DeployTimeline
    AgentRunTimeline
    ToolInvocationCard
    EventMarker

  preview-controls/
    ComponentOutline
    SectionSelector
    VariantSwitcher
    LegalMoveControls
    CustomerNotePin
    PreviewToolbar
    VersionDiffControl

  forms/
    ProjectSettingsFields
    TrackingKeyRotationForm
    GscConnectState
    ReleaseApprovalForm
    RollbackConfirmationForm
```

Feature folders compose these primitives into product screens:

```text
apps/web/src/features/
  mission-control/
  opportunities/
  maps/
  pages/
  preview/
  approvals/
  releases/
  reports/
  gsc/
  tracking/
  agent-runs/
```

## Customer-Page Registry

The customer-page registry is a future package for deployable page sections. It should be schema-first and controlled.

Architecture decision: [ADR 0017 - Page Registry And PageJson Source Of Truth](decisions/0017-page-registry-and-page-json-source-of-truth.md).

The registry source-of-truth rule is:

```text
page_versions.pageJson = approved/rendered page structure
component_instances    = optional projection or note-anchor data
component_notes        = comments anchored to stable section ids/fields
```

`component_instances` must not become a competing renderer source. If the UI needs component rows for notes, outlines, or search, they should be generated from `pageJson` and treated as projection data.

Do not populate `component_templates` as runtime registry truth for MVP. Registry definitions stay code-owned unless a future ADR explicitly introduces editable tenant-specific registry entries.

Initial registry candidates and Page Studio target section families:

```text
Hero
ServiceIntro
ServiceDescription
ServiceGrid
BenefitsGrid
BulletList
ImageText
Gallery
Slideshow
Carousel
BeforeAfter
TrustReviews
References
FAQ
ContactCTA
AreaMap
NearbyPlaces
ServiceAreaList
Footer
```

Each registry component should define:

```text
component type
variants
prop schema
content slots
SEO metadata requirements
allowed style/theme tokens
layout zone
legal movement rules
preview renderer
validation errors
customer note anchors
approval/versioning constraints
```

Suggested future package shape:

```text
packages/page-registry/src/
  registry.ts
  types.ts
  tokens.ts
  validation.ts
  renderers/
  components/
    Hero/
      schema.ts
      variants.ts
      Preview.tsx
    ServiceDescription/
    ServiceGrid/
    TrustReviews/
    FAQ/
    ContactCTA/
    AreaMap/
    Footer/
```

The registry should produce controlled page JSON. It must not accept arbitrary agent-generated HTML, unvalidated props, illegal movement, or silent mutation of an approved page version.

Initial ownership for the page lane:

```text
packages/contracts
  PageJson/PageProposalJson schemas, section types, zones, DTOs

packages/page-registry
  registry entries, prop schemas, variants, preview/static renderers

packages/domain/src/page-studio
  canMoveSection, canSwitchVariant, canReplaceSectionType, publish readiness

packages/ai
  page brief/proposal prompt builders and QA
```

Every page section needs a stable section instance id so notes, validation errors, diffs, and future AI patches remain attached when the section moves.

Preview and deploy must share the same renderer core. The future static release renderer belongs in the page-registry lane and is invoked before the site-hosting adapter; provider adapters upload rendered files and do not render page JSON.

## Page Studio MVP

Page Studio is the constrained editor for generated customer pages and subpages. It should feel much easier than WordPress because the user chooses from legal component sections, variants, generated text, and structured edits instead of assembling a page from scratch.

The core decision:

```text
Page Studio is a constrained layout-zone editor.
It is not a free drag-and-drop builder.
```

Page outline controls:

```text
[Header]               Locked top     < Variant 1 / 3 >
[Hero]                 Locked first   < Variant 2 / 5 >   Generate Text   Edit
[Service Intro]        Up/Down        < Variant 1 / 4 >   Generate Text   Edit
[Benefits Grid]        Up/Down        < Variant 2 / 6 >   Generate Text   Edit
[Image/Text]           Up/Down        < Variant 3 / 5 >   Media/Text      Edit
[Gallery]              Up/Down        < Variant 1 / 4 >   Media           Edit
[Trust Reviews]        Up/Down        < Variant 1 / 3 >   Select Proof    Edit
[FAQ]                  Legal Up only  < Variant 2 / 4 >   Generate FAQ    Edit
[Area Map]             Up/Down        < Variant 2 / 3 >   Edit Area       Edit
[Final CTA]            Locked late    < Variant 1 / 4 >   Generate CTA    Edit
[Footer]               Locked bottom  < Variant 1 / 2 >
```

The UI must only expose legal actions:

```text
Header/footer do not get up/down controls.
Hero stays first after header.
Final CTA stays late/bottom for MVP.
FAQ and map sections can move only in legal late-body zones.
Variant arrows switch variants, not section types.
Section replacement is separate and must validate against the zone rules.
```

LLM-generated page proposals must validate against the same section schemas and movement rules before preview.

## Opportunity Explorer MVP

The first real product screen should make AI-assisted opportunity discovery visible and actionable. It should look like a decision surface for evidence-backed local SEO work, not a generic chat UI.

```text
Left:
  project/service filters
  place cluster list
  score legend

Center:
  opportunity table/list first
  simple nearby-place or service-location surface
  map placeholder until real map interaction is needed

Right:
  "why this page should exist"
  evidence stack
  GSC/search signal summary
  competitor observations
  existing page match
  next action controls

Bottom:
  worker/activity/monitoring timeline
```

Opportunity objects should support:

```text
PlaceNode
  name
  geo
  market hint
  status: won | strong | attack_running | hard_market | not_started
  evidence summary
  next action

ServiceLocationOpportunity
  service
  location
  score
  evidence tier
  recommended action
  cannibalization / uniqueness note
```

Next actions:

```text
monitor
create brief
create proposal
hold
reject
approve for release
```

GSC/search/SERP/competitor signals can justify investigation and page proposals. They are not customer-facing success proof by themselves.

## Mission Control And Agent Runs

The primary interface is evidence, decisions, previews, tables, maps, and timelines. Chat can assist later, but it must not own the workflow.

Agent/workflow event cards should be structured:

```text
EvidenceLoadedCard
ToolInvocationCard
OpportunityClassifiedCard
QualityGateResultCard
MissingEvidenceCard
ProposalCreatedCard
ApprovalRequiredCard
WorkerQueuedCard
WorkerCompletedCard
WorkerFailedCard
```

Do not show hidden chain-of-thought, raw tenant data dumps, or deploy/rollback controls without approval and risk context.

## Dependency Triggers

Do not add libraries before a workflow needs them.

```text
Radix primitives
  Add when @localseo/ui needs accessible dialogs, popovers, menus, tabs, or tooltips.

shadcn-style registry
  Study as a distribution/documentation pattern only if local component blocks need registry tooling.
  Do not adopt its visual style as product truth.

MapLibre
  Add when the Opportunity Explorer needs real map interaction, service-area layers,
  nearby-place geometry, or competitor markers.

React Flow
  Add when opportunity, page, internal-link, or workflow relationships need node-based editing/exploration.

D3 / canvas / WebGL
  Add only when maps, tables, and ordinary charts cannot express the dense relationship or graph view.
```

## MVP Scope

Build now:

```text
Project Mission Control shell
Opportunity table/list
Selected opportunity evidence panel
Simple nearby-place/service-location surface
Agent run timeline
Page brief/proposal action
Preview decision card
Approve / hold / reject controls
Worker timeline
```

Defer:

```text
3D territory map
HTML-in-canvas controls
freeform website builder
full design-system documentation site
heavy graph-generation research
canvas animation framework
custom chart grammar
automatic rollback
agent-owned production mutation
```

## Non-Negotiables

- AI and Mastra may propose, explain, and draft structured outputs; they must not deploy or mutate providers.
- Customer-visible production changes require preview and approval.
- Approved page versions are immutable; new edits create new versions.
- Server state stays in TanStack Query.
- `@localseo/ui` must not import API clients, provider adapters, release state machines, or agent prompts.
- Customer-page components require schemas and validation before preview or release.
- Critical controls and approval flows stay in accessible DOM UI, not canvas-only surfaces.
- The UI must show evidence, warnings, blockers, and worker truth instead of hiding risk behind a single status.
