---
description: "Mermaid and architecture visualization router"
globs: "**/*.{md,mmd}"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: ["mermaid?"]
priority_schema: "critical > strong > guideline"
---

# Diagram Rules Router

<meta-instruction>
Use this router when the task asks for Mermaid diagrams, visual architecture, flowcharts, sequence diagrams, state machines, class diagrams, ERDs, activity-style flows, or diagram cleanup.
</meta-instruction>

<routing-logic>
IF the task asks to create, update, choose, or debug a diagram:
THEN load `.ai-diagram-rules/01-mermaid-visual-modeling.md`.
</routing-logic>

<positive-directives>
- Use diagrams only when they clarify flow, state, boundaries, relationships, or architecture.
- Prefer small diagrams with one purpose.
- Put diagrams near the explanation they support.
- Use stable Mermaid syntax first.
- Explain how to read the diagram when presenting it.
</positive-directives>

<absolute-constraints>
- DO NOT create decorative diagrams.
- DO NOT make one giant diagram answer unrelated questions.
- DO NOT use vague labels like A, B, Node1, or Thing.
- DO NOT hide approval, deploy, or verification gates in product diagrams.
- DO NOT replace product truth with diagram aesthetics.
</absolute-constraints>

<context>
Project diagrams live primarily in:

```text
local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/diagrams/
deployment-agent-extension-only/local-seo-product-knowledge-pack/diagrams/
```

</context>

<pre-flight-checklist>
1. [ ] Did the diagram answer one clear question?
2. [ ] Did I choose the diagram type by structure, not aesthetics?
3. [ ] Did I keep labels human-readable?
</pre-flight-checklist>
