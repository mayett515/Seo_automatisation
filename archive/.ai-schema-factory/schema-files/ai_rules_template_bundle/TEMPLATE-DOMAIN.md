---
description: "Strict architectural rules and constraints for [DOMAIN NAME]"
globs: "[INSERT TARGET FOLDER GLOBS HERE, e.g., src/**/*.ts]"
alwaysApply: false
version: "1.0.0"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Domain Execution Contract: [DOMAIN NAME]

<meta-instruction>
You have been routed to this file because the current task modifies files matching the configured globs. The rules below are absolute and override generic behaviors for this domain. Read XML tags as hard logic gates.
</meta-instruction>

## 1. Focused Best Practices

<positive-directives>
- You MUST implement patterns matching this domain's core architecture: [INSERT RULE].
- Ensure all data flows follow the designated path: [INSERT RULE].
- [INSERT ADDITIONAL BEHAVIOR - KEEP TOTAL SECTION RULES UNDER 5]
</positive-directives>

## 2. Hard Domain Prohibitions

<absolute-constraints>
- UNDER NO CIRCUMSTANCES should you use [INSERT STRICT BAN].
- DO NOT import modules or files from [INSERT PATH RESTRICTION].
- BANNED SYNTAX: Do not use [INSERT BANNED CODE PATTERN].
</absolute-constraints>

## 3. Context-Dependent Trigger Gates

<conditional-logic>
IF [INSERT SPECIFIC CONDITION OR EDGE CASE]:
THEN you MUST [INSERT REQUIRED ACTION].

IF [INSERT SECONDARY CONDITION]:
THEN you MUST [INSERT SECONDARY REQUIRED ACTION].
</conditional-logic>

## 4. Domain Anchoring & Examples

<context>
Target Directory Scope: `[INSERT SCOPE]`
Key Libraries Allowed: `[INSERT LIBRARIES]`

<example>
// Compliant: [Explain why this matches the specific domain constraints]
[Insert short code block demonstrating perfect compliance]
</example>

<example>
// Non-Compliant: [Explain which absolute constraint this violates]
[Insert short code block demonstrating the anti-pattern]
</example>
</context>

## 5. Domain Post-Flight Verification

<pre-flight-checklist>
Before finalizing code within this domain, internally verify and execute this self-check:
1. [ ] Did I violate any domain-specific `<absolute-constraints>`?
2. [ ] Does the implementation strictly adhere to the targeted `<positive-directives>`?
3. [ ] If any `<conditional-logic>` gates were tripped, did I execute the `THEN` clause flawlessly?
</pre-flight-checklist>
