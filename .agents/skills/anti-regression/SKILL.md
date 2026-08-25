---
name: anti-regression
description: Verify that a specific TypeScript change preserved existing behavior and did not reintroduce a fixed problem. Use after a refactor or large edit and before merging; use repo-review for architecture and source-of-truth-audit for duplicated definitions.
---

# Anti-regression

Determine whether behavior that worked before still works after the current change.

1. Establish the staged and unstaged diff. Review what changed, not the whole repository.
2. For every changed export or signature, find and inspect its callers.
3. If a discriminated union changed, locate every switch or decision map over it.
4. If a schema changed, check compatibility with stored data, queued payloads, API clients, and generated artifacts written under the previous shape.
5. Audit removed branches before believing they were dead. A branch that looks unreachable often does double duty - the classic case is a guard whose `if` also narrows an optional handle. Prove reachability from an actual caller before deleting, and check whether the compiler was relying on it.
6. Run the repository's relevant lint, typecheck, tests, guard scripts, and full gate when proportionate. Report failures verbatim with paths. Match the proof to the change; when the fitting proof cannot run, name the missing one instead of substituting a cheaper green check.
7. State what could not be verified. A passing suite is not evidence for changed behavior that lacks coverage.

## Findings

Rank concrete regressions first. For each, include `path:line`, the previous behavior at risk, a failure scenario, and the smallest corrective action. If no regression is found, say so and list the checks actually run.

## Promote durable lessons

Do not add prose for every incident. Before promoting a lesson, check the relevant framework's current official documentation. Put the lesson in the narrowest durable owner: lint/hooks/scripts/CI for mechanical constraints, the nearest `AGENTS.md` for stable local invariants, a focused skill reference for repeatable procedures, or an ADR/runbook for product and operational decisions. Add prose only when the lesson is stable, repeated, and cannot be enforced mechanically.
