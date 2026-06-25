# Graphs And Networks

Come here when you need the part that models and queries relationships: follows, dependencies, links, influence, trust, recommendations, communities, shortest paths, and "things connected to this thing." Once a feature depends on the structure between entities rather than the entities themselves, you are doing graph work, and the same small set of primitives — adjacency representation, traversal (BFS/DFS), weighted shortest path (Dijkstra/A*), centrality (PageRank), and community detection — show up whether you are building a social feed, a package resolver, a fraud signal, or a recommendation rail.

You rarely need a whole graph framework wired into production; more often you need exactly one algorithm — a Dijkstra with the right priority queue, a power-iteration PageRank, a Louvain community pass — adapted to your own adjacency structure. These libraries are worth raiding precisely because each algorithm sits in its own readable module with the textbook math made concrete. Lift the module, keep the intent, and run the 30 lines that matter against your data.

## 1. Repos

| Link | Good For | What to steal |
| --- | --- | --- |
| [networkx/networkx](https://github.com/networkx/networkx) | Python graph algorithms and prototyping. | Great first stop for experimenting with graph ideas before optimizing. |
| [igraph/igraph](https://github.com/igraph/igraph) | Faster graph/network analysis library. | Useful when NetworkX is too slow or you need broader graph analytics. |
| [briatte/awesome-network-analysis](https://github.com/briatte/awesome-network-analysis) | Network analysis catalogue. | Use for graph datasets, tools, papers, visualization, and domain examples. |
| [taynaud/python-louvain](https://github.com/taynaud/python-louvain) | Louvain community detection on NetworkX graphs. | Steal modularity-based community detection in a small, focused codebase you can read in one sitting. |
| [graphology/graphology](https://github.com/graphology/graphology) | JavaScript/TypeScript graph library. | Steal an adjacency-based graph model plus traversal, layout, and metrics for browser/Node graph features. |

## 2. The Anatomy of Large Repos: Decomposing "Stealable" Modules

A graph library is not one algorithm; it is a catalogue of them sharing a common graph object. The trap is treating NetworkX or igraph as a dependency to import wholesale. Instead, treat each algorithm module as a self-contained recipe: the file tells you the data structures (a priority queue here, a residual graph there), the termination condition, and the numerical tolerances that production code actually needs. Map the directory to the intent, lift the recipe, and run it against your own adjacency lists.

### Decomposed Module Index

| Intent | Product / Repo | Target Module / Directory | What to steal |
| --- | --- | --- | --- |
| **Weighted shortest path** | NetworkX | [`networkx/algorithms/shortest_paths/weighted.py`](https://github.com/networkx/networkx/blob/main/networkx/algorithms/shortest_paths/weighted.py) | How Dijkstra and Bellman-Ford are implemented with a binary-heap frontier, predecessor tracking for path reconstruction, and negative-edge handling. |
| **Heuristic shortest path** | NetworkX | [`networkx/algorithms/shortest_paths/astar.py`](https://github.com/networkx/networkx/blob/main/networkx/algorithms/shortest_paths/astar.py) | How A* layers an admissible heuristic on top of Dijkstra to prune the frontier — the basis of routing and "fewest hops to X" features. |
| **Influence / ranking** | NetworkX | [`networkx/algorithms/link_analysis/pagerank_alg.py`](https://github.com/networkx/networkx/blob/main/networkx/algorithms/link_analysis/pagerank_alg.py) | How PageRank is computed by power iteration with a damping factor, dangling-node handling, and a convergence tolerance. |
| **Community detection** | python-louvain | [`community/community_louvain.py`](https://github.com/taynaud/python-louvain/blob/master/community/community_louvain.py) | How modularity-gain greedy moves plus graph aggregation discover clusters/subcultures without a preset number of communities. |
| **Centrality metrics** | igraph | [`src/centrality`](https://github.com/igraph/igraph/tree/main/src/centrality) | How betweenness, closeness, and eigenvector centrality are computed efficiently in C — the engine behind "most influential node" features. |
| **Connectivity & components** | igraph | [`src/connectivity`](https://github.com/igraph/igraph/tree/main/src/connectivity) | How connected components, articulation points, and min-cuts are found — useful for "is this network partitioned?" and resilience analysis. |
| **Max-flow / matching** | NetworkX | [`networkx/algorithms/flow`](https://github.com/networkx/networkx/tree/main/networkx/algorithms/flow) | How max-flow/min-cut and bipartite matching are structured — the basis of assignment, allocation, and bipartite recommendation problems. |
| **Bipartite projections** | NetworkX | [`networkx/algorithms/bipartite`](https://github.com/networkx/networkx/tree/main/networkx/algorithms/bipartite) | How a users-to-items bipartite graph is projected onto a one-mode similarity graph — the skeleton of collaborative-filtering recommendations. |

## Functional Patterns

- Social graph: users, follows, mutes, blocks.
- Interaction graph: user -> item edges from clicks, likes, comments, saves.
- Bipartite graph: users connected to posts/products/topics.
- Trust graph: identity, reputation, fraud, abuse signals.
- Dependency graph: tasks, packages, documents, pages, permissions.
- Community detection: clusters, subcultures, interest groups.
- Graph ranking: PageRank-style influence or importance.

## The Lift

- Graph model: nodes, edge types, weights, timestamps.
- Whether the graph should be directed or undirected.
- Centrality and ranking metrics.
- Community detection and connected components.
- Incremental updates vs batch recomputation.

## Stealable Snippets

**BFS shortest path (unweighted).** The "fewest hops between two users/items" primitive. A queue plus a visited set, recording each node's parent so the path can be reconstructed.

```python
from collections import deque

def bfs_path(adj, src, dst):
    if src == dst:
        return [src]
    parent, q = {src: None}, deque([src])
    while q:
        u = q.popleft()
        for v in adj[u]:
            if v not in parent:
                parent[v] = u
                if v == dst:                      # found it: walk parents back
                    path = [v]
                    while path[-1] is not None:
                        path.append(parent[path[-1]])
                    return path[-2::-1]           # drop the None, reverse
                q.append(v)
    return None
```

**Dijkstra with a priority queue (weighted).** The same shape NetworkX uses: a min-heap frontier keyed by tentative distance, with stale heap entries skipped by comparing against the best known distance.

```python
import heapq

def dijkstra(adj, src):
    """adj[u] = list of (neighbor, weight>=0). Returns dist dict."""
    dist = {src: 0}
    pq = [(0, src)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist.get(u, float("inf")):
            continue                              # stale entry, skip
        for v, w in adj[u]:
            nd = d + w
            if nd < dist.get(v, float("inf")):
                dist[v] = nd
                heapq.heappush(pq, (nd, v))
    return dist
```

**PageRank by power iteration.** The influence/importance score. Repeatedly redistribute rank across out-edges with a damping factor `d`, until the change between iterations falls under a tolerance.

```python
def pagerank(adj, d=0.85, tol=1e-6, max_iter=100):
    nodes = list(adj)
    n = len(nodes)
    rank = {u: 1 / n for u in nodes}
    for _ in range(max_iter):
        new = {u: (1 - d) / n for u in nodes}
        for u in nodes:
            outs = adj[u]
            share = d * rank[u] / len(outs) if outs else 0
            for v in outs:
                new[v] += share
        # dangling nodes (no out-edges) leak rank; redistribute it evenly
        leaked = d * sum(rank[u] for u in nodes if not adj[u]) / n
        for u in nodes:
            new[u] += leaked
        if sum(abs(new[u] - rank[u]) for u in nodes) < tol:
            return new
        rank = new
    return rank
```

## Search Inside

`pagerank`, `centrality`, `community`, `connected components`, `shortest path`, `bipartite`, `clustering`, `graph embedding`, `neighbors`, `degree`, `traversal`.

