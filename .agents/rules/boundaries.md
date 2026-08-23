---
paths:
  - "**/*.{ts,tsx,mts,cts}"
---

# Boundaries

Boundary is not synonymous with class. Choose the smallest rung that covers
the ownership.

```txt
1. Pure function
2. Module function with injected dependencies
3. Framework handler / hook / procedure / middleware
4. Service class
5. Adapter or client class
6. Worker, actor, or process owner
7. Generated client
```

## The class test

A class is justified only when it owns a capability, resource, lifecycle,
framework contract, or collaboration pattern: external clients, repositories,
adapters, stateful resources, workers, schedulers, framework DI.

Never write a class for pure calculations, validators, parsers, or mappers,
and never wrap a single pure function in a service object:

```ts
// Wrong rung: owns nothing.
class ReturnDecisionService {
  decide(order: Order, input: ReturnInput) { return decideReturn(order, input); }
}
```

Pattern placement: Adapter hides an external API's shape. Proxy or Decorator
carries cross-cutting concerns (logging, retry, auth, cache, metrics). Facade
only when it measurably reduces coupling. Prefer unions and composition over
inheritance. Never apply a pattern because the pattern is known, and never
put framework decorators on pure domain functions — decorators belong at
framework and DI boundaries.

## Escalation ladders

Start at the left. Move right only under stated pressure: the variant needs
its own dependencies, state, lifecycle, a shared contract, or external
extension. Volume alone is not pressure.

```txt
conditional grows by key:  if -> function map -> typed strategy map -> strategy object
shared event grows:        callback -> observer with unsubscribe -> emitter boundary
object creation grows:     literal -> factory function -> factory module/class
cross-cutting grows:       direct call -> wrapper/decorator -> boundary middleware
shared resource grows:     module export -> explicit singleton -> DI-managed boundary
```

```ts
// A function map is enough while strategies are stateless:
const paymentStrategies: Record<PaymentMethod, (amount: Money) => Promise<void>> = {
  card: payByCard,
  paypal: payByPaypal,
  bank_transfer: payByBankTransfer,
};
```

## Files follow the same restraint

Extract concepts before extracting files. No `types.ts` + `errors.ts` +
`helpers.ts` for 80 lines of code; no 900-line service method because
"no folders" either. Split when density, reuse, testing, or ownership earns
it. Keep UI display helpers nearby, not in global domain folders.
