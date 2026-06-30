---
description: "Master router for the flat Pragmatic TypeScript v3 rules ecosystem"
globs: "**/*"
alwaysApply: true
version: "3.5.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: ["mcp-filesystem"]
priority_schema: "critical > strong > guideline"
---

# Master System Architecture & Execution Contract

<meta-instruction>
You are operating under the Pragmatic TypeScript v3 schema. Before writing or refactoring code, classify the task and load only the directly referenced flat sibling files that match the task. This file is the root router.
</meta-instruction>

<routing-logic>
IF the task asks for TypeScript architecture, refactoring, code review, or implementation:
THEN you MUST load `.ai-rules/01-core.md`, `.ai-rules/01A-decision-algorithm.md`, `.ai-rules/01B-ceremony-review-ratings.md`, and `.ai-rules/01D-pre-edit-implementation-checklist.md`.

IF the task touches readability, AI-generated TypeScript cleanup, nested functions, handler placement, unclear positional arguments, boolean/operator clarity, or discriminated-union readability:
THEN you SHOULD load and lightly apply: `.ai-rules/01C-readable-code-for-humans-and-ai.md`.

IF the task touches domain modeling, errors, validation, schemas, branded values, generated types, Zod, Effect, fp-ts, ts-fp, or modern TypeScript features:
THEN you MUST load `.ai-rules/02-type-strategy.md`, `.ai-rules/02A-validation-libraries-modern-ts.md`, and `.ai-rules/02B-generated-types-codegen.md`.

IF the task creates, duplicates, derives, exports, validates, or refactors non-trivial TypeScript types:
THEN you SHOULD load and lightly apply: `.ai-rules/02C-type-source-of-truth-checker.md`.

IF the task creates, refactors, reviews, or chooses error modeling patterns such as custom errors, `Result<T, E>`, typed error unions, stable error codes, validation failures, business failures, or error catalogs:
THEN you MUST load and apply: `.ai-rules/02G-error-modeling-failure-taxonomy.md`.

IF the task uses Zod validation for request bodies, forms, webhooks, environment variables, config files, external JSON, external API responses, or other untrusted runtime data:
THEN you MUST load and lightly apply: `.ai-rules/02D-zod-validation-boundaries.md`.

IF the task uses advanced Zod patterns such as recursive schemas, schema composition, preprocessing, brands/newtypes, discriminated unions, transforms, codecs, async validation, `superRefine`, schema input/output divergence, or Zod internals:
THEN you MUST load and lightly apply: `.ai-rules/02F-zod-advanced-schema-design.md`.

IF the task proposes or evaluates ts-pattern, neverthrow, Effect, fp-ts-style helpers, Remeda, lodash/fp, custom combinators, or functional helper libraries:
THEN you SHOULD load and lightly apply: `.ai-rules/02E-functional-library-selection.md`.

IF the task touches business rules, pure decisions, transformations, parsing, lifecycle state, policies, permissions, constraints, sets, or functional SOLID:
THEN you MUST load `.ai-rules/03-functional-core.md`, `.ai-rules/03A-parsing-lifecycle-policies.md`, and `.ai-rules/03B-transformations-solid.md`.

IF the task changes complex branching, ADTs, decision unions, reducers, state/event logic, strategy tables, rule arrays, type guards, narrowing, pattern matching, or result pipelines:
THEN you MUST load and lightly apply: `.ai-rules/03C-control-flow-decision-modeling.md`.

IF the task touches JavaScript runtime semantics such as closures, functions, modules, iteration, async loops, promises, `this`, mutation, objects, arrays, Maps/Sets, coercion, equality, parsing, runtime JSON, or shallow copy behavior:
THEN you SHOULD load and lightly apply: `.ai-rules/03D-javascript-runtime-semantics.md`.

IF the task uses JavaScript functional patterns such as composition, currying, partial application, higher-order wrappers, memoization, WeakMap caches, chaining, or immutable transformations:
THEN you SHOULD load and lightly apply: `.ai-rules/03E-javascript-functional-patterns.md`.

IF the task touches IO, database calls, HTTP calls, filesystem work, email/payment/API clients, logging, framework handlers, or use-case orchestration:
THEN you MUST load `.ai-rules/04-procedural-shell.md`.

IF the task touches queues, workers, background jobs, owned concurrent state, retries, cancellation, worker protocols, or async resource ownership:
THEN you MUST load and lightly apply: `.ai-rules/04A-workers-concurrency.md`.

IF the task touches async workflows, promises, `async` / `await`, sequential vs concurrent execution, `Promise.all`, `Promise.allSettled`, `Promise.any`, `Promise.race`, ordered async loops, async array helpers, bounded concurrency pools, legacy callbacks, promisify wrappers, async recursion, or async class initialization:
THEN you MUST load and lightly apply: `.ai-rules/04B-async-workflows-and-concurrency.md`.

IF the task touches async errors, retries, backoff, timeouts, cancellation, `AbortController`, `AbortSignal`, partial failure, cleanup, idempotency, fire-and-forget work, detached tasks, or unknown caught errors:
THEN you MUST load and lightly apply: `.ai-rules/04C-async-failure-cancellation-resilience.md`.

IF the task touches async iterables, `for await...of`, streams, async generators, pagination, chunked processing, backpressure, stream cleanup, Observables, or large async sequences:
THEN you MUST load and lightly apply: `.ai-rules/04D-async-streams-generators-backpressure.md`.

IF the task touches dynamic imports, top-level await, conditional async dependencies, lazy loading, Web Workers, Service Workers, WebSockets, Observables as runtime boundaries, Custom Events, Intersection Observer, caching, progressive loading, loading states, or async performance boundaries:
THEN you MUST load and lightly apply: `.ai-rules/04E-async-runtime-boundaries-performance.md`.

IF the task touches `try`/`catch`, caught `unknown` values, non-Error throws, error wrapping, `Error.cause`, structured error context, logging, observability, `toResult`, `noThrow`, cleanup, or centralized error normalization:
THEN you MUST load and lightly apply: `.ai-rules/04F-error-normalization-observability.md`.

IF the task touches services, adapters, repositories, framework handlers, OOP, GoF patterns, generated clients, or dependency ownership:
THEN you MUST load `.ai-rules/05-boundary-ladder.md`, `.ai-rules/05A-oop-classes-gof-solid.md`, and `.ai-rules/05B-framework-adapters-generated-clients.md`.

IF the task touches ORM choice, Drizzle, Prisma, schema source of truth, migrations, SQL queries, transactions, database model types, or repository/data-access boundaries:
THEN you MUST load and lightly apply: `.ai-rules/05C-data-access-drizzle-first.md`.

IF the task proposes or changes JavaScript design patterns such as Module, Singleton, Factory, Observer, Strategy, Proxy, Decorator, event emitters, plugin registries, or object creation boundaries:
THEN you SHOULD load and lightly apply: `.ai-rules/05D-javascript-design-patterns-boundaries.md`.

IF the task touches HTTP/API/RPC/Express/Nest/Fastify routes, controllers, middleware, status codes, public error response bodies, 4xx/5xx behavior, async route wrappers, or transport error mapping:
THEN you MUST load and lightly apply: `.ai-rules/05E-http-transport-error-boundaries.md`.

IF the task touches file structure, module boundaries, folder design, comments, documentation comments, or schema-native versus direct refactor comparisons:
THEN you MUST load `.ai-rules/06-modular-architecture.md` and `.ai-rules/06A-comment-architecture.md`.

IF the task asks about extension lenses, language inspiration, plugin systems, pipelines, UI workflows, actors, variants, collections, constraints, sets, parsers, guarantees, or codegen:
THEN you MUST load `.ai-rules/07-extension-lenses.md`, `.ai-rules/07A-extension-workflow-concurrency-variants.md`, and `.ai-rules/07B-extension-constraints-sets-parsing-codegen.md`.

IF the task asks to evaluate open-source repos or rate schema strength:
THEN you MUST load `.ai-rules/08-repo-review-framework.md`, `.ai-rules/08A-casebook-strong-fits.md`, `.ai-rules/08B-casebook-parsers-ui-tooling.md`, and `.ai-rules/08C-casebook-restraint-weak-fits.md`.

IF the task asks for a post-change audit, code review, drift check, generated-type review, schema/type consistency check, or source-of-truth check after implementation changed:
THEN you MUST load and comply with: `.ai-rules/08F-source-of-truth-audit-workflow.md`; IF the diff includes Zod schemas, you SHOULD cross-check `.ai-rules/02D-zod-validation-boundaries.md` and `.ai-rules/02F-zod-advanced-schema-design.md`.

IF the task modifies stable core logic, fixes a bug, or risks recreating past architecture drift:
THEN you MUST load `.ai-rules/09-anti-regression.md`.

IF the task asks to generate or edit AI rule files:
THEN you MUST load `.ai-rules/90-schema-generation-spec.md`, `.ai-rules/90A-file-hierarchy-spec.md`, and the matching flat template file: `.ai-rules/91-template-domain.md`, `.ai-rules/91A-template-anti-regression.md`, `.ai-rules/91B-template-repo-review.md`, `.ai-rules/91C-template-policy-extraction.md`, or `.ai-rules/91D-template-error-handling-snippets.md`.

IF the user asks for copy-ready TypeScript error-handling snippets or a starting template for an error system:
THEN you MAY load: `.ai-rules/91D-template-error-handling-snippets.md`.
</routing-logic>

<positive-directives>
- You MUST apply the schema as: Type Strategy → Functional Core → Procedural Shell → Smallest Honest Boundary.
- You MUST treat extension lenses as part of the schema, not as a separate architecture.
- You MUST rate schema strength against a target responsibility, not automatically against an entire file.
- You MUST preserve existing repo conventions unless doing an explicit schema-native redesign.
- You MUST prefer meaning over ceremony.
</positive-directives>

<absolute-constraints>
- DO NOT create nested `.ai-rules` folders.
- DO NOT apply all sibling files when only one domain is relevant.
- DO NOT use classes merely because dependencies exist.
- DO NOT introduce Result types, state machines, handlers, or folders when they add ceremony without meaning.
- DO NOT rewrite whole files when only a policy seam is the target.
</absolute-constraints>

<pre-flight-checklist>
1. [ ] Did I route to the correct flat sibling files?
2. [ ] Did I identify the target responsibility before applying the schema?
3. [ ] Did I preserve existing repo architecture unless asked for schema-native design?
4. [ ] Did I avoid ceremony that does not reveal meaning?
5. [ ] For implementation, did I run the pre-edit boundary/idempotency/storage/migration checklist before editing?
</pre-flight-checklist>
