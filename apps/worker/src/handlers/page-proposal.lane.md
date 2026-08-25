---
lane: page-generation
domain: page
state: built
enforces: [G1, G2, D1, D2]
missing: []
consumes: [accepted-opportunity, page-template]
produces: [page-version]
terminal: []
external: [accepted-opportunity, page-template]
reason: ""
trigger: ""
proof: apps/worker/src/handlers/page-proposal.integration.ts
---

## Is

- **D1, D2** -> generation always produces a new version rather than editing an
  approved one. The rule is held in the database, not only in code: migration
  `0026_page_version_immutability` makes silent mutation of an approved version
  impossible rather than merely discouraged.
- **G1** -> generated copy is bound to the opportunity and evidence it came
  from, so a page can be traced back to why it was proposed.
- **G2** -> a generation that failed leaves a failed version, not a half-written
  one that looks ready for review.

## Is not

- Does not decide that a page should exist. That decision comes from an accepted
  opportunity.
- Does not publish. A version reaches the customer's domain only through the
  release domain, and only after approval.
- Not a free website builder. The customer picks variants and writes notes; the
  component set is the product's own.
