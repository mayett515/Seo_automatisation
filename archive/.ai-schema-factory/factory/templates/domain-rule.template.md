---
description: "[Domain rule description]"
globs: "[optional file globs]"
alwaysApply: false
version: "1.0.0"
routing_level: "L1"
terminal: false
---

# [Domain Rule]

<meta-instruction>
[Why this file was loaded.]
</meta-instruction>

<routing-logic>
IF [specific trigger]:
THEN load `[sibling terminal file]`.
</routing-logic>

<absolute-constraints>
- DO NOT [atomic ban].
- DO NOT [atomic ban].
</absolute-constraints>

<positive-directives>
- ALWAYS [atomic positive rule].
- ALWAYS [atomic positive rule].
</positive-directives>

<context>
[Short examples or code snippets.]
</context>

<pre-flight-checklist>
- [ ] [check]
</pre-flight-checklist>
