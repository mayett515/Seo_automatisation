---
description: "Optional JavaScript design-pattern rules for modules, factories, observers, strategy, proxy, decorator, and singleton boundaries"
globs: "**/*.{ts,tsx,js,jsx,mts,cts}"
alwaysApply: false
version: "3.4.0-optional-audited"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: []
priority_schema: "critical > strong > guideline"
---

# JavaScript Design Patterns at Boundaries

<meta-instruction>
Use this file when a JavaScript design pattern might clarify a boundary, extension point, event system, or object creation concern. Patterns are vocabulary, not obligations. Prefer the smallest JavaScript-native form first.
</meta-instruction>

## Pattern Directives

<positive-directives>
- Prefer ES modules for module boundaries and private file-local implementation details.
- Use factories when object creation has variants, defaults, validation, environment-specific setup, or dependency wiring.
- Use observer/event patterns when multiple independent consumers must react to a shared event or state change.
- Use function maps before class-based Strategy when switching among simple stateless behaviors.
- Move from function maps to strategy objects/classes only when strategies need dependencies, state, lifecycle, a shared contract, or external extension.
- Use decorators/wrappers for cross-cutting behavior such as logging, metrics, auth, caching, validation, retry, or tracing.
- Use proxies sparingly for reactivity, instrumentation, access control, lazy loading, or boundary validation.
- Treat singletons as resource/config boundaries, not as hidden global dependencies.
</positive-directives>

## Pattern Constraints

<absolute-constraints>
- DO NOT introduce classical GoF ceremony when JavaScript functions, objects, closures, or modules already solve the problem.
- DO NOT use Singleton for ordinary shared state when dependency injection, module exports, or explicit parameters are clearer.
- DO NOT build observers without unsubscribe, cleanup, or lifecycle ownership.
- DO NOT use Proxy when ordinary getters/setters, schemas, or functions would be clearer.
- DO NOT use Factory for simple object literals with no construction complexity.
- DO NOT use Strategy for two stable cases that are clearer as `if` branches.
- DO NOT hide domain policy inside pattern infrastructure.
</absolute-constraints>

## Pattern Progressions

<context>
```txt
conditional grows by key:
  if -> function map -> typed strategy map -> strategy object/class

shared event grows:
  callback -> observer with unsubscribe -> event emitter/observable boundary

object creation grows:
  object literal -> factory function -> factory module/class

cross-cutting behavior grows:
  direct call -> wrapper/decorator -> boundary middleware

shared resource grows:
  module export -> explicit singleton resource -> DI-managed boundary
```
</context>

## Examples

<context>
<example>
// Good: function map is enough for stateless strategies.
type PaymentMethod = "card" | "paypal" | "bank_transfer";
type PaymentStrategy = (amount: Money) => Promise<void>;

const paymentStrategies: Record<PaymentMethod, PaymentStrategy> = {
  card: payByCard,
  paypal: payByPaypal,
  bank_transfer: payByBankTransfer,
};
</example>

<example>
// Bad: class strategy ceremony before state/dependencies/lifecycle exist.
class CardPaymentStrategy { execute(amount: Money) { return payByCard(amount); } }
</example>
</context>

<pre-flight-checklist>
1. [ ] Which recurring design problem does the pattern solve?
2. [ ] Is the JavaScript-native function/object/module version enough?
3. [ ] Does this pattern clarify a boundary or add ceremony?
4. [ ] Is cleanup/lifecycle explicit for observers and resources?
</pre-flight-checklist>
