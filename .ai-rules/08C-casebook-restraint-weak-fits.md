---
description: "Casebook of restraint and weak schema fits"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Casebook: Restraint and Weak Fits

<meta-instruction>
Use this file when the schema may be weak. Sometimes the correct move is to leave the code alone.
</meta-instruction>

## Weak fit findings

- **MUI `createFilterOptions`:** already small and pure; extraction can lower readability.
- **TanStack Query `hashKey`:** tiny pure utility; schema adds little.
- **TypeScript ESLint AST utilities:** already pure predicates; maybe only improve type guards.
- **n8n HTTP wrapper:** version registration class is framework glue and already correct.
- **Generated code:** source-of-truth outputs should usually be untouched.
- **XState spawn:** already type-strategy-heavy and actor-native; only light naming may help.

## Weak categories

```txt
Tiny pure utilities
Infrastructure glue
Framework registration
Highly optimized algorithms
Type-level library internals
Generated code
```

<positive-directives>
- Confirm good code when it already fits the schema.
- Prefer no-op verdicts when meaning is already explicit.
- Use ratings to show weak value honestly.
</positive-directives>

<absolute-constraints>
- DO NOT refactor code just to prove the schema applies.
- DO NOT add files to tiny pure utilities.
- DO NOT replace mature library internals with teaching architecture.
- DO NOT touch generated code except through its generator.
</absolute-constraints>

<pre-flight-checklist>
1. [ ] Is this already pure/small/obvious?
2. [ ] Would our change add more ceremony than meaning?
3. [ ] Should the verdict be “leave it alone”?
</pre-flight-checklist>
