---
description: "Boundary ladder and smallest honest boundary"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Boundary Ladder

<meta-instruction>
Use this file to choose the boundary shape. Boundary is not synonymous with class.
</meta-instruction>

<positive-directives>
- Use a pure function boundary when there are no side effects.
- Use a module use-case function when one use case needs injected dependencies.
- Use a framework handler when the framework already gives the boundary.
- Use a service class when dependency ownership or framework DI is useful.
- Use adapter/worker classes when external systems, resources, lifecycle, or concurrency are owned.
</positive-directives>

## Ladder

```txt
1. Pure function
2. Module function
3. Framework handler / React hook / tRPC procedure / middleware / action
4. Service class
5. Adapter/client class
6. Worker/actor/process owner
7. Generated client
```

<absolute-constraints>
- DO NOT use a class merely because dependencies exist.
- DO NOT wrap a single pure function in a service object.
- DO NOT ignore a framework boundary that already exists.
- DO NOT introduce a new boundary that duplicates repo infrastructure.
- DO NOT choose a larger boundary than ownership requires.
</absolute-constraints>

<context>
<example>
// Good: module boundary is enough for one use case
```ts
export async function requestReturn(deps: ReturnDependencies, input: ReturnInput) {
  const order = await deps.orders.findById(input.orderId);
  const decision = decideReturn(order, input);
  // effects follow
}
```
</example>

<example>
// Bad: fake service class with no ownership
```ts
class ReturnDecisionService {
  decide(order: Order, input: ReturnInput) { return decideReturn(order, input); }
}
```
</example>
</context>

<pre-flight-checklist>
1. [ ] What capability or lifecycle is owned?
2. [ ] Is a smaller boundary enough?
3. [ ] Did I separate domain rules from boundary ownership?
</pre-flight-checklist>
