---
description: "Functional core patterns for parsing, lifecycle, policies, constraints, and sets"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Parsing, Lifecycle, Policies, Constraints, and Sets

<meta-instruction>
Use this file when external data, workflows over time, access policies, constraints, matching, or membership rules appear.
</meta-instruction>

<positive-directives>
- Model parser outcomes as explicit variants when the input can be meaningfully classified.
- Model lifecycle transitions with state and event unions when time/order matters.
- Model access, eligibility, and matching as named policy decisions.
- Use `ReadonlySet<T>` when membership, overlap, missing values, or subset checks are central.
- Keep parsers and policy functions free of side effects unless explicitly marked as boundary-adjacent.
</positive-directives>

## Useful shapes

```ts
type ClipboardParseDecision =
  | { kind: 'mixed_content'; value: MixedContent }
  | { kind: 'excalidraw_elements'; elements: readonly Element[] }
  | { kind: 'plain_text'; value: string };

type ReturnState =
  | { status: 'requested'; refundAmount: number }
  | { status: 'approved'; refundAmount: number }
  | { status: 'refunded'; refundId: string };
```

<absolute-constraints>
- DO NOT parse important text or protocol data with silent catch-and-fallback unless fallback is a named decision.
- DO NOT use arrays as sets when missing/overlap/subset semantics matter.
- DO NOT introduce a full state machine for two obvious states.
- DO NOT hide constraint failures behind a bare boolean when the reason matters.
</absolute-constraints>

<context>
<example>
// Good: parse result carries meaning
```ts
type JsonValidationPlan =
  | { kind: 'empty_allowed' }
  | { kind: 'required_missing' }
  | { kind: 'validate_schema'; value: unknown; schema: JsonSchema };
```
</example>

<example>
// Bad: parser silently treats all failures as text without naming fallback
```ts
try { return JSON.parse(text); } catch { return text; }
```
</example>
</context>

<pre-flight-checklist>
1. [ ] Did parser failure become an explicit outcome when important?
2. [ ] Did lifecycle state prevent contradictory flags?
3. [ ] Did policies expose reasons when reasons matter?
</pre-flight-checklist>
