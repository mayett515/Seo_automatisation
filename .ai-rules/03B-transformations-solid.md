---
description: "Transformations, pipelines, collection logic, and functional SOLID"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Transformations and Functional SOLID

<meta-instruction>
Use this file when code is mostly data transformation, collection logic, or when applying SOLID ideas without class ceremony.
</meta-instruction>

<positive-directives>
- Use named transformations when data flows through clear stages.
- Use collection-shaped helpers for analytics, reports, imports, metrics, and bulk transforms.
- Apply SRP by giving each function one reason to change.
- Apply DIP by passing capabilities/functions instead of importing concrete infrastructure into pure logic.
- Apply ISP by passing only the data and capabilities a function needs.
</positive-directives>

## Functional SOLID translation

```txt
SRP: one function/module owns one decision or transformation.
OCP: extend with strategy maps/handlers only when extension is real.
LSP: interchangeable dependencies must honor the same contract.
ISP: use narrow inputs and narrow ports.
DIP: core/use-case code depends on abstractions or passed functions.
```

<absolute-constraints>
- DO NOT create point-free pipelines that hide important names.
- DO NOT use `reduce` when a loop or named helper is clearer.
- DO NOT make a strategy registry for two obvious cases.
- DO NOT force Open/Closed when editing a switch is clearer and safer.
</absolute-constraints>

<context>
<example>
// Good: left-to-right transformation with named stages
```ts
const users = normalizeUsers(rawUsers);
const activeAdults = keepActiveAdults(users);
const previews = toUserPreviews(activeAdults);
return sortByName(previews);
```
</example>

<example>
// Bad: inside-out transformation obscures flow
```ts
return sortByName(toUserPreviews(keepActiveAdults(normalizeUsers(rawUsers))));
```
</example>
</context>

<pre-flight-checklist>
1. [ ] Does the transformation read in data-flow order?
2. [ ] Did SOLID reduce coupling without adding class ceremony?
3. [ ] Did every helper earn its name?
</pre-flight-checklist>
