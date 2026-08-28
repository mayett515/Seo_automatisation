---
lane: report
domain: report
state: partial
missing:
  [
    "the six analyst status labels (Gewonnen/Stark/Beobachten/Angriff/Problem/Keine Daten) and the won/momentum/attack split exist nowhere in the code - the report narrates section headings and transitions, but does not frame decisions in the analyst vocabulary"
  ]
reason: "The delivery half and a bounded narration half are built and proven: sections, evidence binding, publication, correction lineage, and attributed heading/transition narrative fragments. The analyst framing half - six status labels plus the won/momentum/attack split - was never started, and no record says the order was chosen deliberately."
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

- **Not yet the decision-framing layer the plan describes.** The bounded-AI
  narrative already exists (`narrativeMode: "bounded_ai"`, heading and
  transition fragments per section in `packages/domain/src/report.ts` and
  `packages/ai/src/report-narrative.ts`); what does not exist is the analyst
  status vocabulary. The plan's report opens with a situation assessment and
  separates won, momentum and attack under the six status labels
  (Gewonnen/Stark/Beobachten/Angriff/Problem/Keine Daten). Those are currently
  one `ranking_results` section with no status framing.
- This is sequencing rather than loss: without bound evidence there is no honest
  momentum sentence to write. But nothing records that the sequence was chosen,
  which is why it reads like a gap when someone compares plan and code.
- Does not decide anything. The customer decides; the report supplies what they
  decide with.
