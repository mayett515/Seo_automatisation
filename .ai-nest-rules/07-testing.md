---
description: "Nest and backend testing rules for pure logic, providers, controllers, workers, queues, and module wiring"
globs: "apps/api/src/**/*.{ts,tsx}, apps/worker/src/**/*.{ts,tsx}, packages/**/*.{ts,tsx}, **/*test*.md"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - "https://docs.nestjs.com/fundamentals/testing"
priority_schema: "critical > strong > guideline"
---

# Testing

<positive-directives>
- Start with pure logic tests for domain decisions, URL helpers, date ranges, OAuth state signing/verifying, and job parsing.
- Use Nest testing utilities for controllers/services/modules with mocked providers.
- Test queue producer behavior so queued responses require actual queue calls.
- Test worker idempotency for retry paths.
- Add focused behavioral tests for review findings that would not be caught by typecheck alone.
- Test authorization failure paths, especially guarded routes with missing project context and UUID project ids.
- Test public ingestion boundaries for tracking or webhook-style endpoints before persistence is added.
- Keep typecheck and lint in CI, but do not treat them as substitutes for behavioral tests.
</positive-directives>

<absolute-constraints>
- DO NOT call `test` complete when it only runs `tsc --noEmit` for high-risk backend logic.
- DO NOT leave OAuth, queue, tenancy, or deployment decision logic without targeted tests once real customer data is involved.
- DO NOT leave an ADR regression guard without either a test, lint rule, CI check, or explicit deferred note.
</absolute-constraints>
