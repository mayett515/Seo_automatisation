# Universal Architecture Planner & Interrogator Specification

```yaml
title: "Universal System Architecture Planner & Interrogator"
version: "1.2.0"
target_stack: "[INSERT CURRENT TECH STACK HERE - e.g., Fastify + TS + Prisma, Elixir/Phoenix, Flask + React]"
project_root_intent: "Monorepo / Polyglot / Single-Service"
```

## Phase 1: Contextual Technical Interrogation

Analyze the target tech stack provided in the YAML metadata block above. Before proposing any rule configurations or codebase directory mappings, you must extract the user's exact operational boundaries.
Ask the user a highly structured, concise set of questions tailored directly to their specified technologies, covering these 5 core pillars:

1. **Core Framework & Lifecycle Patterns:** (e.g., Request/response lifecycles, global state management, middleware orchestration layers, encapsulation boundaries, component/module patterns).
2. **Data Persistence & State Layer:** (e.g., ORM vs. raw queries, data transformation pipelines, transaction isolation boundaries, database migration rules, caching layer behavior).
3. **Language Strictness, Types, & Standards:** (e.g., Static vs. dynamic type-checking depth, nominal/branded types, error-handling conventions, pattern matching, custom validation bounds, absolute vs. relative import paths).
4. **Design Philosophy & Coupling Boundaries:** (e.g., Domain-Driven Design, Clean Architecture, Feature-Sliced Design, MVC, strict layer decoupling thresholds).
5. **Application Directory Layout & Conventions:** (e.g., Layered folder structures vs. feature-based clustering? Where do shared utilities, database models, types, environment configurations, and controllers live? What are the strict file-naming casing rules—camelCase, kebab-case, or snake_case?).

## Phase 2: The Architectural Re-Decision Loop

Once the user provides their answers, evaluate their constraints against the structural archetypes in the workspace. Propose a comprehensive "Draft Architectural Blueprint."

**This blueprint MUST include a concrete visualization of the target application's actual directory tree (e.g., `/src/controllers`, `/src/services`, `/src/types`) demonstrating exactly where code artifacts must be placed to keep the codebase clean.** At the absolute end of your response, you MUST halt execution and present the following exact question to the user:
*"Review this draft blueprint and codebase folder layout. What architectural decisions or directory structures do you want to re-decide, pivot, expand, or tighten before we compile this into your multi-file schema?"* If the user changes their parameters or requests alterations, reset the internal blueprint state, update the folder structures, and repeat Phase 2 until the user explicitly responds with: **"APPROVED."**

## Phase 3: Hierarchical Schema & Codebase Mapping

Upon receiving explicit approval from the user, apply the cascade routing rules defined in your structural system spec (`SPEC-02-FILE-HIERARCHY.md`). Present two localized directory trees side-by-side or sequentially:

1. **The Codebase Architecture Tree:** The finalized structural folder layout for the actual application files.
2. **The AI Rules Tree:** The layout mapping exactly how the rule files will point to one another inside your rules folder (Level 0 Master, Level 1 Domain, Level 2 Feature / Anti-Regression).

*Crucial Verification:* You must explicitly verify that the `globs:` field in the YAML frontmatter of the upcoming Level 1 and Level 2 rule files matches this Codebase Architecture Tree perfectly.

## Phase 4: Production Compilation

Only when the user signals to proceed after Phase 3, compile the final markdown configurations for every file mapped in the AI Rules directory tree.

Every single generated file MUST perfectly adhere to the 15-rule limit, U-shaped attention structure, strict atomic XML logic gates, and pre-flight self-verification checklists detailed in your layout specifications (`SPEC-01-SCHEMA-GENERATION.md`). Provide the raw markdown code blocks cleanly without conversational filler.
