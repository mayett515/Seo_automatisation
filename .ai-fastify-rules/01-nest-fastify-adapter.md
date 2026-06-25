---
description: "Rules for using Fastify as the NestJS HTTP adapter without leaking adapter details into application code"
globs: "apps/api/src/**/*.{ts,tsx}, **/*fastify*.md"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - "https://docs.nestjs.com/techniques/performance"
  - "https://docs.nestjs.com/faq/http-adapter"
  - "https://fastify.dev/docs/latest/"
priority_schema: "critical > strong > guideline"
---

# Nest Fastify Adapter

<positive-directives>
- Treat Fastify as the HTTP runtime adapter, not the application architecture.
- Keep Nest controllers, providers, guards, pipes, and modules as the primary application abstraction.
- Use Fastify-specific APIs only at the bootstrap/adapter/plugin boundary or when the feature genuinely requires Fastify runtime behavior.
- Enable Nest shutdown hooks when providers need lifecycle cleanup.
- Smoke-test changed routes because adapter/runtime behavior is not proven by TypeScript.
</positive-directives>

<absolute-constraints>
- DO NOT use raw Fastify request/reply APIs in controllers unless the route has a clear adapter-specific reason.
- DO NOT mix Express assumptions or middleware examples into Fastify-backed Nest code.
- DO NOT introduce adapter-specific behavior into shared packages.
</absolute-constraints>

<conditional-logic>
IF an implementation needs low-level Fastify access:
THEN document why Nest's normal controller/provider/guard/pipe abstraction is insufficient.
</conditional-logic>
