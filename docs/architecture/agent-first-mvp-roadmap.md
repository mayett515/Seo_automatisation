# Agent-First MVP Roadmap

Status: Accepted roadmap correction, refined after opportunity boundary review

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

Status: implemented baseline.

Purpose:

```text
customer own-site URL
-> bounded same-origin import
-> route, brand, service, area, and page evidence
-> dashboard visibility
```

This creates evidence for the agent lane. It is not a complete cloning or rebuild engine by itself.

### 1. AI Reasoning And Opportunity Boundary

Status: implemented baseline.

Define the application boundary for model/Mastra calls and the first product artifact contract.

Required shape:

```text
AiReasoningPort
  timeout-bounded
  typed failure taxonomy
  redacted diagnostics
  cost/latency/run metadata
  no production mutation tools

Opportunity Scout contracts
  EvidenceRef
  NearbyPlaceCandidate
  CorridorCluster
  OpportunityGroupHint
  OpportunityBrief
  OpportunityScoutOutput

Minimal run ledger
  agent_runs
  opportunities.classification
  opportunities.agent_run_id
```

This should look like a provider adapter boundary, not controller-level model code. Mastra/OpenCode/GLM remain adapter details.

### 2. Opportunity QA Hardening

Status: implemented.

Before persistence exists, the pure QA boundary must be hard to bypass:

```text
proven_win proof
  Requires customer-safe ranking proof in brief.evidence only.
  output.groups, brief.groupHints, and location evidence may support context,
  resolution, and containment, but cannot prove the specific opportunity.

deterministic score
  Model confidence is not a score input.
  Score comes from classification, proof tier, evidence strength, cluster strength,
  and cannibalization penalty.
```

Why:

```text
The worker will persist opportunities only after these pure functions accept model output.
The gates need to be trustworthy before they become production write criteria.
```

### 3. MockReasoningAdapter

Status: implemented baseline.

Build the first `AiReasoningPort` implementation as a deterministic test adapter, not a real provider:

```text
MockReasoningAdapter
  canned successful OpportunityScoutOutput
  provider_timeout
  provider_error
  output_not_json
  ok:true with schema-invalid JSON
```

Why:

```text
The worker vertical must prove persistence, idempotency, failures, and QA behavior
without provider flakiness or Mastra orchestration.
```

### 4. Opportunity Scout Worker Vertical

Status: worker baseline and API enqueue endpoint implemented.

Build one useful backend workflow, not a broad agent platform:

```text
opportunity_scout job
-> API/enqueuer creates agent_runs row as queued and uses runId as BullMQ jobId
-> worker loads run and flips queued/failed -> running
-> load deterministic project evidence
-> write redacted evidence packet through ObjectStoragePort as input_ref
-> call AiReasoningPort.runStructured once
-> parse OpportunityScoutOutput through Zod
-> run QA/scoring
-> insert opportunities and mark run succeeded in one transaction
-> failures mark run failed and persist no opportunities
```

Worker invariant:

```text
Opportunities linked to agent run R may exist only when R.status = succeeded.
A succeeded run with zero briefs is legal.
Succeeded runs are immutable.
Opportunities are inserted only inside the transaction that flips running -> succeeded.
```

Run state machine:

```text
queued    -> running      start
running   -> succeeded    success transaction only, WHERE status = running
running   -> failed       adapter/schema/QA failure
failed    -> running      BullMQ retry redo
succeeded -> terminal     no transition out
```

Retry/concurrency rules:

```text
runId is agent_runs.id and BullMQ jobId
one agent_runs row spans all attempts for that runId
same runId already succeeded         -> no-op, no duplicate opportunities
same runId failed on prior attempt   -> retry flips failed -> running
same runId running after crash       -> safe redo
concurrent same-run delivery         -> one conditional status flip wins; loser no-ops
QA/schema/provider failure           -> failed run, zero opportunities
```

The workflow output is an opportunity/proposal, not a page version and not a deploy.

Implementation checkpoint:

```text
implemented now
  opportunity_scout queue/job contract
  MockReasoningAdapter
  stable evidence packet builder and prompt
  worker route and repository
  API/operator enqueue endpoint
  opportunity:run project permission
  agent_runs queued row creation before enqueue
  BullMQ jobId = runId
  Zod parse -> QA/scoring -> transactional persistence
  failed -> running retry support
  succeeded no-op replay
  unit tests plus DB-backed integration tests

still next
  real reasoning adapter
  Opportunity Explorer read-only UI
```

### 5. Real Reasoning Adapter

After the mock worker loop is green, add the real provider behind the same port:

```text
OpenCodeGoReasoningAdapter or MastraReasoningAdapter
  provider/model config through environment
  timeout and failure-code mapping
  redacted diagnostics
  opaque provider/model metadata only
```

No Mastra/OpenCode types in contracts, DB schema, UI, controllers, or product truth.

Adapter preflight already satisfied by the worker baseline:

```text
failed -> running clears stale outputJson/provider/model/usage/latency fields
qa_rejected stores compacted output_json, not uncapped model output
OpportunityScoutOutput arrays are capped before QA and persistence
```

Acceptance criteria for this slice:

```text
mock adapter remains the default/test adapter
real adapter is selected only by explicit environment configuration
missing provider config fails as configuration-required, not as successful reasoning
timeouts map to provider_timeout
transport/auth/provider failures map to provider_error or provider_overloaded
non-JSON model output maps to output_not_json
provider/model/cost/latency are recorded as run metadata only
raw prompts, secrets, OAuth tokens, full competitor text, and provider blobs are never stored
no provider-specific types leak into contracts, DB, UI, controllers, or product truth
```

### 6. Opportunity Explorer And Manual Evidence Entry

The first product UI should be workflow-first, not chat-first.

Smallest useful Explorer:

```text
opportunity table/list
  classification, service, Ort, score, recommended action

detail/evidence panel
  evidence stack, proof tiers, competitor observations, missing evidence,
  cannibalization risk, corridor/group context

agent run list
  status, failure code, provider/model/cost/latency metadata

lifecycle action form
  hold, reject, monitor
```

Explorer/run UX must also close two API-slice follow-ups:

```text
active scout guard
  if a project already has a queued/running opportunity_scout run, return or display
  that active run instead of letting double-submit create duplicate opportunity rows

enqueue failure-code vocabulary
  queue_enqueue_failed and queue_not_configured are enqueue-boundary failure codes.
  Add them to a small shared vocabulary before the run timeline renders failure
  explanations.
```

Manual evidence entry is added here as the bridge before automated SERP snapshots:

```text
manual_ranking_evidence / manual_evidence
  operator records query, page URL, observed rank, checked-at date,
  optional screenshot artifact key, and notes
```

Why:

```text
The current contracts include ranking_proof, serp_snapshot, field_evidence, and manual_note,
but the DB has no backing source rows for those evidence types yet.
Without a manual evidence bridge, proven_win is structurally unreachable until SERP automation.
Manual evidence mirrors the real Martines workflow and dogfoods EvidenceRef resolution
before automating SERP checks.
```

Use TanStack Query for server state, TanStack Table for opportunity lists, TanStack Form for actions/evidence entry, TanStack Store only for local UI state. Corridors render as grouped lists first; MapLibre waits until real map interaction is needed.

### 7. SERP And Competitor Snapshots

Add automated search/competitor evidence only after the first scout loop works:

```text
SerpScoutPort
SerpSnapshot
SearchResult
SerpFeature
competitor snapshot artifacts
cache by query + locale + device + engine
```

Rules:

```text
read-only only
snapshot rows/artifacts first
model cites snapshot sourceIds later
proof freshness policy required
```

Customer-safe ranking proof expires by policy; a stale rank must not remain customer proof forever.

### 8. Page Registry And Preview

Implement the minimal customer-site component registry needed by page proposals and Page Studio.

MVP registry can start with a small subset, but the target taxonomy must support richer section families:

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

### 9. Page Proposal Workflow

Turn an accepted opportunity into a structured page proposal:

```text
opportunity brief
-> Content Agent drafts page brief/copy/meta/FAQ/CTA
-> Template/Layout Agent chooses controlled components
-> component prop schemas validate output
-> SEO QA checks uniqueness, hub/spoke role, cannibalization, proof, schema readiness
-> preview decision card
```

The page proposal must be structured page JSON, not arbitrary HTML, React code, or a freeform website builder output. This slice depends on the page registry.

### 10. Page Studio, Notes, Approval, And Versioning

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

### 11. Release Handoff

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

### 12. Report And Next Action

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

### 13. RAG / Knowledge Retrieval

RAG stays deferred. The direct evidence packet is the first implementation path.

Build retrieval only when one of these is true:

```text
evidence packets are too large
Page Brief drafting needs reusable project memory
Report Narrative needs retrieval across many proof/release artifacts
operators need "why did the agent use this evidence?" UI
repeated runs waste tokens loading the same stable context
```

First retrieval shape:

```text
project-owned source rows/artifacts
-> chunk/index with source metadata and proof tier
-> retrieve with project/source/proof filters before similarity
-> return RetrievedEvidenceCandidate
-> map to EvidenceRef
-> deterministic QA still decides product truth
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
  After the direct evidence-packet workflow proves the evidence/proposal boundary
  and one of the slice 13 retrieval triggers becomes real.
```

## Source Map

This roadmap is grounded in:

```text
C:\big eater\mastra-agent-flow-ideas.md
C:\big eater\frontend-ui-component-registry-stealer-findings-2026-07-01.md
C:\big eater\ai-reasoning-opportunity-scout-stealer-findings-2026-07-02.md
C:\big eater\mastra-docs-for-local-seo-project-2026-07-02.md
C:\big eater\rag-stealer-findings-2026-07-02.md
C:\big eater\agentic-evidence-web-ui-stealer-findings-2026-07-02.md
local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/architecture/05-ai-agent-architecture.md
local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/product/05-template-component-preview-system.md
local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/product/07-subdomains-local-pages.md
.ai-project-rules/13-seo-opportunity-planning.md
.ai-project-rules/09-local-landing-page-generation.md
```
