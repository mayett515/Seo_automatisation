---
description: "NestJS/Fastify backend implementation router for providers, validation, queues, guards, lifecycle, health, errors, and tests"
globs: "apps/api/src/**/*.{ts,tsx}, apps/worker/src/**/*.{ts,tsx}, packages/**/*.{ts,tsx}, **/*nest*.md, **/*backend*.md"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - ".ai-stack-rules/04-nest-fastify-runtime-di.md"
  - ".ai-nest-rules/SOURCES.md"
priority_schema: "critical > strong > guideline"
---

# Nest Rules Router

<meta-instruction>
Use this router when work touches NestJS, Fastify runtime behavior, API modules, controllers, providers, queues, workers, guards, request validation, lifecycle shutdown, readiness checks, exception handling, or Nest tests. These rules are implementation guardrails; product truth still lives in `.ai-project-rules/`.
</meta-instruction>

<routing-logic>
IF the task touches providers, custom providers, adapters, config-derived clients, dependency injection, module wiring, or composition roots:
THEN load `.ai-nest-rules/01-providers-composition-root.md`.

IF the task touches controllers, request params, query/body validation, DTO boundaries, pipes, or external input parsing:
THEN load `.ai-nest-rules/02-controllers-validation-pipes.md`.

IF the task touches BullMQ queues, queue producers, workers, job contracts, retries, shutdown, or queue availability:
THEN load `.ai-nest-rules/03-queues-workers-lifecycle.md`.

IF the task touches auth, project access, tenant ownership, guards, route authorization, or current-user context:
THEN load `.ai-nest-rules/04-guards-auth-tenancy.md`.

IF the task touches health endpoints, liveness, readiness, deployment checks, DB/Redis checks, or Terminus:
THEN load `.ai-nest-rules/05-health-readiness.md`.

IF the task touches exceptions, logging, provider errors, OAuth callback failures, or redaction:
THEN load `.ai-nest-rules/06-exceptions-logging.md`.

IF the task touches tests for controllers, providers, modules, workers, or pure backend functions:
THEN load `.ai-nest-rules/07-testing.md`.
</routing-logic>

<absolute-constraints>
- DO NOT let Nest implementation convenience bypass Local SEO product approval, tenant isolation, or report-safety rules.
- DO NOT treat this Nest bundle as product truth.
- DO NOT use docs/examples to introduce microservices; this project remains modular-monolith-first until explicitly changed.
</absolute-constraints>
