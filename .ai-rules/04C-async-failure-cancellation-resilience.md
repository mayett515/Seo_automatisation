---
description: "Async failure handling, retries, backoff, cancellation, timeouts, cleanup, idempotency, and detached task ownership"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Async Failure, Cancellation, and Resilience

<meta-instruction>
Use this file when async code can fail, timeout, retry, be cancelled, perform cleanup, run detached work, or need idempotency. This file protects the Procedural Shell from lost errors and hidden lifetimes.
</meta-instruction>

## 1. Resilience Directives

<positive-directives>
- Use `try` / `catch` around awaited effects when the shell can handle or translate the failure.
- Treat caught errors as `unknown` until narrowed.
- Pass `AbortSignal` through APIs that support cancellation.
- Add retries only for operations that are safe to retry or explicitly idempotent.
- Use backoff and retry limits for flaky external services.
- Use `finally` or equivalent cleanup for loaders, locks, connections, stream readers, temporary resources, or spans.
</positive-directives>

## 2. Hard Resilience Constraints

<absolute-constraints>
- DO NOT swallow async errors with empty `catch` blocks.
- DO NOT use retry loops around non-idempotent mutations without an idempotency key or duplicate guard.
- DO NOT implement timeouts with `Promise.race()` while leaving the losing operation running without cancellation or cleanup.
- DO NOT fire-and-forget promises without explicit ownership, logging, queueing, or failure strategy.
- DO NOT convert every async error into `null` or `string` when callers need typed failure reasons.
- DO NOT put retry, timeout, or cancellation behavior inside pure-looking domain helpers.
</absolute-constraints>

## 3. Failure Model

<context>
Async failures need a shape:

```txt
expected business failure → typed Result / decision / domain error
external system failure   → thrown error translated at boundary
cancelled work            → AbortSignal path
partial failure           → allSettled-style inspection
unknown failure           → narrow from unknown before handling
```
</context>

## 4. Examples

<context>
<example>
// Good: detached work is explicitly owned and logged.

function startBackgroundSync(userId: UserId): void {
  void syncUser(userId).catch(error => {
    logger.error({ error, userId }, "Background user sync failed");
  });
}
</example>

<example>
// Bad: mystery floating promise; no owner, no catch, no retry, no queue.

function startBackgroundSync(userId: UserId): void {
  syncUser(userId);
}
</example>
</context>

## 5. Routing Support

<conditional-logic>
IF work has a request lifetime or UI lifetime:
THEN pass `AbortSignal` through cancellable APIs.

IF a timeout is needed:
THEN prefer a cancellation-aware timeout over a bare `Promise.race()`.

IF retrying external calls:
THEN check idempotency, retry limit, backoff, and observability.

IF partial failure is valid:
THEN represent individual outcomes instead of throwing away successful results.

IF work is intentionally detached:
THEN mark it with `void` and attach a catch/log/queue owner.
</conditional-logic>

<pre-flight-checklist>
1. [ ] Is each async failure expected, external, cancelled, partial, or unknown?
2. [ ] Did I narrow caught errors before reading properties?
3. [ ] Does retry have a limit and idempotency story?
4. [ ] Does timeout also cancel or clean up?
5. [ ] Does detached work have an explicit owner?
</pre-flight-checklist>
