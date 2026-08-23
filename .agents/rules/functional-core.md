---
paths:
  - "packages/domain/src/**/*.ts"
  - "packages/seo/src/**/*.ts"
  - "packages/page-registry/src/**/*.ts"
  - "packages/*/src/domain/**/*.ts"
  - "packages/*/src/core/**/*.ts"
  - "src/domain/**/*.ts"
  - "src/core/**/*.ts"
---

# Functional Core

Core logic decides; the shell acts. A core function returns a decision as a
value and the caller performs the effect.

- No IO, logging, timing, or randomness inside a core function. Pass time,
  randomness, and external state in as parameters.
- Every input explicit; no module-level mutable state.
- Expected failures appear in the return type, never as throws.
- Accept the parsed type, never a partially validated value — and never
  re-validate a value that was already parsed at the boundary.
- Model lifecycles as transitions between named states; keep transformations
  total (every input shape has a defined output).
- When a parser falls back (bad JSON becomes plain text, missing field
  becomes a default), the fallback is a named decision variant, never a
  silent `catch`.

```ts
// The decision is a value; the shell decides what to do with it.
export function decideRefund(order: Order, request: RefundRequest): RefundDecision {
  if (request.amount > order.total) return { kind: 'reject', reason: 'exceeds_total' };
  if (request.amount > 500) return { kind: 'escalate', amount: request.amount };
  return { kind: 'approve', amount: request.amount };
}
```

The test for purity: can this be tested without a mock? If not, it belongs in
the shell.

## Control flow

Use the lowest shape that reveals the decision:

```txt
simple rejection          -> guard clause / early return
runtime type refinement   -> narrowing / type guard (never assertion)
closed variant set        -> discriminated union + exhaustive switch
stable key -> behavior    -> Record / decision table
many independent rules    -> constraint array ("all must pass, explain failures")
4+ variants or state x event -> pattern matching (see Libraries in CLAUDE.md)
```

Transformations read in data-flow order with named stages — no inside-out
call nesting, no point-free pipelines that hide step names, no `reduce` where
a loop is clearer.
