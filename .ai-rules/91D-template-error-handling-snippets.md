---
description: "Copy-ready TypeScript error handling snippets for AppError, ensureError, Result, and HTTP boundary glue"
globs: "**/*.{ts,tsx,js,jsx}"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# TEMPLATE: Error Handling Snippets

<meta-instruction>
Use this file only when the user asks for copy-ready error-handling code. Prefer project conventions if the repository already has an established error system.
</meta-instruction>

## Base App Error

<context>
```ts
type ErrorContext = Record<string, string | number | boolean | null>;

class AppError<Code extends string = string> extends Error {
  readonly code: Code;
  readonly context: ErrorContext;

  constructor(
    code: Code,
    message: string,
    options: ErrorOptions & { context?: ErrorContext } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.context = options.context ?? {};
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
```
</context>

## Normalize Unknown Caught Values

<context>
```ts
function ensureError(value: unknown): Error {
  return value instanceof Error
    ? value
    : new Error("Non-error value was thrown", { cause: value });
}
```
</context>

## Result Type

<context>
```ts
type Result<T, E extends Error = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

const err = <E extends Error>(error: E): Result<never, E> => ({
  ok: false,
  error,
});
```
</context>

## Async To Result

<context>
```ts
async function toResult<T>(
  operation: () => Promise<T>,
): Promise<Result<T, Error>> {
  try {
    return ok(await operation());
  } catch (cause: unknown) {
    return err(ensureError(cause));
  }
}
```
</context>

## Constraints

<absolute-constraints>
- DO NOT paste these snippets over an existing project error system without adapting names and conventions.
- DO NOT expose private diagnostic context in public responses.
- DO NOT use `Result` for failures the caller cannot meaningfully handle.
</absolute-constraints>

<pre-flight-checklist>
1. [ ] Did I adapt error codes to the domain?
2. [ ] Did I preserve `cause` where wrapping occurs?
3. [ ] Did I keep snippets consistent with the repository’s framework?
</pre-flight-checklist>
