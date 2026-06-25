---
description: "Type strategy for domain concepts, states, decisions, and errors"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Type Strategy

<meta-instruction>
Use this file when modeling domain concepts. Types should reveal meaning, not display cleverness.
</meta-instruction>

<positive-directives>
- Use discriminated unions for meaningful states and decisions.
- Use typed errors for expected failures.
- Use `unknown` at external boundaries until data is validated.
- Use narrow domain-specific types over vague optional objects.
- Use readonly arrays and explicit exported return types when practical.
</positive-directives>

## Best uses

```txt
Decision unions:
  allow / deny / skip / ignore / migrate / recover_from_url

State unions:
  idle / loading / failed / loaded

Error unions:
  invalid_email / email_taken / missing_dimensions

Boundary contracts:
  PaymentProvider / OrderRepository / GeneratedClient
```

<absolute-constraints>
- DO NOT use `any` for external input when `unknown` plus parsing is possible.
- DO NOT model mutually exclusive states with boolean flag soup.
- DO NOT let raw HTTP, clipboard, webhook, protocol, or DB data leak into core logic unvalidated.
- DO NOT create unreadable conditional type puzzles for ordinary validation.
- DO NOT replace repo-standard error contracts unless the task explicitly allows it.
</absolute-constraints>

<context>
<example>
// Good: honest branch
```ts
type ResourceGroupSelection =
  | { kind: 'existing'; item: QuickPickItem }
  | { kind: 'new'; name: string };
```
</example>

<example>
// Bad: implicit branch hidden in a union of unrelated representations
```ts
type State = { resourceGroup: QuickPickItem | string };
```
</example>
</context>

<pre-flight-checklist>
1. [ ] Did I name the concept rather than just the storage shape?
2. [ ] Did I make impossible states harder to represent?
3. [ ] Did I avoid type cleverness without domain payoff?
</pre-flight-checklist>
