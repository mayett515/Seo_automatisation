---
description: "Optional rules for JavaScript runtime semantics that TypeScript does not erase"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.4.0-optional-audited"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# JavaScript Runtime Semantics & Patterns

<meta-instruction>
Use this file when code depends on JavaScript runtime behavior: functions, closures, modules, objects, `this`, iteration, coercion, promises, references, Maps/Sets, arrays, parsing, or mutation. TypeScript checks code; JavaScript still runs it.
</meta-instruction>

## Runtime Directives

<positive-directives>
- Use array methods for pure transformations and `for...of` for ordered side effects, async loops, and early `break` / `continue`.
- Use explicit `null` / `undefined` checks when empty string, zero, false, or NaN are valid values.
- Use closures intentionally for factories, private state, memoization, and callback context; document owned mutable closure state.
- Use `Map` for dynamic or object keys and `Set` for membership; use plain objects/`Record` for stable string-keyed tables.
- Treat object spread, array spread, and `Object.assign` as shallow operations unless deeper cloning is intentionally handled.
- Use `Number.isNaN` or domain-specific parse helpers instead of relying on `NaN` equality.
- Pass an explicit radix to `parseInt`, or prefer `Number` when the whole string must be numeric.
</positive-directives>

## Runtime Constraints

<absolute-constraints>
- DO NOT rely on truthiness when `""`, `0`, `false`, `NaN`, `null`, or `undefined` must be distinguished.
- DO NOT rely on loose equality except for an intentional and documented `value == null` nullish check.
- DO NOT compare arrays or objects by value using `===`.
- DO NOT depend on implicit object-to-string coercion for domain logic.
- DO NOT use `forEach(async ...)` when sequencing, awaiting, error handling, or cancellation matters.
- DO NOT pass unbound class methods as callbacks when they rely on `this`.
- DO NOT use object lookup tables for untrusted keys without prototype/null-prototype or `Map` considerations.
- DO NOT assume TypeScript types protect runtime JSON, environment variables, form values, URL params, or external API responses.
</absolute-constraints>

## JS Runtime Map

<context>
```txt
closure factory       -> one-method state owner or callback customization
module                -> default boundary for shared pure helpers and constants
for...of              -> side effects, async sequence, break/continue
array methods         -> pure map/filter/reduce transformations
Map / Set             -> dynamic lookup and membership domains
object literal table  -> stable string-keyed decision/config table
Object.is             -> only when NaN, -0, or same-value semantics matter
class                 -> capability/resource/framework lifecycle owner
```
</context>

## Examples

<context>
<example>
// Good: nullish is the intended check.
if (value == null) return { kind: "missing" };
</example>

<example>
// Bad: truthiness erases valid domain values.
if (!amount) return { kind: "missing" }; // rejects 0 even if 0 is valid
</example>
</context>

<pre-flight-checklist>
1. [ ] Is this TypeScript rule really a JavaScript runtime rule underneath?
2. [ ] Did I choose iteration based on transformation vs side effect?
3. [ ] Did I avoid coercion, closure, parse, and equality traps?
</pre-flight-checklist>
