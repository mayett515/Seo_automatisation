---
description: "Error normalization, Error.cause, structured context, logging, and observability rules"
globs: "**/*.{ts,tsx,js,jsx}"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# Error Normalization and Observability

<meta-instruction>
Use this file when code catches, wraps, logs, normalizes, or forwards errors. JavaScript can throw any value, so boundary code must normalize before reading properties or logging.
</meta-instruction>

## 1. Normalization and Observability Directives

<positive-directives>
- Treat caught values as `unknown` until narrowed or normalized.
- Normalize non-`Error` thrown values into real `Error` instances before logging or wrapping.
- Preserve the original failure with `Error.cause` when adding higher-level context.
- Use stable human-readable messages for grouping and structured `context` for dynamic data.
- Log once at a clear boundary with name, message, stack, cause, and safe context.
- Use `finally` or explicit cleanup when resources, locks, subscriptions, files, streams, or transactions need release.
- Use helper wrappers such as `toResult`, `noThrow`, or `asyncRoute` only when they reduce repeated error plumbing.
</positive-directives>

## 2. Hard Normalization Constraints

<absolute-constraints>
- DO NOT read `error.message`, `error.stack`, or `error.cause` before narrowing from `unknown`.
- DO NOT swallow errors after logging them.
- DO NOT log and rethrow repeatedly through every layer.
- DO NOT put tokens, secrets, full request bodies, payment details, or full user objects in error context.
- DO NOT create dynamic messages that destroy error grouping when context would do.
- DO NOT use catch-all wrappers to hide control flow or suppress important failures.
- DO NOT wrap an error and lose its original cause.
- DO NOT use empty `catch` blocks.
</absolute-constraints>

## 3. Boundary Pattern

<conditional-logic>
IF code catches an unknown value:
THEN narrow with `instanceof Error` or normalize with `ensureError` before use.

IF code adds a higher-level message:
THEN include the original error as `cause`.

IF code logs an error:
THEN log at the owner boundary and avoid repeating the same error at lower layers.

IF the operation is async and detached:
THEN mark ownership explicitly and attach a failure strategy.
</conditional-logic>

<context>
<example>
// Good: unknown is normalized, cause is preserved, context is bounded.
function ensureError(value: unknown): Error {
  return value instanceof Error
    ? value
    : new Error("Non-error value was thrown", { cause: value });
}

async function billCustomer(customerId: string, amountCents: number) {
  try {
    await payments.charge(customerId, amountCents);
  } catch (caught: unknown) {
    throw new AppError("BILLING_FAILED", "Could not bill customer", {
      cause: ensureError(caught),
      context: { customerId, amountCents },
    });
  }
}
</example>

<example>
// Bad: assumes catch value shape, logs dynamic data, then rethrows without cause.
try {
  await payments.charge(customer.id, amount);
} catch (error: any) {
  console.error(`Failed for ${customer.email}: ${error.message}`);
  throw new Error("Payment failed");
}
</example>
</context>

<pre-flight-checklist>
1. [ ] Did I treat caught values as unknown?
2. [ ] Did I preserve cause when wrapping?
3. [ ] Did I keep context bounded and secret-free?
4. [ ] Is logging centralized instead of repeated?
5. [ ] Are cleanup and detached async failures handled?
</pre-flight-checklist>
