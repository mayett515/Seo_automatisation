---
description: "Customer-control and approval rules for AI-assisted Local SEO automation"
globs: "**/*.{md,json,mmd,ts,tsx}"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - "local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/decisions/ADR-001-controlled-automation.md"
  - "local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/frontend/03-preview-and-notes-ux.md"
priority_schema: "critical > strong > guideline"
---

# Domain Execution Contract: Controlled Automation

<meta-instruction>
You have been routed here because the task touches customer approval, AI-generated suggestions, preview workflows, customer notes, or productive changes to customer assets.
</meta-instruction>

## 1. Focused Best Practices

<positive-directives>
- Preserve the core flow: AI suggests, customer approves, deterministic workers execute.
- Represent generated work as proposals, previews, versions, release plans, or observations before production.
- Convert customer notes into explicit text, image, layout, CTA, or SEO instructions.
- Show confidence, uncertainty, warnings, and next monitoring steps where decisions are customer-visible.
- Persist approvals, rejections, holds, ignored notes, and deployment decisions as audit events.
</positive-directives>

## 2. Hard Domain Prohibitions

<absolute-constraints>
- DO NOT imitate a customer decision.
- DO NOT deploy production changes without approval.
- DO NOT guarantee rankings, leads, or revenue.
- DO NOT silently change customer assets outside the preview or release flow.
- DO NOT use competitor data as a copy source.
</absolute-constraints>

## 3. Context-Dependent Trigger Gates

<conditional-logic>
IF a change affects a live customer asset:
THEN require an approved preview or approved release plan before execution.

IF a required customer note is unresolved:
THEN block release or explicitly carry the unresolved note into the next version.

IF an AI recommendation is customer-facing:
THEN include reasoning and risk without implying guaranteed results.
</conditional-logic>

## 4. Domain Anchoring & Examples

<context>
The product should feel automated but not uncontrolled. The customer decides what goes live.

<example>
```text
// Good: controlled release language
This version is ready for review. It improves the Dachau CTA and adds local FAQ proof. Approve it, hold Dachau, or add a note.
```
</example>

<example>
```text
// Bad: autonomous production action
I published the new Dachau page because the AI score was high.
```
</example>
</context>

## 5. Domain Post-Flight Verification

<pre-flight-checklist>
1. [ ] Did every productive action have a customer-owned decision?
2. [ ] Did I store the decision or note as an auditable event?
3. [ ] Did customer-facing text avoid guaranteed outcome language?
</pre-flight-checklist>
