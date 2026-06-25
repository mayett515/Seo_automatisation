---
description: "Extension lenses for constraints, sets, lifecycle, parsing, guarantees, and codegen"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Extension Lenses: Constraints, Sets, Lifecycle, Parsing, Guarantees, Codegen

<meta-instruction>
Use these lenses when code is about matching rules, membership, lifecycle events, text/protocol parsing, validated guarantees, or generated repetition.
</meta-instruction>

<positive-directives>
- Make constraints first-class when code searches for values satisfying rules.
- Use sets for permissions, scopes, tags, groups, flags, and missing/overlap questions.
- Model lifecycle-heavy entities with state and event unions.
- Treat parsing as a domain when malformed input has business meaning.
- Generate boring repetition from an explicit source of truth.
</positive-directives>

## Practical shapes

```ts
type Constraint<T> = { name: string; passes(value: T): boolean };

type Scope = 'orders:read' | 'orders:write';

function isSubset<T>(required: ReadonlySet<T>, granted: ReadonlySet<T>): boolean {
  for (const value of required) if (!granted.has(value)) return false;
  return true;
}
```

<absolute-constraints>
- DO NOT build a rules engine for two predicates.
- DO NOT use sets when order, duplicates, or counts matter.
- DO NOT use regex soup for important text parsing.
- DO NOT create branded types that require casts everywhere.
- DO NOT hide business logic inside generated code.
</absolute-constraints>

<context>
<example>
// Good: parser classification
```ts
type ClipboardParseDecision =
  | { kind: 'mixed_content'; value: MixedContent }
  | { kind: 'plain_text'; value: string };
```
</example>

<example>
// Bad: unchecked split parsing for important data
```ts
const amount = Number(line.split(',')[2].replace('$', ''));
```
</example>
</context>

<pre-flight-checklist>
1. [ ] Did constraints/sets/parsers expose domain meaning?
2. [ ] Did lifecycle state prevent contradictions?
3. [ ] Is codegen explicit, reproducible, and boring?
</pre-flight-checklist>
