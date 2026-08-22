---
description: "Fastify/Nest error and logging rules for adapter errors, request ids, redaction, and provider failure handling"
globs: "apps/api/src/**/*.{ts,tsx}, packages/adapters/src/**/*.{ts,tsx}, **/*logging*.md, **/*error*.md"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - "https://fastify.dev/docs/latest/Reference/Errors/"
  - "https://fastify.dev/docs/latest/Reference/Logging/"
  - "https://docs.nestjs.com/exception-filters"
  - "https://docs.nestjs.com/techniques/logger"
priority_schema: "critical > strong > guideline"
---

# Errors And Logging

<positive-directives>
- Normalize provider errors before exposing or storing them.
- Use Nest exception filters/logger for application-facing errors unless Fastify-level behavior is required.
- Preserve request correlation and safe reason codes for operational debugging.
- Redact secrets, tokens, authorization headers, raw OAuth/provider bodies, and credentials.
</positive-directives>

<absolute-constraints>
- DO NOT expose raw Fastify/provider errors directly to frontend routes.
- DO NOT log secrets or raw provider response bodies.
- DO NOT let adapter-level errors hide application-level failure states.
</absolute-constraints>
