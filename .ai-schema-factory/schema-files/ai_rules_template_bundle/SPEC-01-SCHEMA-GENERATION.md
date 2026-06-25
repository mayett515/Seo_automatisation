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

### Rule 1: The 15-Rule Ceiling & Horizontal Splitting
Never generate more than 15 total rules or constraints within a single file. Exceeding this limit triggers attention dilution, causing the target model to ignore rules entirely. Keep rules dense, sharp, and brief. **CRITICAL:** If a domain requires more than 15 rules, DO NOT omit or delete rules to fit the limit. Instead, split the domain horizontally into multiple sibling files (e.g., `01A-core-logic.md`, `01B-core-data.md`) so all rules are preserved.

### Rule 2: Absolute Constraint Atomicity
Prohibitions inside `<absolute-constraints>` must be strictly atomic. Write **one distinct prohibition per bullet point, one behavior per line**. Never combine multiple constraints into compound, conversational prose.

### Rule 3: The U-Shaped Attention Flow Pattern
Position YAML, meta-instructions, and routing logic at the absolute top. Position the `<pre-flight-checklist>` at the absolute bottom. Place descriptive context and examples in the middle.

### Rule 4: Reason Freely, Format Second
Structure execution blocks to allow the target model to reason step-by-step in natural language *before* it compiles its final code output.

### Rule 5: Few-Shot Example Anchoring
Every generated domain reference file must contain a `<context>` block hosting exactly one compliant (`// Good`) code snippet and one non-compliant (`// Bad`) code snippet.

### Rule 6: Protocol & Tool Future-Proofing
Every generated YAML frontmatter MUST carry a "triple version": schema version, target model family, and protocol compatibility (e.g., `protocol_compat: "mcp: 2026-05"`). Declare external tools explicitly in a `dependencies` array.

### Rule 7: The Anti-Regression Strategy ("Via Negativa")
When creating an Anti-Regression file, do not use `<positive-directives>`. Rely entirely on `<incident-reports>` to provide historical context, and map those directly to `<absolute-constraints>` to explicitly ban the LLM from recreating past architectural drift.
