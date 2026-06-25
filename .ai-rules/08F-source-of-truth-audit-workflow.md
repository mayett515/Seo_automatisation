---
description: "Post-change source-of-truth audit workflow for type drift"
globs: "**/*.{ts,tsx,js,jsx}"
alwaysApply: false
version: "3.2.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Source-of-Truth Audit Workflow

<meta-instruction>
Use this file after code has been written or refactored when types, schemas, validators, generated contracts, runtime objects, or factory returns may have drifted apart. This is an audit workflow, not an automatic rewrite instruction.
</meta-instruction>

## 1. Audit Purpose

<context>
Run this when implementation direction changed during development, a type was copied, a schema changed, a mapper changed shape, a generated client was updated, or a validation boundary moved.

Output should be soft and ranked:

```txt
Blocking:
  real correctness or safety issue

Warnings:
  possible drift or duplicate truth

Observations:
  design is acceptable

Recommendation:
  smallest useful action
```
</context>

## 2. Audit Directives

<positive-directives>
- Compare exported types against runtime schemas, generated clients, factory returns, config objects, and external library types that appear to own the truth.
- Identify duplicate unions, duplicated DTOs, copied generated types, and hand-written types that can drift.
- Check whether parser, type-guard, assertion, or brand constructor functions actually justify the narrowed or branded type they produce.
- Verify that public domain types are not accidentally inferred from unstable implementation details.
- Recommend the smallest useful fix: derive, document, map, rename, or leave alone.
- Mark acceptable intentional duplication as an observation, not a failure.
</positive-directives>

## 3. Audit Constraints

<absolute-constraints>
- DO NOT rewrite types automatically during an audit.
- DO NOT require every type to be derived from another construct.
- DO NOT treat intentional domain mapping as duplication.
- DO NOT block on stylistic preferences when there is no drift risk.
- DO NOT add a schema library, brand, generic helper, or builder merely because a type exists.
- DO NOT report a warning when the source of truth is already obvious and stable.
</absolute-constraints>

## 4. Audit Template

<context>
Use this output format:

```txt
Source-of-Truth Audit

Blocking:
- [none or concrete issue]

Warnings:
- [possible drift / duplicate truth]

Observations:
- [intentional source-of-truth choice that looks fine]

Recommendation:
- [smallest useful action]
```

When the diff includes Zod schemas, add:

```txt
Zod Source-of-Truth Audit:
- Schema owner:
- Derived type correctness:
- Input/output divergence:
- Hidden business policy risk:
- Advanced Zod feature risk:
```
</context>

## 5. Zod Audit Hook

<conditional-logic>
IF the diff adds or changes Zod schemas:
THEN audit whether exported types are derived from the correct source of truth.

IF the diff uses transforms, preprocessors, codecs, coercion, or brands:
THEN audit whether `z.input<typeof Schema>` and `z.output<typeof Schema>` are used intentionally.

IF the diff uses `.refine()` or `.superRefine()`:
THEN audit whether the rule is structural validation or hidden business policy.

IF the diff uses Zod brands:
THEN audit whether the brand prevents a real mix-up after parsing.

IF the diff uses Zod subclassing or Zod internals in application code:
THEN report a warning unless the code is library/framework infrastructure.
</conditional-logic>

## 6. Audit Examples

<context>
<example>
// Blocking: generated contract was copied and edited by hand.
type UserCreateInput = {
  email: string;
  name: string;
};
// Existing source of truth: Prisma.UserCreateInput
</example>

<example>
// Observation: domain type intentionally differs from transport DTO.
type ReturnDecision =
  | { kind: "allow"; refundAmount: number }
  | { kind: "deny"; reason: ReturnDenyReason };
</example>
</context>

## 7. Pre-Flight Checklist

<pre-flight-checklist>
1. [ ] Did I distinguish blocking drift from acceptable intentional mapping?
2. [ ] Did I recommend the smallest useful action?
3. [ ] Did I avoid creating new architecture during the audit?
</pre-flight-checklist>
