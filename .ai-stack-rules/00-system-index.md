---
description: "Stack implementation guardrail router for TypeScript, React, TanStack, NestJS/Fastify, OAuth, URL safety, and smoke verification"
globs: "apps/**/*.{ts,tsx}, packages/**/*.{ts,tsx}, **/*.{md,json}"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - ".ai-rules/00-system-index.md"
priority_schema: "critical > strong > guideline"
---

# Stack Rules Router

<meta-instruction>
Use this router when the task touches stack-specific implementation behavior. These rules complement the frozen TypeScript schema and the Local SEO product rules. They do not override product truth, architecture direction, or the frozen `.ai-rules` schema.
</meta-instruction>

<routing-logic>
IF the task touches strict TypeScript, unsafe values, non-trivial type ownership, lintability, or maintainability:
THEN load `.ai-stack-rules/01-typescript-static-safety.md`.

IF the task touches React components, hooks, rendering logic, error boundaries, or render-time helpers:
THEN load `.ai-stack-rules/02-react-render-hooks.md`.

IF the task touches TanStack Query, Router, Store, Table, Form, route params, query keys, mutations, invalidation, or async UI states:
THEN load `.ai-stack-rules/03-tanstack-query-router.md`.

IF the task touches TanStack ecosystem decisions, CLI scaffolding, add-ons, docs metadata discovery, Form/Table/Store/Virtual adoption, or compatibility between TanStack guidance and this monorepo:
THEN load `.ai-stack-rules/09-tanstack-ecosystem-schema.md`.

IF the task touches NestJS modules/controllers/providers, Fastify runtime behavior, dependency injection, provider tokens, or backend route wiring:
THEN load `.ai-stack-rules/04-nest-fastify-runtime-di.md`.

IF the task touches NestJS/Fastify providers, controllers, validation, queues, workers, guards, tenant authorization, lifecycle shutdown, readiness, exception handling, or backend tests:
THEN load `.ai-nest-rules/00-system-index.md`.

IF the task touches Fastify adapter behavior, Fastify plugins/ecosystem, hooks, validation/serialization, errors/logging, production recommendations, reverse proxy assumptions, or Nest with Fastify as adapter:
THEN load `.ai-fastify-rules/00-system-index.md`.

IF the task touches OAuth, external provider tokens, refresh tokens, access tokens, callback state, scopes, or provider security:
THEN load `.ai-stack-rules/05-oauth-provider-security.md`.

IF the task touches URL parsing, route construction, provider URLs, user-provided URLs, or render-time URL display:
THEN load `.ai-stack-rules/06-url-runtime-safety.md`.

IF the task changes runtime-sensitive backend routes, providers, workers, queues, migrations, or frontend routes:
THEN load `.ai-stack-rules/07-smoke-verification.md`.

IF a post-implementation review finds a recurring stack mistake, or the task asks whether implementation follows current React/TanStack/Nest/OAuth/URL/API-design standards:
THEN load `.ai-stack-rules/08-official-doc-refresh.md`.
</routing-logic>

<absolute-constraints>
- DO NOT edit `.ai-rules/` through this stack bundle.
- DO NOT let stack convenience weaken Local SEO product constraints, tenant isolation, approval gates, or report-safety rules.
- DO NOT treat stack docs as product truth.
- DO NOT promote a new stack rule from web research unless the source is official documentation or a deliberately marked non-authoritative reference.
</absolute-constraints>
