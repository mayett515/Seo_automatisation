---
lane: seo-qa
domain: page
state: scaffold
missing: ["worker handler", "no producer - nothing enqueues into this queue"]
reason: "Partially superseded by a simpler shape. This is queue Q5 of the original topology, the SEO QA Worker meant to check technique, similarity, canonicals, sitemap, noindex and quality (architecture/04-worker-architecture.md). Technique, canonicals, sitemap, noindex and local-substance quality exist as a pure function, evaluateLocalPageQa (packages/seo/src/index.ts:evaluateLocalPageQa), applied at release preflight rather than as a queue. Similarity/clone detection from the original W5 scope has no home: it is neither in evaluateLocalPageQa nor anywhere else, and no decision records it as dropped."
trigger: "A quality check that genuinely needs to run asynchronously - fetching the deployed page, or comparing many pages against each other. Otherwise remove the queue declaration."
proof: ""
---

## Is

Nothing at runtime as a lane, and the technique/canonical/sitemap/noindex/
quality part of the plan's work happens as a pure function call at release
preflight rather than as a job.

## Is not

- Not proof that the _whole_ original W5 scope has a home. Similarity/clone
  detection is not carried by `evaluateLocalPageQa` and not carried anywhere;
  it is deferred work with no recorded reason, not a deliberate simplification.
- Not a missing quality gate for the checks that do exist. Technique, canonicals,
  sitemap and noindex are enforced in the domain layer and the release path, and
  the leaf for each names where.
- Not built as a queue, and turning the pure preflight check into a lane would
  add a boundary that buys nothing for the checks it already covers.
