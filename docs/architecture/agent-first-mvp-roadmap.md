# Agent-First MVP Roadmap

Status: Accepted roadmap correction

This document corrects the MVP roadmap after reviewing the local product pack and the `C:\big eater` Mastra/frontend findings. The product is not a deterministic "service-area gap finder" with AI added later. The product value is an AI-assisted local SEO workflow where agents scout, compare, reason, draft, and explain, while the platform validates, previews, approves, deploys, verifies, and reports through deterministic boundaries.

## Core Loop

```text
website import / GSC / tracking / SERP / competitor / field evidence
-> AI Opportunity Scout
-> Opportunity Explorer
-> page brief / page proposal
-> component-constrained preview
-> customer/operator notes
-> approval
-> release preflight
-> deploy and verify
-> report and next opportunity
```

The important product correction is that the Opportunity Scout is agent-assisted from the start. Deterministic crawling, GSC sync, tracking, and verification provide evidence and safety. The AI lane turns that evidence into ranked opportunities, competitor observations, page briefs, component choices, copy drafts, and customer-safe explanations.

## Architecture Sentence

```text
Agents make evidence-backed proposals visible.
Contracts and deterministic QA validate them.
The user approves concrete versions.
Workers execute production changes.
Verification decides what is true.
Reports only claim proven truth.
```

## Agent Responsibilities

```text
Research Agent
  SERP review, competitor snapshots, industry/local patterns, field evidence.

SEO Strategy Agent
  service/location priority, opportunity tiering, hub/spoke role, route/subdomain recommendation.

Content Agent
  page brief, title/meta, FAQ, CTA, local copy draft, uniqueness rationale.

Template/Layout Agent
  component selection, section order, variants, theme hints from imported site facts.

SEO Analyst Agent
  observations, risk notes, "why this matters", next action explanation.

Report Agent
  customer-safe narrative, proven wins, progress explanations.
```

Agents may read evidence, analyze, classify, draft, and propose. They may not approve, deploy, roll back, mutate provider state, or make customer-facing success claims from weak evidence.

## Deterministic Responsibilities

```text
Website import worker
  Bounded own-site crawl, route/page facts, design facts, artifact persistence.

GSC sync worker
  Search Console evidence import and internal opportunity signals.

Tracking ingestion
  Customer-site events and readiness signals.

Contracts / validators
  Zod output contracts, component prop schemas, report-safety checks, policy gates.

Page registry
  Controlled customer-site sections and preview renderers.

Release workers
  Approved artifact writing, provider deploy, verification, rollback reconciliation.
```

Deterministic code owns production truth. AI output is external input at the boundary and must be parsed, validated, scored, previewed, and approved before it can become deployable state.

## MVP Slice Order

### 0. Website Import Evidence Baseline

Status: current implementation slice.

Purpose:

```text
customer own-site URL
-> bounded same-origin import
-> route, brand, service, area, and page evidence
-> dashboard visibility
```

This creates evidence for the agent lane. It is not a complete cloning or rebuild engine by itself.

### 1. AI Reasoning Port

Define the application boundary for model/Mastra calls.

Required shape:

```text
AiReasoningPort
  timeout-bounded
  typed failure taxonomy
  redacted diagnostics
  cost/latency/run metadata
  no production mutation tools
```

This should look like a provider adapter boundary, not controller-level model code.

### 2. Opportunity Scout Contracts

Add structured contracts before building broad agent behavior.

Initial outputs:

```text
OpportunityClassification
  proven_win | near_term_target | internal_radar | rejected

OpportunityBrief
  service
  location
  keywords
  suggestedRoute
  suggestedPageType
  evidence
  competitorUrls
  confidence
  risks
  recommendedAction

AgentRunEvent
  agent/tool/evidence/opportunity/quality/proposal/approval/worker events
```

Classification meaning:

```text
proven_win
  Ranking proof exists. Customer report may mention it.

near_term_target
  Strong enough for roadmap or page proposal, not yet report proof.

internal_radar
  Interesting signal, but weak or incomplete.

rejected
  Unsupported, weak intent, cannibalizing, duplicate, outside service area, or poor fit.
```

### 3. Read-Only Agent Tools

First agent tools should read evidence and summarize it, not mutate state.

```text
websiteImportEvidenceTool
gscPerformanceTool
trackingSummaryTool
competitorSnapshotTool
rankingEvidenceTool
localSeoRulesTool
customerMemoryTool
```

The competitor tool is evidence-only. It can record competitor URLs, page structures, positioning, and gaps. It must not copy competitor content or import competitor sites as rebuild sources.

### 4. Opportunity Scout Workflow

Build one useful vertical slice, not a broad agent platform:

```text
load evidence snapshot
-> Research Agent reviews SERP/competitor/context
-> SEO Strategy Agent classifies opportunities
-> deterministic local SEO quality checks
-> save opportunity briefs and missing-evidence notes
-> show cards in Opportunity Explorer
```

The workflow output is a proposal/opportunity, not a page version and not a deploy.

### 5. Opportunity Explorer

The first product UI should be workflow-first, not chat-first.

```text
Project Mission Control
  opportunity table/list
  selected opportunity evidence panel
  nearby-place/service-location surface
  competitor observations
  confidence/risk labels
  create page brief/proposal action
  hold/reject controls
  agent run timeline
```

Use TanStack Query for server state, TanStack Table for opportunity lists, TanStack Form for actions/notes, TanStack Store only for local UI state, and add MapLibre only when real map interaction is needed.

### 6. Page Proposal Workflow

Turn an accepted opportunity into a structured page proposal:

```text
opportunity brief
-> Content Agent drafts page brief/copy/meta/FAQ/CTA
-> Template/Layout Agent chooses controlled components
-> component prop schemas validate output
-> SEO QA checks uniqueness, hub/spoke role, cannibalization, proof, schema readiness
-> preview decision card
```

The page proposal must be structured page JSON, not arbitrary HTML, React code, or a freeform website builder output.

### 7. Page Registry And Preview

Implement the minimal customer-site component registry needed by page proposals and Page Studio.

MVP registry can start with a small subset, but Page Studio's target taxonomy must support richer section families:

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

Each component needs a prop schema, variants, allowed tokens, preview renderer, validation errors, customer note anchors, layout zone metadata, and legal movement rules.

Reference: [Page Studio Layout-Zone Editor](page-studio-layout-zone-editor.md).

### 8. Page Studio, Notes, Approval, And Versioning

Page Studio is the "WordPress but easier" surface for subpages and local pages. It is a constrained layout-zone editor, not a freeform builder:

```text
section type selector
left/right variant arrows
legal up/down movement arrows
Generate Text / Generate FAQ / Generate CTA actions
structured Edit and Media controls
customer notes on sections
approval for one concrete version
```

Movement is realistic:

```text
Header and footer are locked.
Hero is locked first after the header.
Final CTA is locked late for MVP.
Body sections can move only inside allowed zones.
FAQ, AreaMap, and service-area sections usually stay in late-body zones.
The UI only shows arrows/actions that are legal for that section.
```

The customer/operator approves a concrete page version.

Rules:

```text
approved versions are not silently mutated
new agent runs create new proposals or versions
customer notes attach to preview/component anchors
approval freezes the deployable version
```

### 9. Release Handoff

Approved page versions enter the release spine that already exists:

```text
approval
-> release preflight
-> approved artifact
-> Netlify deploy
-> verification
-> manual rollback if needed
```

Agents may explain readiness or blockers. Workers own production mutation.

### 10. Report And Next Action

Reports should explain customer-safe truth and guide the next opportunity.

Allowed:

```text
proven Top 10/Top 5/Top 3/rank 1 wins
released pages and verified technical status
customer-safe progress explanations
next opportunity cards with clear evidence level
```

Not allowed:

```text
GSC impressions/CTR/average position as success proof
ranking guarantees
weak internal radar signals as customer-visible wins
claims that AI "found proof" without evidence
```

## MVP Non-Goals

```text
agents deploying or rolling back
freeform website builder
arbitrary generated HTML/code
chat owning the workflow
copying competitor content
customer-facing ranking claims from weak GSC evidence
automatic rollback
full rollback_operations table
release status projection split before UI/reporting needs it
```

## Deferred Triggers

```text
release status split
  Before lifecycle UI/reporting depends on explaining exact failure/health cause.

rollback_operations table
  When multiple attempts/history, operator attempt audit, DB-enforced active-op uniqueness,
  manual reconciliation workflow, or auto rollback is needed.

auto rollback
  Only after ADR 0014 gates: verified-good target, debounce, single-flight,
  circuit breaker, audit, notification, per-project opt-in, and no-loop behavior.

MapLibre / graph dependencies
  When Opportunity Explorer needs real geospatial/relationship interaction.

Mastra memory / RAG
  After the first opportunity workflow proves the evidence/proposal boundary.
```

## Source Map

This roadmap is grounded in:

```text
C:\big eater\mastra-agent-flow-ideas.md
C:\big eater\frontend-ui-component-registry-stealer-findings-2026-07-01.md
local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/architecture/05-ai-agent-architecture.md
local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/product/05-template-component-preview-system.md
local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/product/07-subdomains-local-pages.md
.ai-project-rules/09-local-landing-page-generation.md
```
