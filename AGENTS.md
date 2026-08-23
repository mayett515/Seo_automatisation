# AGENTS.md

This project uses a native agent layer shared by Cursor, Codex, and Claude Code: this root file, the nearest nested `AGENTS.md`, shared skills, and host-native rules and hooks. The remaining detailed rule bundles (`.ai-project-rules/`, frozen `.ai-rules/`) are routed below; retired bundles live in `archive/`.

## Shared native layer

- Root and nested `AGENTS.md` files are shared by Cursor and Codex; Claude Code additionally loads the root `CLAUDE.md`.
- Repeatable workflows live in `.agents/skills/`, which both hosts discover. Cursor invokes them with `/skill-name`; Codex can invoke them with `$skill-name`.
- Cursor-only rules, subagents, and hooks live in `.cursor/`. Codex-only counterparts live in `.codex/` when installed. The Claude-native layer lives in `CLAUDE.md` plus `.claude/` (17 path-scoped rules, 5 pack skills, 3 hooks wired in `.claude/settings.json`, the diff-reviewer subagent), copied verbatim from the pack master.
- `.agents/rules/` carries the same 17 path-scoped rules as a verbatim mirror of `.claude/rules/` for hosts that read that location (Antigravity/agy; Codex ignores it - it only reads `.agents/skills/`). Sync it from `.claude/rules/` when the pack updates, never by ad-hoc edits.
- Qwen does not read `.agents/skills/` on its own. It sees the shared skills only when the user-level `~/.qwen/settings.json` sets `skills.directories` to this repository's `.agents/skills` path (verified against qwen 0.22.0; the value is ignored in bare and safe mode). That is per-machine configuration: a fresh clone does not carry it and no repository check can verify it, so wire it once per machine.
- Skill ownership: `.agents/skills/` is canonical for the ten project skills listed below. Names that arrive from the vendored pack below are owned by that pack in both trees. `.claude/skills/` mirrors the pack master's five generic skills for Claude-native discovery; where a name exists in both trees, the pack lineage owns `.claude/` and the shared lineage owns `.agents/` — sync deliberately through pack updates, never by ad-hoc edits.
- Before editing below `apps/` or `packages/`, follow the nearest nested `AGENTS.md` in addition to this file.
- Precedence when layers overlap: the more specific layer wins — nested `AGENTS.md` and `.ai-project-rules/` over this root file, and this root file over the generic pack rules (`.claude/rules/`, `.agents/rules/`). The layers restate one doctrine at different zoom levels; on genuine conflict, the most specific statement is authoritative.
- Project skills available: anti-regression, repo-review, smoke-verify, source-of-truth-audit, type-interview, oauth-security-review, deployment-preflight, local-page-quality, mermaid-diagrams, inspiration-pass.
- Vendored pack skills, user-invoked (only when you type them): ask-matt, grill-me, grill-with-docs, triage, wayfinder, to-spec, to-tickets, implement, improve-codebase-architecture, handoff, teach, to-questionnaire, wait-what, setup-matt-pocock-skills.
- Vendored pack skills, model-invoked (an agent may also reach for them): tdd, codebase-design, diagnosing-bugs, domain-modeling, grilling, resolving-merge-conflicts.
- Vendored pack skills restricted to explicit invocation by a local override: code-review, research, prototype. They carry a hand-added `disable-model-invocation: true` so no agent reaches for them unasked. `npx skills update` reverts that line; re-apply it and check ADR 0024 before trusting a fresh install.
- Removed from the vendored set on purpose: wizard and writing-for-agents. Do not reinstall them. `ask-matt` and `wayfinder` still mention wizard in prose; that pointer is dead.
- Decision records live only in `docs/architecture/decisions/`. Vendored pack skills default to `docs/adr/`; that directory must not be created. When a pack skill offers an ADR, write it into the existing log with the existing `TEMPLATE.md`.
- `docs/agents/domain.md` is the per-repo configuration the vendored pack reads for glossary and decision-log locations. It overrides the pack's own defaults; change it there, not in a vendored skill.
- Research notes an agent produces go where this repo already keeps them: `.ai-stack-findings/` for official-doc and API facts, `.ai-stealer-findings/` for patterns mined from other repositories, both named `YYYY-MM-DD-slug.md`. The pack's `research` skill only says "where the repo already keeps such notes", so name the folder when you ask for it.
- Vocabulary precedence over the vendored pack: `codebase-design` advises against the word "boundary", but this project is built on it. The project term wins; the deep-module terms (depth, seam, leverage, locality) are additive.
- Run `/setup-matt-pocock-skills` once per clone before using the vendored engineering flow. It records the issue tracker, the triage labels, and the docs location that the other pack skills read.
- Vendored third-party pack: the `mattpocock/skills` set (23 of 25 skills, see ADR 0024) is installed with `npx skills add mattpocock/skills` as ordinary copies in both `.claude/skills/` (Claude Code) and `.agents/skills/` (Codex, Cursor), with `skills-lock.json` at the repo root recording the source hashes. Refresh it with `npx skills update`, not by hand-editing the copies: a hand edit forks the pack and the next update overwrites it. The only sanctioned exception is the `disable-model-invocation` override on the three skills listed above, recorded in ADR 0024. The pack ships a `code-review` skill whose name also exists as a Claude Code built-in, so say which one you mean when it matters.

## Agent skills

### Issue tracker

GitHub Issues via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical role names (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context. Glossary at `CONTEXT.md` when it exists; decision log at `docs/architecture/decisions/`. See `docs/agents/domain.md`.

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
