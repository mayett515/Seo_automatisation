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

IF the task touches customer approval, previews, notes, generated suggestions, or productive customer changes:
THEN you MUST load and comply with: `.ai-project-rules/03-controlled-automation.md`.

IF the task touches releases, Netlify deploys, rollback, sitemap publication, release plans, or deployment checks:
THEN you MUST load and comply with: `.ai-project-rules/04-deployment-agent.md`.

IF the task touches React UI, routes, forms, tables, app state, preview UX, dashboards, maps, or diagrams:
THEN you MUST load and comply with: `.ai-project-rules/05-frontend-tanstack.md`.

IF the task touches NestJS modules, Fastify HTTP, workers, queues, Mastra workflows, Mastra agents, or job contracts:
THEN you MUST load and comply with: `.ai-project-rules/06-backend-workers-mastra.md`.

IF the task touches tracking, analytics, GSC OAuth, privacy, security, tenant isolation, logs, or observability:
THEN you MUST load and comply with: `.ai-project-rules/07-tracking-privacy-observability.md`.

IF the task touches SEO copy, local pages, metadata, schema, internal links, canonical strategy, or content quality:
THEN you MUST load and comply with: `.ai-project-rules/08-seo-content-constraints.md`.

IF the task touches generation of local landing pages, subdomains, route strategy, page JSON, or publish readiness:
THEN you MUST load and comply with: `.ai-project-rules/09-local-landing-page-generation.md`.

IF the task touches indexing, GSC analysis, keyword monitoring, post-deploy verification, or SEO QA:
THEN you MUST load and comply with: `.ai-project-rules/10-seo-verification-gsc.md`.

IF the task touches customer-facing reports, ranking claims, KPIs, proof language, or roadmap/opportunity separation:
THEN you MUST load and comply with: `.ai-project-rules/11-reporting-anti-regression.md`.
</routing-logic>

<positive-directives>
- Keep project-specific rules separate from the frozen `.ai-rules/` TypeScript schema.
- Treat `local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/` as the main product source.
- Treat `deployment-agent-extension-only/local-seo-product-knowledge-pack/` as the deployment-agent extension source.
- Load external field evidence only when SEO workflow, proof, ranking, or reporting decisions need it.
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
.ai-project-references/field-evidence/kundenreport_seo_martines_v4.pdf
```

Frontend inspiration only:

```text
.ai-project-references/frontend-inspiration/local-seo-mission-control-demo-en.html
```
</context>

<pre-flight-checklist>
1. [ ] Did I preserve customer control over productive changes?
2. [ ] Did I load the specific project-rule shard for this task?
3. [ ] Did I keep product rules outside the frozen TypeScript schema?
</pre-flight-checklist>
