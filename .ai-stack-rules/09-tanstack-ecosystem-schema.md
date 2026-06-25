---
description: "Portable TanStack ecosystem schema for Query, Router, Form, Table, Store, Virtual, and official TanStack CLI skill-derived workflows"
globs: "apps/web/src/**/*.{ts,tsx}, packages/ui/src/**/*.{ts,tsx}, .ai-stack-rules/**/*.md, .ai-stack-findings/**/*.md, **/*tanstack*.md"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - ".ai-stack-rules/03-tanstack-query-router.md"
  - ".ai-stack-rules/SOURCES.md"
  - "C:\\Users\\muell\\.codex-personal\\skills\\query-docs-library-metadata\\SKILL.md"
  - "C:\\Users\\muell\\.codex-personal\\skills\\create-app-scaffold\\SKILL.md"
  - "C:\\Users\\muell\\.codex-personal\\skills\\add-addons-existing-app\\SKILL.md"
  - "C:\\Users\\muell\\.codex-personal\\skills\\choose-ecosystem-integrations\\SKILL.md"
  - "C:\\Users\\muell\\.codex-personal\\skills\\maintain-custom-addons-dev-watch\\SKILL.md"
priority_schema: "critical > strong > guideline"
---

# TanStack Ecosystem Schema

<meta-instruction>
Use this rule when TanStack work is broader than ordinary component code: ecosystem selection, CLI/scaffold decisions, add-ons, Form/Table/Store/Virtual adoption, docs metadata discovery, or audits against TanStack guidance. This file is the project-owned portable schema. The installed Codex skills are optional personal references, not required repo dependencies and not the project source of truth.
</meta-instruction>

## 1. Focused Best Practices

<positive-directives>
- Treat TanStack Query as server-state synchronization, not generic client state.
- Treat TanStack Router as the owner of route params, route loading strategy, and route-level type contracts.
- Treat TanStack Form, Table, Store, and Virtual as separate adoption decisions; add each only when a real workflow needs it.
- Use the installed official TanStack CLI skills as reference when planning scaffolds, add-ons, ecosystem integrations, or docs discovery.
- Treat missing personal skill paths as non-blocking; fall back to official TanStack docs and the project-owned rules.
- Resolve TanStack library/add-on ids from official metadata before writing commands.
- For existing projects, check whether TanStack CLI metadata such as `.cta.json` exists before considering `tanstack add` workflows.
- Keep this repo's architecture direction authoritative: monorepo boundaries, Local SEO product truth, approval gates, and ports/adapters are not overwritten by TanStack defaults.
- Record uncertain or newly discovered TanStack guidance in `.ai-stack-findings/` before promoting it to a hard rule.
</positive-directives>

## 2. Hard Prohibitions

<absolute-constraints>
- DO NOT copy installed Codex skill files into the repo as project truth.
- DO NOT run `tanstack create`, `tanstack add`, add-on dev/watch, or scaffold-mutating commands without explicit user approval.
- DO NOT run `npx @tanstack/cli ...` metadata commands without explicit approval when current metadata is needed, because it may download packages or use telemetry.
- DO NOT assume `tanstack add` applies safely to this repo unless `.cta.json` or equivalent scaffold metadata exists.
- DO NOT combine `--router-only` with template, deployment, or add-on intent; router-only compatibility mode can drop that intent.
- DO NOT treat ecosystem partner ids as installable add-on ids without mapping through official CLI metadata.
- DO NOT let a TanStack scaffold suggestion replace the existing NestJS/Fastify backend, worker architecture, database ownership, or Local SEO product rules.
</absolute-constraints>

## 3. Context-Dependent Trigger Gates

<conditional-logic>
IF the task is ordinary Query/Router UI code:
THEN use `.ai-stack-rules/03-tanstack-query-router.md` first and this file only for broader ecosystem checks.

IF the task asks whether current code follows TanStack guidance:
THEN check query keys, query states, mutation invalidations, route params, API URL construction, and business-state separation.

IF the task asks to scaffold, add integrations, or choose TanStack ecosystem providers:
THEN read the relevant installed TanStack CLI skill, verify official metadata path, ask before running any command, and document any decisions in `.ai-stack-findings/`.

IF a TanStack CLI skill conflicts with this repo's existing architecture:
THEN preserve the repo architecture and record the conflict; do not force the CLI workflow.

IF a new TanStack package is proposed:
THEN define its owner, workflow, source of truth, and verification path before adding it.
</conditional-logic>

## 4. Project-Owned TanStack Domains

<context>
Current TanStack usage:

```text
TanStack Router: app routing and typed route params
TanStack Query: server-state loading, mutation state, invalidation
TanStack Form: planned form workflows, not automatic for every input
TanStack Table: planned dense data grids and audit/report tables
TanStack Store: planned local UI state only when state needs a shared store
TanStack Virtual: planned for large lists/tables when measured UI size requires it
TanStack CLI skills: installed locally for Codex reference; project rules route to them but do not depend on them
```

Current repo constraint:

```text
No .cta.json found. Treat TanStack CLI add-on workflows as reference only unless the user explicitly approves a new scaffold/add-on strategy.
```
</context>

## 5. TanStack Audit Checklist

<pre-flight-checklist>
1. [ ] Did Query keys include every variable that changes fetched data?
2. [ ] Did UI distinguish pending/error/success from business states such as connection-required or approval-required?
3. [ ] Did mutations invalidate or update the affected query keys?
4. [ ] Did Router own route params, and were manually constructed API paths encoded?
5. [ ] Did Form/Table/Store/Virtual usage have a real workflow reason?
6. [ ] Did any TanStack CLI workflow check official metadata and repo preconditions before command construction?
7. [ ] Did TanStack guidance stay subordinate to Local SEO product truth and architecture direction?
</pre-flight-checklist>
