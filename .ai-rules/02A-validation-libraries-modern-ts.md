---
description: "Validation libraries, Effect-family tools, and modern TypeScript feature usage"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: ["zod: optional", "effect: optional"]
priority_schema: "critical > strong > guideline"
---

# Validation Libraries and Modern TypeScript

<meta-instruction>
Use libraries and modern TypeScript features only when they strengthen the schema. The architecture must remain understandable without any specific library.
</meta-instruction>

<positive-directives>
- Use Zod, Valibot, ArkType, or similar libraries for `unknown -> validated data` boundaries when the repo already permits them.
- Use Effect, ts-fp, fp-ts, or neverthrow when the codebase is already shaped around typed effects or Results.
- Use `satisfies` for typed config, policy maps, handler maps, and exhaustive message maps.
- Use `const` type parameters for define-style helpers that preserve literal configuration.
- Use decorators only at framework or DI boundaries, not inside pure domain logic.
</positive-directives>

## Compatibility stance

```txt
The schema is library-agnostic.
Libraries can support layers:
  Zod/Valibot/ArkType -> Type Strategy
  Effect/ts-fp/fp-ts -> Functional Core + Shell
  neverthrow -> Result Modeling
  decorators -> Boundary metadata
```

<absolute-constraints>
- DO NOT import Effect just to avoid a simple `Result<T, E>`.
- DO NOT use decorators to hide business rules.
- DO NOT use `satisfies` as decoration when an annotation is already clearer.
- DO NOT introduce a validation library that conflicts with repo conventions.
- DO NOT make modern TypeScript features the reason for the design.
</absolute-constraints>

<context>
<example>
// Good: complete policy map checked by TypeScript
```ts
const messages = {
  missing_dimensions: 'Asset dimensions are not available',
  crop_out_of_bounds: 'Crop parameters are out of bounds',
} satisfies Record<AssetEditError, string>;
```
</example>

<example>
// Bad: library commitment for one trivial validation
```ts
const program = Effect.succeed(email).pipe(Effect.filterOrFail(e => e.includes('@')));
```
</example>
</context>

<pre-flight-checklist>
1. [ ] Does the library reduce risk more than it adds ceremony?
2. [ ] Does the modern TS feature preserve meaning or only look advanced?
3. [ ] Does the repo already have a standard validation/effect style?
</pre-flight-checklist>
