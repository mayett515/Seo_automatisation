---
description: "Error modeling and failure taxonomy rules for TypeScript Result types, custom errors, and expected failures"
globs: "**/*.{ts,tsx,js,jsx}"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Error Modeling and Failure Taxonomy

<meta-instruction>
Use this file when choosing how a TypeScript function should represent failure. The goal is not to force one error style everywhere. The goal is to make the failure class visible in the signature, boundary, or central error handler.
</meta-instruction>

## 1. Failure Taxonomy Directives

<positive-directives>
- Classify each failure as programmer error, infrastructure failure, expected business failure, invalid client input, third-party behavior, or unknown caught value.
- Use `Result<T, E>` or an explicit decision union for expected business failures the caller should handle.
- Use custom `Error` classes when stack traces, `instanceof` narrowing, `cause`, or exceptional control flow are useful.
- Use `T | ErrorType` only for small adapter conventions with one or two expected error variants.
- Use stable error codes for machine-readable handling and tests.
- Keep dynamic values in structured `context`, not inside branch-critical message text.
- Convert domain/application failures to transport errors only at the framework edge.
</positive-directives>

## 2. Hard Error Modeling Constraints

<absolute-constraints>
- DO NOT branch on `error.message` text.
- DO NOT throw strings, numbers, booleans, or plain objects.
- DO NOT return `null` or `undefined` for several different failure modes.
- DO NOT hide expected business failures inside exceptions when callers must recover.
- DO NOT use `Result` for every programmer bug, impossible invariant, or broken configuration.
- DO NOT expose HTTP status codes from pure domain logic.
- DO NOT mix exceptions, `Result`, and `T | Error` in the same layer without a local convention.
</absolute-constraints>

## 3. Decision Guide

<conditional-logic>
IF the caller is expected to recover, display a specific reason, or assert a stable failure code in tests:
THEN prefer `Result<T, E>` or a typed decision union.

IF the failure means a broken invariant, unavailable infrastructure, invalid configuration, or unexpected third-party behavior:
THEN throw or wrap a real `Error` with `cause` and bounded context.

IF an adapter wraps a third-party API with only one or two expected failure objects:
THEN `T | ErrorType` may be acceptable if call sites stay readable.

IF the error must become an HTTP response:
THEN map it at the route/controller/middleware boundary, not in the domain.
</conditional-logic>

<context>
<example>
// Good: expected business failure is visible and testable.
type SignupFailure =
  | { code: "INVALID_EMAIL" }
  | { code: "EMAIL_ALREADY_EXISTS" };

type SignupResult =
  | { ok: true; value: { userId: string } }
  | { ok: false; error: SignupFailure };
</example>

<example>
// Bad: caller must parse strings or catch normal business outcomes.
async function signup(email: string) {
  if (!email.includes("@")) throw new Error("Invalid email");
  if (await exists(email)) throw new Error(`Email ${email} already exists`);
}
</example>
</context>

<pre-flight-checklist>
1. [ ] Did I classify the failure before choosing a pattern?
2. [ ] Are expected failures visible to the caller?
3. [ ] Are error codes stable and testable?
4. [ ] Did I keep transport concerns out of the domain?
</pre-flight-checklist>
