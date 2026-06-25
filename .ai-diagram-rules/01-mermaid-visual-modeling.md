---
description: "Mermaid diagram selection and quality rules"
globs: "**/*.{md,mmd}"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: ["mermaid?"]
priority_schema: "critical > strong > guideline"
---

# Mermaid Visual Modeling

<meta-instruction>
Use this file to choose and create Mermaid diagrams that clarify one hidden structure in the Local SEO product or application architecture.
</meta-instruction>

<positive-directives>
- Use flowcharts for process, control flow, dependency direction, and architecture boundaries.
- Use sequence diagrams for API calls, workers, agents, and deployment interactions over time.
- Use state diagrams for approvals, releases, jobs, lifecycle, and UI state.
- Use ER diagrams for database entities and relationships.
- Use class diagrams only when interfaces, adapters, or object structure are the main question.
</positive-directives>

<absolute-constraints>
- DO NOT create diagrams that are only decorative.
- DO NOT mix unrelated questions into one diagram.
- DO NOT use unclear node labels.
- DO NOT omit approval, preflight, deploy, rollback, or verification gates when they are part of the flow.
- DO NOT let diagram simplification change product truth.
</absolute-constraints>

<context>
Diagram choice guide:

```text
flowchart TD/LR     process, branches, boundaries
sequenceDiagram    actors over time
stateDiagram-v2    lifecycle states
erDiagram          database relationships
classDiagram       interfaces and object structure
mindmap            concept hierarchy
```

Good output includes the diagram, where it belongs, and a short explanation of how to read it.
</context>

<pre-flight-checklist>
1. [ ] Does this diagram clarify one hidden structure?
2. [ ] Is the Mermaid syntax stable and likely to render?
3. [ ] Did I explain how to read it when presenting it?
</pre-flight-checklist>

