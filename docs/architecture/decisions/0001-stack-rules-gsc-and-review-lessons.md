# 0001 - Stack Rules, GSC Slice, And Review Lessons

Date: 2026-06-25
Status: Accepted

## Why This File Exists

This folder is for human-readable project memory. It is not part of the hidden rule schema.

Use these notes to understand why decisions were made, what reviews found, what was fixed, and what is intentionally deferred.

## Current Direction

The project is a Local SEO automation platform with:

- NestJS + Fastify API
- BullMQ worker host
- Mastra workflows/agents for reasoning and orchestration
- PostgreSQL + Drizzle
- React frontend
- TanStack Router and TanStack Query
- Zod-owned contracts at trust boundaries
- hidden project rules for repeatable AI-assisted development

The architecture direction is:

- modular monolith first
- API and worker as separate processes
- shared typed packages
- ports/adapters for external providers
- deterministic workers for production side effects
- agents/workflows for reasoning, proposals, and orchestration
- customer approval before productive SEO/deployment changes

## What Was Committed Already

Commit:

```text
4769b1a Add GSC sync slice and stack guardrails
```

That commit added the first Google Search Console vertical slice:

- GSC OAuth connection flow
- encrypted refresh-token storage
- Search Console adapter
- performance sync worker
- Search Analytics row storage
- opportunity signal storage
- frontend GSC connect screen
- frontend performance dashboard
- GSC-related contracts and DB tables
- retry-safe worker behavior for repeated sync jobs
- rowId linking from opportunity signals to Search Analytics rows
- reconnect behavior that revokes older refresh tokens
- safe frontend URL parsing
- explicit TanStack Query API error state

It also added the first stack-rule bundle:

- TypeScript static safety
- React render/hooks rules
- TanStack Query/Router rules
- NestJS/Fastify runtime DI rules
- OAuth/provider-token rules
- URL runtime-safety rules
- smoke verification rules
- official-doc refresh workflow

## What Reviews Taught Us

The external reviews were useful because they caught problems that typecheck alone would not catch.

### 1. Typecheck Is Not Runtime Proof

`tsc` can pass while Nest dependency injection, queue configuration, provider construction, or runtime URL parsing is still wrong.

Decision:

- keep `typecheck`
- add runtime smoke checks after backend/frontend route changes
- add lint
- add explicit stack rules for runtime-sensitive areas

### 2. Queue Availability Must Be Checked Before Returning Queued

The GSC API could create a sync run and return a queued job even when `REDIS_URL` was missing and no BullMQ queue existed.

That is a real production bug because the UI would think work was queued, but no worker could ever process it.

Decision:

- before returning a queued job, check that the queue exists
- if queue infrastructure is missing, return a connection/configuration-required state or a service-unavailable style error
- never create misleading job success records when infrastructure cannot execute them

### 3. Zod Should Validate Both Sides Of The API Boundary

The backend already uses Zod contracts, but the frontend originally did:

```ts
return response.json() as Promise<T>;
```

That gives TypeScript a type but does not validate runtime data.

Decision:

- frontend API helpers should parse responses with shared Zod schemas when contracts exist
- request bodies should be parsed with Zod schemas instead of manual casts
- Zod remains the source of truth for external input/output contracts

### 4. URL Values Need Runtime Safety

`new URL(...)` can throw. This matters in render paths, env parsing, provider URLs, and route/API construction.

Decision:

- do not call `new URL(...)` directly inside JSX for remote/untrusted data
- use safe helpers for display-only URL parsing
- validate env URLs with Zod before calling `new URL(...)`
- constrain `REDIS_URL` to `redis://` or `rediss://`
- constrain `DATABASE_URL` to `postgres://` or `postgresql://`

### 5. OAuth Should Use Access Without Exposure

OAuth and provider tokens must not leak into chat, logs, browser redirects, or long-lived operational records.

Current project behavior:

- refresh tokens are encrypted at rest
- access tokens are short-lived/in-memory
- OAuth state is signed and expiring
- old refresh tokens are revoked/cleared on reconnect
- provider errors are normalized before logging/storage

Decision:

- do not expose raw provider responses to users
- do not store plaintext provider tokens
- do not reuse token encryption keys as OAuth state signing keys
- use dedicated secrets for dedicated purposes where possible

### 6. Installed Skills Are Tools, Project Rules Are Truth

Official TanStack CLI skills were installed globally into local Codex:

```text
C:\Users\muell\.codex-personal\skills\
```

Those skills are useful as reference/automation tools, but they are not copied into this repo as project truth.

Decision:

- installed skills are optional local tools
- project-owned rules live in `.ai-stack-rules/`
- findings and research notes live in `.ai-stack-findings/`
- project rules govern installed skills
- scaffold/add-on commands require explicit approval

### 7. TanStack Needs Project-Owned Rules

TanStack has official CLI skills and docs, but this project still needs its own TanStack decision layer.

Decision:

- use `.ai-stack-rules/09-tanstack-ecosystem-schema.md` as the portable project-owned TanStack rule
- use TanStack Query for server state
- use TanStack Router for routes and params
- treat Form/Table/Store/Virtual as separate adoption decisions
- do not run `tanstack create` or `tanstack add` without approval
- do not assume `tanstack add` applies safely when `.cta.json` is absent

### 8. React Rules Are Enough For Now

We do not currently need separate installed React skills.

The project has React guidance through:

- official React docs
- local React Patterns Karteikarten
- Total TypeScript React modules
- `.ai-stack-rules/02-react-render-hooks.md`

Decision:

- keep React rules in the project scheme
- use official React docs as authority
- treat blog posts as inspiration only
- prefer TanStack Query over hand-rolled `useFetch` hooks for server state
- use custom hooks for focused reusable UI/client logic

### 9. NestJS Provider Refactor Is Important But Deferred

`GscService` still constructs several infrastructure dependencies itself:

- DB client
- Search Console adapter
- token cipher
- Redis queue

That works for the MVP slice, but it is not the long-term NestJS shape.

Decision:

- defer full provider/composition-root refactor to a dedicated backend architecture slice
- eventually introduce providers/tokens for DB, queue, Search Console adapter, token cipher, and config
- use lifecycle hooks to close DB/Redis/queue resources cleanly

## What Is Still Deferred

These are known future items, not forgotten mistakes:

- tenant/auth/project authorization for GSC routes
- GSC property selection instead of choosing the first property
- Nest provider/composition-root refactor
- liveness/readiness split for health checks
- DB indexes for GSC analytics and opportunity signals
- stricter production route params instead of demo fallback
- provider lifecycle cleanup
- more complete release/deployment persistence
- Mastra workflow design for approval and human-in-the-loop decisions
- security skill/policy design for secrets, tenant isolation, and logging redaction

## Current Rule Workflow

When a stack issue appears:

1. Check project rules first.
2. Browse official docs for the relevant stack area.
3. Check adjacent official guidance, not only the exact bug page.
4. Record new ideas in `.ai-stack-findings/`.
5. Promote only stable, project-relevant lessons into `.ai-stack-rules/`.
6. Validate with lint, typecheck, build, diff check, and smoke checks where relevant.

Examples:

- URL/browser behavior -> MDN
- REST/API semantics -> Microsoft/Azure API guidance or RFCs
- React behavior -> official React docs
- TanStack behavior -> TanStack docs and installed TanStack CLI skills
- Nest/Fastify behavior -> NestJS and Fastify docs
- Drizzle behavior -> Drizzle docs
- validation/source-of-truth behavior -> Zod docs and `.ai-rules/`

## Practical Mental Model

```text
Installed skills
  = optional local tools

.ai-rules/
  = frozen TypeScript schema

.ai-project-rules/
  = Local SEO product truth

.ai-stack-rules/
  = stack implementation rules

.ai-stack-findings/
  = research and candidate future rules

docs/architecture/decisions/
  = human-readable decision memory
```

## Immediate Next Step

The current follow-up changes after commit `4769b1a` are still uncommitted.

Before the next commit, review:

```bash
git status --short
git diff
```

Then run:

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm build
git diff --check
```
