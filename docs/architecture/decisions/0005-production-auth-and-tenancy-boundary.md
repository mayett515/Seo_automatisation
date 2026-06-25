# 0005 - Production Auth And Tenancy Boundary

Date: 2026-06-25
Status: Accepted

## Context

The API now has a project access guard scaffold, but the scaffold is not final SaaS authentication.

The project is about to need real customer data boundaries:

- Google Search Console connections and Search Analytics data
- reports and customer proof artifacts
- release approvals and deploy actions
- project dashboards and future customer/team access

This triggered the stealer workflow for production auth and tenancy. Local catalog research and current official docs were inspected before choosing the boundary.

## Decision

Use this production auth boundary:

```text
Better Auth owns identity and sessions.
NestJS guards own route authorization.
Postgres/Drizzle owns membership and permission data.
Fastify owns adapter/runtime plumbing only.
```

The protected request path should become:

```text
request
  -> Better Auth session validation
  -> authenticated user context
  -> Nest auth guard
  -> Nest project/customer access guard
  -> membership and permission lookup
  -> controller/service
```

Google Search Console OAuth is not application login. It is a project-scoped external provider connection and remains protected by project membership.

The current header-based project access guard remains a local/demo scaffold. It must be replaced or backed by Better Auth session and database membership before real customer data flows through the system.

## Consequences

What becomes easier:

- Auth primitives come from a library instead of custom session/OAuth code.
- Protected product routes use one Nest guard boundary.
- Project access can be tested as data: user, customer, project, role, permission.
- Fastify can be used for performance/runtime behavior without owning product policy.

Costs:

- We need a proper membership model.
- We need a Better Auth integration slice and adapter compatibility tests under Nest Fastify.
- Existing demo/header auth must be treated as scaffolding, not production security.

Follow-up work:

- Add customer/project membership tables or document a derived customer-membership model.
- Configure Better Auth with Drizzle/Postgres.
- Mount the auth handler under a deliberate route.
- Replace header-only access with session-backed user context.
- Add permission metadata for deploy, GSC, reports, approvals, and admin routes.
- Add actor metadata for user-triggered jobs and explicit system actor behavior for scheduled jobs.

## Alternatives Considered

### Keep Header-Based Auth

Rejected for production. Headers are useful for local scaffolding and tests, but they are not a trustworthy browser/user identity boundary.

### Put Authorization In Fastify Hooks

Rejected as the main product boundary. Fastify hooks are useful for raw request/runtime concerns, but Nest guards have controller and route metadata context. Product authorization belongs there.

### Build Custom Sessions

Rejected for now. Auth is security-sensitive and the local catalog explicitly warns against rolling custom primitives unless the library fit fails.

### External Identity Server First

Deferred. Keycloak/Ory-style systems may become useful later, but they are too heavy for the current modular-monolith MVP.

## Regression Guard

- Do not treat UUID-like route params as authorization.
- Do not expose GSC data, reports, releases, approvals, leads, tracking events, or deployments without project/customer access checks.
- Do not let agents or workers bypass tenant boundaries when acting on persisted data.
- Do not log session tokens, refresh tokens, access tokens, cookies, or authorization headers.
- Do not let Fastify plugin or hook convenience bypass Nest guards.
- Keep demo access explicit and isolated; it must not apply to persisted customer projects.

## Related Files

- `.ai-stealer-findings/2026-06-25-production-auth-tenancy.md`
- `.ai-nest-rules/04-guards-auth-tenancy.md`
- `.ai-nest-rules/SOURCES.md`
- `.ai-fastify-rules/SOURCES.md`
- `apps/api/src/auth/project-access.guard.ts`
- `apps/api/src/auth/project-access.guard.test.ts`
- `docs/architecture/decisions/0002-nest-backend-production-hardening.md`
