# AGENTS.md

This project uses a portable hidden-folder rules system. Codex should treat this file as a thin adapter, not as the source of the rules.

## Routing

- For TypeScript coding, refactoring, audits, Zod, async, errors, HTTP, data access, adapters, or module boundaries, load `.ai-rules/00-system-index.md`.
- For Local SEO product planning, controlled automation, stack decisions, deployment-agent flow, tracking privacy, or product docs, load `.ai-project-rules/00-system-index.md`.
- For hidden-folder design, planner mode, schema-factory usage, context sharding, or new Markdown rule files, load `.ai-planning-rules/00-system-index.md`.
- For repo-catalog research, GitHub/web architecture mining, or "a good artist steals" workflows, load `.ai-stealer-rules/00-system-index.md`.
- For Mermaid diagrams, architecture visualization, sequence/state/ER/class diagrams, or diagram cleanup, load `.ai-diagram-rules/00-system-index.md`.
- For React, TanStack, NestJS/Fastify, OAuth, URL safety, API semantics, or stack-doc refresh reviews, load `.ai-stack-rules/00-system-index.md`.
- For NestJS/Fastify provider wiring, controllers, validation, queues, workers, guards, lifecycle shutdown, readiness, exceptions, or backend tests, load `.ai-nest-rules/00-system-index.md`.
- For Fastify adapter behavior, Fastify plugins/ecosystem, hooks, validation/serialization, errors/logging, or production recommendations, load `.ai-fastify-rules/00-system-index.md`.

## Frozen References

- `.ai-rules/` is the canonical TypeScript schema for this project.
- `.ai-schema-factory/` is frozen reference material for schema generation.
- `.ai-stealer-catalog/` is the stable seed catalog for repo-catalog research.
- `.ai-stealer-findings/` is the editable place for new discovered sources and extracted patterns.
- `.ai-stack-rules/` is the editable stack implementation guardrail bundle.
- `.ai-stack-findings/` is the editable place for stack-doc refresh findings before they become rules.
- `.ai-nest-rules/` is the editable NestJS/Fastify backend guardrail bundle.
- `.ai-fastify-rules/` is the editable Fastify adapter/runtime/plugin guardrail bundle.
- `.ai-project-references/` contains local frontend inspiration and field-evidence artifacts.
- Do not edit frozen/reference seed folders during normal project work.
- Put project-specific behavior in the editable `.ai-*-rules/` shards.

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
