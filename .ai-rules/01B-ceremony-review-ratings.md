---
description: "Ceremony versus meaning and schema strength ratings"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Ceremony, Meaning, and Ratings

<meta-instruction>
Use this file to prevent architecture theater. A schema improvement is valid only when it reveals meaning, reduces risk, improves testability, or clarifies ownership.
</meta-instruction>

<positive-directives>
- Treat ceremony as structure that supports architecture more than the problem.
- Reward abstractions that reveal hidden meaning.
- Penalize abstractions that only increase files, names, indirection, or navigation.
- Rate original code, schema version, and over-refactored version separately when useful.
- Use ratings as evidence, not as performance theater.
</positive-directives>

## Rating anchors

```txt
9–10: strong hidden meaning extracted with little ceremony.
7–8: useful clarity/testability improvement, but limited scope.
5–6: mixed value; may be useful only in schema-native repo.
2–4: weak fit; likely infrastructure, registration, generated code, or tiny utility.
```

## Strong fit signals

- Magic values need domain language.
- Booleans lose reasons.
- Optional fields permit impossible states.
- Framework syntax hides policy.
- Side effects and decisions are interleaved.

## Weak fit signals

- Tiny pure helper.
- Framework registration glue.
- Generated code.
- Highly optimized algorithm internals.
- Type-level library internals where type machinery is the product.

<absolute-constraints>
- DO NOT call code better merely because it has more types.
- DO NOT call a class better merely because dependencies moved into a constructor.
- DO NOT hide low schema value behind high-level language labels.
- DO NOT overrate extension lenses when they only confirm existing structure.
</absolute-constraints>

<context>
<example>
// Good: the abstraction reveals the policy
```ts
type HydrationDecision<S> =
  | { kind: 'empty_storage' }
  | { kind: 'use_stored_state'; state: S }
  | { kind: 'migrate'; state: unknown; fromVersion: number };
```
</example>

<example>
// Bad: class wrapper adds ceremony without ownership
```ts
class RefundCalculator {
  calculate(item: Item, quantity: number) {
    return item.unitPrice * quantity;
  }
}
```
</example>
</context>

<pre-flight-checklist>
1. [ ] What meaning would be lost if this abstraction were removed?
2. [ ] Did this structure reduce ambiguity or only add navigation?
3. [ ] Did I score the exact target, not the whole repo?
</pre-flight-checklist>
