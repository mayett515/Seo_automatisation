---
description: "Comment architecture for purpose, boundaries, and intent"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Comment Architecture

<meta-instruction>
Use comments to explain responsibility boundaries, not obvious syntax. Comments should support modular architecture.
</meta-instruction>

<positive-directives>
- Use file headers for purpose, may, and may-not boundaries when a file has architectural responsibility.
- Use function comments for non-obvious business meaning, failure models, or boundary exclusions.
- Use comments to explain why side effects live in the shell.
- Use comments to distinguish expected business failures from unexpected system failures.
- Keep comments short enough to stay true and maintainable.
</positive-directives>

## File header pattern

```ts
/**
 * Functional Core
 *
 * Purpose:
 * Decide whether asset edits are allowed.
 *
 * May:
 * - inspect asset facts
 * - validate crop bounds
 *
 * May NOT:
 * - access repositories
 * - queue jobs
 * - throw framework exceptions
 */
```

<absolute-constraints>
- DO NOT narrate obvious syntax.
- DO NOT write large stale enterprise headers.
- DO NOT repeat the filename as a comment.
- DO NOT comment every line to make code look architected.
- DO NOT hide weak naming behind explanatory comments.
</absolute-constraints>

<context>
<example>
// Good: boundary intent
```ts
// Imperative shell: payment providers can fail, timeout, or retry, so refunds stay outside decideReturn().
await payments.refund(input);
```
</example>

<example>
// Bad: narration
```ts
// Find the item.
const item = items.find(item => item.id === id);
```
</example>
</context>

<pre-flight-checklist>
1. [ ] Does the comment explain purpose, boundary, or business meaning?
2. [ ] Would renaming code remove the need for the comment?
3. [ ] Is the comment likely to stay true after refactors?
</pre-flight-checklist>
