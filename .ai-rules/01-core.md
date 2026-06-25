---
description: "Core mental model for Pragmatic TypeScript v3"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Core Mental Model

<meta-instruction>
Use this file to establish the core architecture. The schema is not “functional programming everywhere”; it is a pragmatic TypeScript system for extracting meaning.
</meta-instruction>

## 1. Core Formula

<positive-directives>
- Put meaning in types and pure functions.
- Put execution in procedural shells.
- Put ownership in boundaries.
- Apply extension lenses only when they reveal the problem shape.
- Prefer the smallest honest structure that preserves meaning.
</positive-directives>

## 2. Core Architecture

```txt
Type Strategy
↓
Functional Core
↓
Procedural Shell
↓
Smallest Honest Boundary
```

## 3. What each layer means

- **Type Strategy:** name domain concepts, decisions, states, errors, validated values, generated contracts.
- **Functional Core:** pure rules, parsing, validation, policies, transformations, lifecycle transitions.
- **Procedural Shell:** step-by-step orchestration, IO, DB, API calls, logging, emails, queues.
- **Boundary:** function, module, framework handler, service class, adapter class, worker, generated client.

<absolute-constraints>
- DO NOT force one paradigm everywhere.
- DO NOT treat a class as proof of architecture.
- DO NOT hide business meaning inside framework syntax.
- DO NOT hide side effects inside pure-looking helpers.
- DO NOT split files before concepts are clear.
</absolute-constraints>

<context>
<example>
// Good: meaning in a type, execution outside
```ts
type BeforeUploadDecision =
  | { kind: 'upload'; file: RcFile }
  | { kind: 'skip' }
  | { kind: 'ignore' };
```
</example>

<example>
// Bad: magic values carry behavior implicitly
```ts
if (result === false) return false;
if ((result as any) === LIST_IGNORE) return false;
```
</example>
</context>

<pre-flight-checklist>
1. [ ] Did I identify meaning before structure?
2. [ ] Did I separate decision from effect?
3. [ ] Did I choose a boundary shape for ownership, not aesthetics?
</pre-flight-checklist>
