# AI Reasoning Port And Opportunity Scout Contracts

Status: Design review accepted, implementation slice 1-2 of the agent-first MVP roadmap

This document reviews the `C:\big eater` handoff design (AI Reasoning Port, Opportunity Scout contracts, nearby-Orte/corridor model, minimal agent runs) against the actual codebase and pins the shapes for the next implementation slice. The frontend design prompt (Opportunity Explorer, Page Studio) is used here only to pressure-test the contracts; no UI is built in this slice.

Related: [Agent-First MVP Roadmap](agent-first-mvp-roadmap.md), [Page Studio Layout-Zone Editor](page-studio-layout-zone-editor.md), [Frontend UI And Page Registry](frontend-ui-and-page-registry.md).

## Design Verdict

The handoff direction is accepted:

```text
This is not a chat app.
This is not a freeform page builder.
This is an AI-assisted Local SEO mission control.

AI scouts and proposes.
Contracts validate.
Page Studio previews.
Customer approves.
Workers deploy.
Verification decides truth.
```

Accepted as-is from the handoff:

- `runStructured` replaces `runWorkflow` as the port method.
- The port returns untrusted JSON; Zod parsing and deterministic QA happen outside the adapter.
- Classification vocabulary: `proven_win | near_term_target | internal_radar | rejected`.
- Nearby Orte / corridors are first-class contract objects, not prose notes.
- Opportunity groups are first-class hints. They may be GSC query/page clusters, corridor clusters, or agent-suggested groups now; later the user can curate or create their own groups without changing the opportunity contract.
- Persist both: `opportunities.evidenceJson` as the product artifact and a minimal `agent_runs` table as the run audit. Defer `agent_run_events`.
- First output is `OpportunityBrief` only. `PageBrief` is slice 6; `recommendedAction: "create_page_proposal"` is just a flag, not a page draft.
- GSC is internal radar. Customer proof is real SERP visibility (Top 10 / Top 5 / Top 3 / rank 1).
- Competitor data is strategy evidence, never copy source.

## Corrections From Reviewing The Actual Codebase

These are the deltas between the handoff sketch and what the repo already has. They change the design in small but load-bearing ways.

### 1. Port placement follows the existing port convention

The handoff proposes the `AiReasoningPort` interface in `packages/ai`. In this repo, every port (`CrawlerPort`, `AnalyticsPort`, `ObjectStoragePort`, `TrackingPort`, `EventPublisherPort`, and the current `AiReasoningPort`) lives in `packages/adapters/src/index.ts`. Keep that convention:

```text
packages/contracts   Zod schemas: ReasoningTask, EvidenceRef, OpportunityBrief,
                     NearbyPlaceCandidate, CorridorCluster, scout output, failure codes
packages/adapters    AiReasoningPort interface (v2) + OpenCodeGoReasoningAdapter + MockReasoningAdapter
packages/ai          pure prompt/task builders, evidence packet assembly, output parsing + QA pipeline
apps/worker          opportunity-scout handler: load evidence, call packages/ai, persist
```

Do not split port definitions across two homes. `packages/ai` stays free of provider types and free of DB access.

### 2. `ReasoningTask` replaces `workflowId`

`packages/ai` currently exports `mastraWorkflows` string names (`localSeoAnalysisWorkflow`, ...) that nothing implements. The port keys on a closed task union instead; the workflow name list remains aspirational documentation until real Mastra workflows exist.

```ts
type ReasoningTask = "opportunity_scout" | "page_brief_draft" | "section_text_generation" | "report_narrative";
```

Only `opportunity_scout` is implemented in this slice. The union existing now keeps the port stable when slices 6+ arrive.

### 3. The model never emits the final score

`opportunities.score` is a ranking integer the UI sorts by. If the LLM writes it, the LLM grades its own credibility. Rule:

```text
model emits:   confidence (0-1) + rationale + evidence refs
QA computes:   score = deterministic function of evidence strengths,
               proof tiers, classification, cluster strength, cannibalization risk
```

The deterministic scorer is code in `packages/ai`, testable without any provider.

### 4. Classification is not lifecycle status

Classification (`proven_win`...) and lifecycle (`new | monitoring | brief_created | held | rejected`) are different axes: a `near_term_target` can be `new` or `held`. Keep them as separate typed columns:

```text
opportunity_classification enum:
  proven_win | near_term_target | internal_radar | rejected

opportunities:
  + classification opportunity_classification not null
  + agent_run_id uuid null references agent_runs(id)   -- provenance
  status opportunity_lifecycle_status not null default new
  decided_by_user_id uuid null references users(id)
  status_reason text null
```

`gscOpportunitySignals.status` already uses `internal_radar` as a default value, so the vocabulary is consistent with existing DB language.

Worker rule: `recommendedAction` is model advice only. The worker persists every accepted scout brief with lifecycle
`status = "new"`. Only the operator decision API may move status to `monitoring`, `held`, or `rejected`.

### 5. Nearby Orte must not spam the `areas` table

`opportunities.areaId` references `areas`, but the scout proposes nearby Orte that have no `areas` row yet (that is the whole point of nearby-place scouting). Rule:

```text
scout output carries location as a value object (NearbyPlaceCandidate) inside the brief
areaId stays null on scouted opportunities
an areas row is materialized only when the operator accepts
  (recommendedAction create_brief / create_page_proposal is executed)
```

The AI proposes places; only human acceptance turns a place into a first-class project entity.

### 6. Evidence must resolve to real rows

Most evidence sources already have IDs in the DB (`gsc_search_analytics_rows`, `gsc_opportunity_signals`, `website_import_runs` artifacts, `tracking_events`). That makes the anti-hallucination check enforceable, not aspirational:

```text
every EvidenceRef above proofTier internal_signal must carry a sourceId
QA resolves each sourceId against the project's own rows
unresolvable or cross-project sourceId -> run fails QA, nothing persisted
```

### 7. `customerVisible` is derived, not stored

The handoff `EvidenceRef` has both `proofTier` and `customerVisible`. Two writable fields describing one fact will drift. Keep `proofTier` as the single source; `customerVisible` is computed as `proofTier === "customer_safe_proof"` wherever the UI or report lane needs it.

## AiReasoningPort v2

```ts
interface AiReasoningPort {
  runStructured(input: {
    task: ReasoningTask;
    projectId: string;
    runId: string; // idempotency + agent_runs correlation
    prompt: string; // built by packages/ai pure builders
    inputJson: unknown; // structured evidence packet
    outputSchemaName: string; // contracts registry key; adapter never parses with it
    timeoutMs: number;
    policy: {
      canMutateProduction: false; // literal, same pattern as agentDescriptors
      allowedToolCategories: Array<"read_evidence" | "analyze" | "draft_content">;
      maxCostCents?: number;
    };
  }): Promise<AiReasoningRunResult>;
}

type AiReasoningRunResult =
  | {
      ok: true;
      provider: string; // "opencode_go" | "mock" — informational, not a contract enum
      model: string;
      outputJson: unknown; // UNTRUSTED. Zod parse happens in packages/ai.
      usage?: { inputTokens?: number; outputTokens?: number; costCents?: number };
      diagnostics: { latencyMs: number; finishReason?: string };
    }
  | {
      ok: false;
      failureCode: AdapterFailureCode;
      provider: string;
      model?: string;
      diagnostics: { latencyMs: number; detail?: string }; // redacted, no prompts/secrets
    };
```

### Failure taxonomy

Two layers, recorded distinctly in `agent_runs.failure_code`:

```text
adapter layer (AdapterFailureCode):
  provider_timeout        timeoutMs exceeded
  provider_error          transport/5xx or unexpected provider failure
  provider_not_configured missing required config or HTTP 401/403 auth/entitlement failure
  provider_overloaded     rate limit / capacity
  output_not_json         response is not parseable JSON at all
  budget_exceeded         maxCostCents would be exceeded
  policy_violation        adapter detected a disallowed tool request

workflow layer (packages/ai, after the adapter returns ok):
  output_schema_mismatch  Zod parse of outputJson failed
  qa_rejected             deterministic QA gate failed (gate id in failure detail)

enqueue boundary (API, before worker execution):
  queue_enqueue_failed    agent_runs was created but BullMQ add failed
  queue_not_configured    queue infrastructure was unavailable after run creation
```

Rules:

- Provider names, model ids, and OpenCode Go config never leak past the adapter into contracts or UI truth. `provider`/`model` are opaque strings stored as run metadata only.
- On `output_schema_mismatch`, the raw `outputJson` is kept (redacted) in `agent_runs` for diagnosis, and no product row is written.
- `runId` is caller-generated; retrying with the same `runId` must not double-persist opportunities.
- Enqueue-boundary codes live in contracts next to adapter/workflow failures so the Explorer run timeline can render all three layers consistently.
- The mock adapter must cover both adapter failures and `ok: true` with schema-invalid JSON so the worker can exercise `output_schema_mismatch` without a real provider.

### OpenCode Go adapter baseline

```text
OpenCodeGoReasoningAdapter
  lives in packages/adapters
  implements AiReasoningPort
  calls the OpenCode Go OpenAI-compatible chat-completions endpoint
  uses runtime-selected chat-completions models and endpoint https://opencode.ai/zen/go/v1/chat/completions
  sends one JSON-only structured reasoning request
  returns untrusted outputJson only after the provider response is parseable JSON
```

Runtime selection is explicit:

```text
AI_REASONING_PROVIDER=mock          default, local/test safe
AI_REASONING_PROVIDER=opencode_go   requires AI_REASONING_OPENCODE_GO_API_KEY
AI_REASONING_MODEL                  runtime-selected model id
AI_REASONING_OPENCODE_GO_ENDPOINT   default OpenCode Go chat-completions endpoint
AI_REASONING_TIMEOUT_MS             passed to runStructured
```

Task-level model policy:

```text
deepseek-v4-flash
  First practical real smoke/default for the current chat-completions adapter.
  Use for cheap repeated worker runs, first-pass opportunity/search loops, and
  high-volume SERP/query orchestration experiments.

deepseek-v4-pro
  Fallback for harder opportunity/search/SERP reasoning when flash output is too
  weak for query expansion, competitor interpretation, or local-market
  judgement.

glm-5.2
  Strong candidate for page_brief_draft, section_text_generation,
  frontend/page composition, report narrative drafting, and high-quality
  opportunity-scout comparison after cheap baseline artifacts exist.

kimi-k2.7-code
  Experimental judge/reviewer candidate after baseline smoke results exist.

minimax-m3 / qwen3.7 family
  Deferred. OpenCode Go exposes these through the /messages family, so they need
  a separate Anthropic-style adapter before this app can use them.
```

This is a runtime-routing policy, not a product contract. The current
`AI_REASONING_MODEL` setting is intentionally coarse; task-specific model env
keys should be added before automated SERP/search workers land. Model ids still
belong in adapter config and `agent_runs` metadata only.

DeepSeek can be the model behind the future SERP/search worker: it may plan
queries, choose nearby Orte/service combinations to check, call read-only search
or SERP snapshot tools, and interpret the results. The actual snapshot capture is
still a deterministic adapter path (`SerpSnapshotPort` or equivalent) that writes
project-owned rows/artifacts first; rank numbers never enter product truth
because a model said so. In short: DeepSeek can drive the search workflow, but
stored snapshot rows are the evidence boundary.

The adapter maps provider behavior into the existing failure taxonomy:

```text
Abort/timeout                    -> provider_timeout
Missing required provider config  -> provider_not_configured
HTTP 401 / 403 auth or entitlement -> provider_not_configured
HTTP 429 / 503                   -> provider_overloaded
other non-2xx provider response  -> provider_error
invalid completion envelope      -> output_not_json
assistant content not JSON       -> output_not_json
```

Provider response bodies are not persisted. Diagnostics keep only latency, finish reason, and a bounded safe reason code. The worker remains responsible for Zod parsing, deterministic QA, evidence resolution, scoring, and persistence.

If `AI_REASONING_PROVIDER=opencode_go` is selected without `AI_REASONING_OPENCODE_GO_API_KEY`, the worker composition root uses `NotConfiguredReasoningAdapter` instead of crashing the whole worker host. The affected scout run records `provider_not_configured` and fails terminally; deploy, rollback, GSC sync, and website-import workers keep booting.

Deferred provider work:

```text
Mastra internals behind the same port
task-specific model config for search/SERP versus page/frontend reasoning
OpenCode Go /messages endpoint support for MiniMax/Qwen-family models
empirical model benchmarks against Martines/Dachdecker fixtures
real-provider smoke run and prompt tuning from observed run failures
cost budget enforcement beyond recording usage metadata
```

Failure artifact policy:

```text
diagnostics_json
  Always stored on failure, redacted and capped. Include latencyMs, attempt number,
  failureCode, and for QA failures gateId / briefIndex / message.

output_json
  Store only when useful and safe:
    output_schema_mismatch -> redacted size-capped raw model JSON
    qa_rejected            -> parsed but rejected output
    adapter failures       -> no output_json
```

## Opportunity Scout Contracts

All schemas live in `packages/contracts`, parsed with strict Zod (unknown keys rejected). Shapes below are the contract intent; field-level Zod is the implementation.

### EvidenceRef

```text
EvidenceRef {
  sourceType: website_import | gsc_signal | gsc_row | serp_snapshot
            | technical_audit | competitor_snapshot | tracking | field_evidence | manual_note
            | existing_page | ranking_proof | customer_memory
  sourceId?: string          // required above internal_signal, must resolve
  locator?: { url? route? query? pageUrl? sectionId? }
  dateRange?: { from, to }
  summary: string
  excerpt?: string           // capped length; never competitor body text
  observedMetric?: { name, value, unit? }
  strength: weak | medium | strong
  proofTier: internal_signal | supporting_context | customer_safe_proof
}
```

Invariants enforced by QA, not by prayer:

```text
gsc_signal / gsc_row evidence can never carry proofTier customer_safe_proof
customer_safe_proof requires sourceType ranking_proof for MVP
serp_snapshot is supporting_context by default and cannot prove proven_win unless a future ADR promotes a deterministic proof source
technical_audit is supporting_context only; it may explain site issues but never rank truth
competitor_snapshot excerpt length is hard-capped; verbatim reuse downstream is forbidden
```

### NearbyPlaceCandidate, CorridorCluster, and Opportunity Groups

```text
NearbyPlaceCandidate {
  name
  kind: city | district | village | municipality | service_area
  geo?: { lat, lng }
  distanceKm?
  travelTimeMinutes?
  adjacencyReason: near_existing_win | same_corridor | service_radius
                 | competitor_gap | gsc_testing_signal | manual_seed
  existingClusterStrength: none | weak | medium | strong
  competitorWeakness?: string
  mapGroupKey?: string          // UI grouping for map/list surfaces
  evidence: EvidenceRef[]
}

CorridorCluster {
  name
  hubPlace: string
  places: string[]
  rationale: string
  clusterStrength: none | weak | medium | strong
  recommendedSequence: string[] // attack order, e.g. Dachau -> Karlsfeld -> Hebertshausen
}

OpportunityGroupHint {
  key: string
  label: string
  source: gsc_query_cluster | gsc_page_cluster | corridor_cluster | agent_suggested | user_defined
  description?: string
  evidence: EvidenceRef[]
}
```

Martines/Dachdecker calibration (hub Markt Indersdorf; corridors Petershausen/Allershausen/Reichertshausen north-east, Dachau/Karlsfeld/Hebertshausen south, Erdweg/Schwabhausen/Bergkirchen west) is prompt-builder input and test-fixture material, not schema.

GSC/user grouping rule:

```text
GSC-derived groups are value-object hints in the scout output first.
The user may later rename, merge, split, or create custom groups in the UI.
Do not materialize a persistent group table until curation/history actually needs it.
```

### OpportunityBrief

```text
OpportunityBrief {
  projectId
  classification: proven_win | near_term_target | internal_radar | rejected
  service: string               // hint; serviceId resolved on acceptance
  location: NearbyPlaceCandidate                    // explicit target or scouted place
  primaryKeyword
  secondaryKeywords: string[]
  suggestedRoute?: string
  suggestedPageType: normal_page | subdomain | backlog | monitor_only
  evidence: EvidenceRef[]                            // min 1
  competitorObservations: { url, observation, gap? }[]
  corridorCluster?: CorridorCluster
  groupHints: OpportunityGroupHint[]
  hubSpokeRole?: hub | spoke | standalone
  uniquenessRationale?: string   // required when recommendedAction creates anything
  cannibalizationRisk: { level: none | low | medium | high, conflictingRoutes: string[] }
  missingEvidence: string[]      // what would upgrade the classification
  confidence: number             // 0-1, model self-estimate; NOT the score
  rejectionReason?: string       // required when classification = rejected
  recommendedAction: monitor | create_brief | create_page_proposal | hold | reject
}

OpportunityScoutOutput {
  briefs: OpportunityBrief[]     // hard cap per run (start: 12)
  groups: OpportunityGroupHint[]
  runNotes?: string              // operator-facing, customer-invisible
}
```

## Deterministic QA Gates

Run in order after Zod parse; first failure rejects the run with `qa_rejected` + gate id. All gates are pure functions in `packages/ai` with unit tests.

```text
1. evidence_resolution      every required sourceId resolves to a project-owned row
2. proof_tier_containment   only ranking_proof may carry customer_safe_proof for MVP;
                            all other sourceTypes are internal/supporting even when
                            the model marks them as proof
3. proof_gate               proven_win requires >=1 customer_safe_proof ranking evidence;
                            row-backed ranking_proof must match the cited row's rank,
                            query, and pageUrl;
                            otherwise QA downgrades is NOT allowed — the run fails
                            (silent downgrade would hide a lying model)
4. competitor_containment   excerpt caps, no competitor text in keywords/rationale fields
5. uniqueness_gate          create_brief/create_page_proposal requires uniquenessRationale
                            and hubSpokeRole
6. cannibalization_gate     suggestedRoute checked against imported routes (website import
                            evidence) and existing pageProposals.route; collision forces
                            cannibalizationRisk >= medium and blocks create_page_proposal
7. dedupe_gate              no duplicate service+location pair within one run or against
                            open opportunities
8. scoring                  deterministic score computed and attached (see Correction 3)
```

The Entrümpelung Dachau example is the canonical test case: weak GSC impressions on a generic `/entruempelung/` page must come out as `internal_radar` or `near_term_target` with `missingEvidence` populated, never `proven_win`, and `create_brief` only if service fit, unique Dachau intent, SERP gap, and the cannibalization gate all pass.

## Persistence

### opportunities (product artifact)

```text
opportunities
  + classification  opportunity_classification enum, not null
  + agent_run_id    uuid null -> agent_runs.id
  evidenceJson      = full validated OpportunityBrief (the UI reads this)
  score             = deterministic QA score
  status            = lifecycle only (new | monitoring | brief_created | held | rejected)
  decided_by_user_id/status_reason = operator decision provenance
  areaId/serviceId  = null until operator acceptance materializes them
```

Lifecycle decision API:

```text
PATCH /projects/:projectId/opportunities/:opportunityId/status
  permission: opportunity:decide
  status: new | monitoring | held | rejected
  reason required when status = rejected
  brief_created is reserved for the future create-brief side-effect slice
```

This is the first human decision surface. AI classification `rejected` and operator lifecycle `rejected` remain distinct:
the former is the model's verdict inside the brief, the latter is the user's persisted decision.

### agent_runs (minimal audit, new table)

Modeled on the existing `job_runs` conventions (typed status enum, `failureJson`, `startedAt`/`completedAt`):

```text
agent_runs
  id               uuid pk
  project_id       fk projects
  task             agent_task enum (the ReasoningTask union)
  status           agent_run_status enum: queued | running | succeeded | failed
  failure_code     text null      (taxonomy above)
  provider         text
  model            text
  input_ref        text           evidence packet stored via ObjectStoragePort, not inline
  output_json      jsonb null     validated output; raw redacted output only on schema failure
  usage_json       jsonb null     tokens, costCents
  latency_ms       integer null
  started_at / completed_at / timestamps
```

Why `agent_runs` now and not later: a failed run produces zero opportunity rows. Without the table, failures and cost are invisible, and the Opportunity Explorer's run timeline has no data source. Deferred until actually needed: `agent_run_events` (streaming timeline/replay), token-level traces, multi-step tool event logs.

### Worker flow

```text
apps/worker opportunity-scout handler:
  API/enqueuer creates agent_runs row as queued and uses runId as BullMQ jobId
  worker loads run and flips queued/failed -> running
  load website import facts + GSC signals + tracking summary (+ optional SERP/competitor snapshots)
  build redacted evidence packet, persist via ObjectStoragePort, keep input_ref
  build prompt (packages/ai pure builder)
  call AiReasoningPort.runStructured
  Zod parse -> QA gates -> deterministic scoring
  on success: insert opportunities with status new and mark run succeeded in one transaction
  on failure: mark run failed with failure_code, persist diagnostics, write nothing to opportunities
```

Worker invariants:

```text
Opportunities linked to run R may exist only when agent_runs.status = succeeded.
A succeeded run with zero briefs is legal.
Succeeded runs are immutable; no transition out of succeeded is allowed.
Existing succeeded runId means no-op; do not upsert over prior product rows.
Opportunities are inserted only inside the transaction that performs running -> succeeded.
Concurrent same-run delivery uses conditional status transitions; the loser writes nothing.
One agent_runs row spans all attempts of the same runId; job_runs remains queue telemetry.
Only one queued/running opportunity_scout run may exist per project; the DB enforces this with a partial unique index.
```

Run state machine:

```text
queued    -> running      start
running   -> succeeded    success transaction only, WHERE status = running
running   -> failed       adapter/schema/QA failure
failed    -> running      BullMQ retry redo
succeeded -> terminal     no transition out
```

Repository shape:

```text
OpportunityScoutJobDataSchema
  projectId
  runId
  maxBriefs?

handleOpportunityScoutJob(job, dbHandle, reasoning, storage)
  parse job data
  create repository
  executeOpportunityScout(...)

createDrizzleOpportunityScoutRepository(db)
  loadRun(projectId, runId)
  markRunning(projectId, runId, attempt)
  loadEvidence(projectId)
  storePacket(projectId, runId, packet)
  persistSuccess(projectId, runId, opportunities)
  markFailed(projectId, runId, failure)
```

`persistSuccess` owns the transaction. It inserts opportunities and conditionally flips the run to `succeeded`; if the status update affects zero rows, it treats that as a lost race/stale attempt and inserts nothing.

Evidence loading is where project scoping is enforced:

```text
website import facts
GSC signals / rows
tracking summary
existing routes
existing open opportunity keys
ranking_proofs manual ranking evidence
captured serp_snapshots as supporting context
technical_audit findings as supporting context
```

Manual evidence bridge:

```text
ranking_proof is now backed by project-owned ranking_proofs rows.
Only reviewed, fresh ranking_proofs enter Opportunity Scout proof resolution.
Invalidated or stale ranking_proofs are excluded and therefore fail evidence_resolution if cited.
The model cannot improve a proof row by claim: proven_win requires the brief's
ranking_proof observed rank, query, and pageUrl to match the cited row.
Opportunity Explorer should render the
manual ranking-evidence entry path: query, page URL, observed rank, checked-at date,
optional screenshot artifact key, and notes.
```

That bridge makes `proven_win` reachable and testable before search automation. It mirrors the manual SERP-check part of the Martines workflow and lets automated SERP snapshots later replace an operator action rather than invent a new proof model.

Worker vertical acceptance tests:

```text
same runId retry creates no duplicate opportunities or run rows
QA rejection marks run failed and persists zero opportunities
adapter timeout/error/output_not_json marks run failed and persists zero opportunities
ok:true with schema-invalid JSON -> output_schema_mismatch, redacted output, zero opportunities
cross-project evidence sourceId fails evidence_resolution
zero-brief success marks run succeeded with zero opportunities
transient provider failure then retry can flip failed -> running -> succeeded
conditional success race has one winner and no duplicate inserts
redelivery of a running run after crash is safe and does not duplicate
existing routes and open opportunities are loaded from DB and can trigger QA gates
persisted opportunity classification matches evidenceJson; score is stored in the queryable score column only
same project state produces a stable redacted evidence packet
manual ranking evidence resolves as project-owned proof when present
```

Implementation checkpoint:

```text
implemented in the worker baseline
  opportunity_scout job data contract and queue name
  MockReasoningAdapter
  OpenCodeGoReasoningAdapter behind explicit env config
  stable evidence packet builder
  worker handler/repository with failed -> running retry support
  API/operator enqueue endpoint
  opportunity:run project permission
  manual ranking_proofs source rows and API bridge
  ranking_proofs reviewed/invalidated status and freshness filtering
  captured serp_snapshots loaded into the evidence packet as supporting_context only
  technical_audit findings loaded into the evidence packet as supporting_context only
  active-run DB/API guard for queued/running scout runs
  Explorer read APIs for opportunities and agent run summaries
  operator lifecycle decision API with reason/user provenance
  Opportunity lifecycle buttons in the web UI
  agent_runs queued row creation before enqueue
  BullMQ jobId = runId
  ObjectStoragePort input_ref write
  Zod parse, QA/scoring, and success transaction
  succeeded run replay as no-op
  unit tests plus DB-backed integration tests

deferred to the next slices
  live SERP/competitor provider adapters and model-driven orchestration
```

SERP boundary baseline:

```text
SerpScoutPort.search(input)
  read-only driven port for query/locale/device SERP capture.
  DeepSeek or another model can drive the research workflow, but the port writes
  normalized snapshot rows/artifacts before any claim becomes product evidence.

MockSerpScoutAdapter
  default worker adapter for the baseline. It lets the API -> queue -> worker ->
  serp_snapshots path run without live Google/search-provider calls.

serp_snapshots
  project-owned source rows for sourceType = serp_snapshot evidence.
  Stores query, searchEngine, device, locale/region, cacheKey, capturedAt,
  status, provider, normalized results, SERP features, engine errors, and
  artifact refs.
  A row is not customer-safe proof by existence. In the no-paid-SERP-API MVP
  branch, it is supporting_context or internal_signal only.

POST /projects/:id/serp-scout/runs
  enqueues a SERP capture job with jobId = snapshotId and job_runs audit.
  The baseline persists captured or failed snapshots; technical audit,
  operator capture, and search-context tooling remain later slices. Adapter
  output that does not parse as SerpSnapshot, or belongs to the wrong project/id, records
  adapter_invalid_snapshot as a failed snapshot and stops retrying.
```

SERP proof policy after ADR 0015:

```text
manual ranking_proofs are the only customer-safe ranking proof for MVP.

serp_snapshot evidence is loaded as supporting_context when:
  row status = captured
  row belongs to the project
  failed snapshots are excluded
  it is cited as context, not as customer_safe_proof

serp_snapshot evidence cannot support proven_win unless a future ADR explicitly
promotes a deterministic proof source and defines freshness, result attribution,
provider/searchEngine/resultType, and review policy.

Brave/Tavily/model-search/generic browser discovery snapshots stay internal_radar
or supporting_context evidence. They cannot support customer_safe_proof.
```

Technical audit baseline:

```text
technical_audit_runs
  worker run ledger for own-site technical audits.

technical_audit_findings
  project-owned source rows for sourceType = technical_audit evidence.
  First vertical derives deterministic findings from crawler artifacts:
  HTTP status, indexability, canonical, metadata, schema, internal links,
  and crawl skips.

POST /projects/:id/technical-audit/runs
  enqueues a project-scoped audit job through BullMQ and job_runs.
  The worker uses CrawlerPort, stores the crawl artifact key, derives findings
  through pure domain functions, and persists findings for Opportunity Scout.
  TechnicalAudit observes and explains site issues; it does not create
  opportunities and never becomes ranking proof.
```

Explorer backend read baseline:

```text
GET /projects/:projectId/opportunities
  returns project-scoped opportunity rows plus validated OpportunityBrief evidenceJson
  for the table/detail panel.

GET /projects/:projectId/agent-runs?task=opportunity_scout
  returns project-scoped run summaries with typed failure code, selected gate/message,
  provider/model/latency metadata, timestamps, and opportunity counts.
```

## Answers To The Handoff Review Questions

**Is AiReasoningPort too generic or too task-specific?** Right altitude. The closed `ReasoningTask` union prevents a generic "run anything" escape hatch; `outputSchemaName` + external parsing keeps it from becoming task-coupled. Do not add per-task methods to the port.

**OpportunityBrief only, or also PageBrief?** OpportunityBrief only. PageBrief belongs to slice 6 where the page registry prop schemas exist to validate it against. Emitting PageBrief now would mean unvalidatable section content.

**Are the classification states correct?** Yes, with one semantic note: `proven_win` is a report-lane fact, not an actionable opportunity. QA restricts its `recommendedAction` to `monitor`; it feeds slice 10 reporting, never page creation on its own.

**Missing evidence fields?** Added versus the first sketch: `locator`, `dateRange`, `observedMetric`, `proofTier`, `excerpt` cap. Removed: stored `customerVisible` (derived). Deliberately not added: screenshots/artifacts blobs (ObjectStoragePort refs later), evidence hashing (audit depth deferred with `agent_run_events`).

**Persist now vs defer?** Now: `opportunities.evidenceJson` + `classification` + `agent_run_id`, minimal `agent_runs`. Deferred: `agent_run_events`, streaming, replay, per-step tool audit.

**Failure modes that could let LLM output become unsafe product truth?** Each mapped to a gate: invented evidence (gate 1), self-promoted proof (gates 2-3), competitor copying (gate 4), thin doorway pages (gates 5-7), self-graded ranking (gate 8 / Correction 3), provider type leakage (adapter boundary + opaque provider strings), silent partial persistence (all-or-nothing run persistence, idempotent runId).

## UI Pressure Test (No UI Built In This Slice)

The Opportunity Explorer design from the handoff is used only to verify the contracts carry what the UI will need. Checked against the card/panel spec:

```text
card needs          -> contract source
service/Ort         -> brief.service / brief.location
classification      -> opportunities.classification
score band          -> opportunities.score (deterministic)
evidence tier       -> max EvidenceRef.strength
proof tier          -> max EvidenceRef.proofTier
existing page match -> cannibalizationRisk.conflictingRoutes
corridor cluster    -> brief.corridorCluster (+ mapGroupKey for map grouping)
GSC/user grouping   -> brief.groupHints / output.groups
competitor notes    -> brief.competitorObservations
missing evidence    -> brief.missingEvidence
next action         -> brief.recommendedAction
run timeline        -> agent_runs rows
```

No contract field exists solely for a UI that does not exist yet except `mapGroupKey`, `recommendedSequence`, and `OpportunityGroupHint`. These are deliberately cheap value objects because the Opportunity Explorer needs GSC clusters and eventual user grouping from the beginning, and adding them later would force a breaking evidence-shape migration. Everything else the frontend design prompt asks for (routes, TanStack boundaries, Page Studio zones) stays in the referenced frontend docs and starts after this slice lands.

## Out Of Scope For This Slice

```text
Mastra multi-agent orchestration (single scout task first)
agent_run_events / streaming timeline
additional Explorer UI beyond the current table/detail/run/proof/decision baseline
PageBrief / page proposal generation
read-only tool plumbing beyond what the worker loads directly
MapLibre, RAG, agent memory
```

## Open Decisions (Non-Blocking, Defaults Chosen)

```text
timeoutMs default            120_000 for opportunity_scout
briefs-per-run cap           12
maxCostCents default         provider-config concern, start unenforced but recorded
provider config              adapter env vars, never in contracts
model routing                deepseek-v4-flash for first scout smoke /
                             cheap repeated runs; deepseek-v4-pro fallback for
                             harder search/opportunity reasoning; glm-5.2 for
                             page/frontend/content/report quality comparison
```
