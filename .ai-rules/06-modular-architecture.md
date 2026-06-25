---
description: "Modular architecture, file splitting, and schema-native comparison"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Modular Architecture

<meta-instruction>
Use this file for file/folder decisions. This applies to application source code; AI rules bundles use flat horizontal splitting for routing.
</meta-instruction>

<positive-directives>
- Extract concepts before extracting files.
- Start one file first when a feature is small and cohesive.
- Split files when density, reuse, testing, or ownership boundaries earn it.
- Keep direct-refactor and schema-native designs distinct during review.
- Prefer nearby helpers over global domain folders for UI display derivations and component-local policies.
</positive-directives>

## Typical evolution

```txt
small feature:
  return.service.ts

growing feature:
  return.domain.ts
  request-return.ts
  return.service.ts

serious lifecycle feature:
  return.domain.ts
  return.lifecycle.ts
  request-return.ts
  return.service.ts
```

<absolute-constraints>
- DO NOT create `types.ts`, `errors.ts`, `helpers.ts`, and `service.ts` for 80 lines of code.
- DO NOT split files just to mirror architectural layers.
- DO NOT keep a 900-line service method because “no folders.”
- DO NOT create global abstractions for local UI display helpers.
- DO NOT confuse AI rule-bundle structure with production source-code structure.
</absolute-constraints>

<context>
<example>
// Good: schema-native split when the feature earned it
```txt
asset-edit.domain.ts     // decideAssetEdit()
asset-edit.errors.ts     // error mapping
asset.service.ts         // NestJS shell and repositories
```
</example>

<example>
// Bad: folder ceremony before complexity
```txt
refund-calculator.interface.ts
refund-calculator.default.ts
refund-calculator.factory.ts
```
</example>
</context>

<pre-flight-checklist>
1. [ ] Did the split preserve a real concept?
2. [ ] Would a reader navigate less or more?
3. [ ] Is this direct local refactor or schema-native design?
</pre-flight-checklist>
