---
name: anti-regression
description: Verify that a specific change preserved existing behavior and did not reintroduce a fixed problem. Use after a refactor or large edit, before merging — "did this break anything", "check the refactor", "regression check", "before I merge". NOT an architecture assessment (use repo-review), NOT a duplicate-type hunt (use source-of-truth-audit); this skill only answers whether prior behavior survived a change.
---

# Anti-Regression

The question is not whether the new code is good; it is whether anything that
worked before still works.

## Procedure

1. Establish the diff. Read what changed, not what exists.
2. For each changed export, find its callers with Grep. A signature change
   with an unexamined caller is the most common regression.
3. Check union arms. If a discriminated union gained or lost a member, every
   `switch` over it is a candidate site. Exhaustiveness lint only protects
   where the switch is exhaustive.
4. Check boundary contracts. If a schema changed, ask whether stored data
   written under the old schema still parses, and whether queued jobs written
   under the old payload shape still process.
5. Run the checks the repo provides (lint, typecheck, tests, guard scripts;
   `pnpm check` if available). Report failures verbatim with paths. Never
   report a clean result without having run them.
6. State explicitly what you could not verify. Silence is not coverage, and a
   passing suite proves nothing about changed code that has no test.

## Recording new incidents

When this skill (or production) catches a regression that a rule could have
prevented, append a one-line dated ban to the `.claude/rules/` file that owns
the touched layer — that is where the old scheme's incident-report mechanism
now lives. Do not collect incidents in this skill file.

Bans do not accumulate without limit: a ban a lint rule or hook can express
moves there and leaves the prose; when a rule file carries more than a
handful, promote the oldest to a check or prune it at review time.

Promotion discipline (from the old official-doc-refresh workflow): before
hardening a lesson into a rule, check the official docs of the framework
concerned — the fix may be an idiom, not a ban. Promote only lessons that are
stable, repeatable, and would have prevented a real issue here; a best
practice this project has never been bitten by stays out.
