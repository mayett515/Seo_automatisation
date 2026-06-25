# TanStack And Frontend Architecture

Walk in here to lift the part of frontend state you're missing: asynchronous state, type-safe routing, reactive client data graphs, headless tables, form state, virtualization. The boundary between server state and client state is one of the hardest problems in React/TypeScript architecture, and the TanStack ecosystem ships headless, framework-agnostic utilities that solve it cleanly — take the one you need.

This category also shows where to pry production-grade repos apart into discrete, liftable modules. Even when two companies build completely different products, the intent behind a given module (authentication, scheduling, analytics, feature flags) is the same — so lift the pattern, not the whole app.

---

## 1. Core TanStack Ecosystem

The core TanStack libraries focus on single, well-defined responsibilities. They are "headless" (they provide logic, state, and API bindings but no styling or markup), making them highly adaptable.

### Core Repos

| Link | Good For | What to steal |
| --- | --- | --- |
| [TanStack/query](https://github.com/TanStack/query) | Asynchronous state management and data fetching. | Steal the caching state machine, query-key hashing, automatic garbage collection, mutation lifecycles, and optimistic update triggers. |
| [TanStack/db](https://github.com/TanStack/db) | Reactive client store for API data (**beta**). | Steal typed collections, live queries over local API data, optimistic transactions, sync-engine adapters, and the boundary where Query stops being enough. |
| [TanStack/router](https://github.com/TanStack/router) | Type-safe routing and nested page layouts. | Steal route nesting structures, loader prefetching mechanics, type-safe search param validation (using Zod), and code-splitting integrations. |
| [TanStack/table](https://github.com/TanStack/table) | Headless tables and advanced datagrids. | Steal column definition models, sorting/filtering state reducers, pagination sync, and how to separate UI markup from grid state. |
| [TanStack/virtual](https://github.com/TanStack/virtual) | Virtualized list, grid, and table rendering. | Steal windowing algorithms, dynamic size measurements, scroll event handling, and DOM node pooling. |
| [TanStack/form](https://github.com/TanStack/form) | Type-safe form validation and state management. | Steal high-performance form state subscriptions, field-level validation lifecycles, and deep path type safety. |
| [TanStack/start](https://github.com/TanStack/start) | Full-stack SSR framework powered by Router and Vite. | Steal the server function bridge (bridging client-side calls to server execution), SSR hydration processes, and streaming response patterns. |

Use **Query** when you need request orchestration and server-state caching. Bring in **DB** when the cache starts wanting to be a local, reactive data graph with relationships, derived queries, optimistic writes, and sync. Reach for **Start** when the same route tree needs SSR, streaming, server functions, or server routes. None of these replaces a real backend domain layer; they make the client/server boundary less leaky.

### Official References

- [TanStack Libraries](https://tanstack.com/libraries) — the current map of TanStack's headless tools across routing, server state, tables, forms, virtualization, sync, AI, and tooling.
- [TanStack Query Docs](https://tanstack.com/query/latest) — server-state cache, query keys, mutations, invalidation, retries, and framework adapters.
- [TanStack DB Docs](https://tanstack.com/db/latest) — typed collections, live queries, optimistic transactions, sync modes, and backend-agnostic collection adapters.
- [TanStack Start Docs](https://tanstack.com/start/latest) — full-document SSR, streaming, server functions, server routes, middleware, and deployment output.

---

## 2. Reference Architectures & Starters

Raid these repositories to see how TanStack libraries are wired together with styling systems, ORMs, and backend APIs in production — then lift the wiring you need.

### Starters & Boilerplates

| Link | Good For | What to steal |
| --- | --- | --- |
| [alan2207/bulletproof-react](https://github.com/alan2207/bulletproof-react) | Enterprise React application architecture structure. | Steal how they build feature-based directories (`features/`), wrap raw `useQuery` / `useMutation` in custom hooks, handle global error boundaries, and design API client wrappers. |
| [mugnavo/tanstarter](https://github.com/mugnavo/tanstarter) | Full-stack TanStack Start template with database/auth. | Steal how TanStack Start server functions integrate with Better Auth and Drizzle ORM to provide complete type-safety from database to component. |
| [toyamarodrigo/tanstack-router-template](https://github.com/toyamarodrigo/tanstack-router-template) | Client-side React 19 + Vite starter template. | Steal the integration of TanStack Router (with auto-generated routes), TanStack Query, Shadcn UI, Zod validation, and Tailwind CSS v4. |
| [Balastrong/tanstack-filtered-table-demo](https://github.com/Balastrong/tanstack-filtered-table-demo) | Synchronizing table state with URL search parameters. | Steal how table filtering, sorting, and pagination are read from and written to the URL query string, enabling shareable UI states. |
| [refinedev/refine](https://github.com/refinedev/refine) | A meta-framework for internal tools. | Steal how they abstract TanStack Query and Table into data providers to rapidly build CMS and admin panel interfaces. |

---

## 3. The Anatomy of Large Repos: Decomposing "Stealable" Modules

When studying massive repositories (like Cal.com or PostHog), looking at the codebase as a single monolithic product is overwhelming. Instead, decompose the repository into modules. The product might be scheduling or analytics, but the underlying engineering intent of their modules matches common patterns you can steal.

### Decomposed Module Index

| Intent | Product / Repo | Target Module / Directory | What to steal |
| --- | --- | --- | --- |
| **Reactive client collections** | TanStack DB | [`packages/db/src/collection`](https://github.com/TanStack/db/tree/main/packages/db/src/collection) | How typed API records become local collections with lifecycle, indexing, subscriptions, sync hooks, and mutation handling. |
| **Live query React binding** | TanStack DB | [`packages/react-db/src/useLiveQuery.ts`](https://github.com/TanStack/db/blob/main/packages/react-db/src/useLiveQuery.ts) | How React subscribes to live query results so derived UI updates when records change, without hand-built `useMemo` state graphs. |
| **Query-backed collection sync** | TanStack DB | [`packages/query-db-collection/src/query.ts`](https://github.com/TanStack/db/blob/main/packages/query-db-collection/src/query.ts) | How TanStack Query can remain the fetch/cache layer while DB turns fetched records into queryable local collections. |
| **Sync-engine adapter** | TanStack DB | [`packages/electric-db-collection/src/electric.ts`](https://github.com/TanStack/db/blob/main/packages/electric-db-collection/src/electric.ts) | How a backend sync engine feeds collection changes into the same local DB model used by components. |
| **Timezone & Booking Logic** | Cal.com | [`packages/core/availability`](https://github.com/calcom/cal.com/tree/main/packages/core/availability) | How to calculate intersecting time slots, handle timezone offsets, apply recurring calendar limits, and avoid overlap. |
| **Authentication & Sessions** | Cal.com | [`packages/lib/auth`](https://github.com/calcom/cal.com/tree/main/packages/lib/auth) | How Next-Auth adapters are customized, session security checks are made, and password hashing salts are handled. |
| **Event Ingestion Pipelines** | PostHog | [`posthog/api/event.py`](https://github.com/PostHog/posthog/blob/master/posthog/api/event.py) | How high-throughput event endpoints parse, validate, and queue analytics payloads for ClickHouse ingestion. |
| **Deterministic Flag Evaluation** | GrowthBook | [`packages/sdk`](https://github.com/growthbook/growthbook/tree/main/packages/sdk) | How to evaluate feature flags locally in micro-seconds using hashing (sha256 matching user IDs to buckets) with zero network request overhead. |
| **Link Routing & Analytics** | Dub.co | [`apps/web/lib/analytics`](https://github.com/dubco/dub/tree/main/apps/web/lib/analytics) | How link redirection is matched to geo-location, device type, and referrer, and then recorded in ClickHouse/Tinybird. |
| **Workflow Notification Engine** | Novu | [`apps/api/src/app/workflows`](https://github.com/novuhq/novu/tree/main/apps/api/src/app/workflows) | How to structure a multi-channel workflow (Email, SMS, Push, In-App) with template rendering, preference overlays, and queue retries. |
| **Inverted Index Search** | Meilisearch | [`crates/milli`](https://github.com/meilisearch/meilisearch/tree/main/crates/milli) | How an embedded typo-tolerant search engine builds inverted indexes and processes prefix-search rankings in Rust using LMDB. |
| **Federated Activity Sync** | Mastodon | [`app/services/activitypub`](https://github.com/mastodon/mastodon/tree/main/app/services/activitypub) | How to implement signed HTTP requests, process incoming Actor payloads (Inbox), and distribute posts to federated servers (Outbox). |

---

## Functional Patterns

- **Headless UI Separation**: State and behavior live in pure TypeScript hooks/classes (`useReactTable`, `useQuery`); UI styling lives in Tailwind/CSS components. This means logic is 100% portable across design systems.
- **Declarative Cache Invalidation**: Relying on deterministic query keys (`['todos', id]`) for state-sync. To update the UI, you trigger mutations and declare invalidations on specific keys, prompting background refetches.
- **Reactive Client Data Graphs**: Loading API records into typed collections, then querying joins, filters, aggregates, and derived UI state locally instead of scattering derived state across components.
- **Type-safe Query Constraints**: Router search parameters are parsed, validated against Zod schemas, and typed at compile time. This ensures no runtime route crashes due to unexpected query formats.
- **Local-first Optimistic Updates**: Writing mutation triggers that immediately update the cache client-side, with rollback hooks that trigger if the server returns an error.

## The Lift

- **Cache Hydration Policies**: How server-side fetched data is dehydrated into HTML during SSR and rehydrated into the TanStack Query client on the browser.
- **Collection Sync Boundary**: How TanStack DB turns REST, GraphQL, Query, Electric, PowerSync, or custom loaders into the same local collection contract.
- **State-to-URL Synchronization**: How search params are validated at the router boundary and passed directly to API requests or table state.
- **Server Function Bridge**: How frameworks like TanStack Start serialize client parameters and securely invoke functions on the backend.
- **Encapsulated API Custom Hooks**: How to construct reusable wrappers around `useQuery` so components never call `fetch` or `axios` directly.

## Search Inside

`useQuery`, `useMutation`, `QueryClient`, `queryKey`, `invalidateQueries`, `collection`, `live query`, `useLiveQuery`, `queryCollectionOptions`, `electricCollectionOptions`, `optimistic transaction`, `sync mode`, `useReactTable`, `columnDef`, `useVirtualizer`, `createRoute`, `useLoaderData`, `createServerFn`, `ZodSchema`, `features/`, `api/`, `Better-auth`, `Drizzle`, `ClickHouse`, `Tinybird`.
