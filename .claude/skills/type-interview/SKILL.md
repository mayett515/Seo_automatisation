---
name: type-interview
description: Lock domain types with the user before writing implementation code. Use when starting a feature, module, workflow, or integration whose data model is NOT yet settled, or when the user says generated structures keep missing what they meant — "design the types first", "model this domain", "before you implement". NOT when existing contracts/types in the repo already define the model (read those and implement), and NOT for small changes inside an established model.
---

# Type Interview

Types are the tightest specification an agent can be given. Once input and
output types are fixed, the implementation space collapses and the compiler
enforces coherence for free. This skill front-loads that agreement instead of
policing it afterwards.

## Procedure

1. Read enough of the codebase to find the existing conventions: error
   unions, envelope shapes, branded identifiers, naming style. Do not invent
   a second dialect — and do not ask about anything the codebase already
   answers.
2. Propose the data model and nothing else — no implementation, no
   scaffolding, no file layout:
   - domain types, as discriminated unions where states are exclusive
   - the state machine, if the thing has a lifecycle
   - the error union, with stable codes
   - the boundary schema, if untrusted data enters
   No proposed type may permit a state the domain forbids.
3. Ask at most three questions, only about edge cases where a wrong guess is
   expensive to undo: what happens when the external source is unavailable,
   whether a field can legitimately be absent, what the caller does with each
   failure. ("Can a page proposal exist without a resolved opportunity?" is a
   good question; "Should I use Zod?" is answered by the repo.)
4. Wait for approval. Revise. Do not write implementation code until the
   user accepts the types.
5. Once approved, write the types to a file and treat it as frozen for the
   rest of the task — implementation adapts to the types, not the reverse.
