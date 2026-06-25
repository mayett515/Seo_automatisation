---
description: "Procedural shell for orchestration and side effects"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Procedural Shell

<meta-instruction>
Use this file for workflow orchestration. The shell is allowed to be imperative and procedural because it coordinates real-world effects.
</meta-instruction>

<positive-directives>
- Use clear step-by-step async/await for ordered side effects.
- Load external state, ask the functional core for decisions, then execute effects.
- Keep workflow order obvious with early returns where readable.
- Preserve repo-standard error and response conventions.
- Keep shell code boring and explicit.
</positive-directives>

## Shell responsibilities

```txt
HTTP requests
DB reads/writes
file system
payment provider calls
emails
logging
analytics
queues
framework responses
cookies
current time
randomness
```

<absolute-constraints>
- DO NOT hide side effects inside mappers, validators, or decision functions.
- DO NOT force async workflows into clever Promise chains.
- DO NOT mix large policy logic into handlers when it can be named and tested.
- DO NOT catch errors silently unless the ignored case is explicitly documented and safe.
- DO NOT return fake success when an effect failed.
</absolute-constraints>

<context>
<example>
// Good: procedure orchestrates, core decides
```ts
const order = await deps.orders.findById(input.orderId);
const decision = decideReturn(order, input);
if (!decision.ok) return decision;
await deps.payments.refund({ amount: decision.value.refundAmount });
```
</example>

<example>
// Bad: workflow hides a policy and effect in one branch
```ts
if (order.status !== 'fulfilled') throw new Error('Bad order');
await payment.refund(order.paymentId, item.unitPrice * input.quantity);
```
</example>
</context>

<pre-flight-checklist>
1. [ ] Is the order of effects obvious?
2. [ ] Did pure decisions happen before mutation/effects?
3. [ ] Did I preserve the repo’s existing shell conventions?
</pre-flight-checklist>
