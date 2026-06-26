# 2026-06-26 - Good Artist Inspiration: Security And Workflow Patterns

Capability: Defensive reference-mining for the next Local SEO platform hardening slices: session identity, OAuth callback safety, public event ingestion, queue idempotency, release approval gates, audit context, and report-safe serialization.

## Why This Research Happened

The post-`ec00899` review cycle surfaced a pattern: several risks were not isolated bugs, but recurring product-architecture categories.

Using safer language, this is the **Good Artist Inspiration Workflow**: inspect proven systems, extract the shape of the solution, then adapt it to our stack without copying code.

## Local Inspiration Sources

- `C:\a good artist steals\repo-catalog\22-auth-and-identity\README.md`
- `C:\a good artist steals\repo-catalog\12-fullstack-feature-patterns\README.md`
- `C:\a good artist steals\repo-catalog\13-backend-frameworks-and-patterns\README.md`
- `C:\a good artist steals\repo-catalog\23-database-and-orm\README.md`
- `C:\a good artist steals\repo-catalog\26-payments-and-billing\README.md`
- `C:\a good artist steals\repo-catalog\27-email-and-messaging\README.md`

## External References Checked

- RFC 9700 OAuth 2.0 Security Best Current Practice: https://datatracker.ietf.org/doc/rfc9700/
- RFC 6819 OAuth 2.0 Threat Model: https://www.rfc-editor.org/info/rfc6819/
- Google OAuth Web Server Applications: https://developers.google.com/identity/protocols/oauth2/web-server
- OWASP API1:2023 Broken Object Level Authorization: https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/
- Better Auth Drizzle adapter: https://better-auth.com/docs/adapters/drizzle
- Better Auth Organization plugin: https://www.better-auth.com/docs/plugins/organization
- NestJS Guards and Authorization: https://docs.nestjs.com/guards and https://docs.nestjs.com/security/authorization
- Fastify rate-limit plugin: https://github.com/fastify/fastify-rate-limit
- Fastify request/proxy behavior: https://fastify.io/docs/v5.4.x/Reference/Request/
- Stripe idempotent requests: https://docs.stripe.com/api/idempotent_requests
- Stripe webhooks/raw-body verification: https://docs.stripe.com/webhooks
- BullMQ idempotent jobs: https://docs.bullmq.io/patterns/idempotent-jobs
- BullMQ job ids: https://docs.bullmq.io/guide/jobs/job-ids
- BullMQ rate limiting: https://docs.bullmq.io/guide/rate-limiting
- PostHog public capture endpoints: https://posthog.com/docs/api/capture
- PostHog ingestion pipeline: https://posthog.com/docs/how-posthog-works/ingestion-pipeline
- OpenMeter usage event deduplication: https://openmeter.io/docs/metering/events/usage-events
- Cal.com permission patterns: https://github.com/calcom/cal.com/blob/main/PERMISSIONS.md
- Cal.com OAuth state docs: https://cal.com/docs/api-reference/v2/oauth
- ATProto OAuth/client-auth discussions and docs: https://docs.bsky.app/blog/oauth-improvements and https://github.com/bluesky-social/atproto/discussions/3950

## Pattern 1: Verified Identity Before Authorization

Functional category: authentication + authorization split.

Observed pattern:

- Mature systems separate "who is this user?" from "what may this user do?"
- Nest guards are the correct boundary for runtime authorization decisions.
- OWASP treats object-level authorization on user-supplied ids as a top API risk.
- Cal.com documents team/admin/owner checks around concrete operations, not just generic membership.

Adapted Local SEO decision:

```text
Better Auth session -> authenticated user context -> Nest project guard -> DB membership/role -> handler
```

Do not let `x-user-id` become production identity. Do not let `projectId` possession become authorization.

## Pattern 2: Delegated Authorization Callback Handshakes

Functional category: OAuth/OIDC provider connection.

Observed pattern:

- OAuth state is not just a redirect helper; it binds request and callback to prevent CSRF.
- RFC 6819 explicitly frames state as binding the authorization request to the user's authenticated state.
- RFC 9700 requires CSRF protection through PKCE/state/nonce depending on flow.
- Cal.com describes state as a per-session CSRF token that must be verified on callback.

Adapted Local SEO decision:

GSC OAuth state should bind:

```text
projectId
initiating app user/session
expiresAt
one-time nonce
safe redirect target
```

The callback must validate session/user, consume nonce, verify project membership, and only then store provider tokens.

## Pattern 3: Public Event Ingestion

Functional category: analytics/write-key ingestion.

Observed pattern:

- PostHog public capture endpoints use a project token and return no sensitive data.
- OpenMeter treats event identity as `source + id` and deduplicates re-sent events.
- Analytics write keys are publishable enough to be exposed in client apps; they are not equivalent to private secrets.

Adapted Local SEO decision:

Tracking should become:

```text
project-scoped publishable ingestion key
allowlisted event schema
route/domain scoping
event id + source for dedupe
append-only persisted/queued event
explicit dry-run/not-persisted response if storage is not active
```

The current global `TRACKING_INGEST_TOKEN` is a temporary gate, not the final architecture.

## Pattern 4: Idempotent Side-Effect Processing

Functional category: idempotency/retry/replay safety.

Observed pattern:

- Stripe uses idempotency keys so client retries cannot duplicate side effects.
- BullMQ explicitly requires retryable jobs to be idempotent.
- BullMQ custom job ids can act as dedupe handles for predictable job creation.
- Payment/webhook systems authenticate requests and reject replay windows because callbacks arrive out of order and repeat.

Adapted Local SEO decision:

For deploy, GSC sync, tracking ingestion, sitemap publication, rollback, and report generation:

```text
idempotency key or stable job id
actor metadata
transaction/staging/upsert for multi-step DB writes
retry-safe worker side effect
stored response/result where appropriate
```

Delete-then-insert retry paths need a transaction or staging/swap model before they are customer-facing.

## Pattern 5: Approval-Gated State Machines

Functional category: production mutation gate.

Observed pattern:

- Payment systems model authorize -> capture -> refund as explicit states.
- Billing/subscription systems model long-running lifecycle transitions rather than trusting request order.
- Notification/workflow systems queue steps but keep workflow state explicit.

Adapted Local SEO decision:

Release deploy must become:

```text
draft/ready -> approved_for_deploy -> deploying -> live/failed/rollback_recommended
```

The deploy endpoint must load persisted release state and checks, verify `canDeployRelease(...)`, verify `releasePlanId -> projectId`, include actor context, and only then enqueue the worker.

## Pattern 6: Customer-Safe Data Egress

Functional category: output boundary / serialization safety.

Observed pattern:

- Mature APIs separate internal diagnostic endpoints from customer-facing payloads.
- Zod/shared schema systems work best when output contracts are explicit, not implied by source tables.

Adapted Local SEO decision:

GSC performance rows are internal-radar data. Customer report contracts must actively exclude:

```text
impressions
ctr
average_position
raw diagnostic GSC tables
```

The report slice should add an executable schema/serializer test, not only an AI rule.

## Recommended Next Research Checkpoints

Before coding each slice, use this file as the source map:

1. Better Auth session and roles: Better Auth docs + Nest guards + Cal.com permissions.
2. GSC OAuth callback hardening: RFC 9700/RFC 6819 + Google OAuth + Cal.com OAuth state.
3. Tracking ingestion: PostHog public capture + OpenMeter event dedupe.
4. Deploy worker idempotency: Stripe idempotency + BullMQ idempotent jobs + DB transaction patterns.
5. Report safety: local SEO anti-regression rules + explicit output schema tests.

## Do Not Copy

No code was copied into the project. These are source patterns and architecture shapes only.
