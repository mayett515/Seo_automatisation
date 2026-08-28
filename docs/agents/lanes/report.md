# Report domain

## What it is for

The report is not a data dump. It turns measurements into decisions: where are
we winning, what is moving, where are we close, where is it hard, and what
should the customer approve next. It is also the surface where the product's
honesty is most visible, because it is the one the customer actually reads.

Lanes: `report`.

Product source: `product/09-reports-seo-game.md`,
`prompts/seo-analyst-agent-prompt.md`.

## Invariants

### D1 - Every insight is framed as a decision

Why it matters, what it is worth, what to do about it. An observation with no
recommendation and no action is a data point, not a report entry.

### D2 - Not everything is green

Weak signals appear as warning, observation, or growth opportunity. A report
that only shows good news is a fake, and the product explicitly names that as
something it is not.

### D3 - Every recommendation carries a next action

The customer decides; the report gives them something to decide with.
