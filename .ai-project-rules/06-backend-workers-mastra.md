---
description: "NestJS, worker, queue, and Mastra workflow rules for backend implementation"
globs: "src/**/*.{ts,tsx,sql,json}, apps/**/*.{ts,tsx,sql,json}, packages/**/*.{ts,tsx,sql,json}, **/*backend*.md, **/*worker*.md, **/*agent*.md"
alwaysApply: false
version: "1.3.2"
rule_budget: "cohesion-retained"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - "local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/backend/01-backend-architecture.md"
  - "local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/architecture/04-worker-architecture.md"
  - "local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/architecture/05-ai-agent-architecture.md"
  - ".agents/skills/inspiration-pass/SKILL.md"
priority_schema: "critical > strong > guideline"
---

# Domain Execution Contract: Backend Workers Mastra

<meta-instruction>
You have been routed here because the task touches NestJS modules, Fastify HTTP, queues, workers, job contracts, Mastra workflows, Mastra agents, or backend AI integration.
</meta-instruction>

## 1. Focused Best Practices

<positive-directives>
- Keep NestJS controllers thin and route business behavior through application services.
- Use queues for pre-audit, import, local analysis, page generation, SEO QA, deploy, GSC sync, analytics, reports, and notifications.
- Use Mastra Workflows for deterministic multi-step processes.
- Use Mastra Agents for open-ended research, strategy, content, layout, analyst, and report tasks.
- Persist job inputs, outputs, status, retries, failure evidence, and customer-visible results.
- Treat BullMQ/Redis as work transport and Postgres durable run rows as product truth.
- Keep SEO source truth, agent execution truth, and product result truth separate; tool events and Mastra traces are not evidence.
- Treat Mastra workflow storage and observability as operational runtime data; PostgreSQL owns product recovery, evidence identity, approval, and results.
- Define stale-work recovery behavior for every durable workflow before adding new customer-facing worker lanes.
- Give each owning workflow delivery a monotonically increasing execution epoch; step, event, tool-capture, success, and failure writes must reject stale epochs.
- Persist a model-derived tool plan as a typed step output before executing it, and replay that exact plan after a crash instead of asking the model again.
- Carry server-selected source versions into every evidence binding and require the database resolver to reject sources that are no longer current, admissible, fresh, or version-equal.
- Lock every selected evidence source in stable source-kind/id order before locking its owning run; lifecycle-only writes keep the parent-run-first order.
- Renew long-running model/tool work through a bounded exact-owner heartbeat; recovery uses the current heartbeat for running work and `updated_at` only for queued work.
- Store succeeded step output as application-canonical UTF-8 text plus its exact SHA-256; replay must recompute both rather than trusting JSON or a stored digest alone.
- Treat model access to project knowledge as an explicit per-version `model_allowed` opt-in; approval alone is insufficient, and retirement removes only the current pointer while preserving history.
- Reload current model-material identity and run a bounded obvious-secret egress gate before every external model attempt; provider retries must never bypass either check.
- Bind credentialed promotion evidence to workflow, constraint profile, prompts, exact fixture-corpus digest, and model identity before changing the configured production model.
- Define a named constraint profile before adding a new Mastra/agent task, tool category, browser/search capability, or production handoff.
- Before designing a new Mastra agent, workflow, tool permission model, memory/state model, or human-approval handoff, ask whether to run a focused Good Artist Inspiration pass.
</positive-directives>

## 2. Hard Domain Prohibitions

<absolute-constraints>
- DO NOT run long AI or crawl work directly inside HTTP request handlers.
- DO NOT let AI agents mutate live pages or deploy production directly.
- DO NOT trust agent output without schema validation at boundaries.
- DO NOT let Mastra snapshots, memory, traces, schedules, or auto-restart advance product state without a PostgreSQL recovery claim.
- DO NOT persist raw chain-of-thought, token streams, secrets, or full provider/tool bodies as product audit truth.
- DO NOT add broad dynamic tool catalogs to product agents; curate tools into product categories and allow them per task.
- DO NOT treat Mastra/session/tool approval as product approval. Product approval is a durable row or event tied to actor, project, target, timestamp, and state transition.
- DO NOT let subagents widen the parent run's denied outcomes or tool policy.
- DO NOT report job success without persisted evidence.
- DO NOT store raw external data when minimized evidence is sufficient.
- DO NOT retry provider mutations from a generic stuck-job scanner; reconcile provider state or mark manual review.
- DO NOT leave durable `queued` or `running` rows without an explicit recovery, terminal failure, or manual reconciliation policy.
- DO NOT let a new delivery take execution ownership while a prior-epoch step remains `running`.
- DO NOT let a recovery delivery proceed without its exact PostgreSQL recovery count and system `job_runs` identity.
- DO NOT consume a new recovery count when an active purpose-bound reservation for the current generation can be reused after a crash before enqueue.
- DO NOT treat an ordinary approved knowledge version as model-readable unless its persisted model-use policy explicitly allows it.
- DO NOT erase retired knowledge history or silently reactivate a retired document.
</absolute-constraints>

## 3. Context-Dependent Trigger Gates

<conditional-logic>
IF work may exceed normal HTTP request time:
THEN enqueue a job and return a trackable status resource.

IF work is deterministic and repeatable:
THEN model it as a worker or Mastra workflow step.

IF work is open-ended analysis or content strategy:
THEN model it as a Mastra agent whose output is validated before use.

IF work introduces a new agent role, agent tool, workflow graph, memory model, evaluator, or production handoff:
THEN either run or explicitly skip a focused Good Artist Inspiration pass (the `inspiration-pass` skill; archived detail: `archive/.ai-stealer-rules/02-stealer-checkpoints.md`).

IF work introduces live agent tools or specialist workflow steps:
THEN apply ADR 0022's run-step-event-evidence boundary before treating the workflow as production-ready.

IF work introduces or widens agent capabilities:
THEN name the task constraint profile: allowed tool categories, denied actions, output schema, QA gates, approval gate, worker handoff, audit evidence, and recovery policy.

IF an agent delegates to another agent or tool runner:
THEN pass the parent policy object and require the child to inherit or narrow denied outcomes.

IF a worker creates or consumes a durable run row:
THEN name its deterministic operation key, active-run guard, terminal states, retry policy, and stale recovery policy.

IF a worker delivery supersedes another delivery for the same product run:
THEN advance one DB-owned execution epoch, terminalize prior-epoch running steps in the same transaction, and fence every later write on the new epoch.

IF an earlier execution already completed a workflow step:
THEN retain it as an immutable checkpoint, replay it without rewriting its epoch, and require the final PostgreSQL success gate to verify the exact ordered checkpoint set and output digest.

IF provider or tool work can outlive the stale-work threshold:
THEN renew a current-epoch/current-token/current-recovery-generation heartbeat often enough to provide at least three renewal opportunities before recovery eligibility.

IF project knowledge may enter a model packet:
THEN require current approved, non-retired, task-scoped, explicitly `model_allowed` truth and preserve operator-only knowledge outside model egress.

IF a provider adapter retries a model request:
THEN reload current material identity and rerun the egress gate before every attempt; deterministic material/egress rejection must not immediately reschedule the unchanged digest.

IF a configured model or prompt is promoted from fixtures to production:
THEN persist or report a digest-bound manifest naming the exact workflow, policy, prompts, fixture set, and model id used for calibration.

IF an agent chooses follow-up tool inputs:
THEN persist the exact bounded plan before tool execution and make retry/recovery consume that stored plan.

IF work may mutate a remote provider:
THEN recovery must read provider state or require manual reconciliation before repeating the mutation.
</conditional-logic>

## 4. Domain Anchoring & Examples

<context>
HTTP admission, durable queue truth, deterministic workers, and bounded Mastra reasoning form one authority handoff. Splitting those stages could let one shard widen agent or transport authority without the others; crossing the normal rule-count threshold triggers cohesion review rather than mechanical splitting.

Worker topology includes queues for pre-audit, website import, local analysis, page generation, SEO QA, deploy, GSC sync, analytics, report, and notifications.

Agent constraint baseline:

```text
AI may propose; only contracts, QA, approval, workers, and verification can make a proposal real.

Opportunity Scout:
  allow read_evidence, analyze
  deny production mutation, approval, ranking-proof writes, page-version writes

Page Proposal:
  allow read_evidence, read_registry, analyze, draft_content, draft_page_json, render_preview
  deny raw HTML/CSS/JS/React, class/style controls, approval, deploy, provider mutation

Opportunity Research:
  allow confirmed project context, approved scoped knowledge, source-backed evidence, bounded public discovery, analyze, draft structured candidates
  deny Google-rank claims from discovery order, proof promotion, page/release commands, provider mutation, raw browser sessions, and broad dynamic tools
  persist every citable live result before binding it as evidence
  bind every search capture and ledger write to the current execution epoch
  revalidate every evidence source against current durable status, version, freshness, and project truth on each binding
  let a newer execution reuse only immutable succeeded checkpoints and source-backed evidence no newer than that execution
  persist the exact follow-up query plan before the follow-up capture step
  heartbeat every long-running model/tool phase under exact execution ownership
  send only current approved task-scoped knowledge whose model-use policy is model_allowed
  reload current model material and block obvious secret-shaped content before every DeepSeek attempt
  restrict production DeepSeek transport to the official HTTPS origin and bound response bytes before JSON decoding
  abort in-flight model transport when exact PostgreSQL execution ownership is lost
  bind promotion evidence to workflow, policy, prompts, exact fixture-corpus digest, and model id
  let deterministic QA and portfolio policy decide what becomes an opportunity
```

<example>
```ts
// Good: controller returns a status handle
return this.localAnalysisService.enqueue({ projectId, requestedByUserId });
```
</example>

<example>
```ts
// Bad: request handler blocks on crawler plus LLM plus deploy
return this.agent.runAndDeploy({ projectId });
```
</example>
</context>

## 5. Domain Post-Flight Verification

<pre-flight-checklist>
1. [ ] Did long-running work move to a queue, workflow, or worker?
2. [ ] Did agent output cross a validation boundary before use?
3. [ ] Did status and evidence persist for customer-visible workflows?
4. [ ] Did any durable `queued` / `running` row gain a stuck-job recovery or terminal policy?
5. [ ] If this introduced new Mastra/agent behavior, did I run or explicitly skip a Good Artist Inspiration pass?
6. [ ] If this introduced or widened agent tools, did a named constraint profile define allowed categories, denied outcomes, output schema, QA gates, approval, audit, and handoff?
7. [ ] Did Mastra runtime state remain operational data while PostgreSQL retained product, evidence, approval, and recovery authority?
8. [ ] Can a late response from an older execution epoch write any step, event, capture, failure, success, or product row?
9. [ ] If the model selected tool inputs, does crash recovery replay the exact persisted plan?
10. [ ] Do evidence writes lock selected sources before the run while lifecycle-only writes retain their documented parent order?
11. [ ] Does long-running provider work renew only the exact owning execution, with enough margin before stale recovery?
12. [ ] Are replayed step bytes re-canonicalized and re-hashed rather than trusted from stored JSON or digest fields?
13. [ ] Is every knowledge record entering model context explicitly model-allowed, current, approved, scoped, and non-retired?
14. [ ] Is model promotion tied to a versioned fixture/prompt/policy/model manifest?
</pre-flight-checklist>
