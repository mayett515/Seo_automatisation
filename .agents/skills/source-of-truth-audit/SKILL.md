---
name: source-of-truth-audit
description: Find duplicated or drifted definitions of the same TypeScript concept across schemas, types, packages, and contracts. Use when one field requires edits in several places or a type may mirror a schema; use repo-review for general architecture.
---

# Source-of-truth audit

One concept should have one owning definition; other representations derive or map deliberately.

1. Run `node .agents/skills/source-of-truth-audit/scripts/find-drift.mjs [rootDir]`. Treat results as candidates, not verdicts.
2. Search each concept across the repository, including cased and plural variants.
3. Classify every relevant definition as source, derivation, deliberate boundary DTO, or hand-written mirror.
4. Report mirrors that already disagree as correctness bugs before potential drift.
5. Propose the single owner and the smallest derivation or mapper for other sites.
6. When a confirmed class can recur, propose or implement a repository guard rather than relying on repeated audits.

Do not report two equally shaped types with different meanings as duplication. Do not replace a deliberate transport/domain boundary with a long derivation chain.

Rank output as blocking drift, warnings, deliberate observations, and smallest recommendation.
