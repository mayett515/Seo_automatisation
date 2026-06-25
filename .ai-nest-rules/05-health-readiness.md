---
description: "Nest health rules for liveness, readiness, DB/Redis checks, queue readiness, and deploy/load-balancer health endpoints"
globs: "apps/api/src/**/*.{ts,tsx}, apps/worker/src/**/*.{ts,tsx}, **/*health*.md, **/*readiness*.md"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - "https://docs.nestjs.com/recipes/terminus"
priority_schema: "critical > strong > guideline"
---

# Health And Readiness

<positive-directives>
- Keep liveness simple: the HTTP process is up.
- Use readiness for dependencies: DB, Redis, queues, required provider configuration, and worker reachability where relevant.
- Prefer real dependency checks over configuration-only checks when the dependency gates production traffic.
- Prefer `/health/live` and `/health/ready` before production deployment.
- Use health checks to prevent routing traffic to instances that cannot process required work.
</positive-directives>

<absolute-constraints>
- DO NOT treat a static `/health` response as proof of production readiness.
- DO NOT mark queue-backed features ready when Redis or queue producers are unavailable.
- DO NOT mark a dependency `up` just because its environment variable exists.
</absolute-constraints>

<conditional-logic>
IF a health route is used by deployment infrastructure:
THEN separate liveness from readiness.

IF a route depends on DB or Redis:
THEN readiness should verify that dependency before traffic is considered safe.
</conditional-logic>
