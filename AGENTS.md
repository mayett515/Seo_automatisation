# AGENTS.md

This project uses a native agent layer shared by Cursor, Codex, and Claude Code. Operational detail for pack sync, mirrors, vendored skills, archive/frozen references, and the promotion matrix lives in `docs/agents/rule-system-maintenance.md`.

- Before editing below `apps/` or `packages/`, follow the nearest nested `AGENTS.md` in addition to this file.
- Issue tracker, triage labels, domain docs: `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, `docs/agents/domain.md`.

## Shared native layer

Root and nested `AGENTS.md` files are shared by Cursor and Codex; Claude Code additionally loads `CLAUDE.md`. Repeatable workflows live in `.agents/skills/`. Full host wiring, skill ownership, and vendored-pack sync rules: `docs/agents/rule-system-maintenance.md`.

## Archive (retired rule bundles)

Archived bundles live under `archive/` and load only on explicit request. Coverage ledger, bundle list, and immutability rules: `docs/agents/rule-system-maintenance.md`.

## Rule authority

- Generic TypeScript rule authoring is owned upstream by the pack master `C:\claude\claude-workflows\typescript`; update the pack first, then sync the host layers.
- `.ai-rules/` is a frozen reference copy of the retired TypeScript rule bundle; the native layer (root and nested `AGENTS.md`, `.agents/skills/`) is canonical for TypeScript work.

## Pragmatic TypeScript (generic layer)

Use the smallest honest structure that preserves domain meaning.

```text
Type strategy -> functional core -> procedural shell -> smallest honest boundary
```

### Ceremony test

Before adding a layer, wrapper, factory, or envelope, identify what it buys:
an illegal state becomes unrepresentable; a failure moves from runtime to
compile time; an unowned capability or lifecycle gets an owner; real
duplication is removed. If none applies, do not add the abstraction.
Confirming that existing code is already right is a valid outcome.

### Type strategy

- Model mutually exclusive states as discriminated unions, not boolean flags or combinations of optional fields.
- Give expected failures typed representations with stable string codes. Messages are for humans; code branches on codes.
- Keep external input `unknown` until parsed at a boundary.
- Identify the owner before writing a type. Derive from Zod schemas, runtime registries, or generated code instead of mirroring shapes. Use `z.output` for parsed values and `z.input` only when pre-parse input differs.
- Do not replace an established repository error or contract dialect unless the task requires it.

### Functional core and procedural shell

- Core logic decides and returns values. It performs no IO, logging, timing, randomness, or framework work; pass time, randomness, and external state in explicitly.
- Expected core failures are return values; programmer errors may throw.
- Shell code loads state, asks the core for a decision, performs the effect, and normalizes provider failures. Never report success when an effect failed.
- Do not hide business policy inside controllers, workers, repositories, framework hooks, or anonymous schema refinements.

### Libraries

- Plain TypeScript first: `if`, `switch`, named functions, and typed `Record` maps.
- Pattern matching (ts-pattern) is earned only at 4+ meaningful variants or state-and-event matched together. On closed unions use `.exhaustive()`; `.otherwise()` only for intentionally open external input.
- neverthrow only when typed expected failures repeat across several functions AND combinators remove boilerplate without hiding step names. Effect only when a module genuinely needs typed errors, retries, interruption, and resource management together — never for a small Result.
- Collection utils (Remeda etc.) only when they replace helpers the repo already repeats; no custom pipe/compose/combinator helpers without repeated local evidence. Never introduce a new FP ecosystem locally, and never let library syntax outrank domain names.

### Boundaries

Choose the smallest rung that owns the concern: pure function -> injected
module function -> handler/hook -> service class -> adapter/client ->
worker/process owner. A class must own a capability, resource, lifecycle,
framework contract, or collaboration pattern; never wrap pure parsers,
validators, calculations, or mappers in one. Validate once at ingress and
pass the parsed type inward. Preserve caught errors with `cause`; log once at
the owning boundary. Comments explain non-obvious reasons, not syntax. For
the error-shape taxonomy and branching escalation, read
`docs/agents/failure-and-escalation.md`.

### Tests, docs, verification

- Test doubles stay in test files; behavioral assertions for queue, authorization, retry, and status changes. Typecheck is not a behavioral test.
- Update the owning doc in the same change when lifecycle, ownership, public behavior, or verification commands change; documentation describes verified behavior.
- Run the narrowest relevant lint/typecheck after edits and report failures verbatim; runtime wiring changes need a smoke check (the smoke-verify skill).
- Every review asks, besides soundness: does this diff implement what was actually asked? Find the originating requirement (issue, spec, ADR, or the user's words); never reconstruct one from the diff and grade the diff against it. Sound-but-wrong-thing and right-intent-built-badly are separate verdicts.
- When reviewing a repository or subsystem, read change frequency alongside size: churn tells you where findings pay back; a large file nobody touches pays back never.
- Plain TypeScript first; pattern matching, Result libraries, or a new FP ecosystem only with real repeated pressure and explicit approval.

## Routing

- For Local SEO product planning, controlled automation, stack decisions, deployment-agent flow, tracking privacy, or product docs, load `.ai-project-rules/00-system-index.md`.
- For architecture decisions, production hardening decisions, repeated review findings, or regression guards, read the relevant ADR in `docs/architecture/decisions/`.
- For chronological project progress, review responses, completed slices, or remaining next steps, update `docs/progress/`.
- The Martines field corpus lives as a read-only sibling repository at `../martines-dach-gebaeudeservice` (the real customer site plus its `Seo/` folder: the manual SEO operation this product industrializes - keyword analyses v1-v8, ungenutzte_potentiale, growth-plan bundle, kundenreport v1-v4, raw GSC performance exports). It is the primary seed-data source when the Opportunity Research lane activates; ingest through the knowledge/evidence flow (ADR 0016/0023), never by copying files into this repo.
- Original inspiration snapshots (the big-eater research corpus) live as a read-only sibling repository at `../big-eater` (frozen clone, commit 508ab73). Consult it when re-mining patterns for upcoming slices; distilled lessons belong in `.ai-stealer-findings/`, never edited there.
- For research, findings, and lessons that are NOT yet rules: collect them host-neutrally in `.ai-stack-findings/` and `.ai-stealer-findings/` (both editable). Promotion is deliberate — see `docs/agents/rule-system-maintenance.md`.

## Project Stack

```text
Backend: NestJS + Fastify, PostgreSQL, Redis/BullMQ, object storage
AI/Workers: Mastra workflows/agents plus deterministic queue workers
Frontend: React + TypeScript + TanStack Router/Query/Form/Table/Store/Virtual
Deploy: Netlify, Google OAuth, Google Search Console, sitemap, tracking
```

## Product Sources

```text
Core product truth:
1. local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/
2. deployment-agent-extension-only/local-seo-product-knowledge-pack/

Field evidence:
3. `C:\gebäudeservicefirma\Seo` as read-only field evidence when explicitly relevant
4. .ai-project-references/field-evidence/

Frontend inspiration:
5. .ai-project-references/frontend-inspiration/

Architecture guidance (read-only, locked for implementation quality):
6. C:\total typescript\Architecture_Karteikarten
7. C:\total typescript\Hexagonal_Architecture_Karteikarten
8. C:\total typescript\System_Design_101_Karteikarten
```

## Hard Rules

- Do not copy external code verbatim from GitHub or the web without checking license and recording attribution.
- Do not bypass preview, approval, release preflight, or post-deploy verification in product plans.
- For TypeScript/backend implementation, the nested `AGENTS.md` files and `.agents/skills/` are the pre-edit layer; `.ai-rules/` is frozen reference, not a checklist.
- Do not re-decide accepted architecture decisions silently; update or supersede the relevant ADR when the direction changes.
