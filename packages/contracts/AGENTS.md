# Contracts and schemas

- Each external contract has one schema source and derives parsed types with `z.output`.
- Use `z.input` only where coercion, defaults, transforms, or preprocessing make input different from output.
- A `ZodError` never escapes the boundary; map it into the repository error contract.
- Never hand-write a parallel interface for the same schema.
- Schema shape does not prove semantic correctness; domain invariants remain named core functions.
- Contract changes account for stored JSON, queued payloads, API clients, and backward compatibility.
