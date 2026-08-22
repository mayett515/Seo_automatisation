---
paths:
  - "**/auth/**/*.ts"
  - "**/guards/**/*.ts"
  - "**/*guard*.ts"
  - "**/*oauth*.ts"
  - "**/security/**/*.ts"
---

# Auth, Tenancy, and OAuth

Auth and tenant isolation are production blockers, not polish. Access is
modeled as: verified session -> membership check -> permission check ->
handler, and every guard fails closed when its context is missing.

## Guards and tenancy

- Authentication and project/tenant ownership checks live in guards before
  the handler. A UUID-like route param is never authorization; membership is
  checked against the database.
- A request-supplied user or project id (headers included) is never a trusted
  identity boundary. Validate id shape before UUID column lookups and return
  auth failures, never leaked DB type errors.
- Routes keyed by a child resource (e.g. a plan id) resolve the parent's
  project and authorize against it before touching data.
- Privileged actions (approve, deploy, connect providers, publish, admin)
  require an explicit role/permission check, not bare membership.
- Cookie/session auth on mutating routes has an explicit CSRF posture
  (SameSite plus Origin/Referer or token) before production exposure.
- Demo/scaffold bypasses are gated behind an explicit local-only flag;
  production boot fails if that flag is set.

## OAuth and provider tokens

- Refresh tokens encrypted at rest; access tokens short-lived. Never a
  provider token, session token, or authorization header in a log.
- OAuth state is signed, expiring, one-time (consume the nonce atomically,
  e.g. GETDEL), and bound to the initiating user/session and project. A
  callback from a different user than the one bound into state is rejected.
- PKCE where the provider supports it; least-privilege scopes first.
- Normalize provider errors before storing or exposing them; raw provider
  response bodies never reach the browser.
- Reconnecting a project/provider replaces or revokes the old refresh token.
