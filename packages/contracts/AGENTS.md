# Contracts and schemas

- Each external contract has one schema source and derives parsed types with `z.output`.
- Use `z.input` only where coercion, defaults, transforms, or preprocessing make input different from output.
- A `ZodError` never escapes the boundary; map it into the repository error contract.
- Never hand-write a parallel interface for the same schema.
- Schema shape does not prove semantic correctness; domain invariants remain named core functions.
- Contract changes account for stored JSON, queued payloads, API clients, and backward compatibility.

- Every object schema decides explicitly about unknown properties. `z.object()` accepts and silently strips them, which is a policy nobody chose; API, queue, and persistence contracts here are strict. Strip, passthrough, or catchall need a written compatibility reason, and existing schemas migrate one contract at a time after a producer audit.
