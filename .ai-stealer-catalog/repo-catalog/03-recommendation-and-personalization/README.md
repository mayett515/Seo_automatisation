# Recommendation And Personalization

Come here for "what should this user see next?" across posts, products, media, people, search results, articles, jobs, listings, or notifications. Almost every recommender, regardless of domain, is the same two-stage machine: a cheap *retrieval* step that pulls a few hundred plausible candidates from millions of items, followed by an expensive *ranking* step that scores only that shortlist. The libraries here — from notebook-grade `recommenders` to industrial `EasyRec` to the Go service `gorse` — are where you go to lift that retrieval/ranking boundary and the batch-train-to-online-serve plumbing already drawn for you.

The bigger haul is the reusable algorithmic organs every recommender shares: a collaborative-filtering matrix factorization, an approximate-nearest-neighbor index for embedding recall, a two-tower retrieval model, and a feature-and-feedback loop. Taking `gorse` whole as "a recommender service" is daunting; lifting the one package that implements matrix factorization, then the one that builds the ANN index, is not. The section below maps these organs to the exact modules in real production recommenders so you can pull one technique at a time.

## Repos

| Link | Good For | What to steal |
| --- | --- | --- |
| [recommenders-team/recommenders](https://github.com/recommenders-team/recommenders) | Practical recommendation notebooks and best practices. | Good for data prep, modeling, evaluation, and production-ish workflow examples. |
| [RUCAIBox/RecBole](https://github.com/RUCAIBox/RecBole) | Large recommender-system library. | Steal algorithm families: general, sequential, context-aware, knowledge-based. |
| [tensorflow/recommenders](https://github.com/tensorflow/recommenders) | TensorFlow recommendation workflows. | Steal retrieval/ranking split and end-to-end model building. |
| [massquantity/LibRecommender](https://github.com/massquantity/LibRecommender) | End-to-end recommender with training and serving ideas. | Good for seeing train-to-serve structure in one repo. |
| [alibaba/EasyRec](https://github.com/alibaba/EasyRec) | Industrial recommendation framework. | Steal candidate generation, ranking, feature config, and large-scale recsys patterns. |
| [alibaba/TorchEasyRec](https://github.com/alibaba/TorchEasyRec) | PyTorch version of Alibaba recommendation framework. | Useful if you prefer PyTorch-style modeling. |
| [gorse-io/gorse](https://github.com/gorse-io/gorse) | Recommender service in Go. | Good plug-in shape: import users/items/interactions, serve recommendations. |
| [metarank/metarank](https://github.com/metarank/metarank) | Open-source learning-to-rank service. | Steal event ingestion, feature calculation, model config, and real-time reranking. |
| [benfred/implicit](https://github.com/benfred/implicit) | Collaborative filtering for implicit feedback. | Good for likes, views, clicks, purchases, saves, and other implicit signals. |
| [grahamjenson/list_of_recommender_systems](https://github.com/grahamjenson/list_of_recommender_systems) | Catalogue of recommender libraries/resources. | Use as a map of the recommender ecosystem. |

---

## 1. The Anatomy of Large Repos: Decomposing "Stealable" Modules

A recommender service looks monolithic but is really a few well-understood organs wired together: a matrix-factorization or two-tower model that produces embeddings, an ANN index that turns those embeddings into fast recall, a ranker that scores the recalled shortlist, and a feedback store that closes the loop. Each organ lives in an identifiable module in the repos below, and each is stealable on its own — you can lift `implicit`'s ALS without adopting its serving stack, or copy `gorse`'s worker/server split without using its models.

### Decomposed Module Index

| Intent | Product / Repo | Target Module / Directory | What to steal |
| --- | --- | --- | --- |
| **Collaborative-filtering models (Go)** | gorse | [`model/cf`](https://github.com/gorse-io/gorse/tree/master/model/cf) | How matrix factorization and BPR are implemented for implicit feedback in a real service, not a notebook. |
| **Retrieval/ranking worker split** | gorse | [`worker`](https://github.com/gorse-io/gorse/tree/master/worker) & [`server`](https://github.com/gorse-io/gorse/tree/master/server) | The clean boundary between offline candidate generation (worker) and online serving (server). |
| **ALS for implicit feedback** | implicit | [`implicit/als.py`](https://github.com/benfred/implicit/blob/main/implicit/als.py) | The canonical alternating-least-squares update for likes/clicks/views, with Cython/GPU paths. |
| **Approximate nearest neighbours recall** | implicit | [`implicit/ann`](https://github.com/benfred/implicit/tree/main/implicit/ann) | How learned item vectors are wrapped in Annoy/Faiss/NMSLIB indexes for sub-millisecond top-K recall. |
| **Algorithm family taxonomy** | RecBole | [`recbole/model/general_recommender`](https://github.com/RUCAIBox/RecBole/tree/master/recbole/model/general_recommender) | A reference shelf of CF/MF/neural recommenders sharing one interface — ideal for comparing model shapes. |
| **Sequential / session models** | RecBole | [`recbole/model/sequential_recommender`](https://github.com/RUCAIBox/RecBole/tree/master/recbole/model/sequential_recommender) | How "what next given the last N items" (GRU4Rec, SASRec) is structured as next-item prediction. |
| **Two-tower retrieval** | TensorFlow Recommenders | [`tensorflow_recommenders/tasks`](https://github.com/tensorflow/recommenders/tree/main/tensorflow_recommenders/tasks) | The retrieval-vs-ranking task split and the in-batch sampled-softmax loss behind two-tower models. |
| **Real-time learning-to-rank** | Metarank | [`src/main/scala/ai/metarank`](https://github.com/metarank/metarank/tree/master/src/main/scala/ai/metarank) | Event ingestion -> feature computation -> online reranking; how features are versioned and served. |

---

## Functional Patterns

- Candidate generation: get a broad list of possible items cheaply.
- Retrieval: use keywords, embeddings, graph edges, or co-occurrence to pull candidates.
- Ranking: score candidates using model features or rules.
- Reranking: reorder an existing result list for personalization, diversity, freshness, or policy.
- Feedback loop: impressions, clicks, dwell time, likes, hides, saves, follows, conversions.
- Evaluation: offline metrics plus online A/B tests or holdout logs.

### Stealable: cosine top-K recall over item embeddings

```python
import numpy as np

def recall_top_k(query_vec, item_vecs, item_ids, k=50):
    """Brute-force ANN stand-in: cosine similarity, then top-K. Swap in Faiss at scale."""
    q = query_vec / (np.linalg.norm(query_vec) + 1e-9)
    M = item_vecs / (np.linalg.norm(item_vecs, axis=1, keepdims=True) + 1e-9)
    sims = M @ q                                  # cosine == dot of unit vectors
    idx = np.argpartition(-sims, k)[:k]           # O(n) partial select, not a full sort
    idx = idx[np.argsort(-sims[idx])]             # order only the K survivors
    return [(item_ids[i], float(sims[i])) for i in idx]
```

### Stealable: one ALS step for implicit feedback

```python
import numpy as np

def als_user_step(Cu, Pu, Y, YtY, reg):
    """Solve for one user's latent vector given item factors Y (Hu & Koren 2008).
       Cu = diag confidence weights, Pu = binary preference (liked/clicked = 1)."""
    f = Y.shape[1]
    Cu_minus_I = Cu - np.eye(len(Cu))             # confidence above the baseline 1
    A = YtY + Y.T @ (Cu_minus_I[:, None] * Y) + reg * np.eye(f)
    b = Y.T @ (Cu * Pu)
    return np.linalg.solve(A, b)                   # closed-form least-squares update
```

### Stealable: time-decayed weighted-sum ranker

```python
import math, time

def rank(item, ctx, w):
    """Score a recalled candidate. `w` are learned/tuned feature weights."""
    base = (
        w["cf"]      * item.cf_score +            # collaborative-filtering affinity
        w["content"] * item.content_sim(ctx.user) +
        w["pop"]     * math.log1p(item.popularity)
    )
    age_days = (time.time() - item.created_at) / 86400.0
    freshness = math.exp(-age_days / w["half_life_days"])
    diversity_penalty = w["dup"] * ctx.seen_category(item.category)  # discourage repeats
    return base * freshness - diversity_penalty
```

## The Lift

- Event schema for `user`, `item`, `interaction`, `timestamp`, `context`.
- Feature names and feature lifecycle.
- Batch training vs online inference boundaries.
- Cold start strategy for new users/items.
- Diversity and freshness controls.

## Search Inside

`candidate`, `retrieval`, `ranking`, `rerank`, `features`, `implicit`, `feedback`, `negative sampling`, `embedding`, `two tower`, `collaborative filtering`, `matrix factorization`, `sequence`.

