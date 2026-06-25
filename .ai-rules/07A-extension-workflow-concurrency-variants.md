---
description: "Extension lenses for config, pipelines, workflows, concurrency, variants, and collections"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Extension Lenses: Config, Pipelines, Workflows, Concurrency, Variants, Collections

<meta-instruction>
Use these lenses when the code shape matches typed config, transformation pipelines, UI/workflow events, concurrent ownership, domain variants, or collection-heavy logic.
</meta-instruction>

<positive-directives>
- Use typed config objects with `satisfies` when config needs behavior and autocomplete.
- Make transformation stages read left-to-right when a value moves through steps.
- Model serious UI/workflow state with messages and pure update functions when ordinary state becomes scattered.
- Use typed messages and one owner for concurrent/background work.
- Prefer discriminated unions plus operation functions when behavior varies by domain variant.
</positive-directives>

## Practical shapes

```ts
const memberDiscount = {
  name: 'member_discount',
  appliesTo: (cart: Cart) => cart.customer.member,
  apply: (cart: Cart) => applyPercentDiscount(cart, 10),
} satisfies DiscountRule;

type Product =
  | { kind: 'physical'; price: number; shippingWeight: number }
  | { kind: 'subscription'; monthlyPrice: number };
```

<absolute-constraints>
- DO NOT invent pipeline helpers if local variables read better.
- DO NOT add command layers for tiny components.
- DO NOT use shared mutable state without an owner.
- DO NOT create inheritance trees for simple domain variants.
- DO NOT turn dense array chains into unreadable puzzles.
</absolute-constraints>

<context>
<example>
// Good: variant operation
```ts
function calculateCheckoutPrice(product: Product): number {
  switch (product.kind) {
    case 'physical': return product.price + product.shippingWeight * 0.2;
    case 'subscription': return product.monthlyPrice;
  }
}
```
</example>

<example>
// Bad: unnecessary class hierarchy for plain data
```ts
class PhysicalProduct { calculateCheckoutPrice() { /* plus unrelated methods */ } }
```
</example>
</context>

<pre-flight-checklist>
1. [ ] Does the lens match the actual code shape?
2. [ ] Did I keep the TypeScript idiomatic?
3. [ ] Did I avoid making the lens the architecture?
</pre-flight-checklist>
