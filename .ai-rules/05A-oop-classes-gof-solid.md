---
description: "OOP boundaries, class usage, GoF patterns, and SOLID"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# OOP, GoF, and SOLID at Boundaries

<meta-instruction>
Use OOP for ownership and collaboration at boundaries. Do not use OOP to trap business rules inside giant mutable objects.
</meta-instruction>

<positive-directives>
- Use classes for external clients, repositories, adapters, stateful resources, workers, schedulers, framework DI, or grouped use cases.
- Use Adapter to hide external APIs like Stripe, SendGrid, S3, Redis, OpenAI, or Prisma-specific behavior.
- Use Facade to simplify a group of capabilities only when it reduces coupling.
- Use Proxy/Decorator for logging, retry, auth, cache, or metrics wrappers around capabilities.
- Use Strategy/Command/State ideas when they match real variation, jobs, or lifecycle.
</positive-directives>

## Class test

```txt
Does it own a capability, resource, lifecycle, framework contract, or collaboration pattern?
Yes -> class may be right.
No -> prefer function/module/plain data.
```

<absolute-constraints>
- DO NOT create classes for pure calculations, validators, parsers, or mappers.
- DO NOT use inheritance when a union, function, or composition is clearer.
- DO NOT apply GoF patterns because the pattern is known.
- DO NOT let SOLID become class ceremony.
- DO NOT put framework decorators on pure domain functions.
</absolute-constraints>

<context>
<example>
// Good: OOP boundary owns an external capability
```ts
class StripePaymentProvider implements PaymentProvider {
  constructor(private readonly stripe: StripeClient) {}
  async refund(input: RefundInput) { await this.stripe.refunds.create({ amount: input.amount }); }
}
```
</example>

<example>
// Bad: fake OOP around pure logic
```ts
class EmailValidator { validate(value: string) { return value.includes('@'); } }
```
</example>
</context>

<pre-flight-checklist>
1. [ ] Does the class own something real?
2. [ ] Is the GoF pattern describing a boundary problem?
3. [ ] Could a pure function or module be clearer?
</pre-flight-checklist>
