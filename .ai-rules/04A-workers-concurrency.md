---
description: "Workers, queues, concurrency, retries, and cancellation"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Workers and Concurrency

<meta-instruction>
Use this file when background work, queues, actors, retries, cancellation, locks, or shared mutable state appears.
</meta-instruction>

<positive-directives>
- Use typed message/job unions for background work.
- Give mutable process state one owner.
- Keep retry, timeout, and cancellation policies near the imperative shell.
- Use `AbortSignal` when cancellation is part of the protocol.
- Use worker/actor classes when lifecycle or owned mutation is real.
</positive-directives>

<absolute-constraints>
- DO NOT share mutable maps/sets across unrelated modules without an owner.
- DO NOT fire-and-forget promises without failure handling.
- DO NOT add an actor framework for a direct function call.
- DO NOT hide retries inside pure-looking helpers.
- DO NOT swallow worker failures without telemetry or policy.
</absolute-constraints>

<context>
<example>
// Good: typed job protocol with an owner
```ts
type EmailJob =
  | { type: 'send_welcome'; email: string }
  | { type: 'send_receipt'; orderId: string; email: string };

class EmailWorker {
  constructor(private readonly emails: EmailClient) {}
  async handle(job: EmailJob) { /* switch by job.type */ }
}
```
</example>

<example>
// Bad: shared mutable state modified from anywhere
```ts
export const processingUsers = new Set<string>();
```
</example>
</context>

<pre-flight-checklist>
1. [ ] Who owns the mutable state?
2. [ ] Are messages/jobs typed?
3. [ ] Are retries/cancellation/failures explicit?
</pre-flight-checklist>
