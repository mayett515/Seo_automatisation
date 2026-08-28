# Intake domain

## What it is for

Before anyone is asked for anything, a prospect gets an honest picture of what
is possible. They enter a website, their services, and answer a few questions;
the system produces a potential report for the next two to three months and the
next half year. The pack names this a **pre-sales** report: its flow ends in
"Auftrag starten" (start order), so the report exists to convert a prospect
into a customer. What is stricter here is the report's _honesty_, not its
purpose - the forecast must be conservative enough that a "yes" is earned, not
extracted.

Lanes: `pre-audit`.

Product source: `product/03-presales-potential-report.md`, roadmap phase 1.

## Invariants

### D1 - Forecasts are conservative, never invented

No guaranteed first-place promises, no fabricated revenue figures, no
manufactured certainty. Conservative estimate ranges are allowed, and
uncertainty is visible as confidence rather than hidden.

### D2 - A lead is a durable record

An audit that arrives later must have something to attach to. A response that
returns a lead-shaped value without persisting it is not an intake.

### D3 - The intake path is public, so G4 applies without exception

This is the one route a stranger reaches before any account exists. It carries
a rate limit and leaves an audit trace, the way the tracking boundary does.
