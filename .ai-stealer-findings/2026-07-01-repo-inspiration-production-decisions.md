# Finding: Repo Inspiration For Production Decisions

Date: 2026-07-01
Source: local inspiration run over atproto, Bluesky feed-generator/Ozone/social-app, Vendure, Twenty, Drizzle ORM, Mastra, tRPC, Fastify, Nest, and related awesome lists.
License: pattern-only reference. No external code copied.

## What We Needed

After PR #4 and PR #5, the remaining production-readiness work is not mostly folder structure. It is a small set of policy and recovery decisions:

- tracking Redis outage posture,
- rollback manual-vs-auto trigger policy,
- pending rollback reconciliation,
- later single-writer lifecycle projections,
- future contract/query/queue organization as the app grows.

The inspiration run was useful because it compared mature monorepos and worker-heavy products without requiring this repo to adopt their frameworks wholesale.

## What The Sources Do Well

- `bluesky-social/atproto`: schema-first contract families, generated clients, thin runtime services over reusable packages.
- Bluesky feed-generator/AppView/Ozone patterns: separate ingestion/indexing from read models and review workflows.
- Vendure and Twenty: explicit job queue/worker lifecycle, named queues, and shared API/worker modules.
- Drizzle ORM and Mastra: schema-first tooling with clear package boundaries.
- tRPC/TanStack Query patterns: query option/key factories and typed frontend data boundaries.
- `express-rate-limit`, `@fastify/rate-limit`, and `rate-limiter-flexible`: mature rate-limit libraries default or recommend caution around store failures; in-memory fallback is explicitly per process and can allow extra actions across multi-process deployments.
- BullMQ: unrecoverable failures should bypass retries through `UnrecoverableError`.
- Stripe idempotency guidance vs Netlify restore docs: safe POST retries generally require explicit idempotency guarantees or a local operation/reconciliation model. Netlify restore is a provider POST and should not be treated as automatically safe for blind automation retries.
- Kubernetes API conventions: keep coarse workflow state separate from richer status facts/conditions when the UI needs explanation detail.

## What We Steal

- Keep the modular monolith. Do not split services before the local boundaries are proven insufficient.
- Treat public production mutations as strict boundaries; tolerate ingestion drift only where it cannot become an abuse or data-integrity surface.
- Model rollback automation as an operation lifecycle with deterministic workers and reconciliation, not as an immediate retry loop.
- Prefer approval/review/audit queues before full automation for risky production mutations.
- Keep read-model/indexing ideas for later GSC/opportunity/report surfaces.
- Keep package exports and query keys organized as the app grows, but avoid broad structure refactors before product behavior needs them.

## How It Maps To Our Stack

- Tracking posture should be decided as a security/product policy, not a code-style cleanup.
- Rollback automation should stay deterministic: API authorizes, worker mutates, reconciler observes, AI only recommends/explains.
- GSC and opportunity signals should remain ingestion/read-model pipelines with typed evidence.
- Future structure can split contracts, domain, DB schema, adapters, and frontend query options by bounded context while preserving the current public barrels.
- GSC reconnect-required failures should use BullMQ's terminal-failure pattern so retries do not degrade precise connection evidence.
- Deploy rows with provider evidence and timeout/unknown upload outcomes should stay reconcilable instead of becoming ordinary final-attempt failures.

## Source Links

- `express-rate-limit` configuration: https://express-rate-limit.mintlify.app/reference/configuration
- `@fastify/rate-limit` README: https://github.com/fastify/fastify-rate-limit
- `rate-limiter-flexible` insurance strategy: https://github.com/animir/node-rate-limiter-flexible/wiki/Overall-example
- BullMQ stop retrying jobs: https://docs.bullmq.io/patterns/stop-retrying-jobs
- BullMQ idempotent jobs: https://docs.bullmq.io/patterns/idempotent-jobs
- Google OAuth refresh token behavior: https://developers.google.com/identity/protocols/oauth2
- Stripe low-level error/idempotency guidance: https://docs.stripe.com/error-low-level
- Netlify OpenAPI restore endpoint: https://open-api.netlify.com/
- Kubernetes API conventions: https://github.com/kubernetes/community/blob/main/contributors/devel/sig-architecture/api-conventions.md

## Decision

Use this finding as input to the production-readiness decision batch. Do not adopt XRPC, tRPC, GraphQL, Nx, microservices, or plugin frameworks because another repo uses them.

The binding project direction belongs in ADR 0012 and follow-up implementation PRs.
