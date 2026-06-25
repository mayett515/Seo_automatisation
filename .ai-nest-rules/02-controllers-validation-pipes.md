---
description: "Nest controller validation rules for params, query, bodies, DTO contracts, Zod parsing, and pipe boundaries"
globs: "apps/api/src/**/*.{ts,tsx}, packages/contracts/src/**/*.{ts,tsx}, **/*validation*.md"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - "https://docs.nestjs.com/controllers"
  - "https://docs.nestjs.com/techniques/validation"
  - ".ai-rules/00-system-index.md"
priority_schema: "critical > strong > guideline"
---

# Controllers, Validation, And Pipes

<positive-directives>
- Treat route params, query strings, and request bodies as untrusted input.
- Parse external input with Zod schemas or Nest validation pipes before use.
- Keep request and response contracts schema-owned when they cross API boundaries.
- Validate outputs when the response is part of a shared contract consumed by the frontend.
- Keep controller methods small: parse, delegate, return.
</positive-directives>

<absolute-constraints>
- DO NOT use `body as SomeType` or raw casts for external request payloads when a schema exists or should exist.
- DO NOT use route params directly for tenant/project access without auth/ownership checks when real customer data is involved.
- DO NOT let controllers contain provider SDK details or long-running work.
</absolute-constraints>

<conditional-logic>
IF a controller accepts `unknown`:
THEN it must parse the value before the service uses it.

IF a route returns a shared frontend response:
THEN prefer returning a schema-parsed contract object.
</conditional-logic>
