---
description: "Soft TypeScript type source-of-truth checker with API hygiene audit"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.5.0-optional-audited"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Type Source-of-Truth Checker

<meta-instruction>
Use this file as a lightweight sanity check when creating, changing, duplicating, exporting, deriving, or validating TypeScript types. This is not a bureaucracy gate. It should prevent drift and duplication, not create extra abstractions.
</meta-instruction>

<context>
This is a soft authoring-time checker. Mechanically decidable hygiene belongs in ESLint, TypeScript, tests, or scripts; do not turn this rule itself into a hard CI gate.
</context>

## Source-of-Truth Directives

<positive-directives>
- Identify the likely source of truth only when the type is non-trivial, exported, shared, or boundary-facing.
- Prefer handwritten domain types for stable business states, decisions, expected errors, and lifecycle concepts.
- Prefer deriving from runtime values for route maps, policy maps, registries, typed config objects, and handler maps.
- Prefer schema-inferred types when a runtime schema owns the untrusted input or encoded output contract.
- Prefer generated types at API, database, protocol, SDK, ORM, or codegen boundaries.
- Prefer brands or validated constructors only when a checked value travels far enough for the guarantee to matter.
</positive-directives>

## Type API Hygiene Constraints

<absolute-constraints>
- DO NOT duplicate a generated, schema-inferred, value-derived, or function-derived type by hand unless intentionally creating a separate domain model.
- DO NOT use boxed primitive types like `String`, `Number`, `Boolean`, `Symbol`, or broad `Object` for normal values.
- DO NOT use `any` for unknown external input when `unknown` plus narrowing or validation is practical.
- DO NOT define generics that do not use their type parameter.
- DO NOT type ignored callback returns as `any`; use `void`.
- DO NOT mark callback parameters optional unless the callback may actually be invoked with fewer arguments.
- DO NOT put broader overloads before narrower overloads.
- DO NOT scatter brand casts outside the single validation or constructor boundary.
- DO NOT introduce a schema library, brand, generic helper, builder, or type-level transformation solely to satisfy this checker.
</absolute-constraints>

## Source-of-Truth Matrix

<context>
| Source of truth | Use when | Example |
|---|---|---|
| Type-first | Domain meaning exists independently of runtime objects | `PaymentState`, `ReturnDecision` |
| Value-first | Runtime object is the registry/config source | `keyof typeof routes` |
| Function-first | Mapper/factory/query result owns the shape | `ReturnType<typeof createPreview>` |
| Schema-first | Runtime validation owns the input/output contract | `z.output<typeof CreateUserSchema>` |
| Generated-first | External schema owns the contract | Prisma, Drizzle, OpenAPI, GraphQL, Lexicon |
| Brand-first | Value is checked once and guarantee travels | `Email`, `TenantId`, `USD` |
| Class-first | Runtime constructor and instance type both matter | `InstanceType<typeof Client>` |
| Library-first | External package owns the public shape | `Parameters<typeof libraryFn>` |

Type API hygiene examples:
- Prefer `unknown` over `any` at unknown boundaries.
- Prefer `void` for callbacks whose return value is ignored.
- Prefer one union/optional parameter over overloads when the return type does not vary.
- Keep public domain contracts stable instead of deriving them from unstable implementation details.
</context>

## Conditional Logic

<conditional-logic>
IF the type is local, tiny, obvious, and not exported:
THEN do not pause; write the code.

IF a type is being created from a Zod schema:
THEN prefer `z.output<typeof Schema>` unless the code specifically needs the pre-parse input shape.

IF a schema uses transforms, preprocessors, codecs, coercion, or brands:
THEN check whether `z.input<typeof Schema>` and `z.output<typeof Schema>` differ before naming the type.

IF the Zod use is local, tiny, non-exported, and does not cross a boundary:
THEN do not escalate; write the code normally.

IF advanced Zod features are clearly involved:
THEN load `.ai-rules/02F-zod-advanced-schema-design.md` as a lightweight support file.

IF the repository already has a clear type convention for this area:
THEN follow the repo convention and do not invent a new source-of-truth strategy.

IF the type mirrors a runtime schema or generated contract exactly:
THEN derive it instead of copying it manually.
</conditional-logic>

## Examples

<context>
<example>
// Good: value is the source of truth for a registry.
const routes = {
  home: "/",
  billing: "/billing",
  admin: "/admin",
} as const;

type RouteName = keyof typeof routes;
type RoutePath = (typeof routes)[RouteName];
</example>

<example>
// Bad: duplicated truth that can drift.
type RouteName = "home" | "billing" | "admin";
const routes = { home: "/", billing: "/billing", admin: "/admin" } as const;
</example>
</context>

<pre-flight-checklist>
1. [ ] Does this type have a non-obvious source of truth?
2. [ ] Did I avoid creating a new abstraction just to satisfy this checker?
3. [ ] Did I check generated/schema/value/function sources before copying shapes?
4. [ ] Did I avoid common TypeScript API hygiene traps?
</pre-flight-checklist>
