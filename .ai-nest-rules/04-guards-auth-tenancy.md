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
- Require database-backed membership checks for UUID-like persisted project ids.
- Treat Google Search Console OAuth as a project-scoped external connection, not as application login.
- Make project guards fail closed when a guarded route has no project context.
- Derive current user identity from a verified Better Auth/session context before any persisted customer data is reachable.
- Gate `demo-project` and non-UUID scaffold access to non-production environments only.
- Validate user ids before DB membership lookup and return auth failures instead of leaking DB type errors.
- Use route metadata or explicit guard variants for permission-sensitive actions such as approve, deploy, GSC connect, report publishing, and admin changes.
- When cookie/session auth protects mutating routes, define the SameSite, Origin/Referer, and CSRF-token posture before production exposure.
</positive-directives>

<absolute-constraints>
- DO NOT treat UUID-like route params as authorization.
- DO NOT expose GSC data, reports, leads, deployments, or tracking data without project access checks in production.
- DO NOT let agents or workers bypass the same project/tenant boundary when they act on persisted data.
- DO NOT treat header-based project context as production auth; wire it to Better Auth/session membership before real customers.
- DO NOT authorize UUID-like project ids through request headers alone.
- DO NOT treat `x-user-id`, `x-project-id`, or `x-project-ids` as a trustworthy production identity boundary.
- DO NOT let `demo-project` bypass authentication or ingestion boundaries in production.
- DO NOT expose credentialed cookie-based POST/PUT/PATCH/DELETE routes without an explicit CSRF protection decision.
- DO NOT log Better Auth session tokens, OAuth refresh tokens, access tokens, cookies, or authorization headers.
- DO NOT put product authorization policy primarily in Fastify hooks when Nest guards can own it.
- DO NOT protect release-plan-only routes with a project guard unless the route or guard resolves the release plan's project id first.
- DO NOT let a membership row grant every operation when the route requires owner/admin/editor-level permission.
</absolute-constraints>

<conditional-logic>
IF a route is under `/projects/:projectId`:
THEN it eventually needs an auth guard plus project access guard before production use.

IF a route is keyed by `releasePlanId`:
THEN include `projectId` in the route or load the release plan and authorize against its project before allowing the handler.

IF a project id is UUID-like:
THEN treat it as persisted customer data and authorize via database membership, not `x-project-id` or `x-project-ids`.

IF the route uses `demo-project` or a non-UUID scaffold id:
THEN allow it only in local/non-production modes and keep the bypass visibly isolated from persisted projects.

IF a request supplies a user id:
THEN accept it only after a trusted auth/session layer produced it; reject malformed ids before querying UUID columns.

IF a route can approve, deploy, connect OAuth/GSC, publish reports, change tracking keys, or administer users:
THEN require an explicit role/permission check, not just generic project membership.

IF a route receives both `projectId` and `releasePlanId`:
THEN verify the release plan belongs to the route project before mutating, enqueueing, or returning sensitive release data.

IF a background job acts on a project id:
THEN it must either inherit a validated actor/context or operate as a trusted system actor with explicit audit metadata.

IF the task wires application login/session handling:
THEN prefer Better Auth session primitives and verify Nest Fastify adapter compatibility before custom auth code.

IF session cookies are accepted on mutating routes:
THEN verify SameSite settings and add CSRF-token or Origin/Referer validation where the auth provider does not already cover the risk.

IF the task wires role or permission checks:
THEN model the check from database-backed membership and route metadata, not from request headers or route params alone.
</conditional-logic>
