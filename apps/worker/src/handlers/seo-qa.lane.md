---
lane: seo-qa
domain: page
state: scaffold
enforces: []
missing: ["worker handler", "no producer - nothing enqueues into this queue"]
consumes: []
produces: []
terminal: []
external: []
reason: "Superseded by a simpler shape. This is queue Q5 of the original topology, the SEO QA Worker meant to check technique, similarity, canonicals, sitemap, noindex and quality (architecture/04-worker-architecture.md). That logic exists as a pure function, evaluateLocalPageQa (packages/seo/src/index.ts:24), applied where pages are produced. A pure check needs no queue, and turning it into one would add a boundary that buys nothing."
trigger: "A quality check that genuinely needs to run asynchronously - fetching the deployed page, or comparing many pages against each other. Otherwise remove the queue declaration."
proof: ""
---

## Is

Nothing at runtime, and deliberately so. The plan's work happens as a function
call rather than as a job.

## Is not

- Not a missing quality gate. The gate exists; it simply is not a lane.
- Not proof that the page domain's sitemap and readiness rules are unenforced -
  those live in the domain layer and in the release path, and the leaf for each
  names where.
