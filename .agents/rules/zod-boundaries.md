---
paths:
  - "**/schemas/**/*.ts"
  - "**/contracts/**/*.ts"
  - "**/*.schema.ts"
  - "**/dto/**/*.ts"
---

# Validation Boundaries

Parse once at the edge, pass the parsed type inward, never re-check. The edge
is: HTTP bodies, query strings, webhooks, env vars, config files, DB JSON
columns, cache reads, LLM output, third-party API responses, file uploads,
queue payloads.

- Define the schema once; derive the type with `z.output` (or `z.infer`).
  Never hand-write a parallel interface — mirrored types drift.
- Use `safeParse` where invalid input is expected and map the failure into
  the repo error union; `parse` only where invalid input should fail startup.
  A `ZodError` never escapes the boundary layer.
- Mark a field nullable when the source may genuinely omit it. A required
  field pressures a producer into fabricating a value.
- Use an enum plus an `other` member with a detail field when the category
  set will grow. Never `.passthrough()` on untrusted input.

```ts
export const SeoTaskSchema = z.strictObject({
  url: z.string().url(),
  targetKeyword: z.string().min(1),
  maxDepth: z.number().int().default(2),
});
export type SeoTask = z.output<typeof SeoTaskSchema>;
```

## When schemas get advanced

- Transforms, preprocessors, coercion, defaults, and brands make input and
  output diverge: name both sides deliberately with `z.input` and `z.output`.
- `.transform()` is one-way. If the code ever needs to encode the value back,
  use a codec or an explicit mapper pair instead.
- Brands only when the guarantee travels beyond the parser and prevents a
  real mix-up (`UserId` vs `PostId`). A branded value is only obtainable
  through parsing — no scattered casts.
- `z.discriminatedUnion()` for tagged variants; `z.lazy()` for recursive
  input; `.superRefine()` only when one pass must report multiple
  path-specific issues.
- Business policy never hides inside anonymous `.refine()` callbacks. If the
  rule has domain meaning, it is a named core function.

## Schema does not mean correct

A schema guarantees shape, never meaning. A parsed object can still put the
tax ID in the vendor field or report a total that contradicts its line items.
Semantic invariants are checked in the core, after parsing, as named gate
functions that return a failure code.

## Unknown keys are a decision

Every object schema at a boundary decides explicitly what happens to unknown
properties. `z.object()` accepts and silently strips them; that is a policy,
not a default to inherit by accident. Internal API, queue, and persistence
contracts are strict. Strip, passthrough, or catchall need a written
compatibility reason.

The rule binds when writing a schema and when touching one. Existing schemas
migrate deliberately, one contract at a time: tightening changes parse
behavior for producers already in flight, so it needs the same producer audit
as any other contract change.
