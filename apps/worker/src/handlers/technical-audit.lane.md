---
lane: technical-audit
domain: evidence
state: built
missing: []
reason: ""
trigger: ""
proof: apps/worker/src/handlers/technical-audit.integration.ts
---

## Is

- **D1** -> a finding belongs to the audit run that produced it, so two audits
  of the same site can be compared instead of overwriting each other.
- **D2, G2** -> an audit that could not reach the site records that as a
  failure. An unreachable site is a finding, not an absence of findings.

## Is not

- Does not audit competitors. It inspects the customer's own site.
- Does not fix anything. Findings feed proposals; the page domain changes pages.
- Not the local page quality gate. That is a pure function,
  `evaluateLocalPageQa` (`packages/seo/src/index.ts:evaluateLocalPageQa`),
  applied where pages are produced rather than as a lane of its own.
