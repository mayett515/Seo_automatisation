---
description: "URL runtime-safety guardrails for parsing, displaying, validating, and constructing URLs"
globs: "apps/**/*.{ts,tsx}, packages/**/*.{ts,tsx}, **/*.md"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - "https://developer.mozilla.org/en-US/docs/Web/API/URL/URL"
  - "https://developer.mozilla.org/en-US/docs/Web/API/URL/canParse_static"
priority_schema: "critical > strong > guideline"
---

# URL Runtime Safety

<positive-directives>
- Use Zod URL schemas at external boundaries when a field must be a valid URL.
- Use safe URL helpers or `URL.canParse(...)` before parsing untrusted strings in runtime paths.
- Encode route params and query params when manually constructing API URLs.
- Keep provider-specific property formats explicit, for example Search Console URL-prefix properties vs `sc-domain:` properties.
</positive-directives>

<absolute-constraints>
- DO NOT call `new URL(...)` directly in JSX or other user-visible render paths unless input is locally guaranteed.
- DO NOT assume all provider "URL-like" identifiers are valid browser URLs.
- DO NOT build API URLs by concatenating unencoded route params.
</absolute-constraints>
