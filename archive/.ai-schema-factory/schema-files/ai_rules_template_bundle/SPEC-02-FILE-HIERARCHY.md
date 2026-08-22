# Engineering Specification: Multi-File Hierarchy & Nested Routing

## Purpose
This document defines the structural relationships, inheritance rules, and nested routing logic for the AI rules ecosystem.

---

## 1. The Cascade Architecture

The ecosystem is a strict hierarchical tree. Files must only point downwards (to more specific files) or sideways (to anti-regression logs). They must never point upwards to the Master Router.

### Level 0: The Master Router (The Root)
*   **File:** `00-system-index.md`
*   **Routing Rule:** Contains global `<routing-logic>`. It points the LLM to Level 1 files based on broad domains (e.g., Frontend, Backend, Testing). 

### Level 1: Domain Sub-Files (The Branches)
*   **Files:** e.g., `01-frontend.md`, `02-database.md`
*   **Routing Rule:** Domain files CAN contain their own `<routing-logic>` block to act as a router to point to Level 2 Sub-sub-files.

### Level 2: Feature Sub-Sub-Files (The Leaves)
*   **Files:** e.g., `01A-webgl-canvas.md`, `02A-prisma-migrations.md`
*   **Routing Rule:** Level 2 files are terminal. They MUST NOT contain a `<routing-logic>` block. They only contain absolute constraints and verification checklists.

---

## 2. Rules for Creating New Folders & Pointers

### A. The Sub-Routing Syntax
If a file needs to point to another file, it must use this exact XML syntax, placed immediately under the `<meta-instruction>` tag:
```xml
<routing-logic>
IF the task touches [SPECIFIC TRIGGER]:
THEN you MUST load and comply with: `[PATH TO FILE]`.
</routing-logic>
```

### B. The Anti-Regression Sidestep

Anti-Regression files (`04-anti-regression.md`) are "Global Sub-files." Any file at Level 0, Level 1, or Level 2 can include a `<conditional-logic>` gate that commands the LLM to cross-reference an Anti-Regression file.

### C. Folder Structuring Limits

Do not nest rule folders deeper than one level inside your central rules directory.
