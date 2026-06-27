# 0008 - Better Auth Integration Topology

Date: 2026-06-27
Status: Accepted

## Context

ADR 0005 accepted Better Auth as the production identity/session owner and Nest guards as the product authorization boundary.
The next slice needs concrete integration choices before any feature code is added.

The important hidden conflict is schema ownership:

- The app already has `users.id` as a UUID primary key.
- Customer/project authorization already points `customers.ownerUserId` and `customer_memberships.userId` at `users.id`.
- Better Auth needs user, session, account, and verification storage.
- ADR 0006 added `db:check`, so migrations must remain generated from the Drizzle schema instead of a separate auth migration source.

Official Better Auth docs support custom table names, UUID generation, Drizzle adapters, and DB-backed sessions. Better Auth's Fastify docs also expose the runtime shape: auth routes can live at the Fastify layer while protected app routes read the session through `auth.api.getSession(...)`.

## Decision

Use this integration topology:

```text
Fastify adapter layer:
  mounts Better Auth HTTP handler for /api/auth/*

Nest provider layer:
  owns the single Better Auth instance/config
  exposes it to BetterAuthGuard and future auth helpers

Nest guard layer:
  BetterAuthGuard reads Better Auth session
  ProjectAccessGuard proves customer/project membership
  PermissionGuard checks route action permissions

Drizzle schema:
  remains the single migration source of truth
```

Keep the existing UUID-backed `users` table as the canonical app user table. Better Auth must be configured to map its user model to `users` and to use UUID-compatible id generation.

Declare Better Auth's core storage in `packages/db/src/schema.ts`:

```text
users
sessions
accounts
verifications
```

Use plural table names to match the rest of the project schema. The future Better Auth config must map model names accordingly instead of expecting default singular table names.

App-route CSRF is part of the auth topology, not a later afterthought:

```text
Better Auth routes:
  rely on Better Auth trustedOrigins, cookie settings, origin/fetch-metadata behavior, and route-specific auth rate limits.

Local SEO app routes:
  unsafe cookie-authenticated methods require explicit SameSite, trusted Origin/Referer, and/or CSRF-token enforcement before production exposure.
```

Google OAuth remains a GSC project integration, not application login. Better Auth sessions identify the app user; Google OAuth only grants Search Console access for a project after membership is re-checked.

## Consequences

What becomes easier:

- Slice 1 can wire Better Auth without replacing the tenant membership model.
- `customer_memberships.userId` continues to reference the same `users.id` used by sessions.
- `db:check` remains meaningful because Better Auth tables are declared in the same Drizzle schema.
- Nest guards stay the product authorization boundary even though Better Auth routes are mounted at the Fastify layer.

Costs:

- Better Auth config must explicitly map plural table names.
- Existing auth code must stop treating `x-user-id` as production identity once `BetterAuthGuard` lands.
- The `users` table needs Better Auth-compatible fields such as `email_verified` and `image`.
- CSRF and auth route rate limits need concrete code in Slice 1, not only documentation.

## Alternatives Considered

### Let Better Auth Own Separate Migrations

Rejected. This would create two schema sources and weaken the new migration drift check.

### Replace Existing UUID Users With Better Auth Defaults

Rejected. The current membership and customer tables already reference `users.id`; changing the identity type now would force unnecessary data-model churn.

### Wrap Better Auth Entirely In Nest Controllers

Rejected for the first implementation. Better Auth owns raw auth HTTP behavior, cookies, and callback routing. Wrapping those routes through Nest controllers risks double parsing and framework glue errors. Nest should consume the resulting session for product authorization.

### Put Product Authorization In Fastify Hooks

Rejected. Fastify owns runtime plumbing. Product authorization needs route metadata and belongs in Nest guards.

## Regression Guard

- Do not introduce a second migration source for Better Auth tables.
- Do not create a second Better Auth instance for the guard and the HTTP handler.
- Do not let Better Auth social/OAuth login become the GSC project connection model.
- Do not trust `x-user-id` or frontend-provided roles once session auth is wired.
- Do not expose unsafe cookie-authenticated app routes without a CSRF/origin decision in code.
- Do not let auth route mounting bypass the global production runtime, CORS, cookie, and rate-limit decisions.

## Follow-Up Work

- Add the Better Auth provider/config under the API composition root.
- Mount `/api/auth/*` through the Fastify adapter with route-appropriate rate limiting.
- Add `BetterAuthGuard` and request auth typing.
- Replace scaffold user-header extraction with session-derived user context.
- Add app-route CSRF protection for unsafe cookie-authenticated methods.
- Add GSC OAuth session binding, Redis nonce consume, PKCE, safe redirect, and project re-check in the next OAuth slice.

## Related Sources

- Better Auth database docs: `https://better-auth.com/docs/concepts/database`
- Better Auth Drizzle adapter docs: `https://better-auth.com/docs/adapters/drizzle`
- Better Auth Fastify integration docs: `https://better-auth.com/docs/integrations/fastify`
- Better Auth session docs: `https://better-auth.com/docs/concepts/session-management`

## Related Files

- `packages/db/src/schema.ts`
- `packages/db/migrations/0005_sturdy_imperial_guard.sql`
- `.ai-nest-rules/04-guards-auth-tenancy.md`
- `.ai-fastify-rules/02-plugins-ecosystem.md`
- `.ai-fastify-rules/06-production-recommendations.md`
- `.ai-stack-rules/05-oauth-provider-security.md`
- `docs/architecture/decisions/0005-production-auth-and-tenancy-boundary.md`
- `docs/architecture/decisions/0006-anti-regression-guardrails.md`
