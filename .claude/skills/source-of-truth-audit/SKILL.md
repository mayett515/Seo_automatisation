---
name: source-of-truth-audit
description: Find duplicated or drifted definitions of the same concept across a TypeScript codebase. Use when a type and a schema may have diverged, when adding a field required edits in several places, or when asking whether a definition is mirrored — "is this type duplicated", "find drift", "why did I have to change three files". NOT for reviewing a diff (anti-regression) and NOT a general architecture review (repo-review); this skill only hunts duplicate/drifted definitions.
---

# Source of Truth Audit

A concept should have exactly one definition that everything else derives
from. Prefer a mechanical check over reading, and a permanent check over a
one-off audit.

## Procedure

1. Run the bundled scanner first (path is from the project root):
   `node .claude/skills/source-of-truth-audit/scripts/find-drift.mjs [rootDir]`.
   It flags exported interfaces/types declared adjacent to a same-named Zod
   schema without `z.infer`/`z.output` derivation, and same-named exported
   type declarations in multiple packages. Treat its output as candidates,
   not verdicts.
2. For each candidate, Grep the concept name across the repo including plural
   and cased variants, and classify each hit: the source, a derivation
   (`z.output`, `keyof typeof`, indexed access), or a mirror (restates the
   shape by hand).
3. For each mirror, check whether the two definitions currently agree. A
   mirror that already disagrees is a bug, not a smell — report it first.
4. Propose the single source and the derivation for every other site.
5. If the same class of mirror can recur, extend the host repo's guard script
   (`tools/`) so the audit does not need repeating. A check that fails CI is
   worth more than a finding in a report.
6. When the audit ends in a rename, the rename is not finished when the code
   compiles. A rename refactor rewrites every reference the type graph can
   resolve, and editing a declaration by hand turns the remaining ones into
   compile errors; both reach code and nothing else. Strings, comments,
   Markdown, and configuration lie outside, so a retired name survives there
   through a green build — a typechecker does not read prose, and a prose
   check does not know a symbol was renamed. Search the retired name across
   the whole repository, exempt what deliberately records the past
   (changelogs, decision records, progress notes), and repair the rest. Repair
   the claim rather than the word: deleting a stale sentence is often the
   honest fix, and a rule demanding that the successor stand where the old
   name stood teaches authors to paste it in to turn a check green. Then
   record the retirement where a check can enforce it, so the tree cannot
   drift back to the old name later.

## Judgment rules

- Two types with the same fields and different meanings are correctly
  separate — never report a coincidental shape match as duplication.
- A DTO deliberately decoupled from a domain model is not a mirror; the
  separation is the point. Mark intentional duplication as an observation,
  not a failure.
- Never propose a derivation chain longer than the union it replaces.

## Output

Ranked: **Blocking** (mirror already drifted / correctness issue),
**Warnings** (duplicate truth that can drift), **Observations** (intentional,
fine), **Recommendation** (smallest useful action: derive, document, map,
rename, or leave alone).
