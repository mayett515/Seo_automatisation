---
lane: website-import
domain: website
state: partial
enforces: [G2, D1]
missing: ["no proof of its own - no test or integration suite exercises handleWebsiteImportJob"]
consumes: [project-website-url]
produces: [website-import-snapshot]
terminal: [website-import-snapshot]
external: [project-website-url]
reason: "The lane runs and other suites depend on its output, but nothing exercises the handler itself. A green workspace therefore says nothing about whether this lane still crawls and stores correctly."
trigger: "A dedicated integration test against a real database with a stubbed crawler. Until then the state stays partial regardless of how green the workspace looks."
proof: ""
---

## Is

- **D1** -> the lane crawls the URL held on the project, never a competitor's.
  The rebuild is of the customer's own site; competitor material enters the
  system only through the evidence domain and only as analysis.
- **G2** -> import outcomes are written as outcomes. An import that fetched
  nothing is recorded as such rather than left looking pending.

## Is not

- Does not deploy anything. Staging and its `noindex` rule belong to the
  release path (`apps/api/src/modules/projects.module.ts:562`).
- Does not decide what the rebuilt site should look like. Template and
  component selection is the page domain.
- Not a competitor crawler. `technical-audit` inspects the customer's own site;
  competitor observation is `serp-scout`.
