---
description: "Functional core: pure decisions, validation, and transformations"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Functional Core

<meta-instruction>
Use this file when business logic, validation, calculations, transformations, or state decisions appear. The functional core should be pure where practical.
</meta-instruction>

<positive-directives>
- Extract important decisions into pure functions.
- Pass time, randomness, and external state as inputs when needed.
- Return plain data, decisions, or typed failures.
- Keep side effects outside core functions.
- Name the business meaning, not just the implementation step.
</positive-directives>

## Typical core functions

```txt
decideReturn()
decideBookingLimit()
decideRouteAccess()
parseClipboardContent()
calculateOrderTotals()
applySubscriptionEvent()
```

<absolute-constraints>
- DO NOT call databases, HTTP APIs, email clients, queues, loggers, or payment providers inside pure decision functions.
- DO NOT mutate inputs unless the repo convention requires it and the mutation is explicit.
- DO NOT throw generic errors for expected domain failures.
- DO NOT bury important policies inside anonymous callbacks.
- DO NOT force functional style when an existing tiny pure helper is already clear.
</absolute-constraints>

<context>
<example>
// Good: decision independent of infrastructure
```ts
function decideAdvancedAnalyticsAccess(ctx: AccessContext): AccessDecision {
  if (ctx.user.role === 'admin') return { kind: 'allow', reason: 'admin' };
  if (ctx.billingStatus !== 'active') return { kind: 'deny', reason: 'billing_inactive' };
  return { kind: 'deny', reason: 'plan_not_entitled' };
}
```
</example>

<example>
// Bad: pure-looking rule talks to infrastructure
```ts
async function canUseFeature(userId: string) {
  const user = await db.user.findById(userId);
  return user?.plan === 'enterprise';
}
```
</example>
</context>

<pre-flight-checklist>
1. [ ] Is this function deterministic for the same inputs?
2. [ ] Did I keep infrastructure outside?
3. [ ] Did the function name reveal the policy?
</pre-flight-checklist>
