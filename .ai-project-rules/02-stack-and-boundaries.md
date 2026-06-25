---
description: "Application stack, module boundaries, and adapter rules for the Local SEO platform"
globs: "src/**/*.{ts,tsx}, apps/**/*.{ts,tsx}, packages/**/*.{ts,tsx}, **/*architecture*.md, **/*boundary*.md"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - "local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/architecture/02-stack-decisions.md"
  - "local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/architecture/03-service-boundaries.md"
priority_schema: "critical > strong > guideline"
---

# Domain Execution Contract: Stack And Boundaries

<meta-instruction>
You have been routed here because the task touches stack choices, service boundaries, module ownership, external providers, or application architecture.
</meta-instruction>

## 1. Focused Best Practices

<positive-directives>
- Use NestJS with Fastify for the backend HTTP API.
- Use PostgreSQL for product data, Redis/BullMQ-compatible queues for jobs, and object storage for artifacts.
- Keep frontend, API, workers, agents, and external providers behind explicit boundaries.
- Wrap Netlify, GSC, analytics, crawler, and storage providers behind adapters.
- Follow `.ai-project-rules/14-architecture-direction.md` for modular-monolith structure, Clean Architecture dependency direction, Hexagonal ports/adapters, and DDD-lite bounded contexts.
- Use the TypeScript source-of-truth rules from `.ai-rules/02C-type-source-of-truth-checker.md` for non-trivial shared types.
</positive-directives>

## 2. Hard Domain Prohibitions

<absolute-constraints>
- DO NOT call workers directly from the frontend.
- DO NOT let agents mutate production providers without deterministic worker execution.
- DO NOT mix data across tenants or projects.
- DO NOT put provider API code inside domain entities.
- DO NOT bypass the approval module for release state changes.
- DO NOT name ports after vendors or leak provider-specific fields into domain entities.
</absolute-constraints>

## 3. Context-Dependent Trigger Gates

<conditional-logic>
IF a new external integration is introduced:
THEN define the port, adapter, data contract, and failure mode.

IF a shared request, response, event, or job payload type is created:
THEN identify whether the truth is owned by a Zod schema, generated client, runtime object, or exported TypeScript type.

IF a module needs long-running work:
THEN route it through a queue and worker contract instead of a synchronous controller.
</conditional-logic>

## 4. Domain Anchoring & Examples

<context>
Core Modules: Lead, Project, Website Import, Template, Area/Service, Opportunity, Page Proposal, Approval, Deployment, GSC, Tracking, Report, Gamification, Billing/Plan.

<example>
```ts
// Good: controller queues work through an application service
await this.websiteImportService.enqueueImport({ projectId, requestedByUserId });
```
</example>

<example>
```ts
// Bad: frontend-facing controller performs provider work directly
await this.netlifyClient.deploySite(projectId);
```
</example>
</context>

## 5. Domain Post-Flight Verification

<pre-flight-checklist>
1. [ ] Did I keep provider logic behind an adapter?
2. [ ] Did I preserve the frontend -> API -> queue -> worker boundary?
3. [ ] Did I run the source-of-truth check for shared non-trivial types?
</pre-flight-checklist>
