# Catalogues And Maps

These are the "collection of collections" sources — your map when you do not yet know which repo or category to raid and need to see the terrain first. An awesome-list or a clone catalogue is a compressed survey of an entire domain: it hands you the taxonomy, the vocabulary, and the shortlist of canonical projects in one file, which is exactly what you want before committing to a part to lift.

There is a second, less obvious part to take here: the catalogues themselves are software. A 100k-star awesome list is not a static document — it is a Markdown dataset kept honest by link-checkers, format linters, and CI bots, often generated from structured data. If you are building any kind of curated registry, directory, or "marketplace of X," the maintenance machinery below is the part worth lifting. So this page maps both the discovery sources you read *from* and the production directories whose ingestion, validation, and ranking logic you would lift to build a catalogue of your own.

## Broad Catalogues

| Link | Good For | Use When |
| --- | --- | --- |
| [sindresorhus/awesome](https://github.com/sindresorhus/awesome) | Master index of awesome lists. | You want to discover "awesome X" lists across domains. |
| [awesome-selfhosted/awesome-selfhosted](https://github.com/awesome-selfhosted/awesome-selfhosted) | Self-hostable web apps and services. | You want real apps by category: social, bookmarks, feeds, analytics, media, admin tools. |
| [gorvgoyl/clone-wars](https://github.com/gorvgoyl/clone-wars) | Open-source clones and alternatives of popular apps. | You want feature patterns, app structure, demos, and stack comparisons. |
| [realworld-apps/realworld](https://github.com/realworld-apps/realworld) | Same Medium-like app across many stacks. | You want to compare auth, CRUD, comments, favorites, follows, routing, API specs. |

## Domain Catalogues

| Link | Good For | Use When |
| --- | --- | --- |
| [emilebosch/awesome-fediverse](https://github.com/emilebosch/awesome-fediverse) | Fediverse resources and apps. | You want open social network implementations and ActivityPub ecosystem links. |
| [fmoliveira/delightful-fediverse-apps](https://github.com/fmoliveira/delightful-fediverse-apps) | Fediverse app catalogue. | You want ActivityPub-based products grouped by use case. |
| [grahamjenson/list_of_recommender_systems](https://github.com/grahamjenson/list_of_recommender_systems) | Recommender system library/resource list. | You want a map of recommender engines and libraries. |
| [briatte/awesome-network-analysis](https://github.com/briatte/awesome-network-analysis) | Network/graph analysis resources. | You want graph datasets, libraries, papers, and analysis tools. |
| [lmmentel/awesome-time-series](https://github.com/lmmentel/awesome-time-series) | Time-series tools and resources. | You want forecasting, monitoring, anomaly detection, and sequential-data tools. |
| [or-tools/awesome_or-tools](https://github.com/or-tools/awesome_or-tools) | OR-Tools examples and resources. | You want optimization examples by problem type. |

## GitHub Topic Hubs

- [social-network](https://github.com/topics/social-network)
- [social-media-app](https://github.com/topics/social-media-app)
- [activitypub](https://github.com/topics/activitypub)
- [feed-generator](https://github.com/topics/feed-generator)
- [recommender-system](https://github.com/topics/recommender-system)
- [learning-to-rank](https://github.com/topics/learning-to-rank)
- [content-moderation](https://github.com/topics/content-moderation)
- [graph-algorithms](https://github.com/topics/graph-algorithms)
- [streaming-algorithms](https://github.com/topics/streaming-algorithms)

---

## 1. The Anatomy of Large Repos: Decomposing "Stealable" Modules

When you stop *reading* catalogues and start *building* one, the interesting code is the maintenance and ranking machinery, not the list of links. A curated directory is an ingestion pipeline (collect entries), a validation layer (dead-link and schema checks), and a presentation layer (group, rank, render). The repos below each own one of those stages in production, and their data models and CI jobs are directly stealable for any registry, marketplace, or "awesome-X" of your own.

### Decomposed Module Index

| Intent | Product / Repo | Target Module / Directory | What to steal |
| --- | --- | --- | --- |
| **Structured catalogue data model** | awesome-selfhosted-data | [`software/`](https://github.com/awesome-selfhosted/awesome-selfhosted-data/tree/master/software) | One YAML file per entry (name, tags, license, demo URL) — how to turn a Markdown list into a queryable dataset that *generates* the README. |
| **List format linting** | awesome-lint | [`rules/`](https://github.com/sindresorhus/awesome-lint/tree/main/rules) | The exact rules (alphabetization, link format, badge placement) a 300k-star list enforces in CI so entries stay uniform. |
| **Dead-link checking in CI** | lychee | [`lychee-lib/src`](https://github.com/lycheeverse/lychee/tree/master/lychee-lib/src) | A fast async link checker — how to crawl thousands of URLs, dedupe hosts, and respect rate limits without false positives. |
| **Registry ingestion & metadata** | Homebrew | [`Library/Homebrew/formula.rb`](https://github.com/Homebrew/brew/blob/master/Library/Homebrew/formula.rb) | How a package "formula" declares source, dependencies, and version checks — the canonical shape of a registry entry. |
| **Topic / tag classification** | GitHub Explore | [`topics/`](https://github.com/github/explore/tree/main/topics) | One curated descriptor per topic (aliases, related topics, short/long description) — a clean taxonomy schema. |
| **Generated static directory** | Hugo themes registry | [`exampleSite`](https://github.com/gohugoio/hugoThemes) | How submissions become a browsable, searchable gallery via a static-site build step rather than a database. |
| **Clone/alternative mapping** | gorvgoyl/clone-wars | [`data`](https://github.com/GorvGoyl/Clone-Wars) | How "open-source alternative to X" entries are modeled with stack, demo, and difficulty fields — a feature-comparison schema. |

---

## Functional Patterns

- **Data, not document.** Treat each catalogue entry as a typed record (YAML/JSON with a schema) and *render* the human-readable list from it. The Markdown becomes a build artifact, which makes search, filtering, and validation trivial.
- **Validate in CI, not in review.** Format linting, alphabetization, and dead-link checks run as pull-request gates so curation does not depend on a human noticing a broken row.
- **Stable taxonomy, flexible tags.** Keep a small, stable set of top-level categories and attach free-form tags to entries. New domains slot into tags long before they earn a category.
- **One canonical id per entry.** Slug or repo-URL as the primary key lets you dedupe, cross-link, and merge submissions without ambiguity.
- **Survey breadth first, depth second.** As a *reader*, the catalogue's job is to hand you the shortlist and the vocabulary; commit to one project only after the map shows you the field.

### Stealable: a catalogue entry as a typed record

```yaml
# software/jellyfin.yml  — one file per entry, the README is generated from these
name: Jellyfin
website_url: https://jellyfin.org
source_code_url: https://github.com/jellyfin/jellyfin
description: Media server to organize, play, and stream audio and video.
licenses:
  - GPL-2.0
platforms:
  - C#
  - Docker
tags:
  - Media Streaming - Audio Streaming
  - Media Streaming - Video Streaming
depends_3rdparty: false   # flips a "depends on a proprietary service" badge
```

### Stealable: render entries to grouped Markdown

```python
import yaml, pathlib
from collections import defaultdict

def build_readme(software_dir: str) -> str:
    by_tag = defaultdict(list)
    for path in pathlib.Path(software_dir).glob("*.yml"):
        e = yaml.safe_load(path.read_text(encoding="utf-8"))
        for tag in e.get("tags", ["Uncategorized"]):
            by_tag[tag].append(e)

    lines = []
    for tag in sorted(by_tag):                       # stable, alphabetized sections
        lines.append(f"\n### {tag}\n")
        for e in sorted(by_tag[tag], key=lambda x: x["name"].lower()):
            lic = ", ".join(e.get("licenses", []))
            lines.append(f"- [{e['name']}]({e['source_code_url']}) "
                         f"- {e['description']} `{lic}`")
    return "\n".join(lines)
```

## The Lift

- Category names and taxonomies.
- Lists of known projects.
- Feature vocabulary.
- Repeated patterns across many implementations.
- The entry schema, CI checks, and render pipeline if you are building a catalogue of your own.

