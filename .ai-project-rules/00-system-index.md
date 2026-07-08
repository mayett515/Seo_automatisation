---
description: "Local SEO product and application architecture router"
globs: "**/*.{md,json,mmd,ts,tsx}"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Local SEO Project Rules Router

<meta-instruction>
Use this router when the task touches product planning, app architecture, customer workflows, deployment, tracking, SEO constraints, or project-specific Markdown docs for the Local SEO platform.
</meta-instruction>

<routing-logic>
IF the task touches source priority, source conflicts, copied references, or project-rule ownership:
THEN you MUST load and comply with: `.ai-project-rules/01-product-source-of-truth.md`.

IF the task touches stack choice, module ownership, service boundaries, data ownership, or adapters:
THEN you MUST load and comply with: `.ai-project-rules/02-stack-and-boundaries.md`.

IF the task touches TypeScript static safety, React render/hooks, TanStack Query/Router, NestJS/Fastify runtime DI, OAuth provider security, URL parsing/construction, or smoke verification:
THEN you MUST load and comply with: `.ai-stack-rules/00-system-index.md`.

IF the task touches architecture style, layering, Clean Architecture dependency direction, Hexagonal ports/adapters, bounded contexts, composition roots, modular monolith vs microservices, or where logic belongs:
THEN you MUST load and comply with: `.ai-project-rules/14-architecture-direction.md`.

IF the task touches repeated review findings, regression guards, persisted JSON read/write seams, PageJson safety, Page Registry source-of-truth seams, page-version approval, approval-blocker serialization, Page Proposal lifecycle, release-plan actor evidence, provider mutations in API routes, release live-truth projection, deploy artifact approval, or stale implemented/deferred roadmap lists:
THEN you MUST load and comply with: `.ai-project-rules/15-architecture-regression-guards.md`.

IF the task touches customer approval, previews, notes, generated suggestions, or productive customer changes:
THEN you MUST load and comply with: `.ai-project-rules/03-controlled-automation.md`.

IF the task touches releases, Netlify deploys, rollback, sitemap publication, release plans, or deployment checks:
THEN you MUST load and comply with: `.ai-project-rules/04-deployment-agent.md`.

IF the task touches local SEO page quality gates, clone detection, page uniqueness, local page deployment QA, sitemap readiness, noscript reachability, schema readiness, canonical readiness, or hub/spoke cannibalization:
THEN you MUST load and comply with: `.ai-project-rules/12-local-seo-page-quality-gate.md`.

IF the task touches React UI, routes, forms, tables, app state, preview UX, dashboards, maps, or diagrams:
THEN you MUST load and comply with: `.ai-project-rules/05-frontend-tanstack.md`.

IF the task touches NestJS modules, Fastify HTTP, workers, queues, Mastra workflows, Mastra agents, or job contracts:
THEN you MUST load and comply with: `.ai-project-rules/06-backend-workers-mastra.md`.

IF the task touches tracking, analytics, GSC OAuth, privacy, security, tenant isolation, logs, or observability:
THEN you MUST load and comply with: `.ai-project-rules/07-tracking-privacy-observability.md`.

IF the task touches SEO copy, local pages, metadata, schema, internal links, canonical strategy, or content quality:
THEN you MUST load and comply with: `.ai-project-rules/08-seo-content-constraints.md`.

IF the task touches SEO copy, local pages, metadata, schema, internal links, canonical strategy, content quality, or generated service-location pages:
THEN you MUST load and comply with: `.ai-project-rules/12-local-seo-page-quality-gate.md`.

IF the task touches generation of local landing pages, subdomains, route strategy, page JSON, or publish readiness:
THEN you MUST load and comply with: `.ai-project-rules/09-local-landing-page-generation.md`.

IF the task touches generation of local landing pages, route publication, preview approval, or publish readiness:
THEN you MUST load and comply with: `.ai-project-rules/12-local-seo-page-quality-gate.md`.

IF the task touches indexing, GSC OAuth/API sync, Search Console API, Search Analytics data, keyword monitoring, post-deploy verification, or SEO QA:
THEN you MUST load and comply with: `.ai-project-rules/10-seo-verification-gsc.md`.

IF the task touches indexing, GSC handoff, post-deploy verification, or SEO QA for a local page:
THEN you MUST load and comply with: `.ai-project-rules/12-local-seo-page-quality-gate.md`.

IF the task touches customer-facing reports, ranking claims, KPIs, proof language, or roadmap/opportunity separation:
THEN you MUST load and comply with: `.ai-project-rules/11-reporting-anti-regression.md`.

IF the task touches future SEO growth, opportunity discovery, GSC opportunity mining, keyword maps, market potential, rollout sequencing, service expansion backlog, Google Business Profile support signals, review-request workflow, or why a page should exist:
THEN you MUST load and comply with: `.ai-project-rules/13-seo-opportunity-planning.md`.
</routing-logic>

<positive-directives>
- Keep project-specific rules separate from the frozen `.ai-rules/` TypeScript schema.
- Treat `local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/` as the main product source.
- Treat `deployment-agent-extension-only/local-seo-product-knowledge-pack/` as the deployment-agent extension source.
- Load external field evidence only when SEO workflow, proof, ranking, or reporting decisions need it.
- Use `.ai-project-rules/12-local-seo-page-quality-gate.md` as the reusable checklist for generated local SEO pages before preview approval, deploy, and report handoff.
- Use `.ai-project-rules/13-seo-opportunity-planning.md` when deciding future markets, page opportunities, keyword tiers, or execution sequence.
- Use `.ai-project-rules/14-architecture-direction.md` when judging implementation quality, dependency direction, module boundaries, and provider isolation.
- Use `.ai-project-rules/15-architecture-regression-guards.md` when touching a seam that previous reviews identified, especially PageJson safety, persisted JSON, page-version approval, approval-blocker serialization, Page Proposal lifecycle, release-plan actor evidence, provider mutation ownership, release live truth, deploy artifact approval, and roadmap drift.
- Use `.ai-stack-rules/00-system-index.md` for stack-specific implementation guardrails; it complements but does not override `.ai-rules/` or project product rules.
</positive-directives>

<absolute-constraints>
- DO NOT edit `.ai-rules/` for Local SEO product behavior.
- DO NOT treat frontend inspiration files as product truth.
- DO NOT let agents publish production changes directly.
- DO NOT bypass preview and approval before deploy.
- DO NOT guarantee rankings, leads, or revenue.
</absolute-constraints>

<context>
Core product truth:

```text
local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/
deployment-agent-extension-only/local-seo-product-knowledge-pack/
```

Field evidence and workflow reference:

```text
C:\gebäudeservicefirma\Seo as read-only field evidence when local SEO proof/workflow is relevant
C:\gebäudeservicefirma\Seo\workflow as read-only field evidence for real page workflow and deployment-check examples
C:\gebäudeservicefirma\Seo\future-seo-growth-plan as read-only field evidence for roadmap, keyword tiers, and growth sequencing
C:\gebäudeservicefirma\Seo\ungenutzte_potentiale as read-only field evidence for unused keyword and market potential hypotheses
.ai-project-references/field-evidence/kundenreport_seo_martines_v4.pdf
```

Frontend inspiration only:

```text
.ai-project-references/frontend-inspiration/local-seo-mission-control-demo-en.html
```

Architecture guidance:

```text
C:\total typescript\Architecture_Karteikarten as read-only architecture guidance
C:\total typescript\Hexagonal_Architecture_Karteikarten as read-only ports/adapters and dependency-direction guidance
C:\total typescript\System_Design_101_Karteikarten as read-only system design and scaling guidance
```

Stack implementation guardrails:

```text
.ai-stack-rules/00-system-index.md
```

</context>

<pre-flight-checklist>
1. [ ] Did I preserve customer control over productive changes?
2. [ ] Did I load the specific project-rule shard for this task?
3. [ ] Did I keep product rules outside the frozen TypeScript schema?
</pre-flight-checklist>
