# Engineering Specification: Schema Generation & Anti-Regression Rules

## Purpose
This document provides the mandatory operational criteria, cognitive mechanics, and format intents for generating or editing repository architecture rule files (`.md`). 

---

## 1. The Polyglot Format Selection Matrix

When generating any rule file, you must strictly assign data types to their optimized functional domains. Never mix these formatting intents:

| Format Syntax | Functional Domain | LLM Cognitive Treatment |
| :--- | :--- | :--- |
| **YAML Frontmatter** | Metadata, Protocols, and Globs | **Immutable Schema Memory:** Grounds the model's global boundaries before text parsing begins. |
| **XML Body Tags** | Behavioral Control Logic and Constraints | **Hard Operational Fences:** Acts as a cognitive circuit breaker, forcing attention weights to prioritize enclosed rules. |
| **Markdown Prose** | Navigational Structure and Code Examples | **Navigational Anchors:** Maps headings to an Abstract Syntax Tree (AST) for precise section chunking. |

---

## 2. Operational Generation Boundaries

### Rule 1: The Default 15-Rule Review Threshold & Adaptive Horizontal Splitting
Normal domain files should target 15 or fewer total atomic behavioral rules inside `<positive-directives>` and `<absolute-constraints>`. Fifteen is a review threshold, not an automatic ceiling. When a file would exceed it, inspect duplication, cohesion, routing precision, and attention density before choosing a structure. **CRITICAL:** DO NOT omit, delete, or combine independent rules merely to reduce the count. Split horizontally only when every sibling owns an independently coherent, directly routable concern and the split improves comprehension. If the rules must be reasoned about together and splitting would fragment their context, keep the cohesive file intact, declare `rule_budget: "cohesion-retained"`, and record that rationale in `<context>`. This marker makes the review decision auditable; it does not turn count alone into a failure. Router, guard, guardrail, and anti-regression shards that remain intentionally larger because splitting would weaken enforcement should continue to declare `rule_budget: "guard-exception"`. Even those shards should be reviewed when `<absolute-constraints>` alone grows beyond roughly 20 rules.

### Rule 2: Absolute Constraint Atomicity
Prohibitions inside `<absolute-constraints>` must be strictly atomic. Write **one distinct prohibition per bullet point, one behavior per line**. Never combine multiple constraints into compound, conversational prose.

### Rule 3: The U-Shaped Attention Flow Pattern
Position YAML, meta-instructions, and routing logic at the absolute top. Position the `<pre-flight-checklist>` at the absolute bottom. Place descriptive context and examples in the middle.

### Rule 4: Reason Freely, Format Second
Structure execution blocks to allow the target model to reason step-by-step in natural language *before* it compiles its final code output.

### Rule 5: Few-Shot Example Anchoring
Generated implementation/domain reference files should contain a `<context>` block with one concise compliant (`// Good`) code snippet and one non-compliant (`// Bad`) code snippet when they teach implementation behavior. Router, index, guard, guardrail, and anti-regression shards are exempt from mandatory Good/Bad snippets; they should instead provide concrete routing conditions, incident reports, seam descriptions, or executable guard references.

### Rule 6: Protocol & Tool Future-Proofing
Every generated YAML frontmatter MUST carry a "triple version": schema version, target model family, and protocol compatibility (e.g., `protocol_compat: "mcp: 2026-05"`). Declare external tools explicitly in a `dependencies` array.

### Rule 7: The Anti-Regression Strategy ("Via Negativa")
Anti-regression files default to via-negativa: use `<incident-reports>` for historical context and map those reports directly to `<absolute-constraints>`. A hybrid anti-regression file may use `<positive-directives>` only when frontmatter declares `anti_regression_mode: "hybrid-boundary"` and every positive directive is tied to a repeated finding, accepted architecture decision, source-of-truth seam, or executable guard. Hybrid files may substitute `<context>` seam blocks for incident reports when those seams are pinned by tests or guard scripts.
