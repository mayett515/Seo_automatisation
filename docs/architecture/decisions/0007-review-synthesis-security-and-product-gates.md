# 0007 - Review Synthesis: Security And Product Gates

Date: 2026-06-26
Status: Accepted

## Context

After commit `ec00899`, three independent model reviews were used as adversarial architecture input.

The reviews agreed on the broad direction:

- the Nest/Fastify split is sound
- DB-backed membership is the right authorization shape
- AI reasoning must stay separated from deterministic mutation
- GSC data is internal-radar data, not customer proof
- rules and ADRs are useful only when paired with executable guardrails

They also exposed a recurring pattern: the codebase often has a correct target architecture documented before the enforcing implementation is complete. That is acceptable for a scaffold only when the gap is explicit and not reachable by real customer data.

## Decision

Treat the following as accepted production gates before real customer data:

1. **Verified identity first.** Current user identity must come from Better Auth/session validation, not request headers.
2. **Demo/local bypasses are non-production only.** `demo-project`, non-UUID scaffold ids, and header project lists must not authorize production traffic.
3. **Permission-sensitive routes need roles.** Generic membership is not enough for approval, deploy, GSC connect, report publishing, tracking-key rotation, or administration.
4. **Release/deploy state must be persisted and verified.** Deploy enqueue must load persisted release state, verify approval/readiness, and prove `releasePlanId` belongs to the route project.
5. **OAuth callbacks need user/session binding and replay protection.** Signed state must be bound to the initiating user/session and one-time nonce consumption before provider tokens are stored.
6. **Tracking acceptance must mean persistence/queueing or explicit dry-run.** Public tracking should move from a global token to project-scoped publishable keys with rotation.
7. **Workers need actor/audit context and transactional retry paths.** User-triggered jobs carry actor metadata; destructive retry paths use transactions, staging, or upsert semantics.
8. **Customer reports need executable metric bans.** Customer-facing report schemas/serializers must reject impressions, CTR, and average-position fields.
9. **Shared providers should own shared pools.** The API process should converge on one DB provider instead of feature-local pools.
10. **Fastify runtime hardening must match deployment topology.** Public endpoints need route-appropriate rate limits; `trustProxy` must reflect the actual proxy layer.

## What We Do Not Treat As Immediate Blockers

- Project-level memberships are useful later, but customer-level membership is acceptable for the next slice if role permissions are enforced.
- Token cipher KDF hardening is lower priority while secrets are long random values; key rotation/KMS can follow provider/token operationalization.
- Opportunity-signal heuristics can remain coarse while they are internal-radar signals.
- The governance layer is large, but it is justified while it keeps producing executable checks and routed implementation constraints.

## Consequences

What changes:

- Reviews should be converted into code/tests/rules only after severity triage.
- Any "scaffold" bypass must be environment-gated or explicitly dry-run.
- Future implementation slices should close the highest-impact code/rule gaps before adding broad new product surface.

Costs:

- Auth/session work becomes the next prerequisite before real customer data.
- Release/deploy persistence moves ahead of more UI polish.
- Tracking cannot honestly be called accepted in production until persistence or queueing exists.

## Regression Guard

- Do not let a model review finding remain only in chat if it exposes tenant isolation, production mutation, token handling, or customer-report integrity risk.
- Do not implement every model suggestion blindly; classify it as blocking, important, polish, or not accepted.
- Do not call documented architecture "done" until code, tests, or CI enforce the boundary.
- Do not let scaffold conveniences (`demo-project`, headers, global tokens, mocked success) look like production guarantees.

## Related Files

- `.ai-nest-rules/04-guards-auth-tenancy.md`
- `.ai-nest-rules/03-queues-workers-lifecycle.md`
- `.ai-project-rules/04-deployment-agent.md`
- `.ai-project-rules/07-tracking-privacy-observability.md`
- `.ai-project-rules/11-reporting-anti-regression.md`
- `.ai-stack-rules/05-oauth-provider-security.md`
- `.ai-fastify-rules/06-production-recommendations.md`
- `docs/architecture/decisions/0005-production-auth-and-tenancy-boundary.md`
- `docs/architecture/decisions/0006-anti-regression-guardrails.md`
