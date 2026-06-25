---
description: "Nest error, exception, logging, and redaction rules for provider failures, OAuth callbacks, and external API errors"
globs: "apps/api/src/**/*.{ts,tsx}, apps/worker/src/**/*.{ts,tsx}, packages/adapters/src/**/*.{ts,tsx}, **/*logging*.md, **/*error*.md"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - "https://docs.nestjs.com/exception-filters"
  - "https://docs.nestjs.com/techniques/logger"
priority_schema: "critical > strong > guideline"
---

# Exceptions, Logging, And Redaction

<positive-directives>
- Normalize provider errors before storing or exposing them.
- Keep user-facing OAuth/API errors generic while preserving safe internal reason codes.
- Use Nest logger or an explicit logging provider for API-side failures.
- Redact secrets, tokens, raw provider bodies, and credentials from logs.
- Prefer explicit Nest exceptions for service-unavailable or forbidden states when the API contract is not a business-state response.
</positive-directives>

<absolute-constraints>
- DO NOT expose raw provider response bodies to browsers.
- DO NOT log OAuth tokens, refresh tokens, access tokens, secrets, or authorization headers.
- DO NOT silently swallow callback/worker failures without safe operational logging.
</absolute-constraints>
