---
name: type-interview
description: Align with the user on unsettled domain types before implementing a new feature, workflow, or integration. Use when the data model is genuinely undecided; do not trigger for small changes governed by existing contracts.
---

# Type interview

1. Read enough code to identify existing error unions, envelopes, branded IDs, schemas, and naming conventions. Do not ask questions the repository answers.
2. Propose only the data model: domain variants, lifecycle states when relevant, stable error union, and ingress schema for untrusted data.
3. Ensure no type permits a state the domain forbids.
4. Ask at most three questions about expensive-to-reverse ambiguity, such as legitimate absence, unavailable external sources, or caller behavior for each failure.
5. Wait for user approval before implementation. Revise the model until accepted.
6. Write approved types to their owning location, then make implementation conform to them. If implementation reveals a genuine missing decision, return to the user rather than silently weakening the model.
