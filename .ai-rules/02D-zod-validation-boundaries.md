---
description: "Optional rules for Zod as a runtime validation and source-of-truth boundary"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.4.0-optional-audited"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: ["zod"]
priority_schema: "critical > strong > guideline"
---

# Zod Validation Boundaries

<meta-instruction>
Use this file when untrusted runtime data enters the system. Zod is a boundary tool, not automatically the whole domain model.
</meta-instruction>

## Directives

<positive-directives>
- Use Zod for request bodies, forms, webhooks, config files, external API responses, environment variables, and other `unknown` input.
- Treat the schema as source of truth only for structural contracts it actually validates.
- Use `safeParse` when invalid input is expected and should become a response, result, or validation error.
- Use `parse` when invalid input is exceptional at that boundary or should fail startup.
- Derive the public structural type from the schema when the schema owns the contract.
- Convert validated structural input into domain decisions when business meaning is richer than shape.
- Keep API response validation near the external boundary before trusting remote JSON.
- Keep config/env validation at startup or module boundary so the rest of the app receives validated config.
</positive-directives>

## Constraints

<absolute-constraints>
- DO NOT duplicate a Zod-owned input type by hand.
- DO NOT let Zod schemas replace stable domain state unions or business decision types.
- DO NOT parse trusted internal values repeatedly just to feel safe.
- DO NOT hide complex business policy inside anonymous `.refine()` callbacks.
- DO NOT use Zod to validate data already guaranteed by generated ORM/API types unless crossing a trust boundary.
- DO NOT use Zod because a value is TypeScript-typed; use it because runtime data is untrusted.
- DO NOT throw raw Zod errors directly from user-facing HTTP/form boundaries without mapping them to the repo's error shape.
</absolute-constraints>

## Boundary Shape

<context>
```txt
unknown runtime input
  -> Zod parse / safeParse
  -> validated structural data
  -> named domain decision / command / persistence mapping
```
</context>

## Examples

<context>
<example>
// Good: schema owns external input shape.
const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

type CreateUserInput = z.output<typeof CreateUserSchema>;
</example>

<example>
// Bad: duplicate source of truth.
type CreateUserInput = { email: string; name: string };
const CreateUserSchema = z.object({ email: z.string().email(), name: z.string().min(1) });
</example>
</context>

<pre-flight-checklist>
1. [ ] Is this value untrusted at runtime?
2. [ ] Does the Zod schema own the type, or is it only a boundary parser?
3. [ ] Did I separate structural validation from domain meaning?
4. [ ] Did I map validation failure into the repo's normal error shape?
</pre-flight-checklist>
