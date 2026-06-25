# Search, Retrieval, And Ranking

Come here when you need the part that turns raw documents into ranked, typo-tolerant, instantly-filterable result sets. Search is deceptively deep: behind a single search box sits an analyzer pipeline (normalize, tokenize, stem), an inverted index that maps terms to posting lists, a scoring function (BM25 and friends) that decides relevance, and increasingly a vector index for semantic similarity. The hard part is not any one of these pieces but the contract between them, and the engines below have each solved that contract in a form you can lift cleanly.

You almost never need a whole search engine. What you usually need is one well-isolated part: how typo tolerance is bounded by edit distance, how posting lists are merged with skip pointers, how facets are computed as bitset intersections, or how keyword and vector candidates are fused into one ranked list. The same intent recurs across every engine, so once you have grabbed it cleanly out of one repo you can recognize and reuse the shape anywhere.

## 1. Repos

| Link | Good For | What to steal |
| --- | --- | --- |
| [apache/lucene](https://github.com/apache/lucene) | Classic full-text search engine library. | Steal inverted indexes, analyzers, tokenization, query parsing, BM25-style scoring, and index segments. |
| [meilisearch/meilisearch](https://github.com/meilisearch/meilisearch) | Product-friendly search engine. | Steal typo tolerance, facets, instant search feel, filters, ranking rules, and API ergonomics. |
| [facebookresearch/faiss](https://github.com/facebookresearch/faiss) | Vector similarity search and clustering. | Steal approximate nearest neighbor search for embeddings, semantic search, and similar-items features. |
| [nmslib/hnswlib](https://github.com/nmslib/hnswlib) | Focused HNSW approximate nearest-neighbor implementation. | Good smaller codebase for understanding vector indexes without a full database. |
| [vespa-engine/vespa](https://github.com/vespa-engine/vespa) | Large-scale search, recommendation, and ranking engine. | Steal production ranking architecture, document models, vector retrieval, and feature-based scoring. |
| [typesense/typesense](https://github.com/typesense/typesense) | Fast, typo-tolerant, in-memory fuzzy search engine. | Steal instant-search UX, typo correction, faceting, filtering, and ranking rules in a single-binary engine. |
| [quickwit-oss/tantivy](https://github.com/quickwit-oss/tantivy) | Full-text search engine library in Rust (Lucene-inspired). | Steal inverted index internals, tokenization, query parsing, BM25 scoring, and indexing from a Rust codebase. |
| [quickwit-oss/quickwit](https://github.com/quickwit-oss/quickwit) | Distributed search engine for logs and traces built on Tantivy. | Steal distributed indexing, S3-backed storage, sub-second full-text search, and multi-tenant search architecture. |
| [valeriansaliou/sonic](https://github.com/valeriansaliou/sonic) | Lightweight, schema-less search backend. | Steal a minimal inverted-index design, FST-backed suggestion, and an intentionally tiny feature surface that is easy to read end to end. |

## 2. The Anatomy of Large Repos: Decomposing "Stealable" Modules

A full-text engine looks monolithic from the outside, but internally it is a stack of independent stages: analysis, indexing, posting storage, query parsing, and scoring. When you open Lucene or Meilisearch the temptation is to read it as one product; instead, map each directory to the engineering intent it embodies. The product is "search," but the modules are "edit-distance automaton," "BM25 scorer," "facet bitset," and "ANN graph" — and those are the things worth stealing.

### Decomposed Module Index

| Intent | Product / Repo | Target Module / Directory | What to steal |
| --- | --- | --- | --- |
| **Inverted index + typo tolerance** | Meilisearch | [`crates/milli/src/search`](https://github.com/meilisearch/meilisearch/tree/main/crates/milli/src/search) | How a Levenshtein DFA bounds typo tolerance by word length, and how prefix search and proximity ranking are layered on LMDB-backed posting lists. |
| **Ranking-rule pipeline** | Meilisearch | [`crates/milli/src/update`](https://github.com/meilisearch/meilisearch/tree/main/crates/milli/src/update) | How the index is built and the configurable ranking rules (words, typo, proximity, attribute, exactness) are applied as an ordered cascade. |
| **BM25 scoring** | Tantivy | [`src/query/bm25.rs`](https://github.com/quickwit-oss/tantivy/blob/main/src/query/bm25.rs) | How term frequency, inverse document frequency, and field-length normalization combine into a single relevance score, with precomputed IDF weights. |
| **Posting lists + skip pointers** | Tantivy | [`src/postings`](https://github.com/quickwit-oss/tantivy/tree/main/src/postings) | How posting lists are block-compressed and traversed with skip data (`skip.rs`, `block_segment_postings.rs`) so conjunctions can leapfrog non-matching doc IDs. |
| **Analyzer / tokenizer pipeline** | Tantivy | [`src/tokenizer`](https://github.com/quickwit-oss/tantivy/tree/main/src/tokenizer) | How text flows through tokenizer then a chain of token filters (lowercase, stop words, stemming) to produce the terms that actually get indexed. |
| **HNSW vector index** | hnswlib | [`hnswlib/hnswalg.h`](https://github.com/nmslib/hnswlib/blob/master/hnswlib/hnswalg.h) | How a navigable small-world graph supports approximate nearest-neighbor search with `ef`/`M` parameters — the core of semantic and similar-items search. |
| **ANN index family** | FAISS | [`faiss/IndexHNSW.h`](https://github.com/facebookresearch/faiss/blob/main/faiss/IndexHNSW.h) / [`faiss/IndexIVFFlat.h`](https://github.com/facebookresearch/faiss/blob/main/faiss/IndexIVFFlat.h) | How IVF (inverted-file coarse quantization) and HNSW trade recall for speed, and how the `Index` interface unifies many ANN strategies behind one API. |
| **Query parsing** | Tantivy | [`src/query/query_parser`](https://github.com/quickwit-oss/tantivy/tree/main/src/query/query_parser) | How a user string is parsed into a tree of term/boolean/phrase/range queries that the scorer can execute. |

## Functional Patterns

- Inverted index for text lookup.
- Analyzer pipeline: normalize, tokenize, stem, stop words, synonyms.
- Query parser and filters.
- Facets and aggregations for narrowing results.
- Embedding index for semantic similarity.
- Hybrid retrieval: keyword candidates plus vector candidates.
- Rank profile: combine relevance, freshness, popularity, personalization, and policy.

## The Lift

- Search API shape: query, filters, sort, facets, pagination, highlights.
- Ranking controls and weights.
- Indexing pipeline and schema.
- Handling partial updates and deletes.
- Debug views for "why did this result rank here?"

## Stealable Snippets

**BM25 scoring.** The relevance score every classic engine ultimately computes. For a term `t` in document `d`: IDF rewards rare terms, term frequency saturates (no runaway from keyword stuffing), and `b` controls how much long documents are penalized.

```python
import math

def bm25_score(tf, df, n_docs, doc_len, avg_doc_len, k1=1.2, b=0.75):
    # IDF with the standard +0.5 smoothing used by Lucene/Tantivy
    idf = math.log(1 + (n_docs - df + 0.5) / (df + 0.5))
    # length normalization: long docs get their tf discounted
    norm = tf * (k1 + 1) / (tf + k1 * (1 - b + b * doc_len / avg_doc_len))
    return idf * norm
```

**Inverted-index posting merge (conjunction with skip).** Intersecting two sorted posting lists is the inner loop of every AND query. The smaller list drives; `seek` lets the other list skip ahead instead of scanning every doc id.

```python
def intersect(a, b):
    """a, b are sorted, deduplicated lists of doc ids. Returns the intersection."""
    out, i, j = [], 0, 0
    while i < len(a) and j < len(b):
        if a[i] == b[j]:
            out.append(a[i]); i += 1; j += 1
        elif a[i] < b[j]:
            i += 1          # advance the list that's behind
        else:
            j += 1
    return out
```

**Bounded typo tolerance (edit distance under a threshold).** Meilisearch/Lucene cap candidate terms by Levenshtein distance. The banded DP below returns early once the whole row exceeds `max_edits`, which is what makes typo search fast.

```python
def within_edits(term, candidate, max_edits):
    if abs(len(term) - len(candidate)) > max_edits:
        return False
    prev = list(range(len(candidate) + 1))
    for i, tc in enumerate(term, start=1):
        cur = [i] + [0] * len(candidate)
        row_min = cur[0]
        for j, cc in enumerate(candidate, start=1):
            cost = 0 if tc == cc else 1
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
            row_min = min(row_min, cur[j])
        if row_min > max_edits:   # whole row already too far: prune
            return False
        prev = cur
    return prev[-1] <= max_edits
```

## Search Inside

`inverted index`, `analyzer`, `tokenizer`, `bm25`, `query parser`, `facet`, `nearest neighbor`, `hnsw`, `embedding`, `rank profile`, `scoring`, `hybrid`.

