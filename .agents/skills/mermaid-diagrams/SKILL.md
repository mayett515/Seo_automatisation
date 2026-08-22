---
name: mermaid-diagrams
description: Create, choose, or fix a Mermaid diagram that clarifies one structure — flowchart, sequence, state, ER, or class. Use for architecture visualization, lifecycle diagrams, worker/API interaction diagrams, and diagram cleanup; not for product decisions (diagrams illustrate truth, they never define it).
---

# Mermaid Diagrams

A diagram earns its place by clarifying exactly one hidden structure. Decorative diagrams, vague labels, and one giant diagram answering unrelated questions are findings, not output.

## Choose the type by structure, not aesthetics

```text
flowchart TD/LR     process, branches, dependency direction, boundaries
sequenceDiagram     actors over time: API calls, workers, agents, deploys
stateDiagram-v2     lifecycles: approvals, releases, jobs, UI state
erDiagram           database entities and relationships
classDiagram        interfaces, adapters, object structure (only when that IS the question)
mindmap             concept hierarchy
```

## Procedure

1. Name the one question the diagram answers. No question, no diagram.
2. Pick the type from the table. Prefer small diagrams with one purpose over one large one.
3. Use human-readable labels — never `A`, `B`, `Node1`, `Thing`.
4. Product flows must show their gates: approval, preflight, deploy, rollback, and verification steps are never omitted for visual simplicity, and simplification never changes product truth.
5. Use stable Mermaid syntax; verify it renders.
6. Deliver three things: the diagram, where it belongs (near the explanation it supports — project diagrams live in the product knowledge packs' `diagrams/` folders), and one short paragraph on how to read it.
