---
name: repo-review
description: Review a TypeScript repository or subsystem for architecture, boundary ownership, correctness risks, and unnecessary ceremony. Use for architecture assessments and structural second opinions; use anti-regression for one diff and source-of-truth-audit for duplicate definitions.
---

# Repository review

Review evidence in the codebase, not a generic impression. Every finding must cite a file actually inspected.

1. Inventory the relevant tree, entry points, package boundaries, and largest source files.
   Then read `git log --oneline` and note which paths keep reappearing. Where file size and change frequency disagree, review the churning path first: a finding there pays back on the next change, a finding in a large file nobody touches pays back never.
2. Sample type strategy, functional core, procedural shell, adapters, validation, errors, and tests in each relevant area.
3. Read [references/casebook.md](references/casebook.md) before judging ceremony or restraint.
4. For recurring abstractions, ask which ceremony-test benefit they buy: illegal state removed, failure moved to compile time, capability/lifecycle ownership, or real deduplication. Count occurrences before calling one choice a pattern.
5. Check integration across areas: inconsistent error dialects, dependency direction violations, public row/provider types, and documented rules the largest files contradict.

## Output

Sort findings by cost of leaving them alone. For each finding provide:

- `path:line`
- observed behavior or structure
- concrete risk or justification it fails to buy
- smallest useful change

Confirm code that is already right. Do not recommend a rewrite where a rename, derivation, boundary move, or no change is enough.
