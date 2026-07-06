# Architecture Decision Records

This folder is the human-readable decision log for the project.

It is not a hidden rule schema. Use it to record why a technical choice was made, what problem triggered it, what alternatives were considered, and what regressions the decision should prevent.

## When To Add A Record

Add or update an ADR when work changes one of these areas:

- application architecture, module boundaries, or dependency direction
- NestJS provider wiring, lifecycle, health checks, guards, queues, or workers
- Fastify adapter/runtime behavior or plugin policy
- frontend routing, data fetching, validation, or UI state patterns
- persistence, migrations, indexes, or source-of-truth ownership
- deployment, OAuth, credentials, tenant isolation, observability, or security posture
- repeated review findings that should not be rediscovered later

Do not write an ADR for every small code edit. Write one when future maintainers need to know the reason behind the choice.

## Status Values

Use one of these statuses:

- `Proposed` - under discussion
- `Accepted` - current project direction
- `Superseded` - replaced by a newer ADR
- `Deferred` - known, deliberately not implemented yet

## Naming

Use sequential numbering:

```text
0004-short-decision-title.md
0005-next-decision-title.md
```

## Template

Start from [TEMPLATE.md](TEMPLATE.md).

## Current Records

- [0001 - Stack Rules, GSC Slice, And Review Lessons](0001-stack-rules-gsc-and-review-lessons.md)
- [0002 - Nest Backend Production Hardening](0002-nest-backend-production-hardening.md)
- [0003 - Fastify Adapter And Ecosystem Rules](0003-fastify-adapter-and-ecosystem-rules.md)
- [0004 - NestJS Production Builds And Decorator Metadata](0004-nestjs-production-builds-and-decorator-metadata.md)
- [0005 - Production Auth And Tenancy Boundary](0005-production-auth-and-tenancy-boundary.md)
- [0006 - Anti-Regression Guardrails](0006-anti-regression-guardrails.md)
- [0007 - Review Synthesis: Security And Product Gates](0007-review-synthesis-security-and-product-gates.md)
- [0008 - Better Auth Integration Topology](0008-better-auth-integration-topology.md)
- [0009 - Deploy Provider Reconciliation And Operation State](0009-deploy-provider-reconciliation-and-operation-state.md)
- [0010 - HTTP Verification And Release Status Projection](0010-http-verification-and-release-status-projection.md)
- [0011 - Rollback Restore Execution Lifecycle](0011-rollback-restore-execution-lifecycle.md)
- [0012 - Production Readiness Policy Batch](0012-production-readiness-policy-batch.md)
- [0013 - Rollback Operation Vocabulary And Storage Model](0013-rollback-operation-vocabulary-and-storage-model.md)
- [0014 - Rollback Trigger Policy](0014-rollback-trigger-policy.md)
- [0015 - No Paid SERP API Proof Strategy](0015-no-paid-serp-api-proof-strategy.md)
- [0016 - Markdown Context Records And Retrieval Boundary](0016-markdown-context-records-and-retrieval-boundary.md)
- [0017 - Page Registry And PageJson Source Of Truth](0017-page-registry-and-page-json-source-of-truth.md)
