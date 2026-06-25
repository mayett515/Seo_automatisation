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
priority_schema: "critical > strong > guideline"
---

# Nest Fastify Runtime DI

<positive-directives>
- Register every injected dependency as a provider in the owning module or composition root.
- Use explicit `@Inject(Token)` when runtime metadata, abstract ports, custom providers, or tooling make constructor metadata unreliable.
- Keep controllers thin: validate input, delegate to services/use cases, and return schema-owned output.
- Use module/runtime smoke checks after controller/provider changes.
</positive-directives>

<absolute-constraints>
- DO NOT assume `tsc` proves Nest runtime injection works.
- DO NOT instantiate provider adapters throughout business logic when a purpose-named port/composition root should own wiring.
- DO NOT put provider SDK details into controllers.
</absolute-constraints>
