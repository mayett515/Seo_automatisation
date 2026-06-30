---
description: "Complete manifest of the flat Pragmatic TypeScript v3 bundle"
globs: ".ai-rules/**/*.md"
alwaysApply: false
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Manifest

<meta-instruction>
Use this file as the inventory for all flat sibling rule files. This is not the primary router; `00-system-index.md` is.
</meta-instruction>

## Bundle files

- `README.md` — operational guide for LLMs.
- `MANIFEST.md` — inventory of flat sibling rule files.
- `00-system-index.md` — master router.

## Core architecture

- `01-core.md` — mental model and core formula.
- `01A-decision-algorithm.md` — how to apply the schema.
- `01B-ceremony-review-ratings.md` — meaning vs ceremony and ratings.
- `01C-readable-code-for-humans-and-ai.md` — optional readability rules for human and AI maintainability.
- `01D-pre-edit-implementation-checklist.md` — boundary, idempotency, storage, migration, and documentation checklist before implementation edits.

## Type strategy

- `02-type-strategy.md` — domain types, decisions, errors.
- `02A-validation-libraries-modern-ts.md` — Zod, Effect, type libraries, modern TS.
- `02B-generated-types-codegen.md` — Prisma, Lexicon, OpenAPI, GraphQL, generated clients.
- `02C-type-source-of-truth-checker.md` — soft source-of-truth and TypeScript API hygiene checker.
- `02D-zod-validation-boundaries.md` — optional Zod guidance for untrusted runtime boundaries.
- `02E-functional-library-selection.md` — optional selection rules for functional helper libraries.
- `02F-zod-advanced-schema-design.md` — optional advanced Zod schema design rules.
- `02G-error-modeling-failure-taxonomy.md` — optional error modeling and failure taxonomy guidance.

## Functional core and shell

- `03-functional-core.md` — pure decisions, validation, transformations.
- `03A-parsing-lifecycle-policies.md` — parsers, lifecycle, constraints, sets.
- `03B-transformations-solid.md` — pipelines, collection logic, functional SOLID.
- `03C-control-flow-decision-modeling.md` — optional modeling guidance for branching, ADTs, and result pipelines.
- `03D-javascript-runtime-semantics.md` — optional JavaScript runtime semantics guidance.
- `03E-javascript-functional-patterns.md` — optional JavaScript functional pattern guidance.
- `04-procedural-shell.md` — orchestration and effects.
- `04A-workers-concurrency.md` — workers, queues, retries, cancellation.
- `04B-async-workflows-and-concurrency.md` — optional async workflow and Promise concurrency guidance.
- `04C-async-failure-cancellation-resilience.md` — optional async failure, cancellation, retry, and cleanup guidance.
- `04D-async-streams-generators-backpressure.md` — optional async streams, generators, and backpressure guidance.
- `04E-async-runtime-boundaries-performance.md` — optional async runtime boundary and performance guidance.
- `04F-error-normalization-observability.md` — optional error normalization, cause, logging, and observability guidance.

## Boundaries and OOP

- `05-boundary-ladder.md` — smallest honest boundary.
- `05A-oop-classes-gof-solid.md` — classes, GoF, SOLID at boundaries.
- `05B-framework-adapters-generated-clients.md` — framework handlers, adapters, generated clients.
- `05C-data-access-drizzle-first.md` — optional Drizzle-first, Prisma-compatible data-access guidance.
- `05D-javascript-design-patterns-boundaries.md` — optional JavaScript design-pattern boundary guidance.
- `05E-http-transport-error-boundaries.md` — optional HTTP and transport error boundary guidance.

## Modularity and comments

- `06-modular-architecture.md` — file splitting, folders, schema-native comparison.
- `06A-comment-architecture.md` — file headers, function comments, anti-comments.

## Extension lenses

- `07-extension-lenses.md` — extension overview.
- `07A-extension-workflow-concurrency-variants.md` — Lua, Factor/Forth, Elm, Elixir/Occam, Julia, APL.
- `07B-extension-constraints-sets-parsing-codegen.md` — miniKanren, Starset, Simula, SNOBOL, Idris, m4.

## Review and regression

- `08-repo-review-framework.md` — real repo review protocol.
- `08A-casebook-strong-fits.md` — strong fit repo findings.
- `08B-casebook-parsers-ui-tooling.md` — parser/UI/tooling findings.
- `08C-casebook-restraint-weak-fits.md` — weak fit and restraint findings.
- `08F-source-of-truth-audit-workflow.md` — post-change audit workflow for type/source drift.
- `09-anti-regression.md` — global bans and historical drift prevention.

## Specs and templates

- `90-schema-generation-spec.md`
- `90A-file-hierarchy-spec.md`
- `91-template-domain.md`
- `91A-template-anti-regression.md`
- `91B-template-repo-review.md`
- `91C-template-policy-extraction.md`
- `91D-template-error-handling-snippets.md`
