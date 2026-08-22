# AGENTS.md

This project uses a native agent layer shared by Cursor and Codex: this root file, the nearest nested `AGENTS.md`, shared skills, and host-native rules and hooks. The remaining detailed rule bundles (`.ai-project-rules/`, frozen `.ai-rules/`) are routed below; retired bundles live in `archive/`.

## Shared native layer

- Root and nested `AGENTS.md` files are shared by Cursor and Codex.
- Repeatable workflows live in `.agents/skills/`, which both hosts discover. Cursor invokes them with `/skill-name`; Codex can invoke them with `$skill-name`.
- Cursor-only rules, subagents, and hooks live in `.cursor/`. Codex-only counterparts live in `.codex/` when installed.
- Before editing below `apps/` or `packages/`, follow the nearest nested `AGENTS.md` in addition to this file.
- Skills available: anti-regression, repo-review, smoke-verify, source-of-truth-audit, type-interview, oauth-security-review, deployment-preflight, local-page-quality, mermaid-diagrams, inspiration-pass.

## Routing

- For Local SEO product planning, controlled automation, stack decisions, deployment-agent flow, tracking privacy, or product docs, load `.ai-project-rules/00-system-index.md`.
- For architecture decisions, production hardening decisions, repeated review findings, or regression guards, read the relevant ADR in `docs/architecture/decisions/`.
- For chronological project progress, review responses, completed slices, or remaining next steps, update `docs/progress/`.

## Archive (retired rule bundles)

These bundles were migrated into the native layer and moved to `archive/`; the
coverage ledger is `archive/MIGRATION-LEDGER.md`:

- `.ai-planning-rules` — superseded by plan-mode discipline and the pack factory
- `.ai-diagram-rules` — now the `mermaid-diagrams` skill
- `.ai-stealer-rules` — now the `inspiration-pass` skill
- `.ai-stack-rules`, `.ai-nest-rules`, `.ai-fastify-rules` — merged into the reusable TypeScript pack and the nested `AGENTS.md` files
- `.ai-schema-factory` — superseded by the pack factory

Archived material never loads automatically and is never edited. To consult
it, ask explicitly, for example: "read archive/.ai-nest-rules/03-queues-workers-lifecycle.md".
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
