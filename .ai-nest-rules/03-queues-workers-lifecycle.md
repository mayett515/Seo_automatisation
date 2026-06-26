---
description: "BullMQ queue/worker rules for real enqueue boundaries, retries, idempotency, error listeners, graceful shutdown, and dry-run behavior"
globs: "apps/api/src/**/*.{ts,tsx}, apps/worker/src/**/*.{ts,tsx}, packages/contracts/src/**/*.{ts,tsx}, **/*queue*.md, **/*worker*.md"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - "https://docs.nestjs.com/techniques/queues"
  - "https://docs.bullmq.io/guide/queues"
  - "https://docs.bullmq.io/guide/workers"
  - "https://docs.bullmq.io/guide/workers/graceful-shutdown"
priority_schema: "critical > strong > guideline"
---

# Queues, Workers, And Lifecycle

<positive-directives>
- Queue producers must call the real BullMQ queue before returning a queued job contract.
- If queue infrastructure is missing, return a clear unavailable/configuration-required state or throw an explicit service-unavailable error.
- Make worker jobs idempotent across retries.
- Add worker error listeners.
- Close workers gracefully on shutdown and close shared resources after workers stop.
- Mark scaffold-only fake queued behavior as dry-run/demo, not production-ready.
- Use the shared Redis connection helper for API and worker BullMQ connections, including `rediss://` TLS handling.
- Include actor metadata for user-triggered jobs and explicit system-actor metadata for scheduled jobs.
- Wrap destructive retry paths in transactions or use replace/upsert patterns that cannot leave half-written data as success.
</positive-directives>

<absolute-constraints>
- DO NOT create persisted job/sync rows before confirming queue infrastructure exists.
- DO NOT return `queued` for real product workflows unless a job was actually enqueued.
- DO NOT start BullMQ workers without an `error` listener.
- DO NOT deploy workers without graceful shutdown handling.
- DO NOT accept `rediss://` without configuring TLS on the Redis/BullMQ connection.
- DO NOT enqueue project jobs without validated project context and audit actor metadata once persisted data is involved.
- DO NOT delete existing sync/deploy data and insert replacements outside a transaction if readers can observe partial state.
</absolute-constraints>

<conditional-logic>
IF a workflow returns `QueueJobSchema`:
THEN verify a real queue add happened or explicitly mark the response as dry-run/demo.

IF a job can retry:
THEN make writes replay-safe by using idempotency keys, deleting/replacing data for the same run id, or upserting.

IF a worker deletes and reinserts rows for the same run id:
THEN use a transaction or a staging/swap pattern so retries cannot expose partial success or permanently lose prior data.

IF a queue job was triggered by a user request:
THEN include `actorType`, `actorId`, project id, and request intent in the job/audit record.
</conditional-logic>
