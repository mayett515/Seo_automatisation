---
description: "Framework boundaries, adapters, and generated client boundaries"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Framework, Adapter, and Generated Client Boundaries

<meta-instruction>
Use this file when code touches framework handlers, React hooks, middleware, controllers, adapters, or generated clients.
</meta-instruction>

<positive-directives>
- Treat framework entry points as boundaries: route handlers, actions, middleware, hooks, procedures, controllers.
- Translate framework shapes into internal data before policy decisions.
- Keep adapter classes responsible for external-system weirdness.
- Use generated clients as boundary contracts, not as dumping grounds for domain logic.
- Prefer repository/adapters when storage or API details should not leak outward.
</positive-directives>

<absolute-constraints>
- DO NOT let framework request/response objects leak into pure core functions.
- DO NOT duplicate generated client abstractions locally without a reason.
- DO NOT hide retry/auth/cache policies in anonymous wrappers.
- DO NOT move business rules into adapter classes unless the rule is adapter-specific.
- DO NOT replace framework conventions with custom architecture for style reasons.
</absolute-constraints>

<context>
<example>
// Good: tRPC/handler shell maps edge to core
```ts
const input = parseCreatePostForm(formData);
const decision = validateCreatePost(input);
if (!decision.ok) return json({ error: decision.error }, { status: 400 });
```
</example>

<example>
// Bad: pure rule depends on framework request
```ts
function canEditAsset(req: NextRequest) { return req.cookies.has('admin'); }
```
</example>
</context>

<pre-flight-checklist>
1. [ ] Did I keep framework-specific objects at the edge?
2. [ ] Did the adapter hide external weirdness without hiding domain meaning?
3. [ ] Did generated types remain source-of-truth boundaries?
</pre-flight-checklist>
