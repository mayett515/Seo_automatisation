---
description: "Meta-specification defining the cognitive architecture and tokenomic constraints of the AI rule system."
globs: "*"
alwaysApply: true
version: "4.0.0"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical"
---

# Meta-Cognition Spec: The AI Operating System

<meta-instruction>
You are analyzing the foundational operating system of this repository. This document defines the mathematical, cognitive, and formatting mandates required for you to process rules without suffering from Attention Dilution or Context Fragmentation. You MUST internalize these mechanics before executing user code.
</meta-instruction>

## 1. Polyglot Formatting Fences

<positive-directives>
- You MUST treat YAML frontmatter as immutable environment memory.
- You MUST treat all XML tags (e.g., `<absolute-constraints>`) as strict, logit-level boolean execution gates.
- You MUST apply the U-Shaped Attention Flow to all interactions: process global routing at the top, evaluate contextual examples in the middle, and execute the pre-flight checklist at the bottom.
</positive-directives>

## 2. Tokenomic & Structural Boundaries

<absolute-constraints>
- THE 15-RULE CEILING: No single execution file is permitted to hold more than 15 atomic behavioral rules.
- FLAT TRAVERSAL: Do not attempt to traverse or generate deeply nested directories. All rule ecosystems MUST be structured as horizontal, flat nodes (e.g., `01A`, `01B`).
- TERMINAL LEAVES: Level 2 feature sub-files MUST NOT contain `<routing-logic>` pointing downward. Infinite recursion traps are banned.
- VIA NEGATIVA: When enforcing negative constraints, do not use conversational prose. Use atomic, isolated bullet points to mathematically distance banned tokens from execution patterns.
</absolute-constraints>

## 3. Cognitive Context Sharding

<conditional-logic>
IF the user prompt requests a distinct cognitive task (e.g., Architectural Planning vs. Routine Execution) OR a distinct Objective Stack (Frontend vs Backend):
THEN you MUST isolate those rules into separate environment shards (distinct `.folders`) to prevent context bleeding.

IF you are operating inside a specific shard (e.g., `.kordex-refactor-rules/`):
THEN you MUST ignore general directives from entirely separate shards unless explicitly bridged by the root Master Router.
</conditional-logic>

## 4. Example: Schema Compliance

<context>
The following demonstrates the required density and atomicity for all generated logic within this system.

<example>
// Compliant: Atomic, dense, XML-fenced logic
<absolute-constraints>
- DO NOT use the `any` type under any circumstances.
- ALWAYS extract DOM event handlers into isolated pure functions.
</absolute-constraints>
</example>

<example>
// Non-Compliant: Conversational, diluted, undefined boundaries
Please make sure that you try not to use the any type because it breaks type safety, and also if you can, keep the DOM handlers separate from the main logic.
</example>
</context>

## 5. System Execution Verification

<pre-flight-checklist>
Before finalizing any code generation or file scaffolding, internally verify:
1. [ ] Have I adhered strictly to the XML behavioral fences provided by my current contextual shard?
2. [ ] Is my generated output dense, free of conversational filler, and aligned with the Via Negativa bans?
3. [ ] If generating a new rule file, did I enforce the 15-rule ceiling and the flat hierarchy constraints?
</pre-flight-checklist>
