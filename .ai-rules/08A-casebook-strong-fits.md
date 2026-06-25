---
description: "Casebook of strong schema fits from repo stress tests"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Casebook: Strong Fits

<meta-instruction>
Use this file as evidence for where the schema is strongest. These are not mandatory templates; they are observed patterns.
</meta-instruction>

## Strong fit findings

- **Cal.com booking limits:** candidate booking set and limit policy were hidden; schema strength high because recurring limits must evaluate the whole candidate set.
- **Medusa order/returns:** custom item vs variant item and return eligibility revealed invalid domain assumptions.
- **Immich asset edit:** image edit eligibility, crop-first, crop-bounds, unsupported formats became a testable decision.
- **Directus file import:** imported file candidate and MIME policy were hidden inside service workflow.
- **Supabase Auth:** session initialization plan exposed URL callback versus storage recovery.
- **Firecrawl crawl controller:** prompt-option merge, ZDR, credit limits, path-regex validation were strong policy seams.

## Stable conclusion

```txt
The schema is strongest when code hides product or domain policy inside control flow.
```

<positive-directives>
- Extract policy seams before considering whole-file redesign.
- Keep existing service classes when they own repositories, storage, auth, queues, or framework lifecycle.
- Name the policy as a type or pure function.
- Keep procedure order intact after policy extraction.
</positive-directives>

<absolute-constraints>
- DO NOT use these strong fits to justify refactoring unrelated tiny utilities.
- DO NOT remove justified service classes while extracting policy.
- DO NOT overstate the target as the whole repo.
</absolute-constraints>

<pre-flight-checklist>
1. [ ] Does the current target resemble a strong fit case?
2. [ ] What policy seam is hidden?
3. [ ] Can it be tested without infrastructure after extraction?
</pre-flight-checklist>
