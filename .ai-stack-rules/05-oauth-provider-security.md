---
description: "OAuth and provider-token guardrails for refresh tokens, callback state, scopes, and provider error handling"
globs: "apps/**/*.{ts,tsx}, packages/**/*.{ts,tsx}, **/*oauth*.md, **/*gsc*.md"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - "https://developers.google.com/identity/protocols/oauth2/resources/best-practices"
  - "https://developers.google.com/identity/protocols/oauth2/web-server"
priority_schema: "critical > strong > guideline"
---

# OAuth Provider Security

<positive-directives>
- Store refresh tokens encrypted at rest and keep access tokens short-lived/in-memory.
- Use signed, expiring OAuth state and validate it before exchanging provider codes.
- Prefer least-privilege scopes first; request stronger scopes only for the exact feature that needs them.
- Normalize provider errors before exposing them to users or storing them in long-lived operational records.
- Replace or revoke old refresh tokens when reconnecting the same project/provider.
</positive-directives>

<absolute-constraints>
- DO NOT store provider tokens in plaintext.
- DO NOT expose raw provider response bodies to the browser.
- DO NOT reuse encryption keys as OAuth state signing keys when a dedicated state secret is available.
- DO NOT let OAuth connect routes bypass tenant/project authorization before production use.
</absolute-constraints>
