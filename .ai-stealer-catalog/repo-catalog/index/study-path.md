# Where To Raid

This is a map of where the good loot lives, grouped by theme. It is **not** a curriculum and there is no order to follow — you don't work through it front to back. Walk to the zone that holds the part you need, grab it, leave. If you're just browsing for ideas, the zones below are a decent tour of the floor.

When you already know the exact thing you want, skip this and go straight to the [loot table](./module-intent-index.md).

## Vocabulary & First Looks

If a domain is unfamiliar, these two give you the words before you go raiding:

- [01-catalogues-and-maps](../01-catalogues-and-maps/README.md) — collections of collections; good for finding the next place to look.
- [00-general-algorithms](../00-general-algorithms/README.md) — the basic shape of a structure or algorithm before you reach for a production version.

## Feed & Discovery Surfaces

Everything behind a "For You", a search box, or a recommendations rail:

- [02-social-and-community-systems](../02-social-and-community-systems/README.md) — feed fan-out, federation, trust-level gating.
- [03-recommendation-and-personalization](../03-recommendation-and-personalization/README.md) — candidate generation, collaborative filtering, rerankers.
- [04-search-retrieval-and-ranking](../04-search-retrieval-and-ranking/README.md) — inverted indexes, BM25, vector recall, hybrid retrieval.

## Data Structures That Make It Fast

The relationship-modeling and approximate-counting tricks behind trending, dedupe, and top-k:

- [05-graphs-and-networks](../05-graphs-and-networks/README.md) — traversal, centrality, community detection.
- [06-streaming-and-approximation](../06-streaming-and-approximation/README.md) — HyperLogLog, Count-Min, t-digest, reservoir sampling.

## Constraints, Scale & Reliability

When the problem is "hard constraints" or "must not lose data":

- [07-optimization-scheduling-matching](../07-optimization-scheduling-matching/README.md) — CP-SAT, routing, assignment, stable matching (OR-Tools, Timefold, HiGHS).
- [08-distributed-systems-and-sync](../08-distributed-systems-and-sync/README.md) — Raft consensus, CRDTs, local-first sync, fault injection (Jepsen, Loro, ElectricSQL).

## Analytics & ML Depth

Query planning, training loops, and detection:

- [09-query-engines-and-data-processing](../09-query-engines-and-data-processing/README.md) — columnar/vectorized execution, optimizers, lakehouse formats (DuckDB, DataFusion, SQLite VDBE, Iceberg).
- [10-ml-internals-and-classic-ml](../10-ml-internals-and-classic-ml/README.md) — autograd, estimator contracts, transformer training, LLM inference internals (micrograd, tinygrad, nanoGPT, the Mistral/vLLM stack).
- [11-anomaly-detection-and-time-series](../11-anomaly-detection-and-time-series/README.md) — forecasting, decomposition, online drift/outlier detection (Prophet, statsmodels, river, PyOD).

## Whole-Feature Patterns

How a real feature is wired through frontend, API, storage, and tests — feature flags, experiments, notification infra, analytics data models:

- [12-fullstack-feature-patterns](../12-fullstack-feature-patterns/README.md) — Cal.com availability, Dub analytics, PostHog ingestion, GrowthBook flags.

## Backend & Framework Internals

Routing, validation, serialization, plugins, DI, request/response lifecycle:

- [13-backend-frameworks-and-patterns](../13-backend-frameworks-and-patterns/README.md) — Fastify for speed and schema-driven design, NestJS for DI and architecture, plus Express/FastAPI/Django.

## Frontend Architecture & UI

State, routing, components, and design worth copying outright:

- [16-tanstack-and-frontend-architecture](../16-tanstack-and-frontend-architecture/README.md) — server/client state sync, reactive client data graphs, type-safe routing, headless tables, form state, and decomposing big codebases into liftable modules.
- [15-website-templates-and-ui-components](../15-website-templates-and-ui-components/README.md) — landing pages, navbars, hero sections, carousels, and component libraries (shadcn/ui, daisyUI, Flowbite).
- [18-modular-typescript-utilities-and-state](../18-modular-typescript-utilities-and-state/README.md) — pub-sub stores, runtime-agnostic UnJS utilities, proxy clients, compile-time schema inference.

## AI, Agents & RAG

Agent loops, tool calling, and retrieval pipelines:

- [17-agentic-workflows-and-mcp-servers](../17-agentic-workflows-and-mcp-servers/README.md) — state graphs, checkpoint loops, MCP tool serialization, accessibility-tree web automation.
- [20-advanced-rag-and-document-parsing](../20-advanced-rag-and-document-parsing/README.md) — layout-aware PDF parsing, parent-child chunking, fusion query expansion, Self-RAG reflection loops.
- [14-web-extraction-and-browser-agents](../14-web-extraction-and-browser-agents/README.md) — crawl → LLM-ready data (Firecrawl, Crawl4AI, Jina Reader) and visual page analysis (OmniParser, Layout-Parser, Browser-Use).

## Low-Level & Toolchains

Memory boundaries, sandboxed VMs, compilers, build caches:

- [19-webassembly-and-low-level-runtimes](../19-webassembly-and-low-level-runtimes/README.md) — host-guest memory, embedded interpreters (CPython, SQLite, QuickJS), canvas layout precomputation.
- [21-git-internals-and-compilation-toolchains](../21-git-internals-and-compilation-toolchains/README.md) — packfile delta resolution (gitoxide), bring-your-own-filesystem adapters (isomorphic-git), parallel AST linkers (esbuild), monorepo hash caches (Turborepo).

## Production Plumbing

The load-bearing subsystems every real product ends up needing — mostly "boring but a vulnerability or outage if you get it wrong," which is exactly why you steal a correct-by-default version instead of winging it:

- [22-auth-and-identity](../22-auth-and-identity/README.md) — JWT-vs-session trade-offs, JWKS verification, OAuth2/OIDC handshakes, Argon2id hashing, session rotation, RBAC (jose, Ory, Better Auth, SuperTokens).
- [23-database-and-orm](../23-database-and-orm/README.md) — type-safe query builders, schema-diff migrations, connection pooling, serialization-failure retries, pgvector ANN (Drizzle, sqlc, Prisma, pgvector).
- [24-testing-and-quality](../24-testing-and-quality/README.md) — network mocking, property-based testing with shrinking, ephemeral containers, auto-waiting e2e (MSW, fast-check, Testcontainers, Playwright).
- [25-devops-and-ci-cd](../25-devops-and-ci-cd/README.md) — GitOps reconciliation, content-addressed pipeline caching, IaC dependency graphs (Argo CD, Dagger, Terraform).
- [26-payments-and-billing](../26-payments-and-billing/README.md) — idempotent webhooks, usage metering, fee/proration math, provider-agnostic payment modules (Lago, OpenMeter, Hyperswitch, Medusa).
- [27-email-and-messaging](../27-email-and-messaging/README.md) — responsive templating, SMTP pooling + DKIM, multi-channel notification orchestration (MJML, Nodemailer, Novu, listmonk).

## How To Actually Raid A Repo

1. Open the category README and find the part you want in the "What to steal" column.
2. Jump to the cited directory or file — don't read the whole repo.
3. Grep the terms from [search-terms.md](./search-terms.md) to land on the exact code path.
4. Take the transferable idea: the schema, the pipeline, the API, the one function.
5. Check the license before lifting code verbatim. The idea is always free; the code might not be.
