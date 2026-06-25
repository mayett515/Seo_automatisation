---
description: "Template for extracting hidden policy seams"
globs: ".ai-rules/*.md"
alwaysApply: false
version: "3.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Template: Policy Extraction

<meta-instruction>
Use this template when extracting hidden policy from an existing function or method.
</meta-instruction>

```markdown
# Policy Extraction: [POLICY NAME]

## Hidden policy
[Describe current implicit control flow]

## Decision type
```ts
type [Policy]Decision =
  | { kind: '[case_1]' }
  | { kind: '[case_2]'; reason: '[reason]' };
```

## Pure decision function
```ts
function decide[Policy](input: [Input]): [Policy]Decision {
  // no effects
}
```

## Shell integration
```ts
const decision = decide[Policy](facts);
// shell translates decision to DB/API/framework effects
```

## Key win
[What meaning became explicit]
```

<absolute-constraints>
- DO NOT extract policy without naming the hidden meaning.
- DO NOT call infrastructure inside the decision function.
- DO NOT introduce a policy type if a boolean is sufficient and no reason matters.
</absolute-constraints>

<pre-flight-checklist>
1. [ ] Is this a real policy seam?
2. [ ] Can the decision be tested without IO?
3. [ ] Did the shell remain procedural and readable?
</pre-flight-checklist>
