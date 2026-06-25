---
description: "Guidelines for when to create new .folders, cognitive context sharding, and horizontal file splitting."
globs: "*"
alwaysApply: false
version: "3.0.0"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical"
---

# Advanced Context Sharding: Managing Multiple `.Folders`

<meta-instruction>
You have been routed to this file because the user's architectural needs may require separating rules into completely isolated environments (distinct hidden `.folders`). This document dictates WHEN to ask for or execute the creation of multiple folders and HOW to route between them to prevent AI context bleeding.
</meta-instruction>

## 1. The Consent Gate for New `.Folders`

<absolute-constraints>
- DO NOT autonomously generate new `.hidden` environment folders based purely on assumptions.
- ALWAYS explicitly ask the user for permission before scaffolding a new context shard (e.g., "Should we create a dedicated `.ai-testing-rules` folder for this?").
- You may ONLY execute the creation of a new `.folder` if the user explicitly commands it or confirms your suggestion.
</absolute-constraints>

<conditional-logic>
IF the user's workflow implies a distinct cognitive state or a massive new technology domain that risks cluttering the main `.ai-rules` folder:
THEN halt generation and PROPOSE creating a new isolated `.folder`.

IF the user explicitly commands "Create a new `.folder` for this schema" OR confirms your proposal:
THEN you MUST implement Context Sharding by scaffolding the dedicated, hidden folder.
</conditional-logic>

## 2. The 15-Rule Internal Ceiling & Horizontal Splitting

<positive-directives>
- Once inside a specifically authorized `.folder`, you MUST count rules by the number of bullet points inside `<positive-directives>` and `<absolute-constraints>`, NOT by the number of files in the directory.
- When a domain requires more than 15 total rules to explain, you MUST split the domain horizontally across multiple flat files (e.g., `01A-core-mental-model.md`, `01B-core-decision-algorithm.md`).
- When refactoring deep folders, you MUST merge fragmented "orphan files" (files lacking YAML or direct pointers) into single domain files to preserve information.
</positive-directives>

<absolute-constraints>
- UNDER NO CIRCUMSTANCES should a single markdown file contain more than 15 functional rules. Exceeding this triggers context degradation.
- THE TERMINAL LEAF RULE: Level 2 Sub-files (e.g., `01A-feature.md`) MUST NOT contain `<routing-logic>` that points downward to Level 3 files. They are the end of the routing chain.
- DO NOT nest sub-folders deeper than the root of the targeted `.folder` environment.
</absolute-constraints>

## 3. How to Link Isolated `.Folders`

<context>
To prevent the AI from loading refactoring rules while doing daily UI coding, the global `00-system-index.md` file (placed at the absolute project root) must act as a universal traffic cop pointing to the explicitly authorized hidden folders.

<example>
// Compliant: Master Router targeting explicitly created cognitive states and specific task environments
<routing-logic>
IF the user prompt implies brainstorming, categorizing logic, or architectural planning BEFORE writing code:
THEN you MUST explicitly reference, read, and comply with: `.ai-planners/00-categorization.planner.md`.

IF the task involves migrating legacy code, running AST codemods, or the specific Kordex Effect runtime:
THEN you MUST explicitly reference, read, and comply with: `.kordex-refactor-rules/00-system-index.md`.

IF the task is standard daily feature development or UI component creation:
THEN you MUST explicitly reference, read, and comply with: `.ai-rules/00-system-index.md`.
</routing-logic>
</example>
</context>

## 4. Sharding Verification

<pre-flight-checklist>
Before finalizing the directory structure or proposing a new shard, verify the following:
1. [ ] Did I verify that the user EXPLICITLY requested this new `.folder`, or am I correctly halting to ask for their consent first?
2. [ ] Does every individual file inside those folders contain 15 rules or fewer?
3. [ ] Are all Level 2 files (Sub-files) strictly Terminal Leaves (no downward routing)?
4. [ ] Does the global root router accurately point to the newly approved `.hidden` environment folders?
</pre-flight-checklist>
