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
- Configure app-level body limits, security headers, and conservative rate limits before exposing API traffic.
- Use route-specific rate limits for public write endpoints when their traffic profile differs from authenticated API routes.
- Use route-specific rate limits for auth endpoints because login/session routes have different abuse profiles than ordinary API reads.
- Treat `trustProxy` as a deployment assumption that must match the actual reverse-proxy/load-balancer topology.
- Fail fast at production boot when required security/runtime environment variables for exposed routes are missing.
</positive-directives>

<absolute-constraints>
- DO NOT make Fastify directly responsible for multi-domain edge behavior unless deployment architecture explicitly requires it.
- DO NOT treat local `app.listen` behavior as production deployment design.
- DO NOT expose production traffic without a readiness strategy for DB, Redis, queues, and required provider config.
- DO NOT let production boot with missing auth/session, tracking-ingestion, OAuth token, database, or queue secrets when those routes are exposed.
- DO NOT leave public write endpoints without rate limiting, payload limits, and an explicit authentication or ingestion boundary.
- DO NOT enable broad proxy trust for directly exposed services or undocumented network topologies.
</absolute-constraints>

<conditional-logic>
IF `trustProxy` is enabled:
THEN document the expected proxy layer and ensure direct public access to the Node process is not part of production topology.

IF a public endpoint is high-volume or unauthenticated:
THEN define a separate rate-limit policy rather than relying only on the global API limit.

IF cookie-backed app auth is enabled:
THEN document and enforce the expected proxy/cookie/origin topology before exposing production traffic.

IF `NODE_ENV=production`:
THEN validate required runtime configuration during process startup, before listening for traffic.
</conditional-logic>
