# Finding: Production Auth And Tenancy Boundary

Date: 2026-06-25
Capability: Production authentication, project/customer authorization, OAuth/session handling, and tenant isolation.
Code copied: None.
License impact: None. This finding extracts architecture patterns only.

## What We Needed

The current API has a project access guard scaffold for local/demo safety, but real SaaS use still needs production auth:

- user identity and session validation
- project/customer membership lookup
- role/permission checks
- Google Search Console data protection
- audit context for workers and system actions
- a clean NestJS/Fastify boundary

This is a required stealer checkpoint because auth and tenancy affect the data model, request boundary, security posture, and every project-scoped API route.

## Local Sources Inspected

- `C:\a good artist steals\repo-catalog\22-auth-and-identity\README.md`
- `C:\a good artist steals\repo-catalog\13-backend-frameworks-and-patterns\README.md`
- `.ai-stealer-catalog/repo-catalog/22-auth-and-identity/README.md`
- `.ai-stealer-catalog/repo-catalog/13-backend-frameworks-and-patterns/README.md`
- `.ai-nest-rules/04-guards-auth-tenancy.md`
- `docs/architecture/decisions/0002-nest-backend-production-hardening.md`

Local catalog takeaways:

- Do not roll custom auth primitives unless there is no library fit.
- Better Auth is the preferred TypeScript library direction for sessions, OAuth, plugins, organizations, and RBAC.
- NestJS owns the module/provider/guard pipeline.
- Fastify owns adapter/runtime hooks and plugins, not product authorization policy.
- Authorization belongs at protected entry points, not scattered through business logic.

## Web Sources Inspected

- NestJS Guards: https://docs.nestjs.com/guards
- NestJS Authentication: https://docs.nestjs.com/security/authentication
- NestJS Authorization: https://docs.nestjs.com/security/authorization
- NestJS Fastify adapter: https://docs.nestjs.com/techniques/performance
- Better Auth NestJS integration: https://better-auth.com/docs/integrations/nestjs
- Better Auth Fastify integration: https://better-auth.com/docs/integrations/fastify
- Better Auth Session Management: https://better-auth.com/docs/concepts/session-management
- Better Auth Cookies: https://better-auth.com/docs/concepts/cookies
- Better Auth Organization plugin: https://better-auth.com/docs/plugins/organization
- Better Auth Drizzle adapter: https://better-auth.com/docs/adapters/drizzle
- Better Auth Security: https://www.better-auth.com/docs/reference/security
- Fastify Hooks: https://fastify.dev/docs/latest/Reference/Hooks/
- Fastify Routes: https://fastify.dev/docs/latest/Reference/Routes/
- Fastify Ecosystem: https://fastify.dev/ecosystem/
- Fastify auth plugin: https://github.com/fastify/fastify-auth
- Fastify helmet plugin: https://github.com/fastify/fastify-helmet

## What The Sources Do Well

NestJS:

- Guards decide whether a request reaches a route handler based on runtime context such as roles, permissions, or ACLs.
- Authorization can use RBAC for simple cases, and policy-style checks for more complex cases.
- Guards have route-handler context; generic middleware does not.

Better Auth:

- Manages sessions with cookie-backed session tokens and server verification.
- Has database-backed sessions, expiration, refresh, revocation, and session freshness concepts.
- Provides an organization plugin with organizations, members, roles, custom permissions, and invitations.
- Provides Drizzle adapter support and schema generation paths.
- Provides NestJS and Fastify integration guidance, but the NestJS integration is community maintained and Fastify support is explicitly something to verify before production.

Fastify:

- Hooks run in a specific request lifecycle and can be scoped by plugin encapsulation.
- Fastify auth can run at route-level or hook-level, and early hooks avoid parsing unauthorized request bodies.
- Fastify plugins are useful for adapter-level concerns such as CORS, cookies, security headers, and raw request behavior.

## What We Steal

The shape, not code:

```text
Better Auth owns identity:
  users, accounts, sessions, OAuth providers, session cookie behavior

NestJS owns authorization:
  AuthGuard/session extraction
  ProjectAccessGuard/customer/project membership check
  permission decorators or policy metadata

Database owns tenant relationships:
  customers/projects
  memberships
  roles/permissions
  audit actors for user/system actions

Fastify owns runtime plumbing:
  CORS/cookies/security headers/raw handler compatibility
  no product authorization policy in raw hooks unless strictly adapter-level
```

## How It Maps To Our Stack

Recommended request flow:

```text
HTTP request
  -> Better Auth session validation
  -> attach authenticated user context
  -> Nest AuthGuard
  -> Nest ProjectAccessGuard
  -> membership lookup: user -> customer/project -> role/permission
  -> controller
  -> service/use case
```

Recommended data-model direction:

```text
users
customers
projects
customer_memberships
project_memberships or derived project access through customer membership
roles / permissions
audit_events or actor metadata on sensitive actions
```

Recommended worker direction:

```text
User-triggered job:
  validated actor + project id stored on job payload/audit metadata

System job:
  explicit system actor id/reason
  no invisible tenant bypass
```

Recommended OAuth separation:

```text
App auth OAuth:
  Better Auth social/OIDC providers for login identity

Google Search Console OAuth:
  project-scoped external connection
  protected by project membership
  refresh token encrypted at rest
  not a login session
```

## Decision

Use Better Auth for application identity/session management and NestJS guards for project/customer authorization.

Do not treat the current header-based `ProjectAccessGuard` as production auth. It remains a scaffold until it is wired to Better Auth sessions and database-backed membership.

Do not move business authorization into Fastify hooks. Fastify may support the auth handler, cookies, CORS, security headers, and raw request behavior; Nest guards remain the policy boundary for protected product routes.

## Implementation Slices

1. Auth foundation:
   - configure Better Auth with Drizzle/Postgres
   - mount auth handler under a deliberate route
   - verify Nest/Fastify raw-body/cookie/CORS behavior in local smoke tests

2. Membership model:
   - add customer/project membership tables or a clear derived access model
   - define product roles and permissions
   - derive project access from membership, not route params or headers

3. Guard wiring:
   - replace header-only auth context with Better Auth session extraction
   - keep `demo-project` bypass isolated to demo-only routes/data
   - add permission metadata for deploy, GSC, reports, approvals, and admin routes

4. Audit and worker context:
   - add actor metadata to user-triggered jobs
   - define system actor behavior for scheduled/deterministic jobs
   - log authorization denials without leaking secrets or tokens

5. Verification:
   - tests for session missing, membership missing, wrong project, role denied, role allowed
   - smoke check auth route under Nest Fastify adapter
   - CI keeps tests, lint, typecheck, build, and format checks active

## Regression Guards

- No production route may accept a persisted `projectId` as proof of authorization.
- No route may expose GSC data, reports, deployments, approvals, leads, or tracking data without project/customer access checks.
- No worker may act on a persisted project without user actor metadata or explicit system actor metadata.
- No raw Google OAuth token, Better Auth session token, refresh token, cookie, or authorization header may be logged.
- No Fastify plugin or hook may bypass Nest guards for product authorization.
