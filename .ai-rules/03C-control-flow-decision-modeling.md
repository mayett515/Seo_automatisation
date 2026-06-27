---
description: "Optional rules for choosing if/switch/table/pattern-match/combinator control flow without overengineering"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.4.0-optional-audited"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: ["optional: ts-pattern", "optional: neverthrow", "optional: effect"]
priority_schema: "critical > strong > guideline"
---

# Control Flow & Decision Modeling

<meta-instruction>
Use this file when logic has meaningful branching. The goal is not to replace `if`; the goal is to choose the smallest control-flow shape that reveals the decision and lets TypeScript help.
</meta-instruction>

## Decision Ladder

<positive-directives>
- Use guard clauses and early returns for simple validation, empty states, loading states, and expected rejection paths.
- Use normal TypeScript narrowing with `typeof`, `instanceof`, `in`, equality checks, discriminants, and custom type guards when that is enough.
- Use discriminated unions for closed sets of meaningful variants, states, events, decisions, and results.
- Use exhaustive `switch` or exhaustive flat `if` chains when adding a variant must force code updates.
- Use decision tables or strategy maps when a stable key maps to behavior, config, text, permissions, or handlers.
- Use exhaustive pattern matching when nested structures, multiple axes, or evolving ADTs are clearer than `switch` / `if`. Use `ts-pattern` as the current TypeScript implementation only after the decision shape earns pattern matching.
- Use constraint arrays when the domain is explicitly “all rules must pass” or “explain failed rules.”
- Use Result combinators only when they remove repeated plumbing without hiding business step names.
</positive-directives>

## Constraints

<absolute-constraints>
- DO NOT replace a readable two-branch `if` with pattern matching.
- DO NOT build a rule engine for a small condition set.
- DO NOT use combinators when named imperative locals would be easier to debug.
- DO NOT use lookup tables when the behavior needs ordered side effects or complex branching.
- DO NOT hide domain decisions behind anonymous callbacks named `check`, `handler`, or `fn`.
- DO NOT use type assertions where a discriminant, guard, or narrowing-friendly shape would make the compiler prove the case.
</absolute-constraints>

## Control-Flow Choice Matrix

<context>
```txt
simple rejection          -> if / early return
runtime type refinement   -> narrowing / type guard
closed variant set        -> discriminated union
one discriminant          -> switch or exhaustive if-chain
stable key mapping        -> Record / Map / decision table
same operation variants   -> strategy map, then strategy objects if earned
many independent rules    -> constraint array
nested ADT / multi-axis matching -> exhaustive pattern matching; usually ts-pattern in TypeScript
many Result steps         -> neverthrow / local Result helpers
resource workflow         -> procedural shell or Effect when complexity earns it
```
</context>

## Pattern Matching Trigger Check

<context>
Pattern matching is earned when:
- a discriminated union has enough meaningful variants that missed cases are likely, especially 4+
- matching is nested across result/status/provider/action shapes
- state and event must be considered together
- missing a case should become a compile-time error
- repeated `switch` / `if` logic is becoming a decision matrix

Pattern matching is not earned when:
- the branch is a simple guard clause
- the decision is a boolean
- a `Record<Union, Value>` is clearer
- the code is provider wiring, DB lifecycle, or request glue
- a normal exhaustive `switch` is already readable
</context>

## Examples

<context>
<example>
// Good: ordinary narrowing is the clearest shape.
function decideAccess(user: User): AccessDecision {
  if (!user.active) return { kind: "deny", reason: "inactive_user" };
  return { kind: "allow" };
}
</example>

<example>
// Bad: pattern matching adds ceremony to a two-branch decision.
const decision = match(user)
  .with({ active: false }, () => ({ kind: "deny" }))
  .otherwise(() => ({ kind: "allow" }));
</example>
</context>

<pre-flight-checklist>
1. [ ] Did I use the lowest control-flow level that explains the decision?
2. [ ] Did the chosen style improve exhaustiveness, clarity, or drift resistance?
3. [ ] Did I let TypeScript narrow instead of asserting manually?
4. [ ] Would a normal TypeScript engineer debug this quickly?
</pre-flight-checklist>
