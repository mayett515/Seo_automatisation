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

### Rule 1: The Default 15-Rule Budget & Horizontal Splitting
Normal domain files should stay at or below 15 total atomic behavioral rules inside `<positive-directives>` and `<absolute-constraints>`. Exceeding this budget can trigger attention dilution, so keep rules dense, sharp, and brief. **CRITICAL:** If a domain requires more than 15 rules, DO NOT omit or delete rules to fit the budget. Instead, split the domain horizontally into multiple sibling files (e.g., `01A-core-logic.md`, `01B-core-data.md`) so all rules are preserved. Router, guard, guardrail, and anti-regression shards may exceed the default only when frontmatter declares `rule_budget: "guard-exception"` and splitting would make routing or enforcement weaker. Even exception shards should split when `<absolute-constraints>` alone grows beyond roughly 20 rules.

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
