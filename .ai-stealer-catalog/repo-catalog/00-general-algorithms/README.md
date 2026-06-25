# General Algorithms

Walk in here when you need the basic shape of an algorithm or data structure and want to lift it, not reinvent it. The educational repos below hand you the clean version of the part — the input/output contract, the invariant a data structure maintains, the complexity tradeoff you are buying — so you can recover the canonical form of a heap, a trie, a graph traversal, or a dynamic-programming recurrence without dragging in the weight (and opinions) of a full library.

There is a better version of most of these parts, though, and it is rarely the textbook one. The same heap, the same shortest-path search, the same hashing trick lives inside production systems where it has already been hardened against real load. So this page pairs the teaching repos with a map of where those algorithms actually sit in shipping code — the priority queue inside a scheduler, the PageRank iteration inside a graph database, the consistent-hashing ring inside a cache — so you can take the battle-tested version off the shelf instead of the merely clean one.

## Repos

| Link | Good For | What to steal |
| --- | --- | --- |
| [TheAlgorithms/Python](https://github.com/TheAlgorithms/Python) | Large educational catalogue of algorithms and data structures in Python. | Good first stop for readable implementations. Do not assume it is production-optimized. |
| [trekhleb/javascript-algorithms](https://github.com/trekhleb/javascript-algorithms) | JavaScript algorithms with explanations. | Useful when you want implementation plus README-level explanation. |
| [algorithm-visualizer/algorithm-visualizer](https://github.com/algorithm-visualizer/algorithm-visualizer) | Visual walkthroughs of algorithms. | Use when the process matters more than the final code. |
| [tayllan/awesome-algorithms](https://github.com/tayllan/awesome-algorithms) | Curated map of algorithm resources. | Good for finding theory, practice, cheat sheets, and deeper material. |
| [keon/algorithms](https://github.com/keon/algorithms) | Minimal, idiomatic Python implementations. | Use when you want one short reference file per algorithm rather than a sprawling course. |

---

## 1. The Anatomy of Large Repos: Decomposing "Stealable" Modules

A teaching repo shows you a heap in isolation. A production repo shows you a heap that has survived contention, eviction policy, and a profiler. When you need the *real* shape of an algorithm — the version with the off-by-one already fixed and the degenerate input already handled — find where it lives inside a shipping system and read that. Below, each row maps a classic algorithm or data structure to a directory in a real codebase where it does load-bearing work.

### Decomposed Module Index

| Intent | Product / Repo | Target Module / Directory | What to steal |
| --- | --- | --- | --- |
| **Binary heap / priority queue** | CPython | [`Lib/heapq.py`](https://github.com/python/cpython/blob/main/Lib/heapq.py) | The reference sift-up/sift-down, `nlargest`/`nsmallest` top-K, and `merge` of sorted streams — the canonical heap most languages copy. |
| **Consistent hashing ring** | groupcache | [`consistenthash/consistenthash.go`](https://github.com/golang/groupcache/blob/master/consistenthash/consistenthash.go) | How to map keys to nodes with virtual replicas so adding/removing a node only remaps `1/N` of keys. Tiny, complete, production. |
| **LRU eviction cache** | groupcache | [`lru/lru.go`](https://github.com/golang/groupcache/blob/master/lru/lru.go) | A doubly-linked list + map LRU — the textbook structure exactly as used in a real cache. |
| **Trie / prefix automaton** | Meilisearch | [`crates/milli`](https://github.com/meilisearch/meilisearch/tree/main/crates/milli) | How prefix search and typo tolerance are built over an FST/inverted index rather than a naive pointer trie. |
| **Shortest path on a road graph** | Valhalla | [`src/thor`](https://github.com/valhalla/valhalla/tree/master/src/thor) | A bidirectional A*/Dijkstra over a tiled graph with turn costs — the algorithm under real routing. |
| **Topological sort / DAG scheduling** | Apache Airflow | [`airflow-core/src/airflow/utils`](https://github.com/apache/airflow/tree/main/airflow-core/src/airflow/utils) | Cycle detection (`dag.check_cycle()`) and dependency ordering as it actually guards a task scheduler. |
| **PageRank power iteration** | NetworkX | [`networkx/algorithms/link_analysis/pagerank_alg.py`](https://github.com/networkx/networkx/blob/main/networkx/algorithms/link_analysis/pagerank_alg.py) | The damping factor, dangling-node handling, and convergence check of a well-tested PageRank. |
| **Reservoir / weighted sampling** | Redis | [`src/t_zset.c`](https://github.com/redis/redis/blob/unstable/src/t_zset.c) | `ZRANDMEMBER`-style sampling and the skip-list backing sorted sets — sampling and ordered structures under real load. |

---

## Functional Patterns

- **Recover the contract before the code.** For any algorithm, first pin down input shape, output shape, and the invariant (heap property, sorted order, acyclicity). The implementation is mechanical once the contract is fixed.
- **Heap for "top-K of a stream."** Whenever you want the K best of a large or unbounded set without sorting everything, a bounded min-heap is the move: push, and if size exceeds K pop the smallest. O(n log K), O(K) memory.
- **Hashing to avoid coordination.** Consistent hashing and bucket hashing replace a central allocator with pure arithmetic — the same trick used for cache sharding, feature-flag bucketing, and load balancing.
- **Iterate to a fixed point.** PageRank, label propagation, and many graph scores are just "multiply by the transition matrix until it stops changing." Recognize the power-iteration shape and you can implement a whole family.
- **Pick the simple version on purpose.** Know the complexity you are buying, and know the line past which you should hand the problem to a library (a real B-tree, a real ANN index) instead of your own.

### Stealable: bounded-heap top-K of a stream

```python
import heapq

def top_k(stream, k, key=lambda x: x):
    """K largest items by `key`, O(n log k) time, O(k) memory."""
    heap = []  # min-heap of (key, item); smallest sits at heap[0]
    for item in stream:
        score = key(item)
        if len(heap) < k:
            heapq.heappush(heap, (score, item))
        elif score > heap[0][0]:
            heapq.heapreplace(heap, (score, item))  # pop-min + push, one sift
    return [item for _, item in sorted(heap, reverse=True)]
```

### Stealable: PageRank power-iteration step

```python
def pagerank(adj, damping=0.85, eps=1e-8, max_iter=100):
    """adj: {node: [out-neighbors]}. Returns a score dict summing to 1."""
    nodes = list(adj)
    n = len(nodes)
    rank = {u: 1.0 / n for u in nodes}
    for _ in range(max_iter):
        nxt = {u: (1.0 - damping) / n for u in nodes}
        dangling = sum(rank[u] for u in nodes if not adj[u])
        for u in nodes:
            share = damping * dangling / n          # spread dead-end mass evenly
            nxt[u] += share
        for u in nodes:
            outs = adj[u]
            if not outs:
                continue
            contrib = damping * rank[u] / len(outs)  # split rank across out-edges
            for v in outs:
                nxt[v] += contrib
        if sum(abs(nxt[u] - rank[u]) for u in nodes) < eps:  # L1 convergence
            return nxt
        rank = nxt
    return rank
```

### Stealable: consistent-hashing ring with virtual nodes

```python
import bisect, hashlib

class HashRing:
    def __init__(self, nodes, vnodes=100):
        self.ring = {}          # hash -> node
        self.keys = []          # sorted hashes
        for node in nodes:
            for i in range(vnodes):
                h = self._hash(f"{node}:{i}")
                self.ring[h] = node
                bisect.insort(self.keys, h)

    def _hash(self, s):
        return int(hashlib.md5(s.encode()).hexdigest(), 16)

    def node_for(self, key):
        if not self.keys:
            return None
        h = self._hash(key)
        i = bisect.bisect(self.keys, h) % len(self.keys)  # wrap around the ring
        return self.ring[self.keys[i]]
```

## The Lift

- Input/output shape.
- Edge cases.
- Time and memory complexity.
- When the simple version is enough.
- When the production version should come from a library.

## Search Inside

`sort`, `heap`, `trie`, `tree`, `graph`, `dynamic programming`, `hash`, `cache`, `bfs`, `dfs`, `dijkstra`, `pagerank`, `matching`, `sampling`.

