# Architecture review calibration

The TypeScript model is strongest when product or domain policy is hidden inside control flow. It is weakest on tiny pure utilities, framework glue, generated code, and optimized algorithm internals.

## Strong fits

- Booking limits: extract candidate-set and eligibility policy from workflow code.
- Orders and returns: name custom-item, variant-item, and eligibility states.
- Asset editing: model eligibility, crop bounds, order, and unsupported formats as decisions.
- Authentication: distinguish URL callback initialization from storage recovery.
- Crawl controllers: extract option merge, credit limits, and path validation policy.

Keep service classes that genuinely own repositories, queues, clients, or lifecycle. Extract only the policy seam and preserve clear procedural order.

## Medium fits

- Introduce one decision union for a multi-outcome upload hook rather than rewriting the lifecycle.
- Classify clipboard or protocol input into validated variants at the boundary.
- Keep tooling resolvers procedural and name only the non-obvious policy.

## Weak fits

- Tiny pure filter, hash, or mapping utilities.
- Framework registration already expressing its intent.
- Type-heavy library internals already modeled honestly.
- Generated code, which changes through its generator.

For weak fits, “leave it alone” is the correct finding.
