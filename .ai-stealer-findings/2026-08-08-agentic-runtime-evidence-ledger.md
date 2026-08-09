# Finding: Agentic Runtime And Evidence Ledger

Date: 2026-08-08

Sources:

- official Mastra workflow, suspend/resume, storage, observability, and tool documentation;
- `C:\big eater\mastra-agent-flow-ideas.md`;
- `C:\big eater\agentic-evidence-web-ui-stealer-findings-2026-07-02.md`;
- `.ai-stealer-catalog/repo-catalog/17-agentic-workflows-and-mcp-servers/README.md`;
- ADRs 0018 and 0019;
- the current `agent_runs`, Opportunity Scout, SERP snapshot, technical-audit, report-provenance, and recovery implementations.

License: no external code copied. Repository and documentation sources are architecture input only.

## Problem

At research time, the product had a safe single-call AI boundary but no product-integrated Mastra workflow. The implemented ADR 0022 Opportunity Research vertical now adds direct DeepSeek, specialist steps, and live research tools only after establishing application-owned run/step/evidence authority; this finding records the pattern that led to that implementation.

## Candidate Patterns Reviewed

| Source                               | Use                                                    | Decision                                                |
| ------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------- |
| Mastra workflows/storage             | Typed steps, workflow snapshots, restartable execution | Adapt as orchestration only                             |
| Mastra observability                 | Correlated workflow/tool/model telemetry               | Adapt as optional redacted operations data              |
| Mastra tool hooks                    | Before/after tool policy and audit points              | Adapt behind ADR 0019 policy                            |
| AG-UI                                | Run/step/tool event vocabulary                         | Adapt event categories, not protocol/database wholesale |
| Activepieces/Kestra                  | Run/step ledgers, retries, pause/failure vocabulary    | Adapt bounded lifecycle patterns                        |
| Cursor agent trace                   | Versioned event identity and hashes                    | Adapt correlation/digest ideas                          |
| RAGFlow/Cognee/Signet-style evidence | Source-backed citations and provenance                 | Adapt source/version/digest links                       |

Rejected as immediate architecture: generic agent platforms, conversation memory as business truth, broad MCP catalogs, browser-action agents, chain-of-thought storage, and framework-owned approval.

## Adapted Pattern

```text
source truth
  -> immutable run evidence item
  -> typed step usage link
  -> compact append-only run event
  -> deterministic QA
  -> product result transaction
```

One admitted product workflow owns one `agent_runs` row. Specialist agents are typed steps unless they have an independently admitted lifecycle. Mastra checkpoints and traces may help execute/debug the workflow, but PostgreSQL owns run claims, evidence identity, approval, recovery, and product results.

## Decision Record

The accepted design is [ADR 0022](../docs/architecture/decisions/0022-agentic-runtime-and-evidence-ledger.md). Its ordered contracts/persistence, direct DeepSeek/Mastra runtime, read-only research tools, Opportunity Research workflow, and operator timeline slices are implemented; credentialed calibration and optional redacted telemetry remain operational follow-ups.
