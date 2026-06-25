---
description: "Fastify hook and lifecycle rules for request behavior, abort handling, lifecycle ownership, and Nest/Fastify boundary control"
globs: "apps/api/src/**/*.{ts,tsx}, **/*hook*.md, **/*lifecycle*.md"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - "https://fastify.dev/docs/latest/Reference/Hooks/"
  - "https://fastify.dev/docs/latest/Guides/Detecting-When-Clients-Abort/"
  - "https://docs.nestjs.com/fundamentals/lifecycle-events"
priority_schema: "critical > strong > guideline"
---

# Hooks And Lifecycle

<positive-directives>
- Prefer Nest guards/interceptors/pipes for application concerns.
- Use Fastify hooks for adapter-level concerns such as raw request behavior, abort detection, plugin integration, or request lifecycle features Nest does not own.
- Keep hook registration centralized and documented.
- Ensure long-running handlers and workers have graceful shutdown or cancellation behavior where practical.
- Use early Fastify hooks for raw authentication rejection only when the auth method does not need parsed body access.
</positive-directives>

<absolute-constraints>
- DO NOT use Fastify hooks to bypass Nest guards, validation, or product approval gates.
- DO NOT scatter hook registration across feature modules without a clear owner.
- DO NOT assume client aborts cancel backend work unless cancellation is explicitly wired.
- DO NOT parse large request bodies before rejecting unauthorized requests when a safe earlier hook can reject them.
</absolute-constraints>
