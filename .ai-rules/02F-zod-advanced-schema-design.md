---
description: "Optional advanced Zod schema design rules for recursive schemas, preprocessing, async validation, brands, transforms, codecs, and input/output divergence"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.5.0-optional-audited"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: ["zod"]
priority_schema: "critical > strong > guideline"
---

# Zod Advanced Schema Design

<meta-instruction>
Use this file only when the task goes beyond basic Zod boundary validation. This file prevents advanced Zod features from becoming hidden business logic, type drift, or schema ceremony.
</meta-instruction>

## Advanced Zod Directives

<positive-directives>
- Use `z.lazy()` for recursive data such as trees, nested categories, comments, menus, and expression ASTs.
- Use `z.preprocess()` for boundary preparation such as parsing JSON strings, URL values, form data, env vars, and legacy payloads before structural validation.
- Use `parseAsync` or `safeParseAsync` only when validation genuinely calls external async resources.
- Use `z.input<typeof Schema>` and `z.output<typeof Schema>` when transforms, preprocessors, coercion, codecs, defaults, or brands make input and output differ.
- Prefer object spread, `.pick()`, `.omit()`, `.partial()`, `.required()`, or `.safeExtend()` before inventing custom schema builders.
- Prefer `z.discriminatedUnion()` when parsing meaningful tagged variants from external input.
- Use `.superRefine()` when one structural validation pass must report multiple path-specific issues.
- Use Zod brands/newtypes only when parsed values need meaningful nominal identity across function boundaries.
- Use codecs only for real bidirectional boundary transformations such as string/date, JSON/string, URL/string, or encoded/decoded data.
</positive-directives>

## Advanced Zod Constraints

<absolute-constraints>
- DO NOT create advanced Zod schemas for local, tiny, non-exported values.
- DO NOT turn every domain type into a Zod schema.
- DO NOT bury important business policy inside anonymous `.refine()` or `.superRefine()` callbacks.
- DO NOT use async validation for checks that belong in a use case, repository, or domain policy.
- DO NOT use `.transform()` when the code later needs to encode the value back; use a codec or explicit mapper.
- DO NOT subclass Zod in application code.
</absolute-constraints>

## Source-of-Truth Rule

<context>
Zod owns the source of truth only when runtime validation owns the contract.

Good Zod-owned types:
- request bodies
- form inputs
- webhook payloads
- environment variables
- config files
- external JSON
- request and response payloads
- decoded protocol payloads
- external API response validation

Usually not Zod-owned:
- stable internal domain states
- pure decision unions
- expected business errors
- ORM-generated persistence types
- framework-provided request/response types

Zod brand caution:
- A Zod brand is static-only.
- A branded value must be obtained through parsing.
- A brand should prevent a real mix-up such as `UserId` vs `PostId`, `USD` vs `JPY`, or `Email` vs `Username`.
</context>

## Examples

<context>
<example>
// Good: recursive external input uses z.lazy at the boundary.
type Category = {
  name: string;
  subcategories?: Category[];
};

const CategorySchema: z.ZodType<Category> = z.lazy(() =>
  z.object({
    name: z.string().min(1),
    subcategories: z.array(CategorySchema).optional(),
  }),
);
</example>

<example>
// Bad: business policy hidden as anonymous schema refinement.
const CreateUserSchema = z.object({ role: z.enum(["admin", "member"]) })
  .refine(input => input.role !== "admin", { message: "Admin signup disabled" });
</example>
</context>

<conditional-logic>
IF the parsed value has different input and output shapes:
THEN name both shapes intentionally with `z.input` and `z.output`.

IF a value needs nominal identity after validation:
THEN consider a Zod brand only if the guarantee travels beyond the parser.

IF parsing variants with a shared discriminator:
THEN prefer `z.discriminatedUnion()`.

IF converting both directions across a boundary:
THEN prefer a codec or explicit mapper.

IF validation emits multiple structural issues:
THEN consider `.superRefine()`.

IF a transform can fail:
THEN use Zod issue reporting or an explicit mapper; do not throw inside Zod transform functions.

IF the rule is business policy:
THEN move it into a named pure decision function outside Zod.
</conditional-logic>

<pre-flight-checklist>
1. [ ] Is advanced Zod actually earned here?
2. [ ] Did I distinguish schema input from schema output?
3. [ ] Did I avoid hiding business policy in refinements?
4. [ ] If I used a brand, does it prevent a real mix-up after parsing?
5. [ ] Did I avoid Zod subclassing in application code?
</pre-flight-checklist>
