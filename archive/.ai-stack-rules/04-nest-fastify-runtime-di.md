---
description: "NestJS/Fastify runtime DI guardrails for providers, explicit injection, route wiring, and module tests"
globs: "apps/api/src/**/*.{ts,tsx}, packages/**/*.{ts,tsx}, **/*.md"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - "https://docs.nestjs.com/providers"
  - "https://docs.nestjs.com/fundamentals/custom-providers"
  - "https://docs.nestjs.com/fundamentals/testing"
  - "https://docs.nestjs.com/controllers"
  - "https://docs.nestjs.com/techniques/validation"
  - "https://docs.nestjs.com/techniques/configuration"
  - "https://docs.nestjs.com/fundamentals/lifecycle-events"
  - "https://docs.nestjs.com/techniques/queues"
  - "https://docs.nestjs.com/recipes/terminus"
  - "https://docs.nestjs.com/exception-filters"
priority_schema: "critical > strong > guideline"
---

# Nest Fastify Runtime DI

<positive-directives>
- Register every injected dependency as a provider in the owning module or composition root.
- Use explicit `@Inject(Token)` when runtime metadata, abstract ports, custom providers, or tooling make constructor metadata unreliable.
- Keep controllers thin: validate input, delegate to services/use cases, and return schema-owned output.
- Use module/runtime smoke checks after controller/provider changes.
- Model DB clients, queues, ciphers, provider SDK adapters, and config-derived clients as providers or composition-root wiring instead of constructing them deep inside business methods.
- Use lifecycle hooks or owning providers to close DB, Redis, queue, and SDK resources.
- Use Zod or Nest pipes consistently at route/query/body trust boundaries.
- Return explicit unavailable/error states or Nest exceptions when required infrastructure such as Redis/queue is absent; do not return success-looking queued responses.
- Split liveness and readiness when real infrastructure checks matter.
</positive-directives>

<absolute-constraints>
- DO NOT assume `tsc` proves Nest runtime injection works.
- DO NOT instantiate provider adapters throughout business logic when a purpose-named port/composition root should own wiring.
- DO NOT put provider SDK details into controllers.
- DO NOT create persisted job/sync records before confirming the queue infrastructure needed to execute them exists.
- DO NOT use `body as SomeType` or raw casts for external request payloads when a schema exists or should exist.
- DO NOT log raw provider response bodies or secrets from OAuth/API failures.
</absolute-constraints>

<conditional-logic>
IF a service constructor starts creating several external dependencies:
THEN plan a provider/composition-root refactor before the service becomes the long-term boundary.

IF a route queues work:
THEN verify queue availability before returning a queued job contract.

IF a health route is used by deployment or load balancers:
THEN distinguish `/health/live` from readiness checks for DB, Redis, queues, and required providers.
</conditional-logic>
