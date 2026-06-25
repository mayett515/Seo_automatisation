# The Pragmatic AI Operating System: A Human's Guide

Welcome to the meta-architecture. This system is not just a list of coding rules; it is a cognitive framework designed specifically for how Large Language Models (LLMs) parse, weight, and execute data. 

We built this system because standard markdown files fail. When you give an AI a massive nested folder structure with conversational "please do not do this" instructions, it suffers from **Attention Dilution** and **Recency Bias**, eventually ignoring your constraints entirely.

Here is how our system hacks the AI's attention mechanics to ensure flawless code generation.

## 1. The Core Philosophy (The Kimi Research)
Research shows that LLMs lose context when forced to jump through deeply nested directories (e.g., `rules/frontend/components/buttons.md`). 
**Our Solution:** The ecosystem is kept rigorously **flat**. We use a Master Router (`00-system-index.md`) that acts as a central traffic cop, pointing the AI directly to flat domain files (`01-core.md`, `02-database.md`).

## 2. The Format Matrix
AI reads different formatting syntaxes with different levels of strictness. We map data to specific formats to force compliance:
* **YAML (Top):** Used for metadata, system versions, and tool dependencies. It grounds the AI before it starts reading text.
* **XML Tags (Body):** Used for absolute constraints (`<absolute-constraints>`). XML acts as a cognitive circuit breaker. It forces the AI to treat the enclosed text as hard logic gates rather than casual suggestions.
* **Markdown (Structure):** Used for headers and code examples.

## 3. The Three Golden Rules
If you edit or add to this system, you must obey these constraints:
1. **The 15-Rule Ceiling:** No single file can contain more than 15 bullet points inside its XML constraints. If a topic is too large, split it horizontally (e.g., `01A-frontend-state.md` and `01B-frontend-styling.md`). 
2. **Terminal Leaves:** A sub-file (`01A`) is never allowed to route the AI further down to another sub-file. It must be the end of the line.
3. **Via Negativa:** AIs are bad at "not" doing things. To ban a behavior, we don't ask nicely. We use strict `<incident-reports>` and hard bans inside `<absolute-constraints>`.

## 4. Advanced Context Sharding
If the repository is massive (e.g., a fullstack monorepo), we do not put all rules in one folder. We "shard" the context by creating multiple hidden folders:
* `.ai-rules-frontend/`
* `.kordex-refactor-rules/`
* `.ai-planners/`
The Master Router reads the user's prompt, determines their *cognitive intent* (e.g., "Are they writing daily code or running a massive migration?"), and routes them to the correct isolated folder environment.
