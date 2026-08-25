@AGENTS.md

# Pragmatic TypeScript

Claude-native successor to the Pragmatic TypeScript v3 rule scheme.
This file holds only what is true in every session. Standards that apply to a
class of files live in `.claude/rules/` and load on path match. Workflows with
a start and an end live in `.claude/skills/`. Deterministic checks live in
lint, tsc, and hooks — pack documentation: the pack repository README
(`claude-workflows/typescript/README.md`).

## Core formula

- Put meaning in types and pure functions.
- Put execution in procedural shells.
- Put ownership in boundaries.
- Prefer the smallest honest structure that preserves meaning.

```txt
Type Strategy -> Functional Core -> Procedural Shell -> Smallest Honest Boundary
```

## Ceremony test

Before adding a layer, wrapper, factory, or envelope, state which of these it buys:

1. It makes an illegal state unrepresentable.
2. It moves a failure from runtime to compile time.
3. It gives an unowned concept an owner.
4. It removes a real duplication, not a coincidental resemblance.

If none: it is ceremony. Confirming that existing code is already right is a
valid outcome. Never refactor to prove a rule applies.

## Libraries

- Plain TypeScript first: `if`, `switch`, named functions, `Record` maps.
- Pattern matching (ts-pattern) is earned only at 4+ meaningful variants or
  state-and-event matched together. On closed unions use `.exhaustive()`;
  `.otherwise()` only for intentionally open external input.
- neverthrow only when typed expected failures repeat across several
  functions AND combinators remove boilerplate without hiding step names.
  Effect only when a module genuinely needs typed errors, retries,
  interruption, and resource management together — never for a small Result.
- Collection utils (Remeda etc.) only when they replace helpers the repo
  already repeats; no custom pipe/compose/combinator helpers without repeated
  local evidence. Never introduce a new FP ecosystem locally, and never let
  library syntax outrank domain names.

## Working agreement

- Architecture-significant work goes through plan mode first. The agent
  proposes, the human approves, the compiler enforces.
- When a rule can be expressed as a type, a lint rule, or a script, write the
  check instead of prose about it.
- After a series of edits, run lint and typecheck and report failures
  verbatim. Never suppress an error to make a check pass.
- Match the proof to the change, not to convenience: pure decisions and
  mappers -> unit test; database queries and row mapping -> integration test
  against a real database; route, navigation, empty state -> browser check;
  framework wiring -> a started process serving a real request or job.
  Typecheck is not a behavioral test.
- When the fitting proof cannot run, name the missing one and why. A cheaper
  green check never stands in for it.

## Host repo commands

- `corepack pnpm lint` / `corepack pnpm typecheck` — fast gates, run after every change set
- `corepack pnpm test` — unit tests
- `corepack pnpm check` — full gate (format, guards, lint, typecheck, db, build, test)
- `corepack pnpm exec tsx tools/check-architecture-regression-guards.ts` — architecture anchors, run before every commit
