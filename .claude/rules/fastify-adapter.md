---
paths:
  - "apps/api/src/main.ts"
  - "apps/api/src/bootstrap/**/*.ts"
  - "apps/api/src/**/*plugin*.ts"
  - "apps/api/src/app.module.ts"
---

# Fastify Adapter

Fastify is the HTTP runtime adapter, not the application architecture. Nest
controllers, providers, guards, and pipes stay the primary abstraction; raw
Fastify request/reply APIs appear only at the bootstrap/plugin boundary, with
a documented reason when a route needs them.

## Plugins

- Before adding a Fastify plugin, check whether Nest already owns the concern.
  Prefer official ecosystem plugins; registration is centralized at bootstrap
  or an infrastructure module — never inside feature services.
- Adapter plugins (helmet, rate-limit, CORS, cookies, body limits) carry
  adapter-level behavior only; product authorization stays in Nest guards,
  and no plugin default may bypass guards, validation, or tenant isolation.
- Fastify hooks only for what Nest does not own (raw request behavior, abort
  detection). Client aborts do not cancel backend work unless cancellation is
  explicitly wired.

## Schemas

- Zod contracts own external input/output. Fastify JSON-schema serialization
  is allowed only with a measured performance case AND a single-source
  derivation — the same contract is never hand-maintained twice.

## Production exposure

- Production traffic sits behind a reverse proxy; `trustProxy` must match the
  real topology and is never enabled for directly exposed services.
- Public or unauthenticated write endpoints get their own rate-limit policy
  and payload limits; auth endpoints get their own, stricter one.
- Production boot fails fast when required secrets (auth/session, DB, queue,
  OAuth, ingestion) for exposed routes are missing — never boot degraded.
