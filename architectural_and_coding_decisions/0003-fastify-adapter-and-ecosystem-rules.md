# 0003 - Fastify Adapter And Ecosystem Rules

Date: 2026-06-25

## Why This Decision Exists

The backend stack is NestJS with Fastify as the HTTP adapter. That means most application structure still belongs to Nest:

- modules
- controllers
- providers
- guards
- pipes
- lifecycle hooks

Fastify matters at the runtime adapter layer:

- adapter bootstrap
- plugin registration
- request/reply platform differences
- hooks
- validation/serialization performance
- logging/error behavior
- production reverse proxy assumptions

## Decision

Add a dedicated hidden rule bundle:

```text
.ai-fastify-rules/
```

This keeps Fastify-specific concerns separate from generic NestJS backend rules.

## Practical Boundary

Use Nest for:

- route structure
- dependency injection
- guards/auth
- validation/pipes/Zod contract parsing
- service/use-case orchestration
- lifecycle hooks

Use Fastify-specific guidance for:

- adapter behavior
- plugin ecosystem decisions
- raw request/reply edge cases
- Fastify hooks
- Fastify validation/serialization only when deliberately chosen
- production recommendations like reverse proxy assumptions

## Plugin Policy

Fastify has a large ecosystem. Plugin choices must be deliberate.

Before adding a plugin:

1. Check whether Nest already owns the concern.
2. Prefer official Fastify ecosystem plugins when a plugin is needed.
3. Check compatibility and maintenance.
4. Document security and production defaults.
5. Ask before installing dependencies.

## Production Reminder

Fastify recommends using a reverse proxy/load balancer for production edge concerns such as TLS termination, redirects, compression, multi-domain behavior, and static assets.

For this project, that likely means AWS/load-balancer infrastructure owns edge behavior, while Nest/Fastify focuses on application HTTP behavior.
