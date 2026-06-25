# A Good Artist Steals

> "I steal from every single movie ever made." — and then you file the part where you can find it again.

This is a stash, not a syllabus. It's a categorized library of small, specific, *liftable* parts pulled from open-source repositories — the way a director lifts a shot, a cut, or a needle-drop from the movies they love and recombines them into something new.

You are not here to study a codebase front to back. You are here to walk in, grab the one part you came for — the availability math, the BM25 scoring, the Raft vote handler, the webhook idempotency wrapper — and walk out. Each category points at the exact directory or file where the good stuff lives, with a short note on *what to steal* and, increasingly, the actual code to lift.

It is not a game-development catalogue. The loot spans 28 categories: classic algorithms, social feeds, recommendation, search and ranking, graph analysis, streaming analytics, optimization, distributed systems and sync, query engines, ML internals, anomaly detection, full-stack feature patterns, backend frameworks, web extraction and browser agents, website templates and UI components, TanStack and frontend architecture, agentic workflows and MCP, modular TypeScript utilities, WebAssembly and low-level runtimes, advanced RAG and document parsing, Git internals and compilation toolchains, auth and identity, databases and ORMs, testing and quality, DevOps and CI/CD, payments and billing, and email and messaging.

## The Stash

Start here:

- [repo-catalog/README.md](./repo-catalog/README.md)

That folder is the catalog floor — every category, with direct GitHub links, the part worth taking, and notes on where it sits in the source repo.

## Finding What To Lift

- [Module intent index](./repo-catalog/index/module-intent-index.md) — the loot table. "I need X" → here's the exact module and file to take it from. Start here when you know what you want.
- [Repo index](./repo-catalog/index/repo-index.md) — alphabetical list of every repo in the stash.
- [Search terms](./repo-catalog/index/search-terms.md) — the keywords to grep once you're inside a big codebase.
- [Study path](./repo-catalog/index/study-path.md) — a map of where the good loot lives by theme. Raid in any order.

## How To Use This

Pick the part you want first, then come find where someone already built it well.

- Feed or timeline: raid social systems and recommendation.
- Search box or similar-items: raid search, retrieval, and ranking.
- Trending or top-k metrics: raid streaming and approximation.
- Scheduling or matching: raid optimization.
- Offline sync or collaboration: raid distributed systems and sync.
- Analytics or dashboards: raid query engines and data processing.
- Login, OAuth, sessions, or permissions: raid auth and identity.
- Type-safe queries, migrations, or vector search: raid databases and ORMs.
- Subscriptions, metering, or invoicing: raid payments and billing.
- Transactional email or notifications: raid email and messaging.
- CI pipelines, GitOps, or infrastructure-as-code: raid DevOps and CI/CD.
- Mocking, e2e, or property-based testing: raid testing and quality.

Take the *shape* of the solution: the data model, the pipeline, the algorithm, the API boundary, the one clever function. Then make it yours. Check each repo's license before lifting code verbatim — stealing the idea is free, shipping someone's GPL code is not.
