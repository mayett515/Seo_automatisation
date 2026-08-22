---
paths:
  - "**/*.{ts,tsx,mts,cts}"
---

# Type Strategy

Types reveal meaning, not cleverness. Applies when modeling any domain concept.

- Model mutually exclusive states as discriminated unions, never as boolean
  flags or optional-field combinations that permit impossible states.
- Give expected failures typed representations with stable string codes.
- Keep external input `unknown` until it is parsed at the boundary.
- Name the concept, not the storage shape (`ResourceGroupSelection`, not
  `{ resourceGroup: QuickPickItem | string }`).
- Do not replace repo-standard error contracts unless the task allows it.

```ts
// Honest branch: two states, two shapes.
type ResourceGroupSelection =
  | { kind: 'existing'; item: QuickPickItem }
  | { kind: 'new'; name: string };
```

## Source of truth

Before writing a type, identify what owns it. Derive; never copy.

| Owner | Use when | Derivation |
| --- | --- | --- |
| Hand-written type | stable domain states, decisions, expected errors | none — this is the source |
| Runtime value | route maps, policy maps, registries, typed config | `keyof typeof`, `satisfies` |
| Zod schema | untrusted input/output contracts | `z.output` (or `z.input` pre-parse) |
| Generated code | DB rows, OpenAPI, protocol types | import at the boundary, map inward |
| Brand / constructor | a checked value whose guarantee travels far | one validation site, no scattered casts |

Derivation restraint: when a plain union is shorter and equally honest, write
the plain union. A derivation chain over a value nothing reads at runtime is
ceremony.
