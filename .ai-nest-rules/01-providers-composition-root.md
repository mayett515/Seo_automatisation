---
description: "Nest provider and composition-root rules for DB clients, queues, adapters, ciphers, config-derived services, and resource ownership"
globs: "apps/api/src/**/*.{ts,tsx}, packages/adapters/src/**/*.{ts,tsx}, packages/db/src/**/*.{ts,tsx}, **/*provider*.md"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - "https://docs.nestjs.com/providers"
  - "https://docs.nestjs.com/fundamentals/custom-providers"
  - "https://docs.nestjs.com/fundamentals/lifecycle-events"
priority_schema: "critical > strong > guideline"
---

# Providers And Composition Root

<positive-directives>
- Put infrastructure construction in providers or composition-root modules: DB clients, queues, token ciphers, provider SDK adapters, and config-derived clients.
- Use explicit provider tokens for ports, adapters, queues, DB handles, and ciphers.
- Keep controllers thin and services focused on use-case orchestration, not repeated SDK/client construction.
- Own resource cleanup in the provider that created the resource.
- Use lifecycle hooks for resources that must close on shutdown.
</positive-directives>

<absolute-constraints>
- DO NOT let feature services become long-term factories for DB, Redis, BullMQ, OAuth adapters, or provider SDK clients.
- DO NOT instantiate outbound provider adapters throughout business logic when a purpose-named port/provider should own wiring.
- DO NOT duplicate provider construction between API and worker without a clear composition-root boundary.
</absolute-constraints>

<conditional-logic>
IF a constructor creates more than one external dependency:
THEN plan a provider/composition-root refactor before adding more behavior to that service.

IF a provider owns a connection, queue, pool, or SDK client:
THEN define how it is closed during shutdown.
</conditional-logic>
