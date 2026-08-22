---
description: "Fastify implementation router for Nest Fastify adapter, plugins, hooks, schemas, errors, security, and production recommendations"
globs: "apps/api/src/**/*.{ts,tsx}, packages/**/*.{ts,tsx}, **/*fastify*.md, **/*server*.md"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - ".ai-nest-rules/00-system-index.md"
  - ".ai-fastify-rules/SOURCES.md"
priority_schema: "critical > strong > guideline"
---

# Fastify Rules Router

<meta-instruction>
Use this router when work touches Fastify directly or NestJS behavior that depends on the Fastify adapter. This bundle complements `.ai-nest-rules/`; Nest modules/controllers/providers still own the application structure, while Fastify rules own adapter/runtime/plugin behavior.
</meta-instruction>

<routing-logic>
IF the task touches Nest's Fastify adapter, app bootstrap, HTTP adapter assumptions, platform differences, or request/reply behavior:
THEN load `.ai-fastify-rules/01-nest-fastify-adapter.md`.

IF the task touches Fastify plugins, ecosystem packages, CORS, cookies, multipart, static assets, security plugins, compression, or plugin registration:
THEN load `.ai-fastify-rules/02-plugins-ecosystem.md`.

IF the task touches Fastify schemas, serialization, validation, response performance, or conflicts with Zod contracts:
THEN load `.ai-fastify-rules/03-schemas-serialization.md`.

IF the task touches Fastify hooks, lifecycle, request context, abort handling, or per-request behavior:
THEN load `.ai-fastify-rules/04-hooks-lifecycle.md`.

IF the task touches Fastify errors, logging, redaction, request ids, or provider error handling:
THEN load `.ai-fastify-rules/05-errors-logging.md`.

IF the task touches production hosting, reverse proxies, TLS termination, compression, timeouts, scaling, health, or AWS/Fargate deployment assumptions:
THEN load `.ai-fastify-rules/06-production-recommendations.md`.
</routing-logic>

<absolute-constraints>
- DO NOT bypass Nest providers/controllers/guards just because Fastify exposes lower-level hooks.
- DO NOT install Fastify ecosystem plugins without checking whether Nest already owns the concern.
- DO NOT let Fastify plugin defaults override Local SEO product security, tenant isolation, or approval gates.
</absolute-constraints>
