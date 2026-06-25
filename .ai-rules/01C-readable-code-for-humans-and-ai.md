---
description: "Optional readability rules for TypeScript code that must remain understandable to humans and AI agents"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.4.0-optional-audited"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Readable Code for Humans and AI

<meta-instruction>
Use this file when code is becoming hard to scan, deeply nested, AI-generated, React-heavy, or unclear at call sites. This file strengthens the existing Meaning > Ceremony rule. It is not a formatting guide and must not override project lint/formatter conventions.
</meta-instruction>

## Readability Directives

<positive-directives>
- Prefer short functions and components whose purpose can be understood without loading the whole file into memory.
- Prefer early returns and flat guard clauses when they remove nesting from validation, loading, permission, and empty-state logic.
- Prefer names that reveal intent for variables, functions, types, policies, parser steps, and decisions.
- Prefer object parameters when positional arguments are numerous, same-typed, or unclear at the call site.
- Prefer returning named object fields when a primitive return value would be ambiguous.
- Prefer discriminated unions for meaningful variants, states, and workflows that would otherwise become flag soup.
- Prefer exhaustive checks when new variants should force all relevant code to update.
- Keep React handlers inline when they are short and used once; extract only shared or meaning-heavy logic.
</positive-directives>

## Readability Constraints

<absolute-constraints>
- DO NOT create nested condition pyramids when guard clauses would make the path flatter.
- DO NOT use clever boolean negation, double negatives, or negated ternaries when branch order can express the positive case.
- DO NOT use `&&` rendering in JSX when the falsy value could render accidentally or when an explicit `null` branch is clearer.
- DO NOT hoist tiny one-use handlers just to create names that add noise.
- DO NOT split files merely to reduce line count if the concepts still belong together.
- DO NOT optimize for AI generation speed over future human repairability.
</absolute-constraints>

## Fit with the Core Schema

<context>
Readable code supports the existing schema:

```txt
Type Strategy:
  names states and variants honestly

Functional Core:
  keeps decision logic small and pure

Procedural Shell:
  keeps ordered actions readable

Smallest Honest Boundary:
  avoids fake structure while reducing cognitive load
```
</context>

## Examples

<context>
<example>
// Good: flat, named, and obvious.
function renderPaymentMethod(method: PaymentMethod): ReactNode {
  if (method.kind === "card") return <CardPayment method={method} />;
  if (method.kind === "paypal") return <PaypalPayment method={method} />;
  if (method.kind === "bank_transfer") return <BankTransferPayment method={method} />;

  return assertNever(method);
}
</example>

<example>
// Bad: positional ambiguity and nested branch pressure.
createInvite("alice@example.com", true, false, 3, "admin");
</example>
</context>

<pre-flight-checklist>
1. [ ] Can a human or AI agent understand the function without scanning unrelated code?
2. [ ] Did I flatten avoidable nesting?
3. [ ] Did I name the meaning instead of the mechanism?
4. [ ] Are variants represented as variants rather than flags?
</pre-flight-checklist>
