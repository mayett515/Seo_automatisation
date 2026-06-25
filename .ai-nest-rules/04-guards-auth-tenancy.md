---
description: "Nest guard rules for authentication, project authorization, tenant ownership, and route-level access control"
globs: "apps/api/src/**/*.{ts,tsx}, packages/db/src/**/*.{ts,tsx}, **/*auth*.md, **/*tenant*.md"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - "https://docs.nestjs.com/guards"
  - "https://docs.nestjs.com/security/authentication"
  - "https://docs.nestjs.com/security/authorization"
  - "https://better-auth.com/docs/concepts/session-management"
  - "https://better-auth.com/docs/plugins/organization"
  - ".ai-stealer-findings/2026-06-25-production-auth-tenancy.md"
priority_schema: "critical > strong > guideline"
---

# Guards, Auth, And Tenancy

<positive-directives>
- Put authentication and project/customer ownership checks in guards before route handlers.
- Model access as current user -> customer/project membership -> permission check -> handler.
- Let Better Auth own identity/session state; let Nest guards own product authorization.
- Keep GSC, reports, deployments, approvals, and customer data behind project-level authorization before real customer data exists.
- Treat auth/tenant isolation as a production blocker, not polish.
- Keep local demo access explicit; do not let demo bypasses apply to persisted customer projects.
- Treat Google Search Console OAuth as a project-scoped external connection, not as application login.
</positive-directives>

<absolute-constraints>
- DO NOT treat UUID-like route params as authorization.
- DO NOT expose GSC data, reports, leads, deployments, or tracking data without project access checks in production.
- DO NOT let agents or workers bypass the same project/tenant boundary when they act on persisted data.
- DO NOT treat header-based project context as production auth; wire it to Better Auth/session membership before real customers.
- DO NOT log Better Auth session tokens, OAuth refresh tokens, access tokens, cookies, or authorization headers.
- DO NOT put product authorization policy primarily in Fastify hooks when Nest guards can own it.
</absolute-constraints>

<conditional-logic>
IF a route is under `/projects/:projectId`:
THEN it eventually needs an auth guard plus project access guard before production use.

IF a background job acts on a project id:
THEN it must either inherit a validated actor/context or operate as a trusted system actor with explicit audit metadata.

IF the task wires application login/session handling:
THEN prefer Better Auth session primitives and verify Nest Fastify adapter compatibility before custom auth code.

IF the task wires role or permission checks:
THEN model the check from database-backed membership and route metadata, not from request headers or route params alone.
</conditional-logic>
