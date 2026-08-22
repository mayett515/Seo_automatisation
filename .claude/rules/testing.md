---
paths:
  - "**/*.test.{ts,tsx}"
  - "**/*.spec.{ts,tsx}"
  - "**/*.integration.ts"
---

# Testing

A test is a claim about behavior, not a restatement of the implementation.

- Test the core directly; it needs no doubles.
- Assert on the returned decision, not on which internal function was called.
  Never assert call counts of internal functions, and never mock the module
  under test.
- Cover each arm of a discriminated union at least once (the
  `switch-exhaustiveness-check` lint rule covers the production side; tests
  cover the behavior of each arm).
- Use factories for fixtures so a schema change breaks one file. No shared
  mutable fixture state between tests.
- Casting a stub (`as unknown as DatabaseService`) is acceptable in test
  files (the files this rule loads for) and nowhere else — it is a test
  double, not a type escape hatch.
- A test must fail for a real reason: never reimplement the logic under test
  inside the assertion.
- Typecheck and lint are not tests: high-risk backend logic (queue producers,
  authorization, OAuth state, idempotent retries) gets behavioral tests —
  a queued response requires a test proving a real enqueue happened, and
  guarded routes get failure-path tests (missing project context, foreign
  tenant id).
- A review finding that typecheck would not catch gets a focused test in the
  same change, or an explicit deferred note.
