---
description: "Pre-edit implementation checklist for TypeScript/backend changes"
globs: "**/*.{ts,tsx,mts,cts}"
alwaysApply: false
version: "3.5.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Pre-Edit Implementation Checklist

<meta-instruction>
Use this file before changing TypeScript/backend code. Treat it like a lightweight pre-typechecker: identify the boundary and failure mode before editing, then load the specific sibling rules that apply. This is a guardrail, not a source-of-truth audit; post-change type/schema drift is governed by `.ai-rules/08F-source-of-truth-audit-workflow.md`.
</meta-instruction>

<positive-directives>
- Identify the boundary first: external input, DB row, internal value, adapter input/output, worker payload, provider response, or cross-process handoff.
- Use Zod at trust boundaries only; use TypeScript types, `satisfies`, and explicit return types for trusted internal values.
- Prefer asking whether a source-of-truth risk exists over introducing new types, schemas, brands, helpers, or factories preemptively.
- Keep provider adapters provider-specific; move domain rendering, product policy, and release decisions to core packages.
- Check queue idempotency at both BullMQ job ID and database audit/ledger levels.
- For external mutations, write local intent/ledger state before or around side effects and define retry/crash behavior.
- Use durable storage for production cross-process handoff; local filesystem handoff is local/test only.
- Make constraint and `NOT NULL` migrations backfill-safe for non-empty databases.
- Update architecture/progress docs in the same slice when implementation changes lifecycle truth.
</positive-directives>

<absolute-constraints>
- DO NOT parse internally constructed trusted values with Zod just to feel safe.
- DO NOT put presentation rendering or product policy inside provider adapters.
- DO NOT let queue retries or duplicate enqueue paths create orphan audit rows.
- DO NOT let provider accepted/uploaded/building states become live-health truth.
- DO NOT add production side effects without an explicit retry and crash-window story.
- DO NOT use this pre-edit checklist to force type derivation, brands, schemas, or abstractions before real drift exists.
</absolute-constraints>

<pre-flight-checklist>
1. [ ] Did I name the trust boundary before editing?
2. [ ] Did I pick the right validation/type strategy for that boundary?
3. [ ] Did I avoid adding type ceremony before the post-change source-of-truth audit proves drift?
4. [ ] Did I check idempotency, storage durability, and migration safety where relevant?
5. [ ] Did I update docs when lifecycle truth changed?
</pre-flight-checklist>
