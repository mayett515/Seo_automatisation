---
description: "Async workflow ordering, Promise combinator selection, async array helpers, concurrency pools, and legacy callback conversion"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Async Workflows and Concurrency

<meta-instruction>
Use this file when async code is mostly about execution order: callbacks, promises, async/await, sequential vs concurrent work, Promise combinators, async array helpers, bounded concurrency, async recursion, or async class initialization. Async orchestration belongs in the Procedural Shell. Keep pure decisions outside async effects when possible.
</meta-instruction>

## 1. Async Workflow Directives

<positive-directives>
- Use `async` / `await` for ordered side-effect workflows where step-by-step execution is clearest.
- Choose sequential `await`, parallel `Promise.all()`, partial-result `Promise.allSettled()`, first-success `Promise.any()`, or first-settled `Promise.race()` intentionally.
- Start independent promises before awaiting when operations should run concurrently.
- Use a bounded concurrency pool when unbounded parallelism could exhaust network, memory, file handles, database connections, or rate limits.
- Wrap legacy callback APIs with `util.promisify` or a small promise adapter at the boundary.
- Use static async factory methods such as `ClassName.create()` when class setup requires async initialization.
</positive-directives>

## 2. Hard Async Workflow Constraints

<absolute-constraints>
- DO NOT use `array.forEach(async () => ...)` when ordering, awaiting, or error handling matters.
- DO NOT use `Promise.all()` when partial success is acceptable and each failure must be inspected.
- DO NOT use `Promise.race()` when the actual requirement is first successful result.
- DO NOT create async constructors; JavaScript constructors cannot be awaited.
- DO NOT launch unbounded async work over large collections without a reason.
- DO NOT hide business policy inside async orchestration when it can be a named pure decision.
</absolute-constraints>

## 3. Promise Method Selection

<context>
Use this ladder:

```txt
single dependency chain     → sequential await
independent all-or-nothing → Promise.all
independent partial result → Promise.allSettled
first successful provider  → Promise.any
first settled event        → Promise.race
many items with pressure   → bounded concurrency pool
legacy callback API        → promisify at boundary
```
</context>

## 4. Examples

<context>
<example>
// Good: bounded concurrency is intentional.

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  limit: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await mapper(values[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, () => worker()),
  );

  return results;
}
</example>

<example>
// Bad: caller cannot await or catch these sends as a group.

async function sendReceipts(orders: readonly Order[]): Promise<void> {
  orders.forEach(async order => {
    await emails.sendReceipt(order.email, order.id);
  });
}
</example>
</context>

## 5. Routing Support

<conditional-logic>
IF operations depend on previous results:
THEN use sequential `await`.

IF operations are independent and all must succeed:
THEN start them together and use `Promise.all()`.

IF independent operations can fail separately:
THEN use `Promise.allSettled()` and inspect each result.

IF many operations run over a collection:
THEN choose sequential, full parallel, or concurrency-limited execution intentionally.

IF converting callback APIs:
THEN keep the conversion at the boundary and expose a promise-returning function to the rest of the code.
</conditional-logic>

<pre-flight-checklist>
1. [ ] Did I choose sequential, parallel, partial-result, first-success, first-settled, or bounded concurrency intentionally?
2. [ ] Does every started promise have an owner and an error path?
3. [ ] Did I avoid `forEach(async ...)` for awaited work?
4. [ ] Is async orchestration separated from pure policy decisions?
5. [ ] Did I avoid async constructors?
</pre-flight-checklist>
