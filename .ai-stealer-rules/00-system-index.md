---
description: "Repo-catalog, GitHub, and web research workflow router"
globs: "**/*.{md,json,mmd,ts,tsx}"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: ["web-search?"]
priority_schema: "critical > strong > guideline"
---

# Stealer Workflow Router

<meta-instruction>
Use this router when the task asks to find, compare, or adapt proven architecture, folder structures, component systems, workflows, algorithms, or implementation patterns from existing repositories or the web.
</meta-instruction>

<routing-logic>
IF the task asks for repo-catalog research, GitHub examples, web research, or architecture pattern extraction:
THEN load `.ai-stealer-rules/01-repo-catalog-workflow.md`.
</routing-logic>

<positive-directives>
- Start from `.ai-stealer-catalog/repo-catalog/index/module-intent-index.md` when the target capability is known.
- Use `.ai-stealer-catalog/repo-catalog/index/search-terms.md` to guide repository searches.
- Extract solution shape before implementation details.
- Map stolen ideas into the Local SEO stack before recommending them.
- Record references when a planning decision depends on an external source.
</positive-directives>

<absolute-constraints>
- DO NOT copy code verbatim without license review.
- DO NOT adopt a whole repo when one module pattern is enough.
- DO NOT use competitor content as source copy for customer SEO pages.
- DO NOT let research delay a small obvious implementation.
- DO NOT hide external-source assumptions in final architecture decisions.
</absolute-constraints>

<pre-flight-checklist>
1. [ ] Did I identify the specific capability being researched?
2. [ ] Did I prefer local catalog first, then web/GitHub when useful?
3. [ ] Did I turn the source into an adapted project decision?
</pre-flight-checklist>

