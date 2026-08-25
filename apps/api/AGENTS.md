# API — NestJS on Fastify

NestJS is the application framework and Fastify is its HTTP adapter. Express idioms do not apply.

## HTTP and authorization

- Parse and validate requests before delegation. Authorize before fetching protected resources.
- Authentication, tenant ownership, and permissions live in guards and fail closed when context is missing.
- Request-supplied user or project identifiers are not trusted identity boundaries.
- A child-resource route resolves and authorizes its parent project before reading or mutating data.
- Privileged operations require explicit permissions, not bare membership.
- Map domain error codes to HTTP status codes centrally. Unknown failures are logged internally and returned as generic 500 responses.
- Responses consumed by the frontend are shared, schema-owned contracts; never expose raw ORM/provider errors or stack traces.

## Providers and Fastify

- Construct DB, Redis, queues, ciphers, and provider SDK adapters in providers or the composition root with explicit tokens.
- The provider that opens a resource closes it. Use one shared database provider per process.
- Register Fastify plugins centrally. Product authorization remains in Nest guards.
- Use Fastify hooks only for raw runtime concerns Nest does not own.
- Maintain one source for validation and serialization contracts; do not hand-maintain parallel Zod and JSON Schema shapes.
- `/health/live` means the process is alive. `/health/ready` verifies DB, Redis, queues, and required providers.
- After provider, module, controller, guard, plugin, or bootstrap changes, run the smoke-verify skill or an equivalent runtime proof.

## OAuth and secrets

- OAuth state is signed, expiring, one-time, and bound to the initiating session/user and project.
- Consume state nonces atomically (Redis: `GETDEL` or an equivalent Lua fallback) before any connection mutation — a replayable nonce is a finding.
- Never reuse the token-encryption key as the OAuth state-signing key when a dedicated state secret is available.
- Google Search Console OAuth is a project-scoped external connection, not application login.
- Mount Better Auth HTTP routes at the Fastify adapter boundary and feed the same Better Auth instance to Nest guards via DI — never two auth configurations.
- Use PKCE where supported and least-privilege scopes.
- Access tokens stay short-lived and in memory; only refresh tokens are persisted, encrypted.
- Encrypt refresh tokens at rest; never log tokens, authorization headers, or raw provider bodies.
- Production boot fails when secrets required by exposed routes are missing.

## Production exposure

- `trustProxy` must match the actual reverse-proxy topology; never enable broad proxy trust for directly exposed services.
- Public or unauthenticated write endpoints and auth endpoints get route-class-specific rate limits, not only the global API limit; app-level body limits and security headers before exposure.
- TLS termination, redirects, compression, and multi-domain concerns belong to the reverse proxy/edge, never to the Node process; document per deployment which layer owns TLS, redirects, health checks, scaling, and logs.
- Before changing timeout, proxy, compression, static-asset, or scaling behavior, check the current official Fastify recommendations first.

- A guard that proves the database or another required resource is available returns the narrowed handle, never `void`. Callers must not re-read `database.db` afterwards and add a second fallback: that branch is unreachable and claims a policy the guard already replaced.
