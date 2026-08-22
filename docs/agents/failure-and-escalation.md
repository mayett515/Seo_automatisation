# Failure shapes and escalation

Use this reference when designing an error boundary or when conditional dispatch is becoming difficult to review.

| Failure category                   | Preferred shape                                                         |
| ---------------------------------- | ----------------------------------------------------------------------- |
| Expected domain outcome            | Discriminated union or established repository Result type               |
| Invalid external input             | Boundary validation issue with a stable machine-readable code           |
| Provider or infrastructure failure | Normalized adapter error preserving the original `cause`                |
| Programmer invariant violation     | Throw; do not disguise it as an expected business result                |
| Transport failure                  | Map from the owned domain/application failure at the transport boundary |

Escalate branching only when the next representation makes policy clearer:

1. Keep one or two local cases as an `if` or `switch`.
2. Use an exhaustive `switch` for a meaningful discriminated union.
3. Use a typed strategy map when several stable variants share the same operation and independent handlers improve ownership or testing.
4. Introduce a class or registry only when it owns lifecycle, resources, discovery, or framework integration.

Do not escalate merely to reduce line count. Repeated condition syntax is cheaper than an abstraction without an owner.
