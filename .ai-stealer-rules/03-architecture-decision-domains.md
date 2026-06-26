---
description: "Architecture decision domains and cross-cutting concern scan for unknown-unknowns"
globs: "**/*.{md,json,mmd,ts,tsx}"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - ".ai-stealer-rules/01-repo-catalog-workflow.md"
  - ".ai-stealer-rules/02-stealer-checkpoints.md"
  - ".ai-project-rules/14-architecture-direction.md"
priority_schema: "critical > strong > guideline"
---

# Architecture Decision Domains

<meta-instruction>
Use this scan when a task involves an ADR, product architecture, a new vertical slice, a new integration, a production boundary, or a design choice where the user may not know all relevant software categories by name.
</meta-instruction>

## 1. Terminology

<context>
The useful umbrella terms are:

```text
Architecture decision domains:
  named areas where a system design choice may be required.

Cross-cutting concerns:
  capabilities that affect many modules, such as logging, caching, auth, observability, validation, and error handling.

Quality attributes / non-functional requirements:
  security, reliability, performance, maintainability, operability, privacy, scalability, and cost.

Project alias:
  a "Tarantino-style inspiration pass/search/run" means the same thing as a Good Artist Inspiration pass: learn from proven references, cite sources, adapt the pattern locally, and do not copy code.
```

</context>

## 2. Required Domain Scan

<positive-directives>
- Before a new architecture-significant slice, scan these domains and decide which ones matter now, which are deferred, and which need a Good Artist Inspiration pass.
- Prefer a focused inspiration pass for domains that touch security, tenant data, production mutation, public ingestion, queues, customer-facing output, or provider tokens.
- Record recurring domain decisions in an ADR, `.ai-stealer-findings/`, progress docs, or a routed rule shard.
</positive-directives>

## 3. Domain Map

<context>
Scan these domains before major decisions:

```text
Product control:
  preview, approval, deterministic worker handoff, rollback, customer-visible truth.

Identity and access:
  authentication, sessions, OAuth/OIDC, CSRF, authorization, RBAC/ABAC, tenant isolation, object-level authorization.

API and contracts:
  request validation, response schemas, errors, pagination, versioning, idempotency keys, safe redirects, URL handling.

Data and persistence:
  ownership model, migrations, indexes, transactions, concurrency, constraints, retention, backups, soft delete, schema drift.

Async and workflows:
  queues, retries, dead letters, scheduling, state machines, actor context, replay safety, idempotent workers.

External integrations:
  purpose-named ports, provider adapters, rate limits, provider error normalization, token storage, webhook/callback validation.

Security and privacy:
  secrets, encryption, redaction, least privilege, public/private keys, abuse paths, data minimization, PII boundaries.

Observability and audit:
  structured logs, correlation ids, audit trails, metrics, traces, alerting, tenant-safe diagnostics, incident review.

Runtime and infrastructure:
  Fastify plugins, body limits, rate limits, trust proxy, CORS, health checks, graceful shutdown, config validation.

Performance and caching:
  cache keys, invalidation, stale data, CDN behavior, query plans, batching, N+1 avoidance, rate/cost control.

Frontend and UX state:
  routing, loaders vs queries, optimistic updates, error states, permission-aware UI, accessibility, mobile constraints.

Testing and verification:
  unit tests, integration tests, contract tests, property tests, smoke tests, CI gates, migration checks, replay tests.

AI and agent systems:
  tool permissions, memory/state, evaluator tests, schema validation, human approval, deterministic worker boundaries.

Reporting and data egress:
  customer-safe DTOs, proof tiers, internal-only metrics, artifact generation, export privacy, claim language.

Deployment and operations:
  build artifacts, environment promotion, feature flags, rollback plans, data migrations, release checks, runbooks.
```

</context>

## 4. Reminder Behavior

<conditional-logic>
IF the user asks for an architecture decision, ADR, new slice, or production-facing feature:
THEN scan the domain map and briefly name the domains that are relevant.

IF a relevant domain is unfamiliar, risky, or likely to have proven patterns in mature systems:
THEN ask whether to run a focused Good Artist Inspiration pass, unless the user already asked to proceed with research.

IF the user asks for a quick fix and the domain map reveals only low-risk concerns:
THEN proceed without broad research and note any deferred domain.
</conditional-logic>

## 5. Decision Output Format

<pre-flight-checklist>
1. [ ] Which architecture decision domains are touched?
2. [ ] Which domains are blocking now, important before MVP, or deferred?
3. [ ] Which domains need inspiration research before implementation?
4. [ ] Which decision becomes code, a test, an ADR, a rule, or a progress note?
</pre-flight-checklist>
