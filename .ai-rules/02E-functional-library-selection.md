---
description: "Optional rules for ts-pattern, neverthrow, Effect, and functional helper libraries"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.4.0-optional-audited"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: ["optional: ts-pattern", "optional: neverthrow", "optional: effect", "optional: remeda"]
priority_schema: "critical > strong > guideline"
---

# Functional Library Selection

<meta-instruction>
Use this file when considering ts-pattern, neverthrow, Effect, Remeda, fp-ts-like helpers, or custom combinators. Libraries must earn their place by reducing drift or complexity.
</meta-instruction>

## Directives

<positive-directives>
- Prefer plain TypeScript when `if`, `switch`, `for...of`, and named functions are clear.
- Prefer `ts-pattern` for complex ADTs, nested union matching, multi-axis state/event reducers, and exhaustiveness across evolving variants.
- Prefer `neverthrow` when typed expected failures repeat across several functions and combinators reduce boilerplate without hiding step names.
- Prefer Effect when the module genuinely needs typed errors, retries, interruption, concurrency, queues, tracing, metrics, resources, configuration, and dependency management together.
- Prefer small data utility libraries only when they remove repeated collection helpers already common in the repo.
- Preserve existing repo conventions over introducing a new FP ecosystem locally.
</positive-directives>

## Constraints

<absolute-constraints>
- DO NOT import Effect for a tiny pure decision function.
- DO NOT replace every `Result` branch with chained combinators if locals are clearer.
- DO NOT use ts-pattern when a single `switch` or flat exhaustive `if` chain is clearer.
- DO NOT introduce fp-ts, Effect, neverthrow, or ts-pattern into a repo that already has an equivalent convention unless the user asks.
- DO NOT let library syntax become more important than domain names.
- DO NOT create custom combinator libraries without repeated local evidence.
</absolute-constraints>

## Library Placement

<context>
```txt
ts-pattern  -> Functional Core / complex decision matching
neverthrow  -> Functional Core + Shell boundary for repeated expected failures
Effect      -> Procedural Shell / runtime workflow system, not tiny core logic
Zod         -> Type Strategy / runtime boundary
Remeda etc. -> collection-shaped transformations when repo convention supports it
```
</context>

## Examples

<context>
<example>
// Good: ts-pattern earns its place when matching state + event together.
const next = match<[CheckoutState, CheckoutEvent], CheckoutState>([state, event])
  .with([{ status: "editing" }, { type: "submit_clicked" }], ([s]) => ({ status: "submitting", email: s.email }))
  .with([{ status: "submitting" }, { type: "submit_succeeded" }], ([, e]) => ({ status: "succeeded", orderId: e.orderId }))
  .otherwise(() => state);
</example>

<example>
// Bad: Effect imported for simple arithmetic policy.
const total = Effect.succeed(cart.items.length === 0 ? 0 : calculateTotal(cart));
</example>
</context>

<pre-flight-checklist>
1. [ ] Which concrete complexity does the library remove?
2. [ ] Is this library already accepted in the repo?
3. [ ] Would plain TypeScript be more readable?
</pre-flight-checklist>
