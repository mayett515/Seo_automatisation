---
paths:
  - "**/routes/**/*.ts"
  - "**/controllers/**/*.ts"
  - "**/*.controller.ts"
  - "apps/api/**/*.ts"
---

# HTTP Boundaries

This layer translates between the wire and the domain and does nothing else.

- Validate the request into a domain input type before calling anything.
  Authorize before you fetch.
- Map each domain error code to exactly one status code, in one central
  place (error filter/middleware) — never per-route ad hoc mapping.
- Known client errors are stable 4xx with a machine-readable code; unknown
  failures are logged internally and returned as a generic 500. Never map
  every failure to 500 because the mapping is incomplete.
- Response envelopes are stable: clients branch on a code, never on a message
  string. No raw provider/ORM errors, stack traces, or internal identifiers
  in a response body.
- No business rules in a controller. A controller with an `if` on domain data
  is hiding a core decision.
- Responses that a frontend consumes are schema-owned contract objects
  (parsed through the shared contract), not ad-hoc literals that drift from
  the contract.
