---
paths:
  - "docs/**/*.md"
  - "**/*.md"
---

# Documentation

Docs are claims about the system; a stale claim is worse than no claim.

- When an implementation change alters lifecycle truth (states, flows,
  ownership, commands), update the affected doc in the same change — never
  "later".
- Write claims that can be falsified by reading the code, and use honest
  verbs: implemented means shipped and verifiable; planned means not built.
  Never describe intended behavior in the present tense.
- Answer first, context after: state what the reader must do or know in the
  first lines, details below. Prose for reasoning, tables only for enumerable
  facts, one heading level per concern.
- No duplicated truth: link to the owning doc or code instead of restating
  it. A number, command, or path that lives in two files will drift.
- Examples are executable or exact: commands copy-paste-runnable, paths real,
  code fences syntactically valid.
