# Query Engines And Data Processing

Walk in here when the functionality is "filter/sort/group/join/query lots of data efficiently." Behind every `SELECT` lives a pipeline that almost every engine shares: parse SQL into an abstract syntax tree, bind it to a logical plan (relational algebra — scans, filters, joins, aggregates), rewrite that plan with an optimizer (push filters down to the scan, reorder joins, prune columns), lower it to a physical plan (hash join vs merge join, which index to use), then execute. Once you see that pipeline, an intimidating database codebase turns into a row of well-understood stages — and you only need to walk out with the one stage you came for.

The engines make that easy, because the stages are deliberately separated. DataFusion ships its `optimizer`, `physical-plan`, and `sql` crates as independent packages you can depend on à la carte. DuckDB cleanly splits `parser/`, `planner/`, `optimizer/`, and `execution/`. Calcite is *nothing but* a reusable planner — products plug their own data sources into its cost-based optimizer. Whether the product is an embedded analytics DB, a dataframe library, or a federated query layer, the underlying intent of each module — predicate pushdown, the volcano execution model, cost-based join ordering, columnar batching — is a pattern you can lift directly into your own data-processing code.

## Repos

| Link | Good For | What to steal |
| --- | --- | --- |
| [duckdb/duckdb](https://github.com/duckdb/duckdb) | Embedded analytical SQL database. | Steal vectorized execution, local analytics, query planning, storage, and SQL functions. |
| [apache/datafusion](https://github.com/apache/datafusion) | Extensible Rust query engine using Apache Arrow. | Steal SQL parsing, logical plans, optimization, physical plans, and execution. |
| [pola-rs/polars](https://github.com/pola-rs/polars) | Fast dataframe/query engine. | Steal lazy execution, query optimization, streaming, expression APIs, and Arrow-backed data. |
| [ClickHouse/ClickHouse](https://github.com/ClickHouse/ClickHouse) | Column-oriented real-time analytics database. | Steal OLAP storage, columnar execution, ingestion, aggregation, and distributed analytics. |
| [apache/arrow](https://github.com/apache/arrow) | Columnar memory format and compute ecosystem. | Steal the data format many engines use to exchange data efficiently. |
| [dragonflydb/dragonfly](https://github.com/dragonflydb/dragonfly) | Modern multi-threaded in-memory datastore, Redis/Memcached compatible. | Steal shared-nothing architecture, novel cache algorithms, and high-throughput data serving. |
| [delta-io/delta](https://github.com/delta-io/delta) | Open-source storage framework for data lakes (Delta Lake). | Steal ACID transactions on data lakes, time travel, schema enforcement, and Lakehouse architecture. |
| [apache/iceberg](https://github.com/apache/iceberg) | High-performance table format for large analytic tables. | Steal table metadata, partitioning, snapshot isolation, and schema evolution at scale. |
| [apache/calcite](https://github.com/apache/calcite) | Pluggable SQL parser and cost-based query optimizer. | Steal a reusable planner: relational algebra (`rel`), rewrite rules, and the Volcano/Cascades cost-based optimizer many engines embed. |
| [sqlite/sqlite](https://github.com/sqlite/sqlite) | The most-deployed embedded SQL engine. | Steal the bytecode VDBE execution model, the `where.c` query planner, and B-tree storage in compact, heavily-commented C. |

## 2. The Anatomy of Large Repos: Decomposing "Stealable" Modules

A query engine reads as a monolith but is built as a pipeline, and the best codebases make every stage a separate module. DataFusion publishes each stage as its own crate; DuckDB gives each a top-level directory under `src/`; Calcite is a planner with no execution engine at all, designed to be embedded. Decompose along the parse -> plan -> optimize -> execute seam and each module becomes individually liftable.

### Decomposed Module Index

| Intent | Product / Repo | Target Module / Directory | What to steal |
| --- | --- | --- | --- |
| **Vectorized Execution** | DuckDB | [`src/execution`](https://github.com/duckdb/duckdb/tree/main/src/execution) | How a push-based, vectorized operator pipeline processes batches of ~2048 values at a time instead of row-at-a-time, for cache-friendly throughput. |
| **Rule-Based Optimizer** | DuckDB | [`src/optimizer`](https://github.com/duckdb/duckdb/tree/main/src/optimizer) | How filter pushdown, join-order optimization, and expression rewriting are applied as a sequence of plan-rewrite passes. |
| **Logical Planning** | DuckDB | [`src/planner`](https://github.com/duckdb/duckdb/tree/main/src/planner) | How a bound SQL statement becomes a tree of logical operators (relational algebra) before physical planning. |
| **Physical Plan Operators** | Apache DataFusion | [`datafusion/physical-plan`](https://github.com/apache/datafusion/tree/main/datafusion/physical-plan) | How `ExecutionPlan` operators (hash join, sort, aggregate) implement a streaming `RecordBatch` iterator model over Arrow. |
| **Plan Optimization Rules** | Apache DataFusion | [`datafusion/optimizer`](https://github.com/apache/datafusion/tree/main/datafusion/optimizer) | How predicate pushdown, projection pushdown, and constant folding are written as composable `OptimizerRule`s over a logical plan. |
| **SQL to Logical Plan** | Apache DataFusion | [`datafusion/sql`](https://github.com/apache/datafusion/tree/main/datafusion/sql) | How a SQL AST is bound against a schema and lowered into the `LogicalPlan` enum — the front door of the engine. |
| **Bytecode Execution (VDBE)** | SQLite | [`src/vdbe.c`](https://github.com/sqlite/sqlite/blob/master/src/vdbe.c) | How SQL compiles to a register-based bytecode program run by a giant opcode switch — a radically different execution model from volcano/vectorized. |
| **Cost-Based Query Planner** | SQLite | [`src/where.c`](https://github.com/sqlite/sqlite/blob/master/src/where.c) | How index selection and join ordering are chosen by estimating the cost of each access path; the planner heart of an embedded DB. |
| **Reusable Cost-Based Optimizer** | Apache Calcite | [`core/.../plan`](https://github.com/apache/calcite/tree/main/core/src/main/java/org/apache/calcite/plan) and [`rel`](https://github.com/apache/calcite/tree/main/core/src/main/java/org/apache/calcite/rel) | How a Volcano/Cascades optimizer explores equivalent plans via transformation rules and picks the cheapest by cost — the planner countless engines embed. |

---

## Functional Patterns

- **Parse -> bind -> plan -> optimize -> execute**: The universal query lifecycle. Each stage has one job and a clean handoff (AST, then logical plan, then optimized plan, then physical plan), which is why engines can swap components.
- **Volcano / iterator model**: Every operator exposes `next()` and pulls rows from its children; a query plan is a tree of these, and execution is just calling `next()` on the root until it's drained.
- **Vectorized / push-based execution**: Instead of one row per `next()`, operators push columnar batches (e.g. 2048 values) downstream — amortizing per-call overhead and keeping data in CPU cache.
- **Predicate & projection pushdown**: Move filters and column pruning as close to the scan as possible so the engine reads and materializes the least data.
- **Cost-based join reordering**: Estimate cardinalities and pick the join order (and join algorithm) that minimizes intermediate result size, rather than executing joins in written order.

### Volcano-model operator: hash-join `next()`

The iterator model in miniature. The hash-join operator builds a hash table from its right child once, then pulls left rows and probes — every operator in a volcano engine looks like this.

```python
class HashJoin:
    def __init__(self, left, right, left_key, right_key):
        self.left, self.right = left, right
        self.left_key, self.right_key = left_key, right_key
        self.table = None
        self.buffer = []

    def open(self):
        self.left.open(); self.right.open()
        self.table = {}                      # build phase: hash the right side
        while (row := self.right.next()) is not None:
            self.table.setdefault(self.right_key(row), []).append(row)

    def next(self):
        while True:
            if self.buffer:                  # drain pending matches first
                return self.buffer.pop()
            left = self.left.next()          # probe phase: pull from the left
            if left is None:
                return None
            self.buffer = [
                {**left, **r} for r in self.table.get(self.left_key(left), [])
            ]
```

### Predicate pushdown as a plan rewrite

The single highest-value optimizer rule: push a `Filter` below a `Projection` (and ultimately into the scan) so less data flows up the tree.

```python
def push_filter_below_projection(node):
    # Filter(Projection(child))  ->  Projection(Filter(child))
    if node.op == "Filter" and node.child.op == "Projection":
        proj = node.child
        if predicate_refs_only(node.predicate, proj.input_columns):
            return Projection(
                columns=proj.columns,
                child=Filter(predicate=node.predicate, child=proj.child),
            )
    return node
```

### Cost-based join reordering

Reorder a chain of joins so the smallest intermediate results are produced first, using cardinality estimates. This is the kernel of what Calcite's Volcano optimizer and SQLite's `where.c` do at scale.

```python
def best_join_order(relations, estimate_card, join_cost):
    # Greedy: repeatedly join the pair yielding the smallest result so far.
    plan = min(relations, key=estimate_card)
    remaining = [r for r in relations if r is not plan]
    while remaining:
        nxt = min(remaining, key=lambda r: join_cost(plan, r))
        plan = Join(plan, nxt, est=estimate_card(plan) * estimate_card(nxt))
        remaining.remove(nxt)
    return plan
```

## Functional Use Cases

- SQL to logical plan.
- Logical plan to optimized plan.
- Physical execution plan.
- Columnar memory layout.
- Vectorized execution.
- Predicate pushdown.
- Lazy evaluation.
- Streaming larger-than-memory datasets.
- Aggregation and joins.

## The Lift

- Query planning architecture.
- How expressions are represented.
- How filters move closer to the data source.
- Memory model and batch size choices.
- How errors and type coercion are handled.

## Search Inside

`logical plan`, `physical plan`, `optimizer`, `predicate pushdown`, `projection`, `join`, `aggregate`, `vectorized`, `columnar`, `arrow`, `parquet`, `streaming`, `lazy`.

