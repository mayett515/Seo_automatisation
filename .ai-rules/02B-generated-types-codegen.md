---
description: "Generated types and codegen boundaries"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Generated Types and Codegen Boundaries

<meta-instruction>
Use this file when a schema, protocol, ORM, OpenAPI spec, GraphQL schema, or lexicon is the source of truth.
</meta-instruction>

<positive-directives>
- Treat generated types as boundary contracts, not as domain logic by default.
- Map generated persistence/protocol shapes into internal domain variants when meaning is hidden.
- Use generated clients at adapter boundaries.
- Keep codegen sources explicit, reproducible, and boring.
- Leave generated output alone unless the task explicitly edits generation templates.
</positive-directives>

## Examples of generated-type systems

```txt
Prisma schema -> Prisma Client types
ATProto Lexicons -> generated record/API types
OpenAPI -> generated clients and DTOs
GraphQL schema -> generated query/mutation types
```

<absolute-constraints>
- DO NOT hand-edit generated code.
- DO NOT duplicate generated schemas manually without a mapping reason.
- DO NOT let generated protocol records leak into unrelated business logic unclassified.
- DO NOT hide business policy inside code generation templates.
- DO NOT add codegen when the repeated code is small and clearer by hand.
</absolute-constraints>

<context>
<example>
// Good: generated persistence edge plus internal mapping
```ts
function toPrismaUserCreateData(input: CreateUserInput): Prisma.UserCreateInput {
  return { email: input.email, name: input.name, role: input.role };
}
```
</example>

<example>
// Bad: raw generated protocol record drives persistence directly
```ts
await db.posts.insert(record as any);
```
</example>
</context>

<pre-flight-checklist>
1. [ ] What is the source of truth?
2. [ ] Did I keep generated output boring and untouched?
3. [ ] Did I map external shapes only when the mapping reveals meaning?
</pre-flight-checklist>
