---
name: inspiration-pass
description: Good Artist Inspiration — defensive reference-mining of proven architecture and implementation patterns from the local repo catalog, GitHub, or the web, adapted into this stack without copying code. Use before architecture-significant slices, new provider adapters, new workflow/queue/state-machine designs, component systems, or CI/testing conventions — "inspiration pass", "reference mining", "pattern mining", "Tarantino-style". NOT for tiny fixes, obvious errors, or copy edits, and never to reopen locked product decisions.
---

# Good Artist Inspiration Pass

Extract the solution shape from mature references, record the source, and implement the local version inside our own architecture. Learn the idea; never paste the code.

## When this fires (checkpoints)

Run a pass before: a new architecture-significant vertical slice; a new external-provider adapter (Netlify, GSC, crawler/browser, analytics, storage, auth, billing, email, AI tools); a new long-running workflow, queue topology, retry model, or state machine; a reusable component system or TanStack-heavy pattern; data-model changes for release verification, rollback, GSC sync, reporting, opportunities, or tenancy; CI/CD, testing, observability, or failure-recovery conventions. If a task hits a checkpoint and the user did not ask for research, briefly offer the pass instead of silently running or skipping it. Security-, customer-data-, or production-mutation-sensitive designs get at least a focused local-catalog pass unless the user explicitly skips.

## Procedure

1. Define the target capability in one sentence.
2. Architecture-decision domain scan: for architecture-significant or production-sensitive work, walk the domain map in `archive/.ai-stealer-rules/03-architecture-decision-domains.md` (read on demand) to surface cross-cutting concerns and unknown-unknowns before the search narrows.
3. Search the local catalog first: `.ai-stealer-catalog/repo-catalog/index/module-intent-index.md`, `repo-index.md`, `search-terms.md`. High-value aisles: backend frameworks (13), web extraction (14), UI templates (15), TanStack (16), agentic workflows (17), database/ORM (23), testing (24), CI/CD (25).
4. Then GitHub/web where useful. Compare at least two references when the decision is architecture-significant; with limited time, local catalog plus one high-confidence external reference.
5. Extract the solution shape (idea, API shape, data model) — separately from code.
6. Map the chosen pattern into our stack (NestJS/Fastify, BullMQ, Mastra, React/TanStack, Drizzle/Postgres) and our constraints: nothing that violates preview, approval, deterministic-worker execution, or post-deploy verification.
7. Record source and adapted decision in `.ai-stealer-findings/`, a planning doc, an ADR, or the owning rule file.

## Hard limits

- No verbatim external code without license review and attribution.
- No competitor content as copy source for customer SEO pages.
- No vendor DTOs leaking into the domain model.
- Adopt one module pattern, never a whole repo; skip the pattern entirely if a smaller local solution is clearer.
