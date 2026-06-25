---
description: "HTTP and transport error boundary rules for API routes, Express middleware, status codes, and public response shapes"
globs: "**/*.{ts,tsx,js,jsx}"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: ["express?"]
priority_schema: "critical > strong > guideline"
---

# HTTP and Transport Error Boundaries

<meta-instruction>
Use this file at API, HTTP, RPC, route, middleware, controller, or transport boundaries. Domain code should not know final status codes or public response bodies unless the framework itself is the target responsibility.
</meta-instruction>

## 1. HTTP Boundary Directives

<positive-directives>
- Validate request shape before constructing client-facing 4xx errors.
- Map domain/application failures to stable HTTP status codes at the route/controller/middleware edge.
- Use central error middleware or framework-level error handlers for consistent response shapes.
- Keep public error responses stable and separate from private diagnostic details.
- Return generic 500 responses for unknown failures after internal logging.
- Forward async route failures consistently through the framework’s error mechanism.
- Include stable public error codes when clients need machine-readable handling.
</positive-directives>

## 2. Hard HTTP Constraints

<absolute-constraints>
- DO NOT expose stack traces or raw internal exception messages to clients.
- DO NOT throw HTTP errors from pure domain functions.
- DO NOT duplicate response formatting in every route.
- DO NOT rely on Express or framework defaults for your public error contract.
- DO NOT forget to forward rejected async route handlers when the framework setup requires it.
- DO NOT use 500 for known invalid client input.
- DO NOT include private diagnostic context in public 4xx/5xx bodies.
</absolute-constraints>

## 3. Mapping Rules

<conditional-logic>
IF validation fails at the request edge:
THEN return or throw a 400-style public validation error.

IF a domain/application decision denies a normal business operation:
THEN map it to the appropriate 4xx at the transport edge.

IF infrastructure or unknown failure escapes the application layer:
THEN log internally and return a generic 500.

IF using Express-style async routes:
THEN use a consistent async wrapper or the framework’s official promise-handling behavior.
</conditional-logic>

<context>
<example>
// Good: domain failure is mapped at the edge; public body is stable.
function toHttpError(error: SignupFailure): HttpError {
  switch (error.code) {
    case "INVALID_EMAIL":
      return new BadRequestError("Invalid signup input", { field: "email" });
    case "EMAIL_ALREADY_EXISTS":
      return new ConflictError("Email already exists");
  }
}
</example>

<example>
// Bad: domain code imports transport status and response shape.
function validateSignup(input: SignupInput) {
  if (!input.email.includes("@")) {
    throw new BadRequestError("Invalid email", { rawInput: input });
  }
}
</example>
</context>

<pre-flight-checklist>
1. [ ] Is this truly a transport boundary?
2. [ ] Are public and private error details separated?
3. [ ] Are known client errors stable 4xx responses?
4. [ ] Are unknown failures logged and converted to generic 500 responses?
5. [ ] Are async route failures forwarded consistently?
</pre-flight-checklist>
