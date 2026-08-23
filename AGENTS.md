# AGENTS.md

This project uses a native agent layer shared by Cursor, Codex, and Claude Code: this root file, the nearest nested `AGENTS.md`, shared skills, and host-native rules and hooks. The remaining detailed rule bundles (`.ai-project-rules/`, frozen `.ai-rules/`) are routed below; retired bundles live in `archive/`.

## Shared native layer

- Root and nested `AGENTS.md` files are shared by Cursor and Codex; Claude Code additionally loads the root `CLAUDE.md`.
- Repeatable workflows live in `.agents/skills/`, which both hosts discover. Cursor invokes them with `/skill-name`; Codex can invoke them with `$skill-name`.
- Cursor-only rules, subagents, and hooks live in `.cursor/`. Codex-only counterparts live in `.codex/` when installed. The Claude-native layer lives in `CLAUDE.md` plus `.claude/` (17 path-scoped rules, 5 pack skills, 3 hooks wired in `.claude/settings.json`, the diff-reviewer subagent), copied verbatim from the pack master.
- Skill ownership: `.agents/skills/` is canonical for the ten project skills listed below. `.claude/skills/` mirrors the pack master's five generic skills for Claude-native discovery; where a name exists in both trees, the pack lineage owns `.claude/` and the shared lineage owns `.agents/` — sync deliberately through pack updates, never by ad-hoc edits.
- Before editing below `apps/` or `packages/`, follow the nearest nested `AGENTS.md` in addition to this file.
- Skills available: anti-regression, repo-review, smoke-verify, source-of-truth-audit, type-interview, oauth-security-review, deployment-preflight, local-page-quality, mermaid-diagrams, inspiration-pass.

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
- Plain TypeScript first; pattern matching, Result libraries, or a new FP ecosystem only with real repeated pressure and explicit approval.

## Routing

- For Local SEO product planning, controlled automation, stack decisions, deployment-agent flow, tracking privacy, or product docs, load `.ai-project-rules/00-system-index.md`.
- For architecture decisions, production hardening decisions, repeated review findings, or regression guards, read the relevant ADR in `docs/architecture/decisions/`.
- For chronological project progress, review responses, completed slices, or remaining next steps, update `docs/progress/`.
- For research, findings, and lessons that are NOT yet rules: collect them host-neutrally in `.ai-stack-findings/` and `.ai-stealer-findings/` (both editable). Promotion is deliberate, never automatic — the target follows the promotion matrix: mechanically checkable -> lint/hook/CI or guard script; project-wide invariant -> root `AGENTS.md`; location-bound convention -> the owning nested `AGENTS.md`; repeatable procedure -> `.agents/skills/`; architecture decision with rationale -> ADR; stack-generic (true in any repo on this stack) -> the pack master. Never promote into `archive/`.

## Archive (retired rule bundles)

These bundles were migrated into the native layer and moved to `archive/`; the
coverage ledger is `archive/MIGRATION-LEDGER.md`:

- `.ai-planning-rules` — superseded by plan-mode discipline and the pack factory
- `.ai-diagram-rules` — now the `mermaid-diagrams` skill
- `.ai-stealer-rules` — now the `inspiration-pass` skill
- `.ai-stack-rules`, `.ai-nest-rules`, `.ai-fastify-rules` — merged into the reusable TypeScript pack and the nested `AGENTS.md` files
- `.ai-schema-factory` — superseded by the pack factory

Archived material never loads automatically. Archived bundles are immutable;
the coverage ledger (`archive/MIGRATION-LEDGER.md`) receives controlled
amendments outside Cursor sessions. To consult the archive, ask explicitly,
for example: "read archive/.ai-nest-rules/03-queues-workers-lifecycle.md".
New lessons go into the native layer, never into the archive.

## Frozen References

- `.ai-rules/` is a frozen reference copy of the retired TypeScript rule bundle; the native layer (root and nested `AGENTS.md`, `.agents/skills/`, `.cursor/`) plus the reusable packs are canonical for TypeScript work.
- Generic TypeScript rule authoring is owned upstream by the pack master `C:\claude\claude-workflows\typescript`; update the pack first, then sync the host layers. The historical authority at `C:\Scheme\pragmatic_typescript_v3_ai_rules_bundle_complete\` is retired.
- `.ai-stealer-catalog/` is the stable seed catalog for repo-catalog research.
- `.ai-stealer-findings/` is the editable place for new discovered sources and extracted patterns.
- `.ai-stack-findings/` is the editable place for stack-doc findings before they become pack rules.
- `.ai-project-references/` contains local frontend inspiration and field-evidence artifacts.
- Do not edit frozen/reference seed folders during normal project work.
- Put project-specific behavior in `.ai-project-rules/` or the native layer, never in frozen bundles.

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

- Do not add SEO/product/planning rules to `.ai-rules/`.
- Do not duplicate TypeScript audit modes as Codex subagents unless the user explicitly asks for parallel subagent work.
- Do not copy external code verbatim from GitHub or the web without checking license and recording attribution.
- Do not bypass preview, approval, release preflight, or post-deploy verification in product plans.
- For TypeScript/backend implementation, the nested `AGENTS.md` files and `.agents/skills/` are the pre-edit layer; `.ai-rules/` is frozen reference, not a checklist.
- Do not re-decide accepted architecture decisions silently; update or supersede the relevant ADR when the direction changes.
- Do not use ADRs as a running changelog; use `docs/progress/` for chronological progress notes.
