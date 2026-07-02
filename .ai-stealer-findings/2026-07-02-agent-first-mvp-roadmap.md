# Finding: Agent-First MVP Roadmap Correction

Date: 2026-07-02

Sources:

- `C:\big eater\mastra-agent-flow-ideas.md`
- `C:\big eater\frontend-ui-component-registry-stealer-findings-2026-07-01.md`
- `local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/architecture/05-ai-agent-architecture.md`
- `local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/product/05-template-component-preview-system.md`
- `local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/product/07-subdomains-local-pages.md`
- `.ai-project-rules/09-local-landing-page-generation.md`

License: No code copied. Local findings and product docs are used as architecture and roadmap input.

## What We Needed

The previous roadmap risked reading as if the MVP could start with mostly deterministic website import and simple service-area gap finding. That is not the intended product. The real product is closer to the user's CLI research workflow: AI agents help scout markets, compare competitors, identify local SEO opportunities, draft page briefs, and explain strategy. The deterministic platform keeps that work safe, typed, previewed, approved, deployed, and verified.

## What The Sources Say

The strongest sentence from the Mastra findings is:

```text
Mastra agents should reason, classify, explain, and propose.
Deterministic workers should perform production mutations.
```

The strongest sentence from the frontend findings is:

```text
The primary UI is evidence, decisions, previews, tables, maps, and timelines.
Chat can assist, but it should not own the workflow.
```

The product pack supports the same shape: Research, SEO Strategy, Content, Template/Layout, SEO Analyst, and Report agents produce controlled proposals; customer preview, notes, approval, and release workers own execution.

## Corrected Roadmap

```text
website import / GSC / tracking / SERP / competitor / field evidence
-> AI Opportunity Scout
-> Opportunity Explorer
-> page brief / proposal
-> component-constrained preview
-> customer/operator notes
-> approval
-> release preflight
-> deploy and verify
-> report and next opportunity
```

## What We Steal

- Build one useful agent vertical slice first: evidence -> opportunity classification -> page brief proposal -> quality gate -> preview card.
- Keep an orchestrated agent lane with specialist roles, but do not build a broad agent platform first.
- Define output schemas before agent behavior: `OpportunityClassification`, `OpportunityBrief`, `PageBrief`, `ReportCardDraft`, and `AgentRunEvent`.
- Treat competitor/SERP research as evidence. It can reveal gaps and positioning; it must not copy content.
- Use a workflow UI: opportunity table, evidence panel, map/place surface, agent run timeline, preview card, approval controls.
- Keep generated customer pages schema-first through the page component registry.

## What We Do Not Steal

- Coding-agent file tools.
- Shell execution patterns as product behavior.
- Agent-owned production mutation.
- Chat as the workflow owner.
- Freeform generated HTML/code.
- Customer-facing success claims from weak GSC/search evidence.

## Decision

Record the roadmap in `docs/architecture/agent-first-mvp-roadmap.md` and link the existing blueprint, website import, frontend, foundation, and progress docs to it. Future MVP implementation should follow the agent-first sequence while preserving the existing controlled automation rule:

```text
AI proposes.
The system validates.
The user approves.
Workers execute.
Verification decides truth.
```
