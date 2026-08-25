# 2026-08-25 - TypeScript agent guardrails after the architecture fixes

Trigger: follow-up research after the Codex architecture review, the Composer
fixes, and the Claude follow-up review. The question is not whether more
TypeScript techniques exist, but which durable Codex/Claude guardrails would
have prevented the concrete misses without adding ceremony.

## Executive verdict

The repository already covers most of the useful ideas in the supplied
articles: discriminated unions, `unknown` at ingress, schema-derived types,
guard clauses, exhaustive lifecycle decisions, `satisfies`, one source of
truth, route ownership, typed API boundaries, functional core/procedural shell,
and capability-based decomposition.

The remaining gap is not a missing state-machine framework or a missing
"advanced TypeScript" skill. It is a narrower enforcement gap at three seams:

1. a guard that proves a resource exists should return the narrowed resource,
   so downstream code cannot re-read an optional handle and invent a
   contradictory fallback;
2. every external Zod object contract needs an explicit unknown-key policy;
3. a review/fix must map each changed runtime boundary to the proof that can
   actually establish it (unit, PostgreSQL integration, or browser), rather
   than treating a passing typecheck/unit suite as interchangeable evidence.

The smallest useful promotion is therefore one API-local rule, one
contracts-local rule, a small extension to the existing anti-regression/smoke
workflow, and focused tests. A new generic state-machine engine, a new API
layer, or a permanent TypeScript subagent would be overengineering.

## Source assessment

The supplied posts are useful inspiration, not normative sources. Claims about
TypeScript, Zod, Codex, and Claude were checked against the owning vendors.

| Supplied source                                                                                                                                 | Useful idea                                                                                                                                                     | Fit for this repository                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Retool: TypeScript control-flow analysis](https://retool.com/blog/typescript-control-flow-analysis-best-of)                                    | Narrowing, discriminated unions, user-defined guards, `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` reduce casts and optimistic types. | Mostly already present. The repo has `strict` and `noUncheckedIndexedAccess`; its domain rules already prefer unions and guards. The post is right in direction, but compiler flags do not prove interprocedural business reachability.                          |
| [ElangoDev: domain-driven typing](https://elangodev.com/blog/mastering-typescript-domain-driven-typing)                                         | Put types where invariants pay rent, keep business constants and validation in one owner, and avoid typing for prestige.                                        | Fully aligned with the ceremony test and schema ownership rules. Its mixed JS/JSDoc migration strategy is not relevant to this already-TypeScript monorepo.                                                                                                      |
| [DEV: 60-line type-safe state machine](https://dev.to/gabrielanhaia/state-machines-in-typescript-a-60-line-type-safe-engine-1jbf)               | Separate states from events, encode legal transitions, and use discriminants plus exhaustiveness.                                                               | The conceptual model fits releases, reports, recovery, and page lifecycles. The proposed generic engine does not: it mirrors type/value transition tables and uses several casts, while this repo already has named pure transition functions and decision maps. |
| [Shramko: early return](https://shramko.dev/blog/the-early-return-pattern-in-javascript)                                                        | Guard clauses flatten preconditions and help TypeScript narrow the happy path; complex interacting states deserve a switch/decision table instead.              | Already explicit in `packages/domain/AGENTS.md`. A blanket `no-else-return`/`max-depth` policy would be style enforcement, not a fix for the observed bug.                                                                                                       |
| [DEV: TypeScript tips](https://dev.to/gavincettolo/typescript-tips-that-actually-matter-in-real-projects-including-the-satisfies-operator-2cfg) | Prefer discriminated unions over optional-field soup, derive instead of duplicate, use `satisfies` for checked inference, and keep external data `unknown`.     | Already strongly covered. Treat examples as illustrative: a generic `request<T>` or a cast is not runtime validation, and not every function return is the correct owner from which to derive a domain type.                                                     |
| [DEV: API calls done right](https://dev.to/gavincettolo/api-calls-done-right-from-messy-fetch-to-clean-data-layer-419i)                         | Centralize transport/auth/error behavior, keep domain calls out of React components, and let TanStack Query own server state.                                   | The repo already has a shared API client, shared contracts, TanStack Query, and feature/domain ownership. The article's typed `fetch<T>` examples are weaker than this repo's Zod parsing because a generic return parameter does not validate JSON at runtime.  |
| [DEV: Next.js folder zen](https://dev.to/gavincettolo/nextjs-folder-zen-mastering-the-app-directory-16go)                                       | Let routes own route structure, introduce grouping only when different layout/access intent exists, and avoid premature nesting.                                | Only the ownership principle transfers. This project uses TanStack Router, not Next.js App Router, and `apps/web/AGENTS.md` already says TanStack Router owns route params. No Next.js folder rule belongs here.                                                 |

Authoritative cross-checks:

- The official [TypeScript narrowing handbook](https://www.typescriptlang.org/docs/handbook/2/narrowing) confirms control-flow narrowing, discriminated unions, `never`, and exhaustive switches.
- Official TypeScript documentation says [`satisfies`](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html) validates compatibility while retaining the expression's inferred type.
- [`allowUnreachableCode`](https://www.typescriptlang.org/tsconfig/allowUnreachableCode.html) only diagnoses code provably unreachable from JavaScript syntax and explicitly does not diagnose all type-analysis reachability. It would not, by itself, have prevented the async guard/resource incident.
- [`exactOptionalPropertyTypes`](https://www.typescriptlang.org/tsconfig/exactOptionalPropertyTypes.html) distinguishes an absent optional property from a present property whose value is `undefined`. It is a reasonable future migration candidate, not the targeted fix for the release guard or Zod policy.
- Zod documents that ordinary [`z.object`](https://zod.dev/api#objects) strips unknown keys by default, while a strict object rejects them. Therefore "parsed" and "strictly rejected unknown fields" are different contract policies.

## What is already covered well

### Type/domain rules

- Root `AGENTS.md` already requires discriminated unions for exclusive states,
  stable expected-failure codes, external `unknown`, schema-derived
  `z.output`, and the smallest honest boundary.
- `packages/domain/AGENTS.md` already requires named lifecycle transitions,
  total transformations, guard clauses, exhaustive switches, and typed
  decision maps.
- `packages/contracts/AGENTS.md` already owns one schema source per external
  contract, derived output types, compatibility checks, and separation of
  shape validation from semantic domain validation.
- `apps/AGENTS.md`, `apps/api/AGENTS.md`, and `apps/web/AGENTS.md` already keep
  policy out of shells, require honest effects, make shared response schemas
  authoritative, assign route params to TanStack Router, and assign server
  state to TanStack Query.
- Rule 14/14A already prevents both boundary leakage and file-size-driven
  splitting. The Composer capability splits followed that established model.
- Rule 15 already says regression categories need executable evidence and that
  strict persisted JSON needs writer-to-reader proof.

### Compiler and lint baseline

`tsconfig.base.json` already enables `strict`, `noUncheckedIndexedAccess`, and
`noImplicitOverride`; typed ESLint rejects explicit `any`, floating promises,
and misused promises. This is materially stronger than the baseline assumed by
the blog posts.

### Existing skills

- `anti-regression` already inspects callers, union consumers, stored/queued
  compatibility, and explicitly says a passing suite is not proof for behavior
  without coverage.
- `smoke-verify` already says a frontend route must be opened at runtime and
  that typecheck cannot prove runtime wiring.
- `code-review` already separates standards from spec and uses two independent
  review agents when explicitly invoked.
- `repo-review` already requires file evidence and the smallest useful change.

This means the miss was mainly one of trigger/enforcement, not missing prose.

## Concrete guardrails to promote

### 1. Required-resource guards return the narrowed value

**Observed class:** the release rollback/verification capability first called
an async fail-closed persistence check returning `Promise<void>`, then re-read
`DatabaseService.db` as `Db | undefined`. That type forced a second no-DB
branch whose `dry_run` answer contradicted the earlier 503. The implemented fix
correctly changed `assertReleasePlanForProject` to return `Promise<Db>` and made
callers use that handle.

**Narrow rule owner:** add to `apps/api/AGENTS.md` (and only promote upstream to
the generic TypeScript pack after another repo-independent occurrence):

> A guard that establishes a required resource must return the narrowed
> resource (or an explicit decision value). Callers must not re-read the
> original optional handle and add a second fallback with different semantics.

This is more precise than "prefer early return." It connects runtime proof to
the type passed onward.

**Automated proof:** add a focused release integration test for the legitimate
remaining branch: database configured + rollback or verification queue
unconfigured must return the documented `dry_run`/failure evidence. This also
prevents a later reviewer from confusing queue absence with database absence.

**Review workflow addition:** in `anti-regression`, require a reachability
finding to name the controlling value and trace the callee that changes or
checks it. A review should not call a branch dead merely because a nearby guard
throws for a different dependency. Prefer a compiler/linter diagnostic or one
concrete input path as evidence.

**Do not mislabel compiler flags as the fix:** setting
`allowUnreachableCode: false` is a cheap general hardening candidate if the
workspace is clean, but official TypeScript docs limit it to syntactically
provable unreachable code. It would not replace this rule or test.

### 2. Make Zod unknown-key policy explicit

**Observed class:** `TrackingKeyListResponseSchema` now has a shared owner, but
it is `z.object(...)` without `.strict()`. `TrackingKeySummarySchema` inside the
array is also non-strict. Under Zod's documented default, unknown keys are
accepted and stripped, not rejected. Whether that is a bug depends on the
contract's compatibility policy; the original finding explicitly requested a
strict shared contract, so the implementation is incomplete against that spec.

**Narrow rule owner:** extend `packages/contracts/AGENTS.md`:

> Every external object schema chooses an unknown-key policy explicitly.
> Internal API, job, and persisted-JSON contracts default to strict rejection;
> stripping or passthrough requires a named forward-compatibility reason.

This resolves the ambiguity without claiming `.strict()` is universally
correct. Public version-tolerant APIs may intentionally strip unknown fields;
internal lockstep clients may prefer drift detection.

**Automated proof:** add focused contract tests that parse an extra top-level
key and an extra nested key. If strictness is intended, both must fail. Do not
start with a repository-wide regex requiring `.strict()` on every `z.object`:
legacy schemas and intentional compatibility policies need adjudication, and a
textual check cannot understand composed/extended schemas reliably.

**Later mechanical option:** only after the policy is applied and exceptions
are enumerated, consider an AST-based contract lint or a small architecture
guard. Until then, the test is cheaper and more honest.

### 3. Map changed boundaries to the right proof level

**Observed class:** unit tests established fail-closed release reads, but did
not establish that `release_notes`/rollback rows are selected and mapped
correctly from PostgreSQL. The route helper/unit tests did not establish the
rendered empty-project navigation state. The change log correctly disclosed
that Docker integration and browser checks were not run; the gap was reporting,
not a false claim.

**Skill owner:** update the existing `smoke-verify` or `anti-regression` skill;
do not create a second verification skill. Add a small proof matrix:

| Changed seam                                                  | Minimum convincing proof                      |
| ------------------------------------------------------------- | --------------------------------------------- |
| pure decision/type mapping                                    | focused unit/type test                        |
| Drizzle query, persisted read/write, transaction, row mapping | real PostgreSQL integration test              |
| route params, navigation, loading/error/empty state           | browser smoke/E2E on the changed state        |
| Nest provider/module/bootstrap/worker wiring                  | process smoke plus representative request/job |

The skill should require an explicit `proved`, `blocked`, or `not run` result
for each changed seam. That makes omission visible before handoff.

**Location-bound rules:**

- Add to `apps/web/AGENTS.md`: project-route/navigation changes require a
  browser proof for real route id, allowed local-scaffold fallback, and missing
  id/disabled query state.
- A general API prose rule is unnecessary. Add the actual PostgreSQL tests for
  persisted release notes and rollback points; the current API rules already
  require runtime proof for wiring and shared response contracts.

**CI, not an agent hook, should enforce repeatable proof:** `pnpm check` does
not include `test:integration` or `test:browser`. If these paths are release
critical, add path-filtered PR jobs (or a release-preflight job) for the
relevant integration/browser suites. Local Codex/Claude hooks can run a Stop
validation, but vendor docs describe hooks as lifecycle automation that must be
trusted locally; CI is the shared merge authority. Codex officially supports
[Stop validation hooks](https://learn.chatgpt.com/docs/hooks), and Claude's
[extension guide](https://code.claude.com/docs/en/features-overview) similarly
positions hooks as automation that runs on matching events. Neither turns an
unavailable database/browser into evidence.

## AGENTS.md vs skill vs hook/CI vs subagent

| Mechanism                                 | Use here                                           | Why                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/AGENTS.md`                      | Required-resource guard returns narrowed handle    | Stable, location-bound design invariant seen whenever optional infrastructure is validated.                                                                                                                                                                                                                                                                                            |
| `packages/contracts/AGENTS.md`            | Explicit Zod unknown-key policy                    | Stable contract-owner rule, local to schemas.                                                                                                                                                                                                                                                                                                                                          |
| `apps/web/AGENTS.md`                      | Browser proof for route/navigation state changes   | Stable route-local verification requirement.                                                                                                                                                                                                                                                                                                                                           |
| `anti-regression` / `smoke-verify` skill  | Reachability evidence and boundary-to-proof matrix | Repeatable multi-step procedure that should load only for relevant diffs. Official Codex docs say skills package task-specific workflows and load through progressive disclosure: [Build skills](https://learn.chatgpt.com/docs/build-skills).                                                                                                                                         |
| Contract/integration/browser tests and CI | Strictness, SQL mapping, and rendered navigation   | These are mechanically decidable and must not depend on an agent remembering prose.                                                                                                                                                                                                                                                                                                    |
| Hook                                      | Optional fast local reminder/static gate only      | Useful for running an existing cheap validation at Stop; not the owner of Docker/browser truth.                                                                                                                                                                                                                                                                                        |
| Subagent                                  | No new permanent TypeScript subagent               | Subagents help independent, parallel, read-heavy review, but consume extra tokens and do not create enforcement. Official Codex guidance recommends them for bounded parallel exploration/tests and warns about write coordination: [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents). Existing `code-review` already uses the justified Standards/Spec split. |

Official Codex documentation says `AGENTS.md` is loaded as layered project
guidance before work and nearer files override broader files, which supports
putting these rules at their narrow owners rather than growing the root file:
[Custom instructions with AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
Anthropic likewise distinguishes persistent project instructions, reusable
skills, event-driven hooks, and isolated subagents in its official
[Claude Code extension guide](https://code.claude.com/docs/en/features-overview).

This matches the repository's existing promotion matrix in
`docs/agents/rule-system-maintenance.md`: mechanical constraints go to
lint/hooks/CI, project invariants to the nearest `AGENTS.md`, procedures to
skills, and stack-generic lessons to the upstream TypeScript pack.

## What not to add

- **No generic 60-line state-machine engine.** The business lifecycles already
  use explicit domain transitions and typed decisions. A new engine would
  duplicate sources and introduce conditional/mapped-type complexity plus
  casts without preventing either the DB/queue semantic mix-up or Zod policy
  ambiguity.
- **No XState/robot3 dependency.** There is no demonstrated hierarchical or
  parallel UI/domain state pressure requiring it.
- **No blanket early-return lint policy.** `no-else-return` and `max-depth` can
  improve style but do not prove state honesty; cleanup and transaction scopes
  can also make multiple exits less clear.
- **No global branded-type campaign.** The repo's schema-derived identifiers,
  enums, and UUID validation already protect important boundaries. Brand only
  a repeatedly confused same-primitive concept with demonstrated payoff.
- **No generic frontend service layer copied from the blog.** The current API
  client + Zod contract + TanStack Query arrangement is stronger than a
  `fetch<T>` wrapper and already has clear ownership.
- **No Next.js folder rules.** The project does not use Next.js App Router.
- **No root-AGENTS expansion with every blog tip.** The root already states the
  principles. OpenAI's current model guidance recommends lean, non-duplicated
  prompts and validating prompt changes against representative tasks:
  [Model guidance](https://developers.openai.com/api/docs/guides/latest-model).
- **No duplicate TypeScript audit subagent.** It would overlap
  `anti-regression`, `repo-review`, `source-of-truth-audit`, and the existing
  two-axis `code-review` workflow while weakening ownership.
- **No immediate repository-wide `exactOptionalPropertyTypes` migration solely
  because a blog recommends it.** It is valuable, but should be a measured
  compiler migration with representative failures and compatibility work, not
  an incident patch.

## Recommended minimal sequence

1. Add the two narrow design rules to `apps/api/AGENTS.md` and
   `packages/contracts/AGENTS.md`, plus the route proof line to
   `apps/web/AGENTS.md`.
2. Extend `anti-regression`/`smoke-verify` with the four-row proof matrix and
   the reachability-evidence requirement.
3. Add focused tests for nested tracking strictness, persisted release-note and
   rollback-point reads, DB-present/queue-absent release behavior, and the three
   project-route states.
4. Put the integration/browser tests in path-filtered CI or deployment
   preflight when runtime dependencies are available.
5. Only after another incident, consider AST enforcement or promotion to the
   upstream generic TypeScript pack.

No rule, skill, hook, subagent, compiler configuration, or production code was
changed by this research note.
