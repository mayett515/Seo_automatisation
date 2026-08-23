# 0022 - Agentic Runtime And Evidence Ledger

Date: 2026-08-08
Status: Accepted

## Context

At decision time, the repository already used AI in production-shaped worker lanes but did not yet run a product-integrated Mastra workflow. `AiReasoningPort` supported bounded structured calls through mock or OpenCode Go adapters. Slices 1-7 now implement the purpose-named Opportunity Research workflow while preserving the original boundary: evidence packets, PostgreSQL product rows, deterministic QA, human approval, deploy workers, and verification keep model output from becoming authority.

The implemented milestone adds direct DeepSeek-backed Mastra orchestration and read-only research tools. That introduced durable questions that the earlier single-call header could not answer safely:

- Which workflow and policy version ran?
- Which typed step or specialist agent produced a result?
- Which tool calls were allowed, blocked, or failed?
- Which durable source rows were read, captured, cited, or rejected?
- How does BullMQ recovery interact with a Mastra checkpoint after a crash?
- Which data is product truth, which is execution audit, and which is disposable framework telemetry?

The failure mode to avoid is a generic `agent_data` JSON blob or framework-owned checkpoint becoming the source of truth for SEO evidence, product state, approval, or recovery.

A focused Good Artist pass already inspected Mastra, AG-UI, Activepieces, Kestra, agent-trace, RAGFlow, Cognee, and related agent/evidence systems. The reusable pattern is a run header, typed steps, an append-only event timeline, immutable artifact/evidence references, and explicit human/product authority. No external code is copied.

Current Mastra documentation reinforces the same separation:

- workflows use schema-validated steps and explicit control flow;
- workflow snapshots persist suspend/resume and restart state;
- observability traces workflow steps, tool calls, and model interactions;
- storage separates workflow, observability, memory, evaluation, and background-task domains.

Those are useful runtime capabilities. They are not a reason to replace the product's PostgreSQL aggregates, BullMQ transport policy, deterministic QA, or durable approval rows.

## Decision

### 1. Keep Three Truth Layers Separate

```text
SEO source truth
  website imports, GSC rows/signals, ranking proofs, SERP snapshots,
  technical audits, tracking summaries, public-page capture artifacts

Agent execution truth
  agent_runs, agent_run_steps, agent_run_events,
  agent_run_evidence_items, agent_run_step_evidence_links

Product result truth
  opportunities, page proposals, section-copy suggestions,
  page versions, reports, release plans, deployments, verifications
```

The layers may reference one another but must not substitute for one another.

- A tool event is not SEO evidence.
- An evidence link is not a product decision.
- A succeeded agent run is not an approved page or release.
- A Mastra snapshot is not recovery truth.
- An observability trace is not an audit row required for a product invariant.

### 2. One Product Workflow Run Has One `agent_runs` Header

`agent_runs` remains the durable top-level lifecycle and the identity used as the BullMQ `jobId` and Mastra workflow `runId`.

Workflow-backed runs add a versioned identity group:

```text
workflow_name
workflow_version
constraint_profile_version
requested_by_user_id
input_sha256
output_sha256
execution_epoch
execution_claim_token
execution_recovery_count
last_heartbeat_at
```

Legacy single-call rows may keep this group null during migration. A workflow-backed row must provide the complete group through a database CHECK.

Provider and model remain opaque audit strings. DeepSeek-specific request fields, Mastra types, prompts, API keys, and SDK objects do not enter shared product contracts or database truth.

Specialist agents inside one workflow are steps, not independent top-level runs. A child gets its own `agent_runs` row only when it has an independently admitted lifecycle, retry/recovery policy, product subject, and operator-visible result.

The existing top-level status vocabulary remains `queued | running | succeeded | failed` for the first workflow. Product review happens after a successful research run through existing opportunity/page/release state machines. Mastra suspension must not be used as a substitute for product approval. Adding a durable suspended product state requires a later explicit state-machine decision.

Each owning worker delivery has one monotonically increasing `execution_epoch`, one opaque claim token, and the exact recovery generation under which it was claimed. A newer delivery must atomically terminalize any prior-epoch running step before taking ownership. New step, event, tool-capture, success, and failure writes require the current epoch; a late response from an older delivery therefore matches no writable product truth. Parent terminalization also binds pending-step failure evidence to the parent's current epoch, including epoch zero before the first worker claim. Long-running model/tool work renews `last_heartbeat_at` only under the exact current epoch, token, recovery generation, run, project, and active research-state identity. Recovery eligibility for running work uses that heartbeat; queued work uses ordinary update time. An already-succeeded step is an immutable checkpoint and may be replayed by a newer epoch, while failed or unfinished work must be reclaimed under that newer epoch. Recovery deliveries additionally bind to the exact system `job_runs` row and `recovery_count` generation created by the PostgreSQL recovery claimant. A recovery reservation receives its own purpose-bound audit identity. A committed active reservation is reused after a crash before enqueue instead of consuming another recovery generation or writing another `recovery.claimed` event. If transport becomes active after reservation, only that recovery audit is cancelled; the still-valid original audit is not archived or rewritten.

### 3. Add Typed Step Truth

The persistence foundation adds `agent_run_steps` with this conceptual shape:

```text
agent_run_steps
  id
  project_id
  agent_run_id
  step_key
  step_kind                 workflow | agent | tool | qa | persist
  status                    pending | running | succeeded | failed | skipped
  attempt_count
  execution_epoch
  row_version
  agent_role                nullable closed role name
  tool_key                  nullable closed tool name
  provider / model          nullable opaque audit strings
  input_ref / input_sha256  nullable bounded artifact identity
  output_ref / output_sha256
  output_canonical_text      application-canonical exact UTF-8 bytes
  output_json               nullable strict bounded projection
  usage_json                nullable strict bounded usage
  failure_code / failure_message
  started_at / completed_at / created_at / updated_at
```

Required invariants:

- `(agent_run_id, step_key)` is unique.
- `project_id` must match the parent run.
- step kind controls which identity fields are legal;
- only `pending -> running -> succeeded|failed` and `pending -> skipped` are legal;
- retry uses `failed -> running` with a bounded attempt increment;
- succeeded/skipped step payload, digests, provider/model, and usage are immutable;
- guarded `failed -> running` clears current failure/output fields, increments the attempt, and leaves prior-attempt facts in append-only events;
- step output is application-canonicalized, persisted as exact UTF-8 text plus JSON, and SHA-256-verified before the terminal transition;
- all step claims use row/status compare-and-set and no lock spans a provider or tool call.
- a running attempt is owned by exactly one parent execution epoch; takeover fails the old attempt with durable evidence before retrying it under the new epoch.
- succeeded checkpoints remain immutable across execution takeover; replay recomputes canonical text and SHA-256 from stored JSON and requires both to equal the persisted byte/digest evidence. Final workflow success requires the exact canonical step keys, kinds, agent/tool identities, dependency order, completed outputs, and final strategy digest, with no unresolved step.

Workflow definitions own stable `step_key` values. Renaming or changing the meaning of a step requires a workflow-version bump.

`agent_run_steps` represent declared workflow/retry boundaries. Dynamic model-selected tool calls are events plus evidence links unless the workflow explicitly promotes one to a stable retryable step.

### 4. Add An Append-Only Product Event Timeline

The persistence foundation adds `agent_run_events` for compact operator/audit events:

```text
agent_run_events
  id
  project_id
  agent_run_id
  agent_run_step_id          nullable
  sequence                   DB-assigned global identity
  event_key                  idempotency key
  event_type                 closed contract vocabulary
  payload_json               strict, redacted, bounded
  artifact_ref / artifact_sha256 nullable
  occurred_at
  created_at
```

`sequence` is globally unique and database-assigned; `(agent_run_id, sequence)` is indexed for timeline reads and `(agent_run_id, event_key)` is unique for idempotency. Event insertion does not lock the parent run merely to allocate order. Event rows are append-only: normal application paths may not UPDATE or DELETE them.

Initial event categories are:

```text
run.queued
run.started
run.succeeded
run.failed
step.started
step.succeeded
step.failed
step.skipped
tool.call.requested
tool.call.allowed
tool.call.blocked
tool.result.captured
tool.call.failed
evidence.bound
qa.gate.passed
qa.gate.failed
proposal.persisted
recovery.claimed
recovery.exhausted
```

Events record decisions and correlations, not raw chain-of-thought or full payloads. Token deltas and every model stream chunk are observability data, not product events.

A lifecycle transition and its required product event are written in the same transaction. Optional Mastra/OpenTelemetry export may lag or disappear without invalidating product truth.

### 5. Bind Runs And Steps To Durable Evidence

The persistence foundation adds two related projections.

`agent_run_evidence_items` records one immutable, source-backed evidence identity per run:

```text
agent_run_evidence_items
  id
  project_id
  agent_run_id
  evidence_key
  source_kind
  source_id
  source_version
  payload_sha256
  observed_at
  proof_tier
  evidence_json             strict bounded audit projection
  created_at
```

`agent_run_step_evidence_links` records how a step used that evidence:

```text
agent_run_step_evidence_links
  project_id
  agent_run_id
  agent_run_step_id
  evidence_item_id
  role                      input | captured | cited | rejected
  ordinal
  created_at
```

Required invariants:

- every evidence item belongs to the same project and run as every link;
- `(agent_run_id, evidence_key)` is unique;
- source kind is a closed contract, not arbitrary text;
- each implemented source kind has a typed durable resolver and, where practical, a typed FK column plus a source-reference CHECK;
- `source_version` is selected with the server-owned evidence packet and must still equal current admissible durable source truth every time evidence is bound or rebound; `payload_sha256`, timestamps, proof tier, and bounded evidence projection are re-derived by the database, never accepted from a model;
- evidence binding locks selected source rows in stable source-kind/id order before the parent run. An earlier database trigger applies the same source-before-parent order to direct inserts. Source mutations may mark research state dirty, while recovery locks research state before the run; the shared order prevents those paths from forming a three-way wait cycle;
- a tool result is first normalized into a source row or immutable artifact, then linked as evidence;
- evidence rows and links are write-once while the run is active and frozen when it is terminal;
- evidence proof tier comes from source policy, never model confidence;
- an event or Mastra trace cannot satisfy an evidence reference.

The first persistence slice implements only source kinds required by the first Opportunity Research workflow. New kinds require contract, resolver, tenancy, version/digest, freshness, and proof-tier tests.

### 6. Mastra Owns Orchestration, Not Product Authority

The first real agentic workflow is a closed Opportunity Research workflow composed from typed Mastra steps. It may use Research and SEO Strategy agents behind a purpose-named application port. It is not a generic arbitrary-workflow executor.

```text
BullMQ delivery
  -> claim agent_runs row
  -> create/recover Mastra run with runId = agentRunId
  -> execute typed research-plan agent step
  -> execute typed follow-up-capture tool step from the persisted exact plan
  -> execute typed SEO-strategy agent step
  -> call only profile-allowed read tools
  -> persist normalized source evidence
  -> run deterministic QA
  -> persist opportunities and terminal run truth transactionally
```

The worker depends on the purpose-named `OpportunityResearchPort`. A concrete `MastraOpportunityResearchAdapter` owns Mastra agents, workflow definitions, hooks, storage, and DeepSeek model wiring. Mastra and provider SDK types do not cross the port. A generic `runAnyWorkflow(name, payload)` port is forbidden.

`AiReasoningPort` remains valid for bounded single-call tasks. Existing Opportunity Scout, Page Proposal, section-copy, and report-narrative paths are not rewritten merely to prove framework adoption.

The V2 workflow persists the initial captures, Research Agent output, and exact normalized follow-up query list as the `research-plan-agent.v2` step result before any follow-up request runs. `follow-up-capture.v2` consumes only that stored plan. On crash/restart, a changed model response cannot silently produce a different tool plan. Mastra persisted status is inspected only after PostgreSQL grants execution ownership: successful framework state replays, running/failed state restarts through the same ledger boundaries, and suspended/paused framework state fails closed because no corresponding product state exists. A Mastra `success` result alone is insufficient: PostgreSQL admits product success only when the exact ResearchAgent, `public_web_search_follow_up`, and SeoStrategyAgent step identities are succeeded in dependency order, their immutable execution epochs are no newer than the owning run, and the strategy step owns the exact final output digest.

### 7. Mastra Storage And Observability Are Operational Data

Mastra workflow storage may persist checkpoints so a process can restart or inspect a workflow. It must use a dedicated schema/database identity and must not share ownership of application tables.

Only the product recovery controller may decide that a stale run is reclaimable. A recovery worker first wins the PostgreSQL compare-and-set claim, then asks the Mastra adapter to resume/restart the exact `agentRunId`. Mastra auto-restart, schedules, or background tasks must not independently advance product runs.

Mastra observability may record traces, logs, latency, cost, model interactions, and tool spans. It is optional operational telemetry:

- it cannot satisfy product audit or evidence invariants;
- production exporters stay disabled until redaction tests prove secrets, full prompts, customer content, and provider bodies are excluded;
- sensitive-data filtering is mandatory before any external exporter;
- retention may be shorter than product retention;
- losing telemetry must not change run, evidence, approval, or product state.

Persistent Mastra memory, RAG, long-running goals, schedules, and background-task ownership remain deferred. The first workflow receives a bounded server-owned evidence packet and does not remember prior customer conversations.

### 8. Tool Calls Are Curated, Read-Only, And Evidence-Producing

The first live tools are application-owned, strictly typed, timeout-bounded research capabilities. They are curated into ADR 0019 categories rather than exposed through a broad MCP or dynamic tool registry.

The Mastra adapter enforces policy in `beforeToolCall`-equivalent hooks and records requested/allowed/blocked outcomes. The tool itself still re-validates project scope and input. A model cannot grant itself access by naming a tool.

The first live discovery tool is an application-owned DuckDuckGo HTML-search adapter behind `PublicWebSearchPort`. It is deliberately separate from `SerpScoutPort`:

- `SerpScoutPort` models provider-backed SERP snapshots and may contain an observed result rank;
- `PublicWebSearchPort` models broad web discovery only and must not expose `rank`, `position`, or an implied Google ordering;
- every DuckDuckGo call persists a normalized `public_web_search_captures` row before it can be linked as evidence;
- requested, effective, and observed locale are separate fields;
- requested region and bounded result count are part of immutable request identity;
- every provider response is re-fenced against the current execution epoch immediately before capture insertion;
- captures are `research_support_only` and can never satisfy ranking-proof or customer-safe-proof gates.

V1 does not expose a generic public-page reader, a browser-action tool, Google Maps extraction, or an MCP search catalog. A later page reader requires its own SSRF, robots, byte, content-type, redirect, and retention decision.

Initial research tools must not:

- authenticate as the customer;
- submit forms or mutate browser state;
- bypass CAPTCHA, robots, or provider controls;
- write ranking proof;
- treat search/provider output as customer-safe proof;
- pass unbounded raw pages or competitor copy to the model.

Provider-native web search is not the evidence boundary. Product-owned tools must normalize results into the existing source tables/artifacts first.

### 8A. Project Knowledge Is PostgreSQL Markdown, Not Framework Memory

Project-specific business context is stored as versioned Markdown records in PostgreSQL under ADR 0023. Model retrieval requires the current approved, non-retired, task-scoped version and an explicit immutable `model_allowed` policy; approval alone is not model-use consent. Agent-authored versions always enter `proposed`; a human-authored version may enter `approved` only through an actor-bound command. An actor-authorized retirement clears the current pointer while preserving immutable historical versions and prevents reactivation or further review/version writes on that document.

Knowledge retrieval in V1 uses typed task scopes plus PostgreSQL `simple` full-text search. It does not use embeddings, a vector database, Mastra memory, or a generated hidden-folder index. Knowledge records can support research, but they are not ranking proof merely because they are approved.

### 8B. Opportunity Policy Uses Independent Axes

New Opportunity Research results do not persist a model-owned magic score. They use independent closed axes:

```text
ranking milestone   unverified | outside_top_10 | top_10 | top_5 | top_3 | rank_1
evidence readiness  internal_signal | supporting_context | reviewed_proof
business value      unknown | low | medium | high
market difficulty   unknown | low | medium | high
execution effort    unknown | low | medium | high
lane                defend_advance | quick_win | build_cluster | strategic_market
```

Exact ranking milestone is derived only from a current reviewed `ranking_proofs` row. DuckDuckGo, GSC, SERP snapshots, knowledge records, and model confidence cannot promote it. Evidence readiness is source-policy-derived. Model confidence is retained only as a diagnostic.

The server derives the lane from the validated axes and applies a deterministic portfolio policy only after excluding all existing non-rejected project candidate keys and deterministically deduplicating the current run by canonical service/area/keyword identity:

```text
maximum candidates considered per run: 20
defend_advance slots: 2
quick_win + build_cluster combined slots: 4
strategic_market slots: 2
cross-lane slot filling: forbidden
unused capacity: persisted and displayed as a shortfall
```

Sorting uses evidence readiness, business value, market difficulty, execution effort, and stable text/id tie-breakers. Run-scoped candidate ids are content-addressed so crash retries cannot change an equal-ranked duplicate winner. No model-defined order is authoritative.

### 8C. Research Admission And Scheduling

A project is research-ready only when all of the following are durable truth:

- the current business-profile revision is confirmed;
- at least one canonical service is confirmed;
- at least one canonical area is confirmed;
- at least one eligible source exists (approved knowledge, completed website import, GSC evidence, reviewed ranking proof, or approved source configured by a later decision);
- Opportunity Research is not paused.

Material source changes mark a project research state `needs_research` and update a deterministic material digest. The digest binds source versions, the canonical server-owned evidence packet, and the exact initial query seeds rather than only source ids. A bounded scanner enqueues eligible dirty projects and also performs a weekly safety scan. Only states whose `next_scheduled_at` is due are candidates; an incomplete project is rescheduled one day later instead of being rescanned every interval. The worker host currently invokes this scanner from its shared 60-second lifecycle loop and reuses `WORK_RECOVERY_BATCH_SIZE` as the due-candidate cap. The scanner uses the same DB-before-queue and deterministic `jobId = agentRunId` rules as explicit reruns. Pausing prevents new admission but does not silently cancel an already running workflow.

The project research state and active workflow run are a deferrable database-enforced invariant. A terminal state cannot abandon a queued/running workflow, and succeeded state must reference durable success for the same material digest. Persisted research opportunities are durable immutable strategy projections: each row must match one exact candidate in the succeeded strategy output, its service/area must be confirmed same-project truth, and every cited key must resolve through the succeeded strategy step's evidence ledger. Later operator lifecycle decisions may change status/reason evidence but cannot rewrite or hard-delete the underlying research strategy or provenance.

The first workflow is bounded to two research rounds, at most twelve search queries total, at most three follow-up queries, five normalized links per query, and sixty raw links before canonical-URL deduplication. Search seeds come from confirmed service x area pairs, GSC queries, and approved scoped knowledge. Every model-visible public-search capture carries the server-derived `public_web_search_capture:{captureId}` evidence key that the ledger and deterministic QA resolve. The workflow makes no exact search-volume or Google-difficulty claim.

### 9. Direct DeepSeek Is An Adapter Decision

The first Mastra runtime uses a direct DeepSeek API adapter with a configurable Flash-class default and explicit timeout, retry, cost, and failure mapping. Before every provider attempt, the worker reloads the current project material identity and model-use eligibility, then a bounded deterministic egress gate rejects obvious private-key, credential, bearer-token, and secret-assignment shapes. Provider retries repeat both checks and cannot rely on admission-time material. This is defense in depth rather than a general DLP claim; server-owned packet construction and explicit knowledge model-use policy remain the primary disclosure boundaries. A deterministic `model_egress_blocked` result terminalizes the current material attempt without immediately scheduling the same digest again. The exact model id is runtime configuration verified against the current provider API, not a persisted contract enum.

Promotion evidence is version-bound. A calibration manifest names and digests the workflow version, constraint profile, research/strategy prompts, exact deterministic fixture-corpus bytes, and configured model id. Passing the local fixture corpus is necessary but is not a credentialed provider smoke result; production model changes still require the named sanitized smoke/calibration evidence.

Migration 0051 is a pre-activation hardening migration: it intentionally aborts if a succeeded workflow checkpoint already exists because historical rows do not retain the exact canonical bytes needed for a truthful backfill. Deploy migrations 0047-0054 before enabling Opportunity Research workers. 0052-0054 repair trigger defects found by the first real-PostgreSQL integration campaign (agent_runs output_ref reference, step_key variable collision, jsonb text-concatenation precedence). If an interrupted rollout allows 0047-0050 work to succeed first, stop those workers and perform an explicit operator-reviewed ledger reset or canonical-byte backfill before retrying 0051; do not synthesize canonical text from `jsonb::text`.

The existing OpenCode Go adapter is removed only after equivalent direct-DeepSeek tests and a credentialed smoke pass succeed. Provider replacement must not change workflow contracts, evidence schemas, product QA, or product truth.

### 10. Recovery And Crash Convergence

The first workflow remains a `read_analyze` ADR 0018 lane. It uses `jobId = agentRunId`, deterministic step keys, bounded attempts, and no provider mutation.

Key timelines:

```text
duplicate delivery before step claim
  one step CAS wins; loser no-ops or returns already_active

provider call exceeds one recovery interval
  exact-owner heartbeat renewals keep the running delivery fresh; a stale token,
  epoch, recovery generation, project, or active-state binding updates zero rows

new BullMQ attempt or recovery delivery takes ownership
  parent execution_epoch advances exactly once, any prior-epoch running step becomes
  failed with an exact step.failed event, and the new owner may retry it

tool result stored, crash before step success
  retry resolves the same deterministic source identity and payload digest,
  links it idempotently, then completes the step

step succeeds, crash before next step
  recovery wins the product run claim, verifies the stored step output digest,
  reuses the immutable checkpoint, and resumes/restarts unfinished work under
  the new execution epoch

research plan succeeds, crash during follow-up capture
  retry replays the stored exact follow-up query list; it cannot ask the model to
  replace the tool plan before continuing the capture step

late model/tool response after run failure
  terminal run/step CAS matches zero rows; no evidence or product result is promoted

late public-search response after execution takeover
  the capture transaction locks the run and rejects the stale epoch before INSERT

Mastra checkpoint and BullMQ recovery both notice stale work
  only the PostgreSQL recovery claimant may invoke resume/restart;
  framework state alone cannot advance product truth

recovery claim commits, then original transport appears active
  the recovery reservation remains durable, its new recovery audit is cancelled,
  and the original generation remains claimable until a genuine takeover occurs

recovery claim commits, then the scanner crashes before enqueue
  the next scan reuses the same active purpose-bound recovery audit and generation,
  checks transport again, and enqueues at most once under the same job id

source bytes or source row changed after selection
  selected source version and durable payload recheck fail closed before QA or product persistence

event append races duplicate retry
  deterministic event_key makes one insert win; replay verifies the existing event
```

Completed BullMQ transport with a non-terminal product run remains inconsistent work and follows ADR 0018 terminalization/recovery rules.

### 11. Disclosure, Privacy, And Retention

Operator APIs may expose bounded step/event/evidence summaries after project/permission checks. Public projections omit event payloads and step failure messages entirely; they may expose only stable failure codes and source-backed citation summaries. They must not expose storage keys, raw prompts, full tool arguments/results, provider responses, customer secrets, OAuth tokens, or hidden reasoning.

Persist:

- workflow/step/tool identifiers;
- source ids, versions, digests, timestamps, and proof tiers;
- policy and QA gate decisions;
- provider/model, latency, token/cost summaries;
- bounded redacted errors and artifacts by opaque API capability.

Do not persist:

- chain-of-thought or hidden reasoning;
- streaming token deltas;
- full public/competitor pages when a normalized excerpt or artifact is sufficient;
- API keys, cookies, auth headers, browser session data, or CAPTCHA material;
- raw provider bodies as product evidence.

Operational trace retention is configured independently. Initial product event rows are not physically deleted; a later event-retention workflow requires an explicit policy and migration. Product evidence required by a surviving product result must not be deleted merely because its originating run is old.

## Implementation Slices

### Slice 0 - Design (This Slice)

- accept the truth-layer, persistence, runtime, and recovery boundaries;
- update ADR 0019 and roadmap language;
- do not add runtime code or tables.

### Slice 1 - Persistence Foundation (Implemented 2026-08-09)

- strict contracts and domain state decisions;
- `agent_runs` workflow identity fields;
- `agent_run_steps`, `agent_run_events`, evidence items, and step links;
- database constraints, transition/immutability triggers, indexes, and repository helpers;
- real PostgreSQL tests for tenancy, exact evidence identity, terminal freeze, event idempotency, and concurrent claims;
- no Mastra execution or live tools.

### Slice 2 - Business Profile, Knowledge, And Proof Foundation (Implemented 2026-08-09)

- revisioned project business profiles plus confirmed canonical services/areas;
- website-import confirmation command with source provenance;
- PostgreSQL Markdown knowledge records, immutable versions, typed links, task scopes, approval workflow, and `simple` full-text search;
- ranking proof `captured -> reviewed -> invalidated` lifecycle with actor-bound compare-and-set commands;
- no embeddings, vector database, or framework memory.

### Slice 3 - Opportunity Research Policy (Implemented 2026-08-09)

- orthogonal opportunity axes and deterministic lane policy;
- material research-state digest, pause/resume/rerun controls, and readiness decision;
- deterministic candidate dedupe and 2/4/2 portfolio allocation with visible shortfalls;
- compatibility read of legacy classification/score while new workflow rows leave those fields null.

The 2/4/2 allocation is the first operator-calibration policy, not permanent market truth. Change it only from observed workflow use and keep shortfalls visible rather than silently cross-filling lanes.

### Slice 4 - Direct DeepSeek And Mastra Runtime (Implemented 2026-08-09)

- `OpportunityResearchPort` plus concrete `MastraOpportunityResearchAdapter`;
- direct DeepSeek configuration and adapter tests;
- one typed V2 workflow with separately persisted research-plan, follow-up-capture, and strategy steps;
- product-run/step/event projection hooks and redaction tests;
- dedicated Mastra workflow storage with product-owned recovery invocation;
- exact framework-status replay/restart/reject behavior and crash replay of the persisted follow-up plan;
- keep OpenCode Go for existing bounded lanes until parity and credentialed smoke evidence justify removal.

### Slice 5 - DuckDuckGo Research Capture (Implemented 2026-08-09)

- separate `PublicWebSearchPort` contract and owned DuckDuckGo HTML adapter;
- normalized `public_web_search_captures` rows with locale, ordinal, failure taxonomy, bounded result count, and `research_support_only` policy;
- no `rank`/`position`, public-page reader, browser acting, auth sessions, CAPTCHA bypass, MCP server, or proof promotion;
- fixture, parser, timeout, policy, and controlled live-smoke coverage.

### Slice 6 - Opportunity Research Workflow (Implemented 2026-08-09)

- Research Agent and SEO Strategy Agent steps;
- confirmed-profile, service, area, GSC, approved-knowledge, ranking-proof, and captured-search evidence packet;
- two rounds, twelve-query cap, three-follow-up cap, top-five links per query, and sixty-link pre-dedupe cap;
- deterministic synthesis/QA, axis derivation, canonical dedupe, portfolio allocation, and opportunity persistence boundary;
- stable evidence citations and dedupe/cannibalization checks;
- due-only material-dirty plus weekly scheduling, one-day not-ready deferral, and duplicate-delivery integration tests;
- execution-epoch fencing for runs, steps, events, captures, and terminal writes;
- exact user/system/recovery job-run ownership, crash-reusable pre-enqueue recovery reservations, prior-attempt step reclamation, immutable checkpoint replay, completed-transport inconsistency, and bounded exhaustion;
- exact three-step PostgreSQL completion proof, state/run consistency, packet/query-bound material identity, and strategy/evidence-bound opportunity projection.
- exact-owner heartbeat renewal, pending-step epoch binding, distinct recovery audit generations, pre-enqueue crash reuse, and post-claim active-transport convergence;
- application-canonical checkpoint bytes plus database byte/digest checks and replay-time canonical recomputation;
- current-source eligibility checks on every evidence binding, database-enforced knowledge/proof actor authority, explicit knowledge model-use consent, non-destructive retirement, per-attempt material/secret egress checks, and an exact-corpus-digest promotion manifest.

### Slice 7 - Operator Controls, Timeline, And Observability (Implemented 2026-08-09)

- project-scoped profile confirmation, knowledge review, proof confirmation, pause/resume/rerun, and bounded run/step/event/evidence APIs;
- Opportunity Explorer axes, lane, portfolio order, exact citations, unknowns, shortfalls, selectable run history, and stable-code failure/QA visibility;
- map/bundle-compatible data shape without a V1 map provider or visualization;
- optional redacted Mastra observability exporter remains deferred until privacy tests establish a need;
- no raw trace or storage disclosure.

Memory/RAG, autonomous browser action, broad MCP catalogs, generic workflow builders, and agent-owned production commands remain separate decisions triggered only by a concrete product need.

## Consequences

The system gains a durable explanation of what agents did and which evidence they used without making framework state a second product database. Direct DeepSeek or later provider changes stay adapter-local. Mastra can provide typed orchestration, restartable workflows, and rich telemetry while BullMQ/PostgreSQL continue to own transport and product recovery.

The cost is additional normalized persistence and transactional event writing. That is intentional. A source-backed evidence ledger and bounded event timeline are cheaper to operate and safer to query than a generic replay blob whose semantics drift with framework versions.

The first workflow is deliberately narrow. It proves one useful research-to-opportunity path before adding memory, RAG, browser acting, a tool marketplace, or a general multi-agent platform.

## Alternatives Considered

- **Let Mastra storage own all run and workflow truth.** Rejected because product state, tenancy, approval, evidence, and ADR 0018 recovery need stable application-owned invariants independent of framework schemas.
- **Store one generic agent JSON document.** Rejected because tenancy, lifecycle, evidence identity, retention, operator queries, and race guarantees would be app-only and hard to validate.
- **Create one `agent_runs` row per specialist agent.** Rejected for the first workflow because the specialists share one admitted product lifecycle and recovery unit. Steps carry the required attribution without inventing nested product runs.
- **Persist every model/tool stream event.** Rejected because token streams and raw payloads are high-volume observability data, not product audit truth.
- **Use Mastra HITL as product approval.** Rejected because page, release, rollback, and publication approval already belong to durable actor-bound product state machines.
- **Adopt memory/RAG before live tools.** Rejected because the first workflow can use bounded direct evidence packets and source-backed captures. Retrieval starts only after a measured context or reuse need.
- **Replace every existing reasoning path with Mastra immediately.** Rejected because the current constrained single-call lanes work and do not need risky framework-driven rewrites.
- **Treat DuckDuckGo result order as Google rank.** Rejected because discovery order is provider-dependent research context and cannot replace a reviewed ranking proof.
- **Keep one opportunity score.** Rejected because rank evidence, business value, market difficulty, execution effort, and evidence readiness have different owners and uncertainty.

## Regression Guard

Future agentic work must not:

- treat Mastra snapshots, traces, memory, or workflow status as product truth;
- let Mastra auto-restart independently of the PostgreSQL recovery claimant;
- let a recovered or retried delivery write without the current execution epoch and exact recovery generation;
- consume a new recovery generation while the current purpose-bound reservation is still active but transport has not yet been enqueued;
- recover a running workflow from stale `updated_at` while its exact-owner heartbeat is fresh;
- terminalize a pending step with failure evidence from an execution epoch other than its parent run's current epoch;
- recompute model-derived follow-up tool plans after their plan step has durably succeeded;
- replay a succeeded checkpoint without recomputing and matching its canonical text and SHA-256;
- persist raw chain-of-thought, token streams, secrets, or full provider bodies;
- treat tool events as evidence or evidence links as product approval;
- introduce arbitrary source kinds without typed tenancy/version/digest/proof policy;
- bind or rebind evidence without rechecking the source's current project, status, version, freshness, and source-specific admissibility;
- expose a broad dynamic tool/MCP catalog to a product agent;
- let specialist agents widen the parent constraint profile;
- let search, SERP, public-page, browser, or model output become customer-safe proof by model assertion;
- add DeepSeek- or Mastra-specific fields to product contracts or domain entities;
- rewrite working bounded single-call lanes merely to maximize framework usage.
- conflate DuckDuckGo discovery order with Google rank or ranking proof;
- add vectors/embeddings before a measured retrieval failure;
- collapse opportunity strategy back into one score or classification;
- let agent-authored Markdown knowledge self-approve.
- create or review project knowledge or ranking proof without database-verified project actor authority;
- treat ordinary knowledge approval as model-use consent or delete history during retirement;
- retry around the current-material/model-egress gates, call a provider before both gates run, or immediately reschedule the same material digest after deterministic egress rejection;
- promote a model from unversioned fixture bytes or prompt/model identity that the promotion manifest does not bind and digest exactly;
- allocate 2/4/2 portfolio slots before project-wide and same-run candidate deduplication.

## External References

- Mastra workflows overview: https://mastra.ai/docs/workflows/overview
- Mastra suspend and resume: https://mastra.ai/docs/workflows/suspend-and-resume
- Mastra storage overview: https://mastra.ai/docs/storage/overview
- Mastra observability overview: https://mastra.ai/docs/observability/overview
- Mastra tools: https://mastra.ai/docs/agents/using-tools
- AG-UI protocol: https://github.com/ag-ui-protocol/ag-ui
- Activepieces: https://github.com/activepieces/activepieces
- Kestra: https://github.com/kestra-io/kestra
- Cursor agent trace: https://github.com/cursor/agent-trace

No external code is copied.

## Related Files

- `packages/ai/src/index.ts`
- `packages/db/src/schema.ts`
- `apps/worker/src/reasoning-policy.ts`
- `apps/worker/src/work-recovery.ts`
- `docs/architecture/ai-reasoning-port-and-opportunity-scout-contracts.md`
- `docs/architecture/agent-first-mvp-roadmap.md`
- `docs/architecture/backend-foundation-status.md`
- `docs/architecture/decisions/0018-db-before-queue-work-recovery-policy.md`
- `docs/architecture/decisions/0019-agent-constraint-architecture-and-tool-policy.md`
- `.ai-project-rules/06-backend-workers-mastra.md`
- `.ai-project-rules/14-architecture-direction.md`
- `.ai-project-rules/15-architecture-regression-guards.md`
- `.ai-stealer-findings/2026-07-02-agent-first-mvp-roadmap.md`
- `C:\big eater\agentic-evidence-web-ui-stealer-findings-2026-07-02.md`
- `C:\big eater\mastra-agent-flow-ideas.md`
