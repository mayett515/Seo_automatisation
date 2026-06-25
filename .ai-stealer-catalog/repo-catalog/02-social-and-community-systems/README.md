# Social And Community Systems

Come here for feeds, timelines, follows, custom algorithms, federation, moderation, comments, communities, and trust/safety tools. Social software is deceptively deep: behind a simple "home timeline" sits a fan-out strategy, a ranking pipeline, a graph of follows and blocks, a federation protocol, and a moderation queue — each a hard system in its own right. The repos here are the rare cases where mature, real-world versions of those systems are open and sitting in the clear, from X's recommendation pipeline to Mastodon's ActivityPub fan-out to Discourse's trust levels.

Do not try to walk off with the whole building. Treating Mastodon or `the-algorithm` as one monolithic "social app" is hopeless and leaves you with nothing portable. The move is to take the canonical subsystems every social product rebuilds — timeline fan-out, candidate-then-rank feed scoring, the interaction graph, inbox/outbox delivery, the report-to-action moderation loop — one at a time. The section below maps each subsystem to the exact directory where it lives, so you can lift one part and leave the rest.

## Feed And Ranking Systems

| Link | Good For | What to steal |
| --- | --- | --- |
| [xai-org/x-algorithm](https://github.com/xai-org/x-algorithm) | Modern X For You feed recommendation pipeline. | Steal candidate retrieval, in-network/out-of-network split, ranking, hydrators, and feed pipeline boundaries. |
| [twitter/the-algorithm](https://github.com/twitter/the-algorithm) | Older X/Twitter recommendation architecture. | Steal module names and architecture: product-mixer, tweet-mixer, SimClusters, real graph, trust and safety features. |
| [twitter/the-algorithm-ml](https://github.com/twitter/the-algorithm-ml) | Open-sourced Twitter/X ML model pieces. | Steal heavy-ranker and TwHIN-style embedding ideas. |
| [igorbrigadir/awesome-twitter-algo](https://github.com/igorbrigadir/awesome-twitter-algo) | Annotated map of Twitter algorithm release. | Use as a guide when the main repo is too large to parse cold. |
| [bluesky-social/feed-generator](https://github.com/bluesky-social/feed-generator) | ATProto custom feed starter. | Best small entry point for "make my own timeline algorithm as a service." |
| [Bluesky Custom Feeds Docs](https://docs.bsky.app/docs/starter-templates/custom-feeds) | Official custom feed explanation. | Use with the feed-generator repo to understand the API contract. |

## Open Social Apps And Community Platforms

| Link | Good For | What to steal |
| --- | --- | --- |
| [bluesky-social/atproto](https://github.com/bluesky-social/atproto) | AT Protocol implementation and social networking primitives. | Steal identity, repos, records, lexicons, federation-ish architecture. |
| [bluesky-social/social-app](https://github.com/bluesky-social/social-app) | Bluesky web/mobile app. | Steal social product flows, feeds, profiles, interactions, and client patterns. |
| [mastodon/mastodon](https://github.com/mastodon/mastodon) | Federated ActivityPub social network. | Steal follows, timelines, federation, moderation, accounts, media, and server-to-server flows. |
| [LemmyNet/lemmy](https://github.com/LemmyNet/lemmy) | Reddit-like federated link aggregator. | Steal communities, posts, comments, votes, moderation, and ActivityPub federation for forums. |
| [pixelfed/pixelfed](https://github.com/pixelfed/pixelfed) | Instagram-like federated photo sharing. | Steal media posts, profiles, albums, privacy choices, timelines, and federation. |
| [discourse/discourse](https://github.com/discourse/discourse) | Mature community/forum platform. | Steal topics, replies, notifications, trust levels, moderation, search, plugins, and admin UX. |
| [opensource-socialnetwork/opensource-socialnetwork](https://github.com/opensource-socialnetwork/opensource-socialnetwork) | Classic PHP social network software. | Steal traditional profile/timeline/groups/photos/likes/comments features. |

## Moderation, Protocols, And Trust

| Link | Good For | What to steal |
| --- | --- | --- |
| [bluesky-social/ozone](https://github.com/bluesky-social/ozone) | Bluesky moderation tooling. | Steal reports, labels, takedowns, account actions, moderation queues, and admin tools. |
| [nostr-protocol/nips](https://github.com/nostr-protocol/nips) | Nostr protocol improvement proposals. | Steal decentralized social primitives: events, relays, clients, identity, and protocol extensions. |
| [matrix-org/synapse](https://github.com/matrix-org/synapse) | Matrix homeserver reference implementation. | Steal rooms, events, federation, state resolution, end-to-end encryption, and decentralized communication. |

---

## 4. The Anatomy of Large Repos: Decomposing "Stealable" Modules

Every social product, no matter the brand, rebuilds the same five subsystems: timeline fan-out, candidate-then-rank feed scoring, the follow/block interaction graph, federation delivery, and the report-to-action moderation loop. Reading Mastodon or `the-algorithm` end-to-end is hopeless; reading the one directory that owns *fan-out*, then the one that owns *ranking*, is tractable. The index below maps each canonical subsystem to a real module so you can steal them one at a time.

### Decomposed Module Index

| Intent | Product / Repo | Target Module / Directory | What to steal |
| --- | --- | --- | --- |
| **Timeline fan-out (push on write)** | Mastodon | [`app/lib/feed_manager.rb`](https://github.com/mastodon/mastodon/blob/main/app/lib/feed_manager.rb) | How home timelines are materialized into per-user Redis lists on post, trimmed to a cap, and filtered for mutes/blocks. |
| **Candidate retrieval + ranking pipeline** | X / Twitter | [`home-mixer`](https://github.com/twitter/the-algorithm/tree/main/home-mixer) | The clean separation of candidate sources, feature hydration, heavy-ranker scoring, and final mixing/filtering. |
| **Pluggable custom feed service** | Bluesky | [`src/algos`](https://github.com/bluesky-social/feed-generator/tree/main/src/algos) | The smallest possible "feed as a service": a skeet firehose subscription writing post URIs, served back as a ranked feed. |
| **Signed federation delivery (inbox/outbox)** | Mastodon | [`app/lib/activitypub`](https://github.com/mastodon/mastodon/tree/main/app/lib/activitypub) | HTTP-signed server-to-server delivery, Actor/Inbox parsing, and fan-out to remote followers with retries. |
| **Forum federation & data model** | Lemmy | [`crates/apub`](https://github.com/LemmyNet/lemmy/tree/main/crates/apub) | How communities, posts, comments, and votes map onto ActivityPub objects in a strongly-typed Rust codebase. |
| **Read-side view models** | Lemmy | [`crates/db_views`](https://github.com/LemmyNet/lemmy/tree/main/crates/db_views) | How aggregated counts (score, comment count, rank) are precomputed into view structs instead of joined at read time. |
| **Moderation queue & actions** | Bluesky | [`bluesky-social/ozone`](https://github.com/bluesky-social/ozone) | Report intake, label assignment, takedown actions, and the reviewer queue UX — the full trust-and-safety loop. |
| **Trust levels & rate gating** | Discourse | [`lib/trust_level.rb`](https://github.com/discourse/discourse/blob/main/lib/trust_level.rb) | How user privileges escalate from reading/posting thresholds — a portable reputation-gating model. |

---

## Functional Patterns

- **Fan-out on write vs. fan-out on read.** Push posts into precomputed per-follower timelines for cheap reads (good for most users), or assemble the timeline at read time for celebrities with millions of followers. Real systems use both, switching on follower count.
- **Candidate then rank, always.** Never score the whole corpus. Cheaply retrieve a few hundred candidates (in-network, out-of-network, trending), hydrate features, then run the expensive ranker only on that shortlist.
- **The interaction graph is the substrate.** Follows, mutes, blocks, likes, and reposts are edges; nearly every feature (ranking signal, notification trigger, moderation heuristic) is a query over that graph.
- **Federation is inbox/outbox with signatures.** Local object -> sign -> POST to remote inboxes -> retry on failure. Incoming activities land in your inbox, get verified, and mutate local state.
- **Moderation is a state machine.** report -> queue -> reviewer action -> label/takedown -> appeal -> audit. Model it explicitly; do not scatter ad-hoc flags across tables.

### Stealable: candidate-then-rank feed assembly

```python
def build_timeline(user, k=50):
    # 1. Cheap, diverse candidate retrieval (union, then dedupe)
    candidates = (
        in_network_posts(user, limit=400) +      # people you follow
        out_of_network_posts(user, limit=200) +  # 2nd-degree / engagement graph
        trending_posts(user.locale, limit=100)
    )
    seen, uniq = set(), []
    for p in candidates:
        if p.id not in seen and not user.blocks(p.author):
            seen.add(p.id); uniq.append(p)

    # 2. Hydrate features + score only the shortlist (the expensive step)
    for p in uniq:
        p.score = rank_score(features(user, p))

    # 3. Sort, then a light diversity pass so one author can't flood the feed
    uniq.sort(key=lambda p: p.score, reverse=True)
    return dedupe_by_author(uniq, max_per_author=2)[:k]
```

### Stealable: a feed-ranking score formula

```python
import math, time

def rank_score(f) -> float:
    """Weighted-sum ranker with a freshness decay — the shape behind 'heavy rankers'."""
    engagement = (
        1.0 * f.p_like +
        4.0 * f.p_reply +       # replies signal more than likes
        6.0 * f.p_repost +
       -8.0 * f.p_report        # negative signals subtract hard
    )
    age_hours = (time.time() - f.created_at) / 3600.0
    freshness = math.exp(-age_hours / 12.0)        # half-life ~ 8h
    affinity  = f.author_affinity                  # past interaction with author
    return engagement * freshness * (0.5 + affinity)
```

### Stealable: fan-out-on-write timeline insert (Redis-style)

```python
def fan_out_on_write(post, redis, follower_cap=800):
    """On publish, push the post id into each follower's capped home list."""
    followers = follower_ids(post.author_id)
    pipe = redis.pipeline()
    for fid in followers:
        if is_muted(fid, post.author_id):
            continue
        key = f"timeline:home:{fid}"
        pipe.lpush(key, post.id)
        pipe.ltrim(key, 0, follower_cap - 1)   # keep only the newest N
    pipe.execute()
```

## The Lift

- Feed pipeline stages: collect candidates, hydrate, score, filter, diversify, paginate.
- User graph and interaction graph: follows, mutes, blocks, likes, replies, reposts.
- Moderation workflow: report intake, queue, reviewer action, labels, appeal, audit log.
- Federation workflow: local object, remote object, inbox/outbox, delivery, retries.
- Notification triggers: follows, replies, mentions, likes, reposts, moderator actions.

## Search Inside

`timeline`, `feed`, `rank`, `score`, `candidate`, `hydrate`, `follow`, `mute`, `block`, `report`, `moderation`, `label`, `activitypub`, `federation`, `notification`, `trust`.

