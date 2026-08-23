---
paths:
  - "**/*.{ts,tsx,mts,cts}"
---

# Error Modeling

The choice between throwing and returning is about who is expected to handle
the failure.

| Category | Retryable | Shape |
| --- | --- | --- |
| Transient (timeout, rate limit) | yes, with backoff | `{ ok: false; code: 'timeout'; retryAfterMs?: number }` |
| Validation | no, fix the input | `{ ok: false; code: 'invalid_input'; field: string }` |
| Business | no, explain it | `{ ok: false; code: 'policy_violation'; message: string }` |
| Permission | no, escalate | `{ ok: false; code: 'forbidden' }` |
| Programmer error | no | throw |

- Return a union for failures the caller must handle; throw for failures that
  mean the program is wrong. Never wrap in `Result` when the only failure is
  a bug.
- Every failure gets a stable string code to switch on; messages are for
  humans only — never branch on message text.
- A transient failure and a valid empty result must be distinguishable shapes.
- Include what was attempted (query, id, amount) so the caller can decide.

```ts
// A timeout and a valid empty result are distinguishable: empty is ok:true
// with hits: [], transient failure is ok:false with the table's shape.
type SearchOutcome =
  | { ok: true; hits: Hit[] }
  | { ok: false; code: 'timeout'; query: string; retryAfterMs?: number };
```

## Catching and logging

JavaScript can throw any value; normalize before reading properties.

- Treat caught values as `unknown`; narrow with `instanceof Error` or an
  `ensureError` helper before touching `.message` or `.stack`.
- When wrapping, preserve the original via `cause`. Never wrap and drop it.
- Log once, at the owning boundary. Never log-and-rethrow through every
  layer, and never swallow after logging.
- Keep dynamic data in structured context, not interpolated into the message
  (stable messages keep error grouping intact). No secrets, tokens, or full
  request bodies in error context.
- Never leave an empty `catch`. If ignoring is correct, say why in one line.

```ts
function ensureError(value: unknown): Error {
  return value instanceof Error
    ? value
    : new Error('Non-error value was thrown', { cause: value });
}
```
