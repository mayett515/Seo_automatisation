---
lane: website-import
domain: website
state: built
missing: []
reason: ""
trigger: ""
proof: apps/worker/src/handlers.test.ts
---

## Is

- **D1** -> the lane crawls the URL held on the project, never a competitor's.
  The rebuild is of the customer's own site; competitor material enters the
  system only through the evidence domain and only as analysis.
- **G2** -> import outcomes are written as outcomes. An import that fetched
  nothing is recorded as such rather than left looking pending.

## Is not

- Not the rebuild itself. This lane crawls and snapshots; the pack's
  Clone/Rebuild Worker (`product/04-main-website-rebuild.md`) also recognizes
  components, generates a React/Vite project, improves SEO/speed/CTA/mobile,
  and deploys a staging preview. That rebuild-and-preview half has no owner and
  no recorded reason for being absent - see the `website` domain parent.
- Does not deploy anything. Staging and its `noindex` rule belong to the
  release path (`apps/api/src/modules/projects.module.ts:ProjectsService`).
- Does not decide what the rebuilt site should look like. Template and
  component selection is the page domain.
- Not a competitor crawler. `technical-audit` inspects the customer's own site;
  competitor observation is `serp-scout`.
