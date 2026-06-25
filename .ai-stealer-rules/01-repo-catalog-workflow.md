---
description: "Good Artist Steals workflow for fast architecture and implementation research"
globs: "**/*.{md,json,mmd,ts,tsx}"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: ["web-search?"]
priority_schema: "critical > strong > guideline"
---

# Repo Catalog Workflow

<meta-instruction>
Use this workflow to move quickly from capability need to proven reference pattern without turning research into a rewrite of someone else's project.
</meta-instruction>

<positive-directives>
- Define the target capability in one sentence before searching.
- Search the local repo catalog before broad web search.
- Inspect only the source modules relevant to the capability.
- Compare at least two references when the decision is architecture-significant.
- Translate the pattern into our stack, boundaries, and product constraints.
</positive-directives>

<absolute-constraints>
- DO NOT paste external code into the project without license and attribution checks.
- DO NOT copy design/content from competitors.
- DO NOT import architecture that violates controlled automation.
- DO NOT let vendor DTOs leak into the domain model.
- DO NOT use a pattern if a smaller local solution is clearer.
</absolute-constraints>

<context>
Primary local catalog entry points:

```text
.ai-stealer-catalog/repo-catalog/README.md
.ai-stealer-catalog/repo-catalog/index/module-intent-index.md
.ai-stealer-catalog/repo-catalog/index/repo-index.md
.ai-stealer-catalog/repo-catalog/index/search-terms.md
```

High-value aisles for this app:

```text
13-backend-frameworks-and-patterns
14-web-extraction-and-browser-agents
15-website-templates-and-ui-components
16-tanstack-and-frontend-architecture
17-agentic-workflows-and-mcp-servers
23-database-and-orm
24-testing-and-quality
25-devops-and-ci-cd
```
</context>

<pre-flight-checklist>
1. [ ] Did I separate idea, API shape, data model, and code copying?
2. [ ] Did I cite or record the source when it influenced a decision?
3. [ ] Did I adapt the pattern to our actual stack instead of cargo-culting it?
</pre-flight-checklist>

