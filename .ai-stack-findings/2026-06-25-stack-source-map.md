# 2026-06-25 Stack Source Map

Purpose: keep broader React, TanStack, NestJS/Fastify, Drizzle, Mastra, Zod, and worker guidance visible without turning every idea into a hard rule too early.

## Installed Official Skills

Installed from `TanStack/cli` into `C:\Users\muell\.codex-personal\skills`:

- `query-docs-library-metadata`
- `create-app-scaffold`
- `add-addons-existing-app`
- `choose-ecosystem-integrations`
- `maintain-custom-addons-dev-watch`

Use after restarting Codex. Until then, read the installed `SKILL.md` files manually when needed.

These paths are optional personal references. A clone on another machine may not have them; in that case, use official TanStack docs and the project-owned `.ai-stack-rules/09-tanstack-ecosystem-schema.md`.

Do not run scaffold-mutating commands such as `tanstack create`, `tanstack add`, or add-on workflows without explicit user approval. Ask before running metadata commands if current TanStack CLI output is needed, because `npx @tanstack/cli ...` may download packages and may use telemetry unless disabled.

## LobeHub Skill Links

The provided LobeHub `skill.md` URLs returned `429 Too Many Requests`, so they were not installed or treated as trusted. Keep them as candidate sources only:

- `enitrat-skill-issue-tanstack-best-practices`
- `openclaw-skills-react`
- `exceptionless-exceptionless-tanstack-form`
- `tanstack-cli-*`

Prefer the official TanStack CLI GitHub skills over marketplace mirrors when they overlap.

## Project-Owned TanStack Schema

The repo should not depend on personal Codex skill installation for correctness. The portable project rule is:

- `.ai-stack-rules/09-tanstack-ecosystem-schema.md`

That file summarizes the official skill-derived workflow and adds project-specific constraints, especially:

- installed Codex skills are reference material, not project truth
- no `.cta.json` exists in this repo, so `tanstack add` is not a safe direct workflow right now
- TanStack defaults must not override the Local SEO monorepo architecture
- scaffold/add-on commands require explicit user approval

## Local Read-Only References

- `C:\total typescript\total_typescript_learning_path\modules\06_zod\index.md`: runtime validation, schema-derived types, transforms, composition.
- `C:\total typescript\total_typescript_learning_path\modules\07_react_with_typescript\index.md`: props, children, event handlers, hooks, refs, reducer typing.
- `C:\total typescript\total_typescript_learning_path\modules\08_advanced_react_with_typescript\index.md`: discriminated union props, generic components/hooks, custom hook inference, external library wrappers.
- `C:\total typescript\total_typescript_learning_path\modules\05_advanced_typescript_patterns\index.md`: branded types, predicates/assertions, external library type extraction.
- `C:\total typescript\React_Patterns_Karteikarten\Index.md`: component, state, composition, resilience/loading, and feature architecture patterns.

## Official Source Areas To Refresh Later

- React: hooks linting, purity, error boundaries, Suspense/lazy, server/client boundaries if introduced.
- TanStack Query/Router/Form/Table/Store/Virtual: query state, keys, invalidation, loaders, route params, form validation, table state, virtualization.
- NestJS + Fastify: provider tokens, runtime DI, adapter differences, request/response typing, error filters, multipart/static/cors/plugin behavior under Fastify.
- Drizzle: schema ownership, migrations, relations, indexes, transactions, row-level tenancy constraints.
- Mastra: agents vs workflows, deterministic workflows for known control flow, agents for open-ended reasoning, human approval/suspend-resume paths.
- Workers/queues: idempotency, retries, backoff, failure normalization, replay-safe persistence, outbox/events if needed.
