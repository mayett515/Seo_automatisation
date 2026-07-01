# Frontend UI And Page Registry Architecture

Status: Accepted MVP direction

This document defines the frontend product shape after the backend foundation milestone. It exists to keep the MVP UI focused on real customer value instead of drifting into a generic design-system or chat UI project.

## MVP Product Loop

```text
GSC / tracking / site evidence
-> Potential Searcher
-> Opportunity Explorer
-> page brief / proposal
-> preview and notes
-> approval
-> release preflight
-> deploy and verify
-> report and next opportunity
```

The customer-facing value is not "AI generated a page." The value is that the app shows where local SEO opportunities are, why they matter, what evidence supports them, and what controlled action follows.

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

Initial registry candidates:

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

Each registry component should define:

```text
component type
variants
prop schema
content slots
SEO metadata requirements
allowed style/theme tokens
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

The registry should produce controlled page JSON. It must not accept arbitrary agent-generated HTML, unvalidated props, or silent mutation of an approved page version.

## Opportunity Explorer MVP

The first real product screen should make opportunity discovery visible and actionable.

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

GSC/search signals can justify investigation and page proposals. They are not customer-facing success proof by themselves.

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
