---
description: "Extension lenses overview integrated into the schema"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Extension Lenses Overview

<meta-instruction>
The extension lenses are part of the schema. They are not new architectures. Use them to identify the shape of the problem inside the main layers.
</meta-instruction>

<context>
The language names below are retrieval keys for paradigm knowledge, not implementation instructions.

Use them to recognize problem shapes, then translate the shape into ordinary, idiomatic TypeScript. Do not imitate the source language's syntax, ecosystem, or style.

Retrieval keys wake up problem-shape knowledge; they do not decide the implementation.
</context>

<positive-directives>
- Use lenses only when they reveal a real shape in the code.
- Map each lens back to Type Strategy, Functional Core, Procedural Shell, or Boundary.
- Prefer ordinary TypeScript over language cosplay.
- Explain the lens in practical TypeScript terms when teaching.
- Skip the lens when it adds no value.
</positive-directives>

## Lens map

```txt
Lua: typed executable config / plugin APIs
Factor/Forth: visible left-to-right data flow
Elm: model, message, update, command
Elixir/Occam: messages, workers, ownership, recovery
Julia: operations over variants
APL: arrays, tables, bulk transforms
miniKanren: constraints and matching
Starset: sets and membership
Simula: lifecycle over time
SNOBOL: typed parsing and patterns
Idris: simple guarantees in types
m4: boring codegen from one source of truth
```

<absolute-constraints>
- DO NOT mention a source language in code comments unless teaching.
- DO NOT build fake actor systems, rule engines, or DSLs for simple direct code.
- DO NOT replace clear TypeScript with language cosplay.
- DO NOT use a lens to justify overengineering.
</absolute-constraints>

<pre-flight-checklist>
1. [ ] What problem shape did I identify?
2. [ ] Which layer does the lens improve?
3. [ ] Did the lens reveal meaning or add ceremony?
</pre-flight-checklist>
