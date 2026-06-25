---
description: "Fastify production recommendation rules for reverse proxy, TLS termination, scaling, timeouts, compression, capacity, and deployment readiness"
globs: "apps/api/src/**/*.{ts,tsx}, docs/**/*.md, architectural_and_coding_decisions/**/*.md, **/*deployment*.md"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - "https://fastify.dev/docs/latest/Guides/Recommendations/"
  - "https://fastify.dev/docs/latest/Guides/Serverless/"
  - "https://docs.nestjs.com/recipes/terminus"
priority_schema: "critical > strong > guideline"
---

# Production Recommendations

<positive-directives>
- Assume production HTTP traffic is behind a reverse proxy/load balancer for TLS termination, redirects, compression, and multi-domain concerns.
- Keep the Node/Fastify app focused on application HTTP behavior, not edge proxy responsibilities.
- Define liveness/readiness before production traffic.
- Review Fastify recommendations before changing timeout, proxy, compression, static asset, or scaling behavior.
- For AWS/Fargate, document which layer owns TLS, redirects, health checks, scaling, and logs.
</positive-directives>

<absolute-constraints>
- DO NOT make Fastify directly responsible for multi-domain edge behavior unless deployment architecture explicitly requires it.
- DO NOT treat local `app.listen` behavior as production deployment design.
- DO NOT expose production traffic without a readiness strategy for DB, Redis, queues, and required provider config.
</absolute-constraints>
