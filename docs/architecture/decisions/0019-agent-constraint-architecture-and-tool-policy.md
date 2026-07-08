# 0019 - Agent Constraint Architecture And Tool Policy

Date: 2026-07-07
Status: Accepted

## Context

The repo already has the main agent safety shape:

- `AiReasoningPort` receives a run policy with `canMutateProduction: false`.
- Opportunity Scout can read evidence and analyze, then strict contracts and deterministic QA decide what persists.
- PageJson, Page Registry, Page Studio, preview, approval, deploy, verification, and recovery all have deterministic boundaries.
- Mastra is reserved for reasoning, orchestration, drafting, and explanation, not production mutation.

The 2026-07-07 Big Eater agent-constraint research found that this policy is correct but scattered. Before adding Page Proposal agents, report agents, browser tools, web-search tools, broader Mastra tool catalogs, or customer-facing agent UI, the repo needs one accepted constraint matrix.

The dangerous failure mode is not only a wrong model answer. The dangerous path is:

```text
model says something plausible
-> app treats it as evidence, approval, or product truth
-> worker mutates production
-> UI/report presents it as customer truth
```

Prompt instructions are useful for steering, but prompt constraints are not the safety boundary. The boundary must be enforced by tool policy, contracts, deterministic QA, durable approvals, workers, and verification.

## Decision

Every product agent or reasoning task must have a named constraint profile before it gets new tools or durable product effects.

A constraint profile must name:

- task or agent identity;
- allowed tool categories;
- forbidden actions;
- output schema;
- deterministic QA gates;
- approval gate, if any;
- worker handoff, if any;
- audit events or durable run evidence;
- stale-work recovery behavior when it creates a durable run row.

The top-level product rule is:

```text
AI may propose; only contracts, QA, approval, workers, and verification can make a proposal real.
```

Expanded:

```text
AI can scout, reason, cluster, summarize, draft, classify, explain, and prepare proposals.
AI cannot approve, deploy, rollback, submit provider mutations, create ranking proof, mark customer-safe wins, or publish pages.
```

### Tool Categories

Allowed by default only when the task profile explicitly names them:

```text
read_evidence
read_own_site
read_gsc
read_tracking
read_registry
analyze
draft_content
draft_page_json
render_preview
```

Ask / approval-needed categories, only for a future explicit slice:

```text
search_web
read_public_page
create_page_proposal
create_report_draft
request_customer_approval
```

Denied for product agents in the MVP:

```text
approve
deploy
rollback
provider_mutation
submit_sitemap
write_ranking_proof
write_approved_page_version
mark_release_live
browser_act
auth_session
captcha_solve
shell
file_write
db_write
```

Broad dynamic tool catalogs are not allowed. If a future MCP, Composio, browser, search, or Mastra tool registry is introduced, its tools must first be curated into product categories and then allowed by a task-specific policy.

### Current And Planned Task Matrix

Opportunity Scout:

```text
Allowed: read_evidence, analyze
Output: OpportunityScoutOutput
QA: evidence resolution, proof-tier containment, proof gate, competitor containment, uniqueness, cannibalization, dedupe, deterministic scoring
Persistence: agent_runs row plus opportunities only after QA succeeds
Forbidden: deploy, approve, rollback, provider mutation, write ranking proof, create page version, mark customer-safe proof by model confidence
```

Page Brief / Page Proposal:

```text
Allowed: read_evidence, read_registry, analyze, draft_content, draft_page_json, render_preview
Output: PageProposalJson or a later PageBriefJson
QA: PageJson contract, registry validation, Page Studio composition, route/cannibalization checks, SEO metadata checks, local uniqueness rationale, no raw HTML/CSS/JS/React/classes/styles
Persistence: proposal or draft version only, never approved version
Approval: human/customer approves a concrete PageVersion before release
Forbidden: approve page, deploy page, write approved PageVersion, invent proof, copy competitor copy, emit raw code/markup
```

Implementation checkpoint:

```text
implemented 2026-07-07
  apps/worker/src/reasoning-policy.ts owns policyForReasoningTask(task)
  Opportunity Scout consumes policyForReasoningTask("opportunity_scout")
  Page Proposal consumes policyForReasoningTask("page_brief_draft")
  Page Proposal active-run idempotency is keyed by project + task + opportunity subject
  Page Proposal persists only page_proposals.status = draft and page_versions.status = preview
  Page Proposal worker gates output through PageProposalJsonSchema, deterministic QA,
    registry validation, Page Studio publish-readiness, and shared preview rendering
  page_proposals route uniqueness is DB-enforced per project
  Opportunity Explorer can trigger Page Proposal runs through the API queue endpoint only
  Page Proposal UI status reads subject-scoped page_brief_draft agent runs
  Page version review API owns durable approval/request-changes with actor audit
  unresolved approval_blocker notes block approval and serialize against approval
  release-plan creation selects approved page versions, records actor evidence, and creates draft release items

still deferred
  page-lane UI wiring for release preflight, release deploy approval, and deploy enqueue from approved release plans
  agent_run_events timeline
```

Report Narrative:

```text
Allowed: read_evidence, analyze, draft_content
Output: ReportDraftJson
QA: every customer-facing claim maps to reviewed proof, verified release evidence, or approved product state
Forbidden: GSC as customer success proof, ranking guarantees, invented source rows, weak internal radar as a win
```

Website Understanding / Import:

```text
Allowed: read_own_site, read_public_page by policy, analyze
Output: WebsiteImportFacts or equivalent structured facts
QA: source URL retained, excerpts capped, PII minimized, facts distinguished from guesses
Forbidden: admin/auth flows, state-changing browser actions, submit forms, clone competitor site, persist arbitrary scraped copy as customer copy
```

Deployment Agent:

```text
Allowed: read_evidence, analyze, draft_content
Output: readiness explanation, blockers, release notes, next actions
Worker handoff: none directly; deterministic deploy/verify/rollback workers own provider mutation
Forbidden: enqueue deploy without approved release plan, mutate Netlify, submit sitemap, mark release live, rollback
```

### Approval Placement

Mastra or session-level approval is not product approval.

Product approval is a durable row or event tied to actor, project, target, timestamp, and state transition. A chat response or temporary tool approval cannot replace approval of a page version, release plan, rollback, or provider mutation.

Approval belongs where the risk lives:

- before a tool call when the tool call itself is risky;
- at the workflow step before persistence or handoff when risk emerges after analysis;
- as a durable product row before any deployable customer artifact is released.

### Subagent Constraint Propagation

Multi-agent delegation cannot widen authority.

If a parent run denies a category or outcome, a subagent cannot perform it for the parent by using a wider tool set. Delegation must pass a policy object, not only a prompt, and subagent output crosses the same Zod and deterministic QA boundary as direct model output.

Subagents must not produce direct worker commands. They may produce structured proposals that the parent workflow validates.

### Audit

`agent_runs` remains the run header for current MVP work. `agent_run_events` stays deferred until the UI needs streaming, replay, or per-tool timelines.

When added, `agent_run_events` should record event categories such as:

```text
run.queued
run.started
run.finished
run.failed
step.started
step.finished
step.failed
tool.call.requested
tool.call.allowed
tool.call.blocked
tool.approval.required
tool.result
tool.error
qa.gate.passed
qa.gate.failed
workflow.suspended
workflow.resumed
proposal.persisted
approval.required
subagent.started
subagent.finished
subagent.policy_inherited
subagent.policy_violation
worker.job.queued
```

Do not persist raw chain-of-thought, secrets, unredacted provider bodies, long competitor copy, or full browser session data. Persist source ids, artifact refs, redacted diagnostics, gate ids, failure codes, tool category decisions, latency/cost, and actor ids for approvals.

## Consequences

This keeps the useful parts of Mastra and agent tooling without turning the product into a generic autonomous-agent platform.

Future agent work gets a predictable implementation path:

```text
create durable run row
load scoped evidence/context
call constrained agent
parse output through contract
run deterministic QA
persist proposal or failure evidence
pause for durable approval if needed
enqueue deterministic worker only after approval
project result from worker/verification
```

The cost is more upfront policy typing before adding tools. That cost is intentional: it prevents broad tool catalogs, prompt-only safety, chat-style approvals, or agent-created production mutations from entering the product.

Completed implementation work:

- added `policyForReasoningTask(task)` before the Page Proposal worker foundation;
- kept Opportunity Scout on `read_evidence` and `analyze` only;
- added fail-closed tests for unprofiled reasoning tasks;
- added the durable page-version review API so product approval is an explicit `page:approve` human/operator action tied to one `pageVersionId`, not a Mastra/session/tool approval.

Remaining implementation work:

- add policy tests that reject provider mutation, approval, shell/file/db writes, browser state-changing actions, and unknown tool categories once those categories exist as executable tool calls;
- add `agent_run_events` only when the UI needs live/replay event timelines.

## Alternatives Considered

- Rely on prompts only. Rejected because prompt rules guide behavior but do not constrain tool execution or product persistence.
- Expose a broad tool registry and ask the model to behave. Rejected because product safety must be outcome-based and category-based.
- Let Mastra own approval or production mutation. Rejected because Postgres product rows, deterministic workers, and verification own product truth.
- Add a heavyweight constrained-policy-optimization or RL layer. Rejected because the useful current need is deterministic product policy, not a new research/runtime layer.

## Regression Guard

Future agent work must not:

- add a new agent task or tool without a named constraint profile;
- let agents call production side-effect ports directly;
- treat session/tool approval as product approval;
- bypass the page-version review API when a generated page needs product approval;
- let subagents widen parent constraints;
- persist or display model output as product truth before contract parse and deterministic QA;
- let web/browser/search/model output become customer-safe proof without a future ADR promoting that evidence source;
- let agents create approved page versions or enqueue deploy/rollback/provider jobs directly;
- add raw HTML, CSS, JavaScript, React, class names, inline styles, or freeform layout instructions as PageJson truth.

## Related Files

- `packages/adapters/src/index.ts`
- `packages/ai/src/index.ts`
- `apps/worker/src/reasoning-policy.ts`
- `apps/worker/src/handlers/opportunity-scout.ts`
- `apps/worker/src/handlers/page-proposal.ts`
- `docs/architecture/agent-first-mvp-roadmap.md`
- `docs/architecture/ai-reasoning-port-and-opportunity-scout-contracts.md`
- `docs/architecture/backend-foundation-status.md`
- `docs/architecture/decisions/0017-page-registry-and-page-json-source-of-truth.md`
- `docs/architecture/decisions/0018-db-before-queue-work-recovery-policy.md`
- `.ai-project-rules/06-backend-workers-mastra.md`
- `.ai-project-rules/14-architecture-direction.md`
- `.ai-project-rules/15-architecture-regression-guards.md`
- `C:\big eater\agent\on_constraints.md`
