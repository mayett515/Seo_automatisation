# The Catalog Floor

This is the stash, laid out by category. Every entry is an open-source repo with a direct link, the part worth taking, and a note on where in the source it lives. It is intentionally not about games — the loot is product and system functionality: feeds, ranking, search, recommendations, graphs, streaming analytics, optimization, sync, query engines, ML internals, anomaly detection, full-stack features, and the production plumbing (auth, databases, testing, DevOps, payments, email) every real app ends up needing.

Walk the aisle for the part you came for, then lift it. The thing worth stealing is usually the *shape* of the solution: the data model, the pipeline, the event flow, the algorithm choice, the API boundary, the one reliability trick. The newer categories go further and hand you the exact directory and a code snippet. Check each repo's license before copying code verbatim.

## File Tree

- [00-general-algorithms](./00-general-algorithms/README.md) - classic algorithms, data structures, explanations, visualizers.
- [01-catalogues-and-maps](./01-catalogues-and-maps/README.md) - collections of collections and topic maps.
- [02-social-and-community-systems](./02-social-and-community-systems/README.md) - feeds, timelines, federation, moderation, community products.
- [03-recommendation-and-personalization](./03-recommendation-and-personalization/README.md) - recommenders, rerankers, candidate generation, feedback loops.
- [04-search-retrieval-and-ranking](./04-search-retrieval-and-ranking/README.md) - full-text search, vector search, hybrid retrieval, ranking engines.
- [05-graphs-and-networks](./05-graphs-and-networks/README.md) - graph algorithms, centrality, community detection, network analysis.
- [06-streaming-and-approximation](./06-streaming-and-approximation/README.md) - Bloom filters, HyperLogLog, Count-Min Sketch, top-k, sampling.
- [07-optimization-scheduling-matching](./07-optimization-scheduling-matching/README.md) - routing, scheduling, packing, assignment, constraints.
- [08-distributed-systems-and-sync](./08-distributed-systems-and-sync/README.md) - Raft, Jepsen, CRDTs, local-first collaboration.
- [09-query-engines-and-data-processing](./09-query-engines-and-data-processing/README.md) - SQL engines, columnar execution, lazy dataframes, OLAP.
- [10-ml-internals-and-classic-ml](./10-ml-internals-and-classic-ml/README.md) - small AI codebases, ML libraries, transformers, autograd.
- [11-anomaly-detection-and-time-series](./11-anomaly-detection-and-time-series/README.md) - outlier detection, monitoring, forecasting, time-series reading lists.
- [12-fullstack-feature-patterns](./12-fullstack-feature-patterns/README.md) - real app feature examples and clone catalogues.
- [13-backend-frameworks-and-patterns](./13-backend-frameworks-and-patterns/README.md) - Fastify, NestJS, routing, validation, DI, plugin systems.
- [14-web-extraction-and-browser-agents](./14-web-extraction-and-browser-agents/README.md) - web crawling, LLM-ready extraction, browser agents, frontend component analysis.
- [15-website-templates-and-ui-components](./15-website-templates-and-ui-components/README.md) - landing pages, navbars, carousels, UI component libraries, service business templates.
- [16-tanstack-and-frontend-architecture](./16-tanstack-and-frontend-architecture/README.md) - headless state, routing, reactive client DB, data tables, form state, virtualization, and stealing modules from large codebases.
- [17-agentic-workflows-and-mcp-servers](./17-agentic-workflows-and-mcp-servers/README.md) - AI agents, workflow orchestrators, Model Context Protocol (MCP) servers, sandboxes, and computer-use visual grounding.
- [18-modular-typescript-utilities-and-state](./18-modular-typescript-utilities-and-state/README.md) - runtime-agnostic UnJS utilities, atomic state graphs, proxy client integrations, and compile-time type-safe schemas.
- [19-webassembly-and-low-level-runtimes](./19-webassembly-and-low-level-runtimes/README.md) - WebAssembly compilers, plugin SDKs, sandboxed script interpreters, and canvas-based layout engines.
- [20-advanced-rag-and-document-parsing](./20-advanced-rag-and-document-parsing/README.md) - document extraction, table parsing, vector chunking pipelines, context reranking, and query translation.
- [21-git-internals-and-compilation-toolchains](./21-git-internals-and-compilation-toolchains/README.md) - Git packfile resolving, isomorphic-git filesystem abstraction, parallel AST compilers, and build caching.
- [22-auth-and-identity](./22-auth-and-identity/README.md) - OAuth2/OIDC, sessions vs JWT, password hashing, passkeys/WebAuthn, RBAC, identity servers.
- [23-database-and-orm](./23-database-and-orm/README.md) - type-safe query builders, migrations, connection pooling, ORMs, vector search.
- [24-testing-and-quality](./24-testing-and-quality/README.md) - unit/integration/e2e, mocking, property-based testing, containers, load testing.
- [25-devops-and-ci-cd](./25-devops-and-ci-cd/README.md) - CI pipelines, GitOps reconciliation, infrastructure-as-code, container builds, runners.
- [26-payments-and-billing](./26-payments-and-billing/README.md) - checkout, subscriptions, usage metering, invoicing, idempotency, webhooks.
- [27-email-and-messaging](./27-email-and-messaging/README.md) - transactional email, templating, multi-channel notifications, deliverability, queues.
- [index/repo-index.md](./index/repo-index.md) - alphabetical index of all linked repos.
- [index/module-intent-index.md](./index/module-intent-index.md) - the loot table: "I need X" → the exact module and file to lift it from.
- [index/search-terms.md](./index/search-terms.md) - the keywords to grep once you're inside a big repo.
- [index/study-path.md](./index/study-path.md) - a map of where the good loot lives by theme. Raid in any order.

## The Greatest Hits

If you only want the highest-value loot to grab first, start here:

- [xai-org/x-algorithm](https://github.com/xai-org/x-algorithm) - modern For You feed pipeline shape.
- [twitter/the-algorithm](https://github.com/twitter/the-algorithm) - older large-scale social recommendation architecture.
- [bluesky-social/feed-generator](https://github.com/bluesky-social/feed-generator) - custom feed service starter.
- [mastodon/mastodon](https://github.com/mastodon/mastodon) - real federated social network.
- [realworld-apps/realworld](https://github.com/realworld-apps/realworld) - same product built across stacks.
- [apache/lucene](https://github.com/apache/lucene) - classic full-text search internals.
- [facebookresearch/faiss](https://github.com/facebookresearch/faiss) - vector similarity search.
- [metarank/metarank](https://github.com/metarank/metarank) - learning-to-rank service.
- [recommenders-team/recommenders](https://github.com/recommenders-team/recommenders) - recommender notebooks and best practices.
- [google/or-tools](https://github.com/google/or-tools) - constraint optimization.
- [Callidon/bloom-filters](https://github.com/Callidon/bloom-filters) - probabilistic data structures in JS/TS.
- [duckdb/duckdb](https://github.com/duckdb/duckdb) - embedded analytical SQL engine.
- [tinygrad/tinygrad](https://github.com/tinygrad/tinygrad) - small deep learning stack internals.
- [typesense/typesense](https://github.com/typesense/typesense) - fast typo-tolerant search engine.
- [PostHog/posthog](https://github.com/PostHog/posthog) - product analytics, session replay, feature flags.
- [novuhq/novu](https://github.com/novuhq/novu) - notification infrastructure for products.
- [loro-dev/loro](https://github.com/loro-dev/loro) - high-performance CRDT with version control.
- [dragonflydb/dragonfly](https://github.com/dragonflydb/dragonfly) - modern multi-threaded Redis/Memcached replacement.
- [ERGO-Code/HiGHS](https://github.com/ERGO-Code/HiGHS) - high-performance linear & mixed-integer optimizer.
- [fastify/fastify](https://github.com/fastify/fastify) - high-performance Node.js web framework with plugin architecture.
- [nestjs/nest](https://github.com/nestjs/nest) - progressive Node.js framework with DI, modules, guards, interceptors.
- [mistralai/mistral-inference](https://github.com/mistralai/mistral-inference) - reference inference for Mistral open-weight LLMs.
- [EricLBuehler/mistral.rs](https://github.com/EricLBuehler/mistral.rs) - blazing fast Rust inference for Mistral models.
- [vllm-project/vllm](https://github.com/vllm-project/vllm) - high-throughput LLM serving with PagedAttention.
- [firecrawl/firecrawl](https://github.com/firecrawl/firecrawl) - web context API: crawl, scrape, extract to markdown/structured data.
- [browser-use/browser-use](https://github.com/browser-use/browser-use) - AI agent that controls a browser to complete web tasks.
- [shadcn-ui/ui](https://github.com/shadcn-ui/ui) - copy-paste React components with Radix UI + Tailwind CSS.
- [PaulleDemon/awesome-landing-pages](https://github.com/PaulleDemon/awesome-landing-pages) - curated collection of free landing page templates.
- [TanStack/query](https://github.com/TanStack/query) - industry-standard async state management and caching.
- [TanStack/db](https://github.com/TanStack/db) - reactive client store for API data with typed collections, live queries, and sync adapters.
- [TanStack/router](https://github.com/TanStack/router) - modern, type-safe router with loaders and search param parsing.
- [alan2207/bulletproof-react](https://github.com/alan2207/bulletproof-react) - enterprise-grade React architecture structure and API hooks boundaries.
- [mugnavo/tanstarter](https://github.com/mugnavo/tanstarter) - full-stack TanStack Start template with database and authentication integration.
- [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) - stateful multi-agent system orchestrator with checkpoint memory cycles.
- [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) - open Model Context Protocol server connectors for databases and tools.
- [unjs/unstorage](https://github.com/unjs/unstorage) - universal unified storage API engine with multi-driver mounting systems.
- [extism/extism](https://github.com/extism/extism) - universal WebAssembly plugin framework.
- [chenglou/pretext](https://github.com/chenglou/pretext) - high-performance multiline text measurement and layout.
- [mastra-ai/mastra](https://github.com/mastra-ai/mastra) - production-grade TypeScript AI agent framework (Zod tool schemas, workflows, evaluations).
- [0xPlaygrounds/rig](https://github.com/0xPlaygrounds/rig) - modular, async-first LLM agent and vector RAG framework in Rust.
- [NirDiamant/RAG_Techniques](https://github.com/NirDiamant/RAG_Techniques) - complete code walkthroughs for 30+ advanced retrieval-augmented generation strategies.
- [run-llama/llama_index](https://github.com/run-llama/llama_index) - comprehensive framework for structuring, parsing, and retrieving data.
- [Byron/gitoxide](https://github.com/Byron/gitoxide) - pure Rust high-performance implementation of Git (packfile resolve, concurrency).
- [evanw/esbuild](https://github.com/evanw/esbuild) - blazing fast Javascript/Typescript compiler and bundler in Go (parallel AST linking).
- [better-auth/better-auth](https://github.com/better-auth/better-auth) - framework-agnostic TypeScript auth with sessions, OAuth, 2FA, and passkeys.
- [ory/kratos](https://github.com/ory/kratos) - headless identity with resumable self-service flows and pluggable password hashing.
- [drizzle-team/drizzle-orm](https://github.com/drizzle-team/drizzle-orm) - type-safe SQL with schema-driven migrations and a Zod bridge.
- [microsoft/playwright](https://github.com/microsoft/playwright) - reliable end-to-end browser testing with auto-waiting.
- [argoproj/argo-cd](https://github.com/argoproj/argo-cd) - GitOps reconciliation loop diffing desired vs. live cluster state.
- [getlago/lago](https://github.com/getlago/lago) - open-source usage-based billing with metering, fees, and invoicing.
- [novuhq/novu](https://github.com/novuhq/novu) - multi-channel notification orchestration (email, SMS, push, in-app).

## How To Use This

Pick the part you want first, then go raid the repos that already built it:

- Feed, timeline, discovery: raid social systems plus recommendation.
- Search box, similar items, semantic lookup: raid search and retrieval.
- "Trending", dedupe, unique counts, top hashtags: raid streaming and approximation.
- Scheduling, matching, allocation: raid optimization.
- Offline sync or collaborative editing: raid distributed systems and sync.
- Analytics, dashboards, local data crunching: raid query engines.
- Alerts, fraud-ish signals, weird behavior: raid anomaly detection and time series.
- Backend routing, validation, middleware, DI, plugin architecture: raid backend frameworks.
- Web crawling, scraping to LLM-ready data, browser automation, UI component detection: raid web extraction and browser agents.
- Landing pages, navbars, sliders, carousels, service business templates, UI component libraries: raid website templates and UI components.
- Headless UI, async state caching, reactive client data graphs, type-safe routing, virtualization, and stealing modules from large codebases: raid TanStack and frontend architecture.
- Autonomous agent execution loops, memory state checkpointers, and tool integrations: raid Agentic Workflows and MCP.
- Composition-first micro-libraries, multi-driver storage adapters, type validation without generation: raid Modular TS Utilities and State.
- WebAssembly compilers, host-plugin execution environments, sandboxes, and low-level rendering: raid WebAssembly and Low-Level Runtimes.
- Retrieval-Augmented Generation (RAG) pipelines, layout-aware PDF parsers, query translation, and context evaluation: raid Advanced RAG and Document Parsing.
- Git packfile parsing, custom isomorphic storage adapters, AST compilers, and build orchestration: raid Git Internals and Compilation Toolchains.
- Login, OAuth2/OIDC, sessions, JWT verification, password hashing, passkeys, RBAC: raid Auth and Identity.
- Type-safe queries, schema migrations, connection pooling, vector search in the DB: raid Database and ORM.
- Mocking, fixtures, property-based tests, e2e browsers, containers, load testing: raid Testing and Quality.
- CI pipelines, GitOps, infrastructure-as-code, container builds, self-hosted runners: raid DevOps and CI/CD.
- Checkout, subscriptions, usage metering, invoicing, idempotent webhooks: raid Payments and Billing.
- Transactional email, responsive templates, multi-channel notifications, deliverability: raid Email and Messaging.

Good code search words are collected in [index/search-terms.md](./index/search-terms.md).
