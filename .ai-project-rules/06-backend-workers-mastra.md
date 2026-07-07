---
description: "NestJS, worker, queue, and Mastra workflow rules for backend implementation"
globs: "src/**/*.{ts,tsx}, apps/**/*.{ts,tsx}, packages/**/*.{ts,tsx}, **/*backend*.md, **/*worker*.md, **/*agent*.md"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - "local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/backend/01-backend-architecture.md"
  - "local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/architecture/04-worker-architecture.md"
  - "local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/architecture/05-ai-agent-architecture.md"
  - ".ai-stealer-rules/02-stealer-checkpoints.md"
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
- Define stale-work recovery behavior for every durable workflow before adding new customer-facing worker lanes.
- Define a named constraint profile before adding a new Mastra/agent task, tool category, browser/search capability, or production handoff.
- Before designing a new Mastra agent, workflow, tool permission model, memory/state model, or human-approval handoff, ask whether to run a focused Good Artist Inspiration pass.
</positive-directives>

## 2. Hard Domain Prohibitions

<absolute-constraints>
- DO NOT run long AI or crawl work directly inside HTTP request handlers.
- DO NOT let AI agents mutate live pages or deploy production directly.
- DO NOT trust agent output without schema validation at boundaries.
- DO NOT add broad dynamic tool catalogs to product agents; curate tools into product categories and allow them per task.
- DO NOT treat Mastra/session/tool approval as product approval. Product approval is a durable row or event tied to actor, project, target, timestamp, and state transition.
- DO NOT let subagents widen the parent run's denied outcomes or tool policy.
- DO NOT report job success without persisted evidence.
- DO NOT store raw external data when minimized evidence is sufficient.
- DO NOT retry provider mutations from a generic stuck-job scanner; reconcile provider state or mark manual review.
- DO NOT leave durable `queued` or `running` rows without an explicit recovery, terminal failure, or manual reconciliation policy.
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
THEN consult `.ai-stealer-rules/02-stealer-checkpoints.md` and either run or explicitly skip a focused Good Artist Inspiration pass.

IF work introduces or widens agent capabilities:
THEN name the task constraint profile: allowed tool categories, denied actions, output schema, QA gates, approval gate, worker handoff, audit evidence, and recovery policy.

IF an agent delegates to another agent or tool runner:
THEN pass the parent policy object and require the child to inherit or narrow denied outcomes.

IF a worker creates or consumes a durable run row:
THEN name its deterministic operation key, active-run guard, terminal states, retry policy, and stale recovery policy.

IF work may mutate a remote provider:
THEN recovery must read provider state or require manual reconciliation before repeating the mutation.
</conditional-logic>

## 4. Domain Anchoring & Examples

<context>
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
</pre-flight-checklist>
