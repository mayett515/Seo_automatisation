---
lane: report
domain: report
state: partial
enforces: [G1, G2, D2, D3]
missing:
  [
    "the narration layer - the six analyst status labels from prompts/seo-analyst-agent-prompt.md exist nowhere in the code, so the report delivers evidence rather than framing decisions"
  ]
consumes: [gsc-search-analytics-rows, deployment, release-verification-evidence, page-version, opportunity-candidates]
produces: [customer-report]
terminal: [customer-report]
external: []
reason: "The delivery half is built and proven: sections, evidence binding, publication and correction lineage. The narration half was never started, and no record says the order was chosen deliberately."
trigger: "Implement the six analyst status labels from prompts/seo-analyst-agent-prompt.md over the existing GSC signal types, and split ranking_results into won, momentum and attack."
proof: apps/worker/src/handlers/customer-report.integration.ts
---

## Is

- **G1** -> the report is digest-bound: every section cites evidence of a
  declared kind, and a correction produces a new publication with lineage rather
  than an edit (ADR 0021). This is the strictest application of G1 in the
  product, because this is the artefact a customer reads.
- **G2** -> a generation that failed does not publish, and a superseded report is
  marked superseded rather than quietly replaced.
- **D3** -> sections carry navigation targets
  (`packages/contracts/src/report.ts` - opportunity, page_studio_review,
  release_review), so a recommendation has somewhere to go.

## Is not

- **Not yet the decision engine the plan describes.** Built sections are
  `ranking_results`, `page_delivery`, `live_health`, `warnings`,
  `rollback_corrections`, `future_opportunities` - a delivery report bound to
  evidence. The plan's report opens with a situation assessment and separates
  won, momentum and attack. Those three are currently one section, and the six
  status labels do not exist.
- This is sequencing rather than loss: without bound evidence there is no honest
  momentum sentence to write. But nothing records that the sequence was chosen,
  which is why it reads like a gap when someone compares plan and code.
- Does not decide anything. The customer decides; the report supplies what they
  decide with.
