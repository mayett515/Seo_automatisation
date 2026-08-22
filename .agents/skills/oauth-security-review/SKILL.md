---
name: oauth-security-review
description: Implement or review a project-scoped OAuth authorization-code flow, including callback state, replay protection, PKCE, tenant authorization, token storage, reconnect behavior, and failure handling. Use when OAuth connect or callback code changes; not for ordinary application-session work without a provider flow.
---

# OAuth security review

Establish the actual authorization flow from connect initiation through callback persistence. Read the relevant API and auth instructions before changing code, and verify current provider guidance when provider behavior matters.

1. Trace initiation, callback, state creation/verification, code exchange, token persistence, reconnect, and disconnect/revocation paths.
2. Verify state is signed, expiring, bound to the initiating application user and project, and contains or references a high-entropy nonce.
3. Verify the nonce is consumed atomically before connection mutation. A replay or callback from another user must fail closed.
4. Verify project membership before initiation and again before callback mutation. Route parameters and request headers are not authorization.
5. Verify PKCE where supported, least-privilege scopes, dedicated state-signing material, encrypted refresh tokens, short-lived access tokens, and secret-safe logs.
6. Verify reconnect replaces or revokes the previous refresh token and that raw provider bodies never reach clients or durable operational records.
7. Exercise or add focused failures for expired state, tampered state, replay, foreign user/project, missing membership, provider rejection, and token-storage failure.

Report findings by severity with `path:line`, the exploitable or incorrect scenario, evidence, and the smallest fix. Distinguish code proof from assumptions and missing runtime/provider verification.
