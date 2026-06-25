# Streaming And Approximation

Come here when you need to answer questions about enormous or unbounded data streams in fixed memory, trading a little accuracy for a lot of resources. When you cannot afford to store every event, the part you want is a sketch: a compact data structure that approximates a query (cardinality, frequency, membership, quantiles, top-k) with provable error bounds. The same handful of structures — Bloom filter, HyperLogLog, Count-Min Sketch, t-digest, reservoir sample, MinHash — power "unique visitors today," "is this URL malicious," "trending hashtags," and "p99 latency" across nearly every analytics and infrastructure system.

Sketches are unusually easy to walk off with. Each one is a small, self-contained algorithm with a tight contract: an `add`/`update` operation, an `estimate`/`query` operation, and — crucially for distributed systems — a `merge` operation so per-shard sketches can be combined into a global answer. Lift one clean implementation and the rest port themselves, because the math (hashing into registers or counters, taking a harmonic mean or a minimum) is the same everywhere. The interesting differences are in error bounds, mergeability, and how counters age out over time windows.

## 1. Repos

| Link | Good For | What to steal |
| --- | --- | --- |
| [alecmocatta/streaming_algorithms](https://github.com/alecmocatta/streaming_algorithms) | Rust implementations of streaming algorithms. | Steal Count-Min Sketch, Top-K, HyperLogLog, and reservoir sampling. |
| [Callidon/bloom-filters](https://github.com/Callidon/bloom-filters) | JS/TS probabilistic data structures. | Steal Bloom filters, HyperLogLog, Count-Min Sketch, Top-K, MinHash, and XOR filters. |
| [yfedoseev/sketch_oxide](https://github.com/yfedoseev/sketch_oxide) | Collection of sketch algorithms. | Good broader catalogue of modern sketching approaches. |
| [apache/datasketches-java](https://github.com/apache/datasketches-java) | Production-grade sketch library (Apache). | Steal battle-tested, mergeable implementations of HLL, CPC, KLL/quantiles, frequencies, theta, and t-digest with rigorous error analysis. |
| [redis/redis](https://github.com/redis/redis) | In-memory data store with built-in HyperLogLog. | Steal a real HLL implementation (`PFADD`/`PFCOUNT`) including the sparse/dense register encoding and bias correction. |

## 2. The Anatomy of Large Repos: Decomposing "Stealable" Modules

Sketch libraries are unusually friendly to decomposition: each probabilistic structure is its own module with a near-identical `add` / `estimate` / `merge` surface. The trap is reaching for a whole library when you needed one 40-line counter. Map each file to the question it answers — "how many distinct?", "how often?", "have I seen this?", "what's the p99?" — and lift just that one. Pay special attention to the register/counter encoding and the merge operation, since those are what make a sketch correct across shards.

### Decomposed Module Index

| Intent | Product / Repo | Target Module / Directory | What to steal |
| --- | --- | --- | --- |
| **Approximate cardinality** | streaming_algorithms | [`src/distinct.rs`](https://github.com/alecmocatta/streaming_algorithms/blob/master/src/distinct.rs) | How HyperLogLog buckets hashed items into registers, takes the harmonic mean of leading-zero counts, and applies small/large-range bias correction. |
| **Production HLL with encoding** | Redis | [`src/hyperloglog.c`](https://github.com/redis/redis/blob/unstable/src/hyperloglog.c) | How a real HLL switches between a sparse and dense register representation to stay tiny at low cardinality, plus the HLL++ bias tables. |
| **Approximate frequency** | streaming_algorithms | [`src/count_min.rs`](https://github.com/alecmocatta/streaming_algorithms/blob/master/src/count_min.rs) | How Count-Min Sketch hashes into `d` rows of counters and takes the minimum across rows to bound overestimation. |
| **Heavy hitters / top-k** | streaming_algorithms | [`src/top.rs`](https://github.com/alecmocatta/streaming_algorithms/blob/master/src/top.rs) | How a Count-Min Sketch is paired with a bounded heap to track the most frequent items without storing every key. |
| **Fair sampling** | streaming_algorithms | [`src/sample.rs`](https://github.com/alecmocatta/streaming_algorithms/blob/master/src/sample.rs) | How reservoir sampling keeps a uniform sample of an unbounded stream in fixed space using decreasing replacement probability. |
| **Streaming quantiles (p50/p99)** | t-digest | [`core/src/main/java/com/tdunning/math/stats/MergingDigest.java`](https://github.com/tdunning/t-digest/blob/main/core/src/main/java/com/tdunning/math/stats/MergingDigest.java) | How centroids are sized by a scale function so tail quantiles stay accurate, and how two digests merge — the standard for latency percentiles. |
| **Mergeable quantiles (KLL)** | Apache DataSketches | [`src/main/java/org/apache/datasketches/kll`](https://github.com/apache/datasketches-java/tree/master/src/main/java/org/apache/datasketches/kll) | How the KLL sketch gives quantile estimates with formal error guarantees and clean cross-shard mergeability. |
| **Set membership** | bloom-filters | [`src/bloom`](https://github.com/Callidon/bloom-filters/tree/master/src/bloom) | How a Bloom filter sets `k` hash-derived bits on insert and reports "definitely not / probably yes," and how counting variants support deletes. |
| **Near-duplicate detection** | bloom-filters | [`src/sketch`](https://github.com/Callidon/bloom-filters/tree/master/src/sketch) | How MinHash estimates Jaccard similarity from the minimum hash values of two sets — the basis of dedup and similarity grouping. |

## Functional Patterns

- "Have we seen this before?" with Bloom filters.
- Approximate unique users with HyperLogLog.
- Top hashtags/searches/items with top-k or heavy-hitter sketches.
- Approximate frequency with Count-Min Sketch.
- Sample events fairly with reservoir sampling.
- Find near-duplicates with MinHash.

## The Lift

- Error bounds and false positive behavior.
- Memory tradeoffs.
- Mergeability across shards or workers.
- How counters age out or reset over time windows.
- Monitoring for when approximate answers are no longer good enough.

## Stealable Snippets

**HyperLogLog add + estimate.** Approximate distinct count in a few KB. Each item hashes to a register; we record the position of the leftmost 1-bit (a proxy for "how rare this hash prefix was"), then take the harmonic mean across registers.

```python
import math

class HyperLogLog:
    def __init__(self, p=14):                 # 2**p registers
        self.p, self.m = p, 1 << p
        self.reg = [0] * self.m

    def add(self, h):                          # h: a 64-bit hash of the item
        idx = h & (self.m - 1)                 # low p bits pick the register
        w = h >> self.p
        rank = (64 - self.p) - w.bit_length() + 1  # leading zeros + 1
        self.reg[idx] = max(self.reg[idx], rank)

    def estimate(self):
        alpha = 0.7213 / (1 + 1.079 / self.m)
        z = sum(2.0 ** -r for r in self.reg)
        e = alpha * self.m * self.m / z
        zeros = self.reg.count(0)              # small-range correction
        if e <= 2.5 * self.m and zeros:
            return self.m * math.log(self.m / zeros)
        return e

    def merge(self, other):                    # mergeable across shards
        self.reg = [max(a, b) for a, b in zip(self.reg, other.reg)]
```

**Count-Min Sketch update + query.** Approximate frequency in fixed memory. Increment one counter per hash row on update; on query take the minimum across rows, which bounds the overestimate caused by collisions.

```python
class CountMinSketch:
    def __init__(self, d=5, w=2719, seeds=None):
        self.d, self.w = d, w
        self.table = [[0] * w for _ in range(d)]
        self.seeds = seeds or list(range(d))

    def _idx(self, item, i):
        return hash((self.seeds[i], item)) % self.w

    def add(self, item, count=1):
        for i in range(self.d):
            self.table[i][self._idx(item, i)] += count

    def query(self, item):                     # never underestimates
        return min(self.table[i][self._idx(item, i)] for i in range(self.d))
```

**Reservoir sampling.** A uniform sample of `k` items from a stream of unknown length, in O(k) space. The i-th item replaces a random slot with probability k/i, which keeps every seen item equally likely.

```python
import random

def reservoir(stream, k):
    res = []
    for i, item in enumerate(stream):
        if i < k:
            res.append(item)
        else:
            j = random.randint(0, i)           # 0..i inclusive
            if j < k:
                res[j] = item
    return res
```

## Search Inside

`bloom`, `hyperloglog`, `count-min`, `top-k`, `heavy hitter`, `reservoir`, `minhash`, `xor filter`, `cardinality`, `frequency`, `sketch`, `sampling`.

