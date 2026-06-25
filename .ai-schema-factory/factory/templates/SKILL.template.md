---
name: "[skill-name]"
description: "[Use this skill when... Include natural trigger phrases the user actually says.]"
---

# [Skill Name]

<skill_contract>

<purpose>
[What this skill does.]
</purpose>

<activation>
Use this skill when the user says or implies:

- [trigger]
- [trigger]
- [trigger]
</activation>

<non_activation>
Do not use this skill when:

- [non-trigger]
- [non-trigger]
</non_activation>

<required_references>
- `.ai-rules/00-system-index.md`
</required_references>

<core_rules>
<rule id="rule_1">
[Atomic behavioral rule.]
</rule>

<rule id="rule_2">
[Atomic behavioral rule.]
</rule>
</core_rules>

<output_contract>
A good response should include:

1. [required output]
2. [required output]
3. [required output]
</output_contract>

<pre-flight-checklist>
- [ ] [check]
- [ ] [check]
</pre-flight-checklist>

</skill_contract>
