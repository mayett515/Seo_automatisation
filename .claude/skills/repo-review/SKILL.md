---
name: repo-review
description: Architecture-level review of a repository or subsystem against the Pragmatic TypeScript model. Use when the user asks for an architecture assessment, a second opinion on structure, or whether something is over-engineered — "review this repo", "assess the architecture", "where is the ceremony". NOT for reviewing a single diff or recent change (use anti-regression), NOT for type/schema drift questions (use source-of-truth-audit).
---

# Repo Review

Review against evidence in the codebase, never against a general impression
of what codebases like this usually look like. Every claim names a file; a
claim without a path is an opinion and does not belong in the report.

Read `.claude/skills/repo-review/references/casebook.md` (path from project
root) before pass 3 — it calibrates strong, medium, and weak fits so
restraint verdicts stay honest.

## Procedure

Work in passes. Do not attempt the whole repo in one look.

**Pass 1 — inventory.** Glob the tree. Count source lines per package,
identify the largest files and the entry points.

Then read the recent commit history (`git log --oneline`) and note which
paths keep reappearing. Size tells you where the code is; change frequency
tells you where the cost is, and the two rarely agree. Where they disagree,
review the churning path first: a finding there pays back on the next change,
a finding in a large file nobody touches pays back never. If the user named a
subsystem, take that and skip the inference.

**Pass 2 — per-area.** For each of type strategy, functional core,
procedural shell, boundaries, and tests: read a representative sample and
record findings with paths.

**Pass 3 — ceremony and restraint.** For each recurring abstraction, ask
which of the four ceremony-test justifications it buys (see CLAUDE.md). An
abstraction buying none is ceremony. Count occurrences before calling it a
pattern: three instances is a pattern, one is a choice. Equally: confirm code
that is already right. "Leave it alone" is a finding.

**Pass 4 — integration.** Look for inconsistency across areas: a modularity
rule the largest files violate, an error dialect used in one package and not
another.

## Output

For each finding: path, what is there, which justification it buys or fails
to buy, and the smallest change that would fix it. Sort by cost of leaving it
alone, not by ease of description.

Optionally close with the three-way rating from the source scheme when the
user wants calibration: original X/10, schema version Y/10, over-refactored
version Z/10 — pricing the over-engineered version keeps the review honest.

Hard rules:

- No claim without a path you actually read; no pattern inferred from an
  unopened file.
- Never recommend a rewrite where a rename would do.
- Never call something over-engineered without naming what the abstraction
  would have to buy to be justified.
- If the user pushes back, re-check the evidence and either correct the
  finding or hold it — never soften it to be agreeable.
