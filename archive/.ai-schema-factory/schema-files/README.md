# AI Operating System Schema Structure

This directory contains the entire blueprint for an advanced, context-sharded AI Operating System. It is designed to act as a strict operational meta-architecture for Large Language Models (LLMs) working in your codebase.

## Directory Layout

```text
the Schema files/
├── README.md                      (This file - the overview of the directory structure)
│
├── ai_rules_template_bundle/      (The core templates for day-to-day operational coding LLMs)
│   ├── 00-system-index.md
│   ├── README.md
│   ├── SPEC-01-SCHEMA-GENERATION.md
│   ├── SPEC-02-FILE-HIERARCHY.md
│   ├── TEMPLATE-ANTI-REGRESSION.md
│   └── TEMPLATE-DOMAIN.md
│
├── for_planner_mode/              (The meta-prompt bundle for system architects / starting new projects)
│   └── PLANNER-MODE-SPEC.md
│
├── CONTEXT SHARDING/              (The machine-readable strict schema for creating isolated folders/shards)
│   └── ADVANCED-CONTEXT-SHARDING.md
│
├── for_humans/                    (The human-readable plain-English guides to advanced patterns)
│   └── ADVANCED-CONTEXT-SHARDING.md
│
└── scheme explanation/            (The capstone meta-documentation explaining the OS architecture)
    ├── HUMAN-SCHEMA-GUIDE.md      (The manual written purely for humans to understand the psychology)
    ├── SPEC-00-META-COGNITION.md  (The OS instructions for the AI to adopt our architectural constraints)
    ├── llm_schema.agent.final/    (Extracted research material supporting the architecture)
    └── llm_schema.agent.final.pdf (The full Kimi/Attention research PDF)
```

## How to Use This

1. **Humans:** Read `scheme explanation/HUMAN-SCHEMA-GUIDE.md` first to understand the underlying psychology and mechanisms of this architecture.
2. **AI / Machines:** Point your AI's core instructions to `scheme explanation/SPEC-00-META-COGNITION.md` to force it to adopt the mathematical formatting limits of the system.
3. **Planners:** Use `for_planner_mode/PLANNER-MODE-SPEC.md` when initiating a new project to generate a flawless setup.
4. **Day-to-day Coding:** The files in `ai_rules_template_bundle/` serve as your standard `.ai-rules` environment inside your repos.

## Important Restriction for AI Agents

<absolute-constraints>
- UNDER NO CIRCUMSTANCES should an LLM read the massive `llm_schema.agent.final/` research folder or `llm_schema.agent.final.pdf` during standard day-to-day operations.
- You may ONLY access these research files if the user EXPLICITLY instructs you to do so, or if your specific task is to modify the underlying structural schema itself. Reading them unnecessarily will cause severe context window bloat and attention dilution.
</absolute-constraints>
