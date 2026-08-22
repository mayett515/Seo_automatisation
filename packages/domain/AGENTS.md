# Domain functional core

- No IO, framework imports, logging, timing, randomness, environment reads, or mutable module state.
- Pass external state, time, and randomness as explicit inputs.
- Accept already parsed domain values and do not revalidate them.
- Return expected failures as typed unions with stable codes.
- Model lifecycles as transitions between named states and keep transformations total.
- Named fallback variants replace silent catch-and-default behavior.
- Prefer guard clauses, exhaustive switches, typed decision maps, and named stages over deeply nested or point-free control flow.
- Core behavior must be testable without mocks.
