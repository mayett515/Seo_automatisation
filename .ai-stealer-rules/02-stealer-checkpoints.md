---
description: "Checkpoints for when to run the Good Artist Steals research workflow"
globs: "**/*.{md,json,mmd,ts,tsx}"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - ".ai-stealer-rules/01-repo-catalog-workflow.md"
  - ".ai-stealer-catalog/repo-catalog/index/module-intent-index.md"
  - ".ai-stealer-catalog/repo-catalog/index/search-terms.md"
priority_schema: "critical > strong > guideline"
---

# Stealer Workflow Checkpoints

<meta-instruction>
Use this file to decide when architecture or implementation work should pause for repo-catalog, GitHub, or web pattern research before coding.
</meta-instruction>

## 1. Required Checkpoints

<positive-directives>
- Run the stealer workflow before starting a new architecture-significant vertical slice.
- Run it before defining a new external-provider adapter, especially Netlify, GSC, crawler/browser automation, analytics, object storage, auth, billing, email, or AI/Mastra tools.
- Run it before designing a new long-running workflow, queue topology, retry model, or state machine.
- Run it before creating a reusable component system, TanStack-heavy route/data/form/table pattern, preview UX, or dashboard surface.
- Run it before changing the data model for release verification, rollback, GSC sync, reporting, opportunities, or tenancy.
- Run it before choosing CI/CD, testing, observability, deployment, or failure-recovery conventions.
</positive-directives>

## 2. Skip Conditions

<absolute-constraints>
- DO NOT run repo/web research for tiny fixes, obvious TypeScript errors, copy edits, or narrow rule wording changes.
- DO NOT use research to reopen locked product decisions unless a source conflict is found.
- DO NOT import a pattern that violates preview, approval, deterministic-worker execution, or post-deploy verification.
- DO NOT copy source code verbatim without license review and attribution.
</absolute-constraints>

## 3. Research Sequence

<conditional-logic>
IF the checkpoint is triggered:
THEN define the capability, search the local seed catalog, inspect relevant architecture references, optionally search GitHub/web, extract 2-3 candidate patterns, and map the chosen pattern into the Local SEO stack.

IF time is limited:
THEN use the local seed catalog plus one high-confidence external reference instead of broad research.

IF the researched pattern affects product architecture:
THEN record the source and adapted decision in `.ai-stealer-findings/`, a planning doc, an ADR, or the relevant `.ai-project-rules/` shard.
</conditional-logic>

## 4. Local SEO Checkpoint Map

<context>
High-value checkpoints for this app:

```text
Deployment Agent vertical slice:
  release state machine, verification outcomes, rollback points, Netlify adapter, sitemap worker

GSC vertical slice:
  OAuth/API sync, connection-required UX, Search Analytics storage, opportunity mining, report-safe data boundary

Website import/rebuild vertical slice:
  crawler/browser automation, asset capture, component extraction, noindex preview, static fallback

Frontend mission-control vertical slice:
  TanStack Router/Query/Form/Table/Store patterns, preview notes, approvals, release detail, GSC connection state

Reporting vertical slice:
  proof tiers, conservative claims, artifact generation, customer-safe report UX

Tenancy/auth vertical slice:
  Better Auth integration, project membership, role checks, audit logs
```

</context>

## 5. Post-Flight Verification

<pre-flight-checklist>
1. [ ] Did this task hit a required checkpoint or a skip condition?
2. [ ] Did I start from the local seed catalog before broad search?
3. [ ] Did I adapt the idea into our NestJS/Fastify, BullMQ, Mastra, React/TanStack, Drizzle/Postgres architecture?
4. [ ] Did I record any external source that influenced the decision?
</pre-flight-checklist>
