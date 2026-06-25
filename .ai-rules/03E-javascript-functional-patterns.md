---
description: "Optional JavaScript functional pattern rules for composition, currying, memoization, WeakMap caching, and chaining"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.4.0-optional-audited"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# JavaScript Functional Patterns

<meta-instruction>
Use this file when code uses or could benefit from JavaScript-native functional patterns. The goal is ordinary readable JavaScript/TypeScript, not point-free FP cosplay.
</meta-instruction>

## Functional Pattern Directives

<positive-directives>
- Prefer pure functions for calculations, transformations, normalization, formatting, validation, and decision helpers.
- Prefer immutable updates by default when values cross component, domain, or async boundaries.
- Use higher-order functions when wrapping behavior such as logging, timing, validation, retry, authorization, or instrumentation.
- Use composition when a value travels through named, pure stages and the order is important.
- Use currying or partial application only when it creates a useful specialized function by binding stable context first.
- Use memoization only for pure expensive functions with stable inputs and a bounded or explainable cache.
- Use `WeakMap` for memoization or metadata keyed by objects that should not be kept alive by the cache.
- Use method chaining only when the object owns staged configuration or state and each method intentionally returns `this`.
</positive-directives>

## Functional Pattern Constraints

<absolute-constraints>
- DO NOT force `map`, `filter`, or `reduce` over a loop when the loop is clearer or side-effectful.
- DO NOT create generic `pipe`, `compose`, or `curry` helpers unless the repo already uses them or repeated code earns them.
- DO NOT memoize impure functions, time-dependent functions, random functions, or functions with hidden external reads.
- DO NOT use `JSON.stringify(args)` memoization when object key order, cycles, large data, or non-JSON values matter.
- DO NOT use currying when a simple object parameter would make the call site clearer.
- DO NOT use chaining when intermediate named values would make debugging easier.
</absolute-constraints>

## Selection Map

<context>
```txt
pure helper             -> simple function
many transforms         -> named locals or existing pipe
stable context binding  -> partial application / curry
expensive pure function -> memoize with clear cache policy
object-key cache        -> WeakMap
staged builder/config   -> method chaining may be honest
side effects            -> procedural shell, not FP chain
```
</context>

## Examples

<context>
<example>
// Good: named stages reveal the transformation.
function slugify(input: string): string {
  const normalized = input.trim().toLowerCase();
  const sanitized = normalized.replace(/[^a-z0-9 -]/g, "");
  return sanitized.replace(/\s+/g, "-");
}
</example>

<example>
// Bad: helper abstraction appears before repeated evidence.
const slugify = pipe(trim, lower, sanitize, dashify);
</example>
</context>

<pre-flight-checklist>
1. [ ] Is this functional pattern making the code easier to reason about?
2. [ ] Are functions pure where the pattern assumes purity?
3. [ ] Is the cache bounded, weak, or intentionally long-lived?
4. [ ] Would named locals be clearer than composition?
</pre-flight-checklist>
