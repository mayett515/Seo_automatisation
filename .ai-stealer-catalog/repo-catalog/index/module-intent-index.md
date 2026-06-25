# Global Module Intent Index

This is the loot table. It organizes specific code directories and modules from open-source repositories by their **engineering intent** (the problem they solve). Don't case a massive codebase as one monolithic product — come here, find the exact part you want, and lift it: the architecture pattern, the schema, the protocol. Every row points at one liftable thing and the file it lives in.

Every path below was verified against the live GitHub tree. Branches differ between repos (`main`, `master`, `next`, `develop`, `stable`), so the links point at the branch where the module currently lives.

---

## 1. Algorithms & Data Structures

The boring-but-correct primitives. Steal the data structure, not the whole library.

| Intent / Problem | Target Repository | Code Module / Path | What to steal & where |
| --- | --- | --- | --- |
| **Binary Heap / Priority Queue** | `python/cpython` | [`Lib/heapq.py`](https://github.com/python/cpython/blob/main/Lib/heapq.py) | The canonical readable heap: sift-up/sift-down, `nlargest`/`nsmallest` bounded top-K. See [General Algorithms](../00-general-algorithms/README.md). |
| **Consistent Hashing Ring** | `golang/groupcache` | [`consistenthash/consistenthash.go`](https://github.com/golang/groupcache/blob/master/consistenthash/consistenthash.go) | Virtual-node ring that maps keys to nodes with minimal reshuffling on membership change. See [General Algorithms](../00-general-algorithms/README.md). |
| **LRU Eviction** | `golang/groupcache` | [`lru/lru.go`](https://github.com/golang/groupcache/blob/master/lru/lru.go) | Doubly-linked-list + map LRU in ~100 lines — the pattern every cache reimplements. See [General Algorithms](../00-general-algorithms/README.md). |
| **Sorted-Set Skiplist** | `redis/redis` | [`src/t_zset.c`](https://github.com/redis/redis/blob/unstable/src/t_zset.c) | How a production sorted set is backed by a skiplist + hash for O(log n) range queries and ranking. See [General Algorithms](../00-general-algorithms/README.md). |
| **Shortest-Path Routing Core** | `valhalla/valhalla` | [`src/thor`](https://github.com/valhalla/valhalla/tree/master/src/thor) | Production path-finding (bidirectional A*, time-dependent costing) over real road graphs. See [General Algorithms](../00-general-algorithms/README.md). |
| **DAG Cycle Detection** | `apache/airflow` | [`airflow-core/src/airflow/utils`](https://github.com/apache/airflow/tree/main/airflow-core/src/airflow/utils) | How a scheduler validates task graphs are acyclic (`dag.check_cycle()`) before execution. See [General Algorithms](../00-general-algorithms/README.md). |

---

## 2. Search, Retrieval & Ranking

How inverted indexes, scoring, typo tolerance, and vector recall actually get built.

| Intent / Problem | Target Repository | Code Module / Path | What to steal & where |
| --- | --- | --- | --- |
| **Search Query Pipeline** | `meilisearch/meilisearch` | [`crates/milli/src/search`](https://github.com/meilisearch/meilisearch/tree/main/crates/milli/src/search) | Prefix search, ranking rules, and typo-tolerant matching over an LMDB-backed inverted index. See [Search & Retrieval](../04-search-retrieval-and-ranking/README.md). |
| **Index Build / Update** | `meilisearch/meilisearch` | [`crates/milli/src/update`](https://github.com/meilisearch/meilisearch/tree/main/crates/milli/src/update) | Incremental document indexing and inverted-index maintenance. See [Search & Retrieval](../04-search-retrieval-and-ranking/README.md). |
| **BM25 Scoring** | `quickwit-oss/tantivy` | [`src/query/bm25.rs`](https://github.com/quickwit-oss/tantivy/blob/main/src/query/bm25.rs) | The exact term-frequency / inverse-document-frequency math used for relevance scoring. See [Search & Retrieval](../04-search-retrieval-and-ranking/README.md). |
| **Posting Lists** | `quickwit-oss/tantivy` | [`src/postings`](https://github.com/quickwit-oss/tantivy/tree/main/src/postings) | How term → document-id posting lists are encoded, compressed, and intersected. See [Search & Retrieval](../04-search-retrieval-and-ranking/README.md). |
| **Tokenization / Analysis** | `quickwit-oss/tantivy` | [`src/tokenizer`](https://github.com/quickwit-oss/tantivy/tree/main/src/tokenizer) | Tokenizer + filter chain (lowercase, stemming, n-grams) that normalizes text before indexing. See [Search & Retrieval](../04-search-retrieval-and-ranking/README.md). |
| **HNSW Graph ANN** | `nmslib/hnswlib` | [`hnswlib/hnswalg.h`](https://github.com/nmslib/hnswlib/blob/master/hnswlib/hnswalg.h) | The reference hierarchical-navigable-small-world graph for approximate nearest-neighbor search. See [Search & Retrieval](../04-search-retrieval-and-ranking/README.md). |
| **IVF / HNSW Index Types** | `facebookresearch/faiss` | [`faiss/IndexHNSW.h`](https://github.com/facebookresearch/faiss/blob/main/faiss/IndexHNSW.h) | How different ANN index structures trade recall for speed and memory. See [Search & Retrieval](../04-search-retrieval-and-ranking/README.md). |

---

## 3. Social Feeds, Federation & Moderation

How real social products assemble timelines, federate posts, and gate behavior by trust.

| Intent / Problem | Target Repository | Code Module / Path | What to steal & where |
| --- | --- | --- | --- |
| **Fan-out Feed Assembly** | `mastodon/mastodon` | [`app/lib/feed_manager.rb`](https://github.com/mastodon/mastodon/blob/main/app/lib/feed_manager.rb) | Push-on-write home-timeline fan-out, filtering, and Redis-backed feed storage. See [Social Systems](../02-social-and-community-systems/README.md). |
| **Candidate → Ranking Mixer** | `twitter/the-algorithm` | [`home-mixer`](https://github.com/twitter/the-algorithm/tree/main/home-mixer) | The candidate-source → hydration → heavy-ranker → filter assembly of a "For You" feed. See [Social Systems](../02-social-and-community-systems/README.md). |
| **Custom Feed Algorithms** | `bluesky-social/feed-generator` | [`src/algos`](https://github.com/bluesky-social/feed-generator/tree/main/src/algos) | A minimal pluggable feed-generator service you can run yourself. See [Social Systems](../02-social-and-community-systems/README.md). |
| **ActivityPub Federation** | `mastodon/mastodon` | [`app/lib/activitypub`](https://github.com/mastodon/mastodon/tree/main/app/lib/activitypub) | Signed HTTP requests, Actor payloads, Inbox/Outbox delivery to federated servers. See [Social Systems](../02-social-and-community-systems/README.md). |
| **Federated Apub (Rust)** | `LemmyNet/lemmy` | [`crates/apub`](https://github.com/LemmyNet/lemmy/tree/main/crates/apub) | A second, Rust-idiomatic take on ActivityPub inbox/outbox handling. See [Social Systems](../02-social-and-community-systems/README.md). |
| **Materialized Read Views** | `LemmyNet/lemmy` | [`crates/db_views`](https://github.com/LemmyNet/lemmy/tree/main/crates/db_views) | Precomputed aggregate views that keep feed reads cheap. See [Social Systems](../02-social-and-community-systems/README.md). |
| **Trust-Level Gating** | `discourse/discourse` | [`lib/trust_level.rb`](https://github.com/discourse/discourse/blob/main/lib/trust_level.rb) | Progressive capability unlocking by accrued reputation — anti-spam without hard bans. See [Social Systems](../02-social-and-community-systems/README.md). |

---

## 4. Recommendation & Personalization

Candidate generation, collaborative filtering, and ranking organs you can lift.

| Intent / Problem | Target Repository | Code Module / Path | What to steal & where |
| --- | --- | --- | --- |
| **Collaborative-Filtering Models** | `gorse-io/gorse` | [`model/cf`](https://github.com/gorse-io/gorse/tree/master/model/cf) | Matrix-factorization and CF model implementations behind a self-hosted recommender. See [Recommendation](../03-recommendation-and-personalization/README.md). |
| **Recommender Worker/Server Split** | `gorse-io/gorse` | [`worker`](https://github.com/gorse-io/gorse/tree/master/worker) | How offline candidate generation is split from the online serving path. See [Recommendation](../03-recommendation-and-personalization/README.md). |
| **ALS Matrix Factorization** | `benfred/implicit` | [`implicit/als.py`](https://github.com/benfred/implicit/blob/main/implicit/als.py) | Alternating-least-squares for implicit feedback — the workhorse of "people also liked." See [Recommendation](../03-recommendation-and-personalization/README.md). |
| **Sequential Recommenders** | `RUCAIBox/RecBole` | [`recbole/model/sequential_recommender`](https://github.com/RUCAIBox/RecBole/tree/master/recbole/model/sequential_recommender) | Session/sequence models (GRU4Rec, SASRec) in a uniform interface. See [Recommendation](../03-recommendation-and-personalization/README.md). |
| **Ranking Tasks/Losses** | `tensorflow/recommenders` | [`tensorflow_recommenders/tasks`](https://github.com/tensorflow/recommenders/tree/main/tensorflow_recommenders/tasks) | Retrieval vs. ranking task abstractions and their loss functions. See [Recommendation](../03-recommendation-and-personalization/README.md). |
| **Online Reranking Service** | `metarank/metarank` | [`src/main/scala/ai/metarank`](https://github.com/metarank/metarank/tree/master/src/main/scala/ai/metarank) | Feature store + learning-to-rank reranker deployable as a service. See [Recommendation](../03-recommendation-and-personalization/README.md). |

---

## 5. Streaming & Approximation

Sublinear-memory sketches for counting, frequency, and sampling at scale.

| Intent / Problem | Target Repository | Code Module / Path | What to steal & where |
| --- | --- | --- | --- |
| **HyperLogLog (Cardinality)** | `redis/redis` | [`src/hyperloglog.c`](https://github.com/redis/redis/blob/unstable/src/hyperloglog.c) | Production HLL with sparse/dense encodings and bias correction — count uniques in KBs. See [Streaming & Approximation](../06-streaming-and-approximation/README.md). |
| **Distinct Counting (Rust)** | `alecmocatta/streaming_algorithms` | [`src/distinct.rs`](https://github.com/alecmocatta/streaming_algorithms/blob/master/src/distinct.rs) | A clean, mergeable HLL implementation to read alongside the C version. See [Streaming & Approximation](../06-streaming-and-approximation/README.md). |
| **Count-Min Sketch (Frequency)** | `alecmocatta/streaming_algorithms` | [`src/count_min.rs`](https://github.com/alecmocatta/streaming_algorithms/blob/master/src/count_min.rs) | Approximate frequency counts in fixed memory with tunable error bounds. See [Streaming & Approximation](../06-streaming-and-approximation/README.md). |
| **Top-K / Heavy Hitters** | `alecmocatta/streaming_algorithms` | [`src/top.rs`](https://github.com/alecmocatta/streaming_algorithms/blob/master/src/top.rs) | Streaming "trending" detection without storing every key. See [Streaming & Approximation](../06-streaming-and-approximation/README.md). |
| **Reservoir Sampling** | `alecmocatta/streaming_algorithms` | [`src/sample.rs`](https://github.com/alecmocatta/streaming_algorithms/blob/master/src/sample.rs) | Uniform sampling from an unbounded stream in O(k) memory. See [Streaming & Approximation](../06-streaming-and-approximation/README.md). |
| **Quantile Estimation (t-digest)** | `tdunning/t-digest` | [`MergingDigest.java`](https://github.com/tdunning/t-digest/blob/main/core/src/main/java/com/tdunning/math/stats/MergingDigest.java) | Accurate p99/quantiles over streams with mergeable, bounded state. See [Streaming & Approximation](../06-streaming-and-approximation/README.md). |
| **Probabilistic Filters (JS)** | `Callidon/bloom-filters` | [`src/bloom`](https://github.com/Callidon/bloom-filters/tree/master/src/bloom) | Bloom / counting-bloom membership tests in TypeScript. See [Streaming & Approximation](../06-streaming-and-approximation/README.md). |

---

## 6. Graphs & Networks

Traversal, centrality, and community detection lifted from reference libraries.

| Intent / Problem | Target Repository | Code Module / Path | What to steal & where |
| --- | --- | --- | --- |
| **Weighted Shortest Path** | `networkx/networkx` | [`shortest_paths/weighted.py`](https://github.com/networkx/networkx/blob/main/networkx/algorithms/shortest_paths/weighted.py) | Readable Dijkstra/Bellman-Ford with a clean priority-queue structure. See [Graphs & Networks](../05-graphs-and-networks/README.md). |
| **A\* Heuristic Search** | `networkx/networkx` | [`shortest_paths/astar.py`](https://github.com/networkx/networkx/blob/main/networkx/algorithms/shortest_paths/astar.py) | How a heuristic prunes the search frontier vs. plain Dijkstra. See [Graphs & Networks](../05-graphs-and-networks/README.md). |
| **PageRank** | `networkx/networkx` | [`link_analysis/pagerank_alg.py`](https://github.com/networkx/networkx/blob/main/networkx/algorithms/link_analysis/pagerank_alg.py) | Power-iteration PageRank with damping — the canonical authority score. See [Graphs & Networks](../05-graphs-and-networks/README.md). |
| **Community Detection (Louvain)** | `taynaud/python-louvain` | [`community/community_louvain.py`](https://github.com/taynaud/python-louvain/blob/master/community/community_louvain.py) | Modularity-maximizing community detection in readable Python. See [Graphs & Networks](../05-graphs-and-networks/README.md). |
| **Max-Flow / Min-Cut** | `networkx/networkx` | [`algorithms/flow`](https://github.com/networkx/networkx/tree/main/networkx/algorithms/flow) | Flow algorithms underlying matching, segmentation, and capacity problems. See [Graphs & Networks](../05-graphs-and-networks/README.md). |
| **Centrality (C core)** | `igraph/igraph` | [`src/centrality`](https://github.com/igraph/igraph/tree/main/src/centrality) | High-performance betweenness/closeness/eigenvector centrality in C. See [Graphs & Networks](../05-graphs-and-networks/README.md). |

---

## 7. Optimization, Scheduling & Matching

Constraint solving, assignment, and stable matching.

| Intent / Problem | Target Repository | Code Module / Path | What to steal & where |
| --- | --- | --- | --- |
| **CP-SAT Constraint Solver** | `google/or-tools` | [`ortools/sat`](https://github.com/google/or-tools/tree/stable/ortools/sat) | The constraint-programming engine for scheduling, rostering, and assignment. See [Optimization](../07-optimization-scheduling-matching/README.md). |
| **Graph Assignment Algorithms** | `google/or-tools` | [`ortools/graph`](https://github.com/google/or-tools/tree/stable/ortools/graph) | Min-cost flow, linear assignment (Hungarian) building blocks. See [Optimization](../07-optimization-scheduling-matching/README.md). |
| **Vehicle Routing** | `google/or-tools` | [`ortools/routing`](https://github.com/google/or-tools/tree/stable/ortools/routing) | VRP/TSP with time windows and capacity constraints. See [Optimization](../07-optimization-scheduling-matching/README.md). |
| **LP Simplex (Glop)** | `google/or-tools` | [`ortools/glop`](https://github.com/google/or-tools/tree/stable/ortools/glop) | A clean linear-programming simplex implementation. See [Optimization](../07-optimization-scheduling-matching/README.md). |
| **Constraint Solver Core** | `TimefoldAI/timefold-solver` | [`core`](https://github.com/TimefoldAI/timefold-solver/tree/main/core) | Local-search/metaheuristic constraint solving with incremental score calculation. See [Optimization](../07-optimization-scheduling-matching/README.md). |
| **MIP Branch & Bound** | `ERGO-Code/HiGHS` | [`highs/mip`](https://github.com/ERGO-Code/HiGHS/tree/master/highs/mip) | Production mixed-integer programming branch-and-bound. See [Optimization](../07-optimization-scheduling-matching/README.md). |

---

## 8. Distributed Systems & Sync

Consensus, conflict-free replication, and causality.

| Intent / Problem | Target Repository | Code Module / Path | What to steal & where |
| --- | --- | --- | --- |
| **Raft Consensus** | `hashicorp/raft` | [`raft.go`](https://github.com/hashicorp/raft/blob/main/raft.go) | Leader election, log replication, and commit logic in readable Go. See [Distributed Systems](../08-distributed-systems-and-sync/README.md). |
| **Raft Quorum / Joint Config** | `etcd-io/raft` | [`quorum`](https://github.com/etcd-io/raft/tree/main/quorum) | How joint-consensus membership changes stay safe during reconfiguration. See [Distributed Systems](../08-distributed-systems-and-sync/README.md). |
| **State Machine Application** | `hashicorp/raft` | [`fsm.go`](https://github.com/hashicorp/raft/blob/main/fsm.go) | Applying a committed log to a finite-state machine + snapshotting. See [Distributed Systems](../08-distributed-systems-and-sync/README.md). |
| **CRDT Document Structs** | `yjs/yjs` | [`src/structs/Item.js`](https://github.com/yjs/yjs/blob/main/src/structs/Item.js) | The linked-item structure powering conflict-free collaborative editing. See [Distributed Systems](../08-distributed-systems-and-sync/README.md). |
| **CRDT Engine (Rust)** | `automerge/automerge` | [`rust/automerge`](https://github.com/automerge/automerge/tree/main/rust/automerge) | A columnar, compressed CRDT with full change history. See [Distributed Systems](../08-distributed-systems-and-sync/README.md). |
| **Fault Injection (Nemesis)** | `jepsen-io/jepsen` | [`jepsen/src/jepsen/nemesis`](https://github.com/jepsen-io/jepsen/tree/main/jepsen/src/jepsen/nemesis) | How partitions, clock skew, and crashes are injected to test consistency. See [Distributed Systems](../08-distributed-systems-and-sync/README.md). |

---

## 9. Query Engines & Data Processing

Planning, optimization, and vectorized execution.

| Intent / Problem | Target Repository | Code Module / Path | What to steal & where |
| --- | --- | --- | --- |
| **Vectorized Execution** | `duckdb/duckdb` | [`src/execution`](https://github.com/duckdb/duckdb/tree/main/src/execution) | Columnar, vectorized operators (hash join, aggregate) in an embedded OLAP engine. See [Query Engines](../09-query-engines-and-data-processing/README.md). |
| **Optimizer Rules** | `duckdb/duckdb` | [`src/optimizer`](https://github.com/duckdb/duckdb/tree/main/src/optimizer) | Filter pushdown, join ordering, and expression rewrites. See [Query Engines](../09-query-engines-and-data-processing/README.md). |
| **Physical Plan (Rust)** | `apache/datafusion` | [`datafusion/physical-plan`](https://github.com/apache/datafusion/tree/main/datafusion/physical-plan) | Arrow-native physical operators and execution streams. See [Query Engines](../09-query-engines-and-data-processing/README.md). |
| **Bytecode VM (VDBE)** | `sqlite/sqlite` | [`src/vdbe.c`](https://github.com/sqlite/sqlite/blob/master/src/vdbe.c) | How SQL compiles to a register-based virtual machine. See [Query Engines](../09-query-engines-and-data-processing/README.md). |
| **Query Planner (where.c)** | `sqlite/sqlite` | [`src/where.c`](https://github.com/sqlite/sqlite/blob/master/src/where.c) | Index selection and the WHERE-clause planning that drives lookups. See [Query Engines](../09-query-engines-and-data-processing/README.md). |
| **Cost-Based Planner** | `apache/calcite` | [`core/.../calcite/plan`](https://github.com/apache/calcite/tree/main/core/src/main/java/org/apache/calcite/plan) | The reusable relational optimizer (Volcano/Cascades) many engines embed. See [Query Engines](../09-query-engines-and-data-processing/README.md). |

---

## 10. ML Internals & Classic ML

Autograd, estimator contracts, and training loops, small enough to read end-to-end.

| Intent / Problem | Target Repository | Code Module / Path | What to steal & where |
| --- | --- | --- | --- |
| **Autograd Engine** | `karpathy/micrograd` | [`micrograd/engine.py`](https://github.com/karpathy/micrograd/blob/master/micrograd/engine.py) | A ~100-line scalar reverse-mode autodiff — the cleanest backprop you can read. See [ML Internals](../10-ml-internals-and-classic-ml/README.md). |
| **Tensor + Lazy Ops** | `tinygrad/tinygrad` | [`tinygrad/tensor.py`](https://github.com/tinygrad/tinygrad/blob/master/tinygrad/tensor.py) | How a tensor library builds a lazy op graph then lowers it to kernels. See [ML Internals](../10-ml-internals-and-classic-ml/README.md). |
| **Estimator Contract** | `scikit-learn/scikit-learn` | [`sklearn/base.py`](https://github.com/scikit-learn/scikit-learn/blob/main/sklearn/base.py) | The `fit`/`predict`/`transform` interface that the whole ecosystem depends on. See [ML Internals](../10-ml-internals-and-classic-ml/README.md). |
| **Pipeline Composition** | `scikit-learn/scikit-learn` | [`sklearn/pipeline.py`](https://github.com/scikit-learn/scikit-learn/blob/main/sklearn/pipeline.py) | Chaining transformers + an estimator behind one consistent interface. See [ML Internals](../10-ml-internals-and-classic-ml/README.md). |
| **GPT Training Loop** | `karpathy/nanoGPT` | [`train.py`](https://github.com/karpathy/nanoGPT/blob/master/train.py) | A minimal, hackable transformer training loop with grad accumulation. See [ML Internals](../10-ml-internals-and-classic-ml/README.md). |

---

## 11. Anomaly Detection & Time Series

Forecasting, decomposition, and online drift/outlier detection.

| Intent / Problem | Target Repository | Code Module / Path | What to steal & where |
| --- | --- | --- | --- |
| **Additive Forecaster** | `facebook/prophet` | [`python/prophet/forecaster.py`](https://github.com/facebook/prophet/blob/main/python/prophet/forecaster.py) | Trend + seasonality + holidays decomposition for business time series. See [Anomaly & Time Series](../11-anomaly-detection-and-time-series/README.md). |
| **ARIMA / Seasonal Models** | `statsmodels/statsmodels` | [`statsmodels/tsa`](https://github.com/statsmodels/statsmodels/tree/main/statsmodels/tsa) | Classic time-series modeling (ARIMA, STL, state-space). See [Anomaly & Time Series](../11-anomaly-detection-and-time-series/README.md). |
| **Online Anomaly Detection** | `online-ml/river` | [`river/anomaly`](https://github.com/online-ml/river/tree/main/river/anomaly) | Streaming anomaly scorers that update per-sample with no retraining. See [Anomaly & Time Series](../11-anomaly-detection-and-time-series/README.md). |
| **Concept Drift Detection** | `online-ml/river` | [`river/drift`](https://github.com/online-ml/river/tree/main/river/drift) | ADWIN/Page-Hinkley detectors that flag when a stream's distribution shifts. See [Anomaly & Time Series](../11-anomaly-detection-and-time-series/README.md). |
| **Outlier Model Zoo** | `yzhao062/pyod` | [`pyod/models`](https://github.com/yzhao062/pyod/tree/master/pyod/models) | 50+ outlier detectors behind one sklearn-style interface. See [Anomaly & Time Series](../11-anomaly-detection-and-time-series/README.md). |

---

## 12. Fullstack Feature Patterns

Real product features decomposed into their reusable engine.

| Intent / Problem | Target Repository | Code Module / Path | What to steal & where |
| --- | --- | --- | --- |
| **Booking Slot Math** | `calcom/cal.com` | [`packages/lib/availability.ts`](https://github.com/calcom/cal.com/blob/main/packages/lib/availability.ts) | Intersecting availability windows, timezone offsets, and overlap rules. See [Fullstack Patterns](../12-fullstack-feature-patterns/README.md). |
| **Booking Lifecycle** | `calcom/cal.com` | [`packages/lib/bookings`](https://github.com/calcom/cal.com/tree/main/packages/lib/bookings) | Create/reschedule/cancel flows, confirmations, and calendar sync. See [Fullstack Patterns](../12-fullstack-feature-patterns/README.md). |
| **Link Analytics Ingestion** | `dubinc/dub` | [`apps/web/lib/analytics`](https://github.com/dubinc/dub/tree/main/apps/web/lib/analytics) | Recording click events by geo/device/referrer into a columnar store. See [Fullstack Patterns](../12-fullstack-feature-patterns/README.md). |
| **Shared Zod Schemas** | `dubinc/dub` | [`apps/web/lib/zod`](https://github.com/dubinc/dub/tree/main/apps/web/lib/zod) | One schema validating API input, types, and OpenAPI docs. See [Fullstack Patterns](../12-fullstack-feature-patterns/README.md). |
| **High-Throughput Event Ingestion** | `PostHog/posthog` | [`posthog/api/event.py`](https://github.com/PostHog/posthog/blob/master/posthog/api/event.py) | Parse/validate/queue analytics payloads for ClickHouse. See [Fullstack Patterns](../12-fullstack-feature-patterns/README.md). |
| **Local Feature-Flag Evaluation** | `growthbook/growthbook` | [`packages/sdk-js`](https://github.com/growthbook/growthbook/tree/main/packages/sdk-js) | Deterministic hash bucketing (`sha256(userId+seed)`) with zero network latency. See [Fullstack Patterns](../12-fullstack-feature-patterns/README.md). |

---

## 13. Backend Frameworks & Patterns

Routing, hooks, validation, and dependency injection internals.

| Intent / Problem | Target Repository | Code Module / Path | What to steal & where |
| --- | --- | --- | --- |
| **Middleware Dispatch** | `expressjs/express` | [`lib`](https://github.com/expressjs/express/tree/master/lib) | The `next()` middleware chain and router layer everyone reimplements. See [Backend Frameworks](../13-backend-frameworks-and-patterns/README.md). |
| **Lifecycle Hooks** | `fastify/fastify` | [`lib/hooks.js`](https://github.com/fastify/fastify/blob/main/lib/hooks.js) | onRequest/preHandler/onSend hook pipeline implementation. See [Backend Frameworks](../13-backend-frameworks-and-patterns/README.md). |
| **Schema-Based Validation** | `fastify/fastify` | [`lib/validation.js`](https://github.com/fastify/fastify/blob/main/lib/validation.js) | Compiling JSON Schema into fast request validators + serializers. See [Backend Frameworks](../13-backend-frameworks-and-patterns/README.md). |
| **DI Container** | `nestjs/nest` | [`packages/core`](https://github.com/nestjs/nest/tree/master/packages/core) | Module resolution, provider scoping, and the injector graph. See [Backend Frameworks](../13-backend-frameworks-and-patterns/README.md). |
| **Dependency Injection (Python)** | `fastapi/fastapi` | [`fastapi/dependencies`](https://github.com/fastapi/fastapi/tree/master/fastapi/dependencies) | Declarative `Depends()` resolution and sub-dependency caching. See [Backend Frameworks](../13-backend-frameworks-and-patterns/README.md). |
| **ORM Model Layer** | `django/django` | [`django/db/models`](https://github.com/django/django/tree/main/django/db/models) | Active-record models, query sets, and migrations. See [Backend Frameworks](../13-backend-frameworks-and-patterns/README.md). |

---

## 14. Auth & Identity

Tokens, sessions, hashing, and delegated authorization.

| Intent / Problem | Target Repository | Code Module / Path | What to steal & where |
| --- | --- | --- | --- |
| **Self-Service Flow State Machine** | `ory/kratos` | [`selfservice`](https://github.com/ory/kratos/tree/master/selfservice) | Registration/login/recovery modeled as resumable, expiring flow objects. See [Auth & Identity](../22-auth-and-identity/README.md). |
| **Pluggable Password Hashing** | `ory/kratos` | [`hash`](https://github.com/ory/kratos/tree/master/hash) | One `Comparator` interface over Argon2id/bcrypt/scrypt + rehash on login. See [Auth & Identity](../22-auth-and-identity/README.md). |
| **Server Session Lifecycle** | `ory/kratos` | [`session`](https://github.com/ory/kratos/tree/master/session) | Sessions carrying assurance level, persisted and revoked on credential change. See [Auth & Identity](../22-auth-and-identity/README.md). |
| **OAuth2 Consent Handshake** | `ory/hydra` | [`consent`](https://github.com/ory/hydra/tree/master/consent) | Bouncing the user to your login/consent UI, keeping creds out of the token server. See [Auth & Identity](../22-auth-and-identity/README.md). |
| **Auth DB Adapter Interface** | `nextauthjs/next-auth` | [`packages/adapter-drizzle`](https://github.com/nextauthjs/next-auth/tree/main/packages/adapter-drizzle) | The minimal `Adapter` (createUser/getSessionAndUser/linkAccount) one core targets any DB with. See [Auth & Identity](../22-auth-and-identity/README.md). |
| **Plugin-Based Capabilities** | `better-auth/better-auth` | [`packages/better-auth/src/plugins`](https://github.com/better-auth/better-auth/tree/main/packages/better-auth/src/plugins) | 2FA/passkeys/orgs as bolt-on plugins that register routes, schema, hooks. See [Auth & Identity](../22-auth-and-identity/README.md). |
| **JWKS-backed Verification** | `panva/jose` | [`src/jwks`](https://github.com/panva/jose/tree/main/src/jwks) | `createRemoteJWKSet` caching provider keys and selecting by `kid`. See [Auth & Identity](../22-auth-and-identity/README.md). |

---

## 15. Database & ORM

Type-safe queries, migrations, and vector search internals.

| Intent / Problem | Target Repository | Code Module / Path | What to steal & where |
| --- | --- | --- | --- |
| **Migration Generation** | `drizzle-team/drizzle-orm` | [`drizzle-kit`](https://github.com/drizzle-team/drizzle-orm/tree/main/drizzle-kit) | Diffing a schema against the DB to generate SQL migrations. See [Database & ORM](../23-database-and-orm/README.md). |
| **Type-Safe SQL Core** | `drizzle-team/drizzle-orm` | [`drizzle-orm/src/pg-core`](https://github.com/drizzle-team/drizzle-orm/tree/main/drizzle-orm/src/pg-core) | How a query builder stays fully typed from column to result row. See [Database & ORM](../23-database-and-orm/README.md). |
| **Schema → Validator Bridge** | `drizzle-team/drizzle-orm` | [`drizzle-zod`](https://github.com/drizzle-team/drizzle-orm/tree/main/drizzle-zod) | Deriving runtime Zod validators directly from table definitions. See [Database & ORM](../23-database-and-orm/README.md). |
| **SQL → Typed Code (sqlc)** | `sqlc-dev/sqlc` | [`internal/compiler`](https://github.com/sqlc-dev/sqlc/tree/main/internal/compiler) | Parsing raw SQL and emitting typed query functions — the inverse of an ORM. See [Database & ORM](../23-database-and-orm/README.md). |
| **Vector Index (pgvector)** | `pgvector/pgvector` | [`src/hnsw.c`](https://github.com/pgvector/pgvector/blob/master/src/hnsw.c) | An HNSW index implemented as a Postgres extension. See [Database & ORM](../23-database-and-orm/README.md). |
| **Schema Migrator (Go)** | `go-gorm/gorm` | [`migrator`](https://github.com/go-gorm/gorm/tree/master/migrator) | Auto-migration: diffing structs against live table schemas. See [Database & ORM](../23-database-and-orm/README.md). |

---

## 16. Testing & Quality

Mocking, property-based testing, containers, and load testing.

| Intent / Problem | Target Repository | Code Module / Path | What to steal & where |
| --- | --- | --- | --- |
| **Network Mocking** | `mswjs/msw` | [`src/core/handlers`](https://github.com/mswjs/msw/tree/main/src/core/handlers) | Intercepting requests at the network layer so tests hit no real backend. See [Testing & Quality](../24-testing-and-quality/README.md). |
| **E2E Client Protocol** | `microsoft/playwright` | [`packages/playwright-core/src/client`](https://github.com/microsoft/playwright/tree/main/packages/playwright-core/src/client) | How a test driver speaks to a real browser over a typed protocol. See [Testing & Quality](../24-testing-and-quality/README.md). |
| **Property-Based Arbitraries** | `dubzzz/fast-check` | [`packages/fast-check/src/arbitrary`](https://github.com/dubzzz/fast-check/tree/main/packages/fast-check/src/arbitrary) | Generators + shrinkers that find minimal failing inputs automatically. See [Testing & Quality](../24-testing-and-quality/README.md). |
| **Container Wait Strategies** | `testcontainers/testcontainers-node` | [`packages/testcontainers/src/wait-strategies`](https://github.com/testcontainers/testcontainers-node/tree/main/packages/testcontainers/src/wait-strategies) | Knowing a spun-up DB/Kafka container is actually ready before the test runs. See [Testing & Quality](../24-testing-and-quality/README.md). |
| **Assertion / Matcher Engine** | `vitest-dev/vitest` | [`packages/expect/src`](https://github.com/vitest-dev/vitest/tree/main/packages/expect/src) | How `expect(...).toEqual(...)` matchers and diffs are implemented. See [Testing & Quality](../24-testing-and-quality/README.md). |

---

## 17. DevOps & CI/CD

GitOps reconciliation, pipeline runners, and IaC graphs.

| Intent / Problem | Target Repository | Code Module / Path | What to steal & where |
| --- | --- | --- | --- |
| **GitOps Reconciliation Loop** | `argoproj/argo-cd` | [`controller`](https://github.com/argoproj/argo-cd/tree/master/controller) | Continuously diffing desired (Git) vs. live (cluster) state and syncing. See [DevOps & CI/CD](../25-devops-and-ci-cd/README.md). |
| **Source Reconcilers** | `fluxcd/flux2` | [`internal`](https://github.com/fluxcd/flux2/tree/main/internal) | How Git/Helm/OCI sources are pulled and applied on an interval. See [DevOps & CI/CD](../25-devops-and-ci-cd/README.md). |
| **Pipeline DAG (Dagger)** | `dagger/dagger` | [`dagql`](https://github.com/dagger/dagger/tree/main/dagql) | A content-addressed DAG that caches pipeline steps by input hash. See [DevOps & CI/CD](../25-devops-and-ci-cd/README.md). |
| **Local Actions Runner** | `nektos/act` | [`pkg/runner`](https://github.com/nektos/act/tree/master/pkg/runner) | How GitHub Actions workflows are parsed and executed in containers locally. See [DevOps & CI/CD](../25-devops-and-ci-cd/README.md). |
| **Actions Toolkit** | `actions/toolkit` | [`packages/core`](https://github.com/actions/toolkit/tree/main/packages/core) | Inputs/outputs, masking, and step-summary primitives for CI steps. See [DevOps & CI/CD](../25-devops-and-ci-cd/README.md). |
| **IaC Graph & Apply** | `hashicorp/terraform` | [`internal/terraform`](https://github.com/hashicorp/terraform/tree/main/internal/terraform) | Building a resource dependency graph and computing a plan/apply diff. See [DevOps & CI/CD](../25-devops-and-ci-cd/README.md). |

---

## 18. Payments & Billing

Metering, invoicing, webhooks, and idempotency.

| Intent / Problem | Target Repository | Code Module / Path | What to steal & where |
| --- | --- | --- | --- |
| **Usage Event Ingestion** | `getlago/lago-api` | [`app/services/events`](https://github.com/getlago/lago-api/tree/main/app/services/events) | Capturing metered usage events idempotently for downstream billing. See [Payments & Billing](../26-payments-and-billing/README.md). |
| **Fee / Charge Calculation** | `getlago/lago-api` | [`app/services/fees`](https://github.com/getlago/lago-api/tree/main/app/services/fees) | Turning metered usage + plans into line-item fees (tiered/volume/package). See [Payments & Billing](../26-payments-and-billing/README.md). |
| **Invoice Generation** | `getlago/lago-api` | [`app/services/invoices`](https://github.com/getlago/lago-api/tree/main/app/services/invoices) | Assembling fees into finalized, taxed invoices. See [Payments & Billing](../26-payments-and-billing/README.md). |
| **Outbound Webhooks** | `getlago/lago-api` | [`app/services/webhooks`](https://github.com/getlago/lago-api/tree/main/app/services/webhooks) | Signing, queuing, and retrying webhook deliveries to merchants. See [Payments & Billing](../26-payments-and-billing/README.md). |
| **Payment Provider Abstraction** | `medusajs/medusa` | [`packages/modules/payment`](https://github.com/medusajs/medusa/tree/develop/packages/modules/payment) | A provider-agnostic payment module (authorize/capture/refund). See [Payments & Billing](../26-payments-and-billing/README.md). |
| **Metering Aggregation** | `openmeterio/openmeter` | [`openmeter`](https://github.com/openmeterio/openmeter/tree/main/openmeter) | High-throughput usage aggregation over a streaming pipeline. See [Payments & Billing](../26-payments-and-billing/README.md). |

---

## 19. Email & Messaging

Templating, multi-channel orchestration, and reliable delivery.

| Intent / Problem | Target Repository | Code Module / Path | What to steal & where |
| --- | --- | --- | --- |
| **Multi-Channel Workflows** | `novuhq/novu` | [`apps/api/src/app/workflows-v2`](https://github.com/novuhq/novu/tree/next/apps/api/src/app/workflows-v2) | Orchestrating Email/SMS/Push/In-App steps with templates and preferences. See [Email & Messaging](../27-email-and-messaging/README.md). |
| **Event-Triggered Notifications** | `novuhq/novu` | [`apps/api/src/app/events`](https://github.com/novuhq/novu/tree/next/apps/api/src/app/events) | Mapping a single triggered event to fan-out across channels + digests. See [Email & Messaging](../27-email-and-messaging/README.md). |
| **SMTP Connection Pooling** | `nodemailer/nodemailer` | [`lib/smtp-pool`](https://github.com/nodemailer/nodemailer/tree/master/lib/smtp-pool) | Reusing SMTP connections under load without exhausting the server. See [Email & Messaging](../27-email-and-messaging/README.md). |
| **DKIM Signing** | `nodemailer/nodemailer` | [`lib/dkim`](https://github.com/nodemailer/nodemailer/tree/master/lib/dkim) | Cryptographically signing outbound mail for deliverability. See [Email & Messaging](../27-email-and-messaging/README.md). |
| **Email Templating (MJML)** | `mjmlio/mjml` | [`packages/mjml-core`](https://github.com/mjmlio/mjml/tree/master/packages/mjml-core) | Compiling a high-level markup into responsive, client-safe table HTML. See [Email & Messaging](../27-email-and-messaging/README.md). |
| **Campaign Send Manager** | `knadh/listmonk` | [`internal/manager`](https://github.com/knadh/listmonk/tree/master/internal/manager) | Throttled, resumable bulk-send with per-subscriber rendering. See [Email & Messaging](../27-email-and-messaging/README.md). |

---

## 20. State, Reactivity & Data Abstraction

How to manage local or global state, abstract storage APIs, and create type-safe data access layers.

| Intent / Problem | Target Repository | Code Module / Path | What to steal & where |
| --- | --- | --- | --- |
| **Reactive Client Collections** | `TanStack/db` | [`packages/db/src/collection`](https://github.com/TanStack/db/tree/main/packages/db/src/collection) | Typed API records loaded into local collections with lifecycle, indexes, subscriptions, sync hooks, and mutations. See [TanStack & Frontend Architecture](../16-tanstack-and-frontend-architecture/README.md). |
| **Live Query React Binding** | `TanStack/db` | [`packages/react-db/src/useLiveQuery.ts`](https://github.com/TanStack/db/blob/main/packages/react-db/src/useLiveQuery.ts) | Subscribing React components to live query results so joins, filters, and derived state update without hand-built component state graphs. See [TanStack & Frontend Architecture](../16-tanstack-and-frontend-architecture/README.md). |
| **Query-Backed Collection Sync** | `TanStack/db` | [`packages/query-db-collection/src/query.ts`](https://github.com/TanStack/db/blob/main/packages/query-db-collection/src/query.ts) | Letting TanStack Query keep the fetch/cache contract while DB turns fetched rows into queryable collections. See [TanStack & Frontend Architecture](../16-tanstack-and-frontend-architecture/README.md). |
| **Electric Sync Collection Adapter** | `TanStack/db` | [`packages/electric-db-collection/src/electric.ts`](https://github.com/TanStack/db/blob/main/packages/electric-db-collection/src/electric.ts) | Feeding backend sync-engine changes into the same local collection model used by components. See [TanStack & Frontend Architecture](../16-tanstack-and-frontend-architecture/README.md). |
| **Multi-Driver Adapter Abstraction** | `unjs/unstorage` | [`drivers/`](https://github.com/unjs/unstorage/tree/main/src/drivers) | A single async wrapper mapping `getItem`/`setItem` to Redis, FileSystem, and S3 drivers. See [Modular TS Utilities](../18-modular-typescript-utilities-and-state/README.md). |
| **Bring-Your-Own-FileSystem** | `isomorphic-git` | [`src/models/FileSystem.js`](https://github.com/isomorphic-git/isomorphic-git/blob/main/src/models/FileSystem.js) | Requiring callers to pass an `fs` adapter (Node `fs`, browser IndexedDB) for all I/O. See [Git Internals](../21-git-internals-and-compilation-toolchains/README.md). |
| **ES6 Dynamic Client Proxying** | `trpc/trpc` | [`packages/client/src/links`](https://github.com/trpc/trpc/tree/main/packages/client/src/links) | `new Proxy()` intercepting nested caller properties (`api.user.get()`) into fetch requests. See [Modular TS Utilities](../18-modular-typescript-utilities-and-state/README.md). |

---

## 21. Low-Level Compilation, Sandboxing & Wasm

How to manage sandboxed scripting engines, JIT compiling, thread serialization, and DOM layout precomputations.

| Intent / Problem | Target Repository | Code Module / Path | What to steal & where |
| --- | --- | --- | --- |
| **Dynamic Host-Wasm Memory Freeing** | `extism/extism` | [`runtime/src/`](https://github.com/extism/extism/tree/main/runtime/src) | Allocating linear memory, passing pointers to a guest plug-in, reading results, and GCing. See [WebAssembly](../19-webassembly-and-low-level-runtimes/README.md). |
| **JS Interpreter Sandboxing** | `bytecodealliance/javy` | [`crates/quickjs-wasm-sys/`](https://github.com/bytecodealliance/javy/tree/main/crates/quickjs-wasm-sys) | Embedding QuickJS as a static lib inside Wasm to evaluate untrusted JS securely. See [WebAssembly](../19-webassembly-and-low-level-runtimes/README.md). |
| **DOM-Bypass Layout Arithmetic** | `chenglou/pretext` | [`src/pretext.ts`](https://github.com/chenglou/pretext/blob/main/src/pretext.ts) | Capturing bounding boxes with `canvas.measureText()`, caching, and pure-math layout loops. See [WebAssembly](../19-webassembly-and-low-level-runtimes/README.md). |
| **Multithreaded Pack Delta Resolution** | `Byron/gitoxide` | [`gix-pack/src/cache/`](https://github.com/Byron/gitoxide/tree/main/gix-pack/src/cache) | Resolving delta-compressed diffs inside packfiles in lock-free threads. See [Git Internals](../21-git-internals-and-compilation-toolchains/README.md). |
| **GC-Free Concurrent Linking** | `evanw/esbuild` | [`pkg/cli/`](https://github.com/evanw/esbuild/tree/main/pkg/cli) | Tokenizing across cores and link-offsetting directly into a single output buffer. See [Git Internals](../21-git-internals-and-compilation-toolchains/README.md). |
| **Lockfile Input Build Hashing** | `vercel/turbo` | [`crates/turbo-tasks/`](https://github.com/vercel/turbo/tree/main/crates/turbo-tasks) | Mapping input file hash trees and caching outputs by git reference. See [Git Internals](../21-git-internals-and-compilation-toolchains/README.md). |

---

## 22. AI Workflows, Agents & Advanced RAG

How to implement task graph runners, evaluate vector nodes, expand queries, and structure layout-aware document chunkers.

| Intent / Problem | Target Repository | Code Module / Path | What to steal & where |
| --- | --- | --- | --- |
| **State Graphs & Checkpoint Rewinds** | `langchain-ai/langgraph` | [`libs/sdk/`](https://github.com/langchain-ai/langgraph) | Saving an execution checkpoint after every node transition for time-travel + recovery. See [Agentic Workflows](../17-agentic-workflows-and-mcp-servers/README.md). |
| **Visual Accessibility Tree Extractors** | `browserbase/stagehand` | [`lib/`](https://github.com/browserbase/stagehand) | Transforming raw DOM into a clean accessibility hierarchy and converting it to LLM actions. See [Agentic Workflows](../17-agentic-workflows-and-mcp-servers/README.md). |
| **Zod Function Schema Parsers** | `mastra-ai/mastra` | [`packages/core/src/tools`](https://github.com/mastra-ai/mastra/tree/main/packages/core/src/tools) | Converting TS functions into Zod validation schemas for LLM tool calls. See [Agentic Workflows](../17-agentic-workflows-and-mcp-servers/README.md). |
| **Layout-Aware OCR Document Parsing** | `infiniflow/ragflow` | [`rag/app/`](https://github.com/infiniflow/ragflow/tree/main/rag/app) | Keeping related table rows in one chunk by analyzing PDF layout before embedding. See [Advanced RAG](../20-advanced-rag-and-document-parsing/README.md). |
| **Hierarchical Parent-Child Chunking** | `run-llama/llama_index` | [`node-parser/`](https://github.com/run-llama/llama_index/tree/main/llama-index-core/llama_index/core/node_parser) | Matching on tiny child chunks but passing parent chunks to the LLM. See [Advanced RAG](../20-advanced-rag-and-document-parsing/README.md). |
| **Self-Reflection Verification Loops** | `NirDiamant/RAG_Techniques` | [`self_rag.ipynb`](https://github.com/NirDiamant/RAG_Techniques/blob/main/all_rag_techniques/self_rag.ipynb) | Checking retrieval relevance and self-correcting when retrieved data lacks facts. See [Advanced RAG](../20-advanced-rag-and-document-parsing/README.md). |
