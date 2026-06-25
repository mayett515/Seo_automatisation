# Payments And Billing

This is where you come to lift correct-by-default code for the hardest problem in software: moving money. You do not want to reinvent this. Payments code has to be exactly-once in a world of unreliable networks, where a dropped response does not mean the charge did not happen; it has to reconcile against external processors that lie, retry, and fire webhooks out of order. And billing layered on top adds its own arithmetic minefield — proration when a customer upgrades mid-cycle, usage metering that aggregates millions of events into a single invoice line, tax, credits, and dunning. The repos below are the open-source state of the art: usage-based billing engines, payment orchestrators routing across 100+ processors, and subscription platforms.

You almost never want to fork an entire billing system, but you very often want to lift one part: Lago's event aggregation, Hyperswitch's idempotency layer, Medusa's pluggable payment-provider interface. A SaaS metering startup and an e-commerce checkout share the same intents — verify a webhook is authentic, make a charge idempotent, compute a fair proration. Find the intent, take the module.

---

## 1. Billing & Usage Metering Engines

These ingest raw usage events, aggregate them under pricing models (graduated, volume, package), and emit invoices. The aggregation pipeline and the proration math are the parts to lift.

### Billing Repos

| Link | Good For | What to steal |
| --- | --- | --- |
| [getlago/lago](https://github.com/getlago/lago) | Open-source usage-based & subscription billing. | Steal the event ingestion → aggregation → fee → invoice pipeline. The Rails API (`getlago/lago-api`) holds the real logic; the meta-repo bundles services. |
| [openmeterio/openmeter](https://github.com/openmeterio/openmeter) | Real-time usage metering for AI/DevTool monetization. | Steal CloudEvents ingestion, the ClickHouse-backed aggregation queries, and how entitlements/quotas are derived from a live usage stream. |
| [killbill/killbill](https://github.com/killbill/killbill) | Mature, plugin-based subscription billing platform (Java). | Steal the subscription state machine, the catalog/price-list model, and the invoice-generation + dunning lifecycle hardened over a decade. |

---

## 2. Payment Orchestration & Checkout

These sit between your app and many payment processors, handling routing, vaulting, retries, and the webhook firehose. The provider-abstraction and idempotency layers are the parts to lift.

### Payment Repos

| Link | Good For | What to steal |
| --- | --- | --- |
| [juspay/hyperswitch](https://github.com/juspay/hyperswitch) | Composable payments infra in Rust, routing across 120+ processors. | Steal the connector trait abstraction (`crates/`), intelligent routing, idempotency, and the unified request/response normalization across wildly different processor APIs. |
| [medusajs/medusa](https://github.com/medusajs/medusa) | Modular commerce platform with a pluggable payment module. | Steal the payment module's provider interface and session/authorization/capture state machine in [`packages/modules/payment`](https://github.com/medusajs/medusa/tree/develop/packages/modules/payment). |
| [saleor/saleor](https://github.com/saleor/saleor) | GraphQL-first e-commerce platform (Python/Django). | Steal the checkout-to-order flow, the payment gateway plugin interface, and transaction event recording. |
| [stripe-samples](https://github.com/stripe-samples) | Official Stripe integration reference samples. | Steal canonical implementations of webhook verification, Checkout Sessions, and subscription lifecycle handling across many stacks. |

---

## 3. The Anatomy of Large Repos: Decomposing "Stealable" Modules

A billing platform is intimidating as a whole, but inside it is a set of well-bounded problems: aggregate events, verify a webhook, dedupe a request, prorate a plan change. Break it down by intent and lift the module.

### Decomposed Module Index

| Intent | Product / Repo | Target Module / Directory | What to steal |
| --- | --- | --- | --- |
| **Usage Event Aggregation** | Lago | [`app/services/events`](https://github.com/getlago/lago-api/tree/main/app/services/events) | How raw events are validated, enriched, post-processed, and pushed to a store/Kafka for aggregation into billable metrics. |
| **Charge / Fee Computation** | Lago | [`app/services/fees`](https://github.com/getlago/lago-api/tree/main/app/services/fees) and [`charges`](https://github.com/getlago/lago-api/tree/main/app/services/charges) | How aggregated usage is turned into fees under graduated/volume/package charge models. |
| **Invoice Generation** | Lago | [`app/services/invoices`](https://github.com/getlago/lago-api/tree/main/app/services/invoices) | How fees, credits, coupons, and taxes are assembled into a finalized invoice with the right lifecycle states. |
| **Webhook Delivery (outbound)** | Lago | [`app/services/webhooks`](https://github.com/getlago/lago-api/tree/main/app/services/webhooks) | How signed webhooks are built, delivered with retries, and recorded — the producer side of the webhook contract. |
| **Processor Connector Abstraction** | Hyperswitch | [`crates/`](https://github.com/juspay/hyperswitch/tree/main/crates) | The Rust trait that normalizes 120+ payment processors behind one request/response shape — the canonical adapter pattern for payments. |
| **Pluggable Payment Provider** | Medusa | [`packages/modules/payment`](https://github.com/medusajs/medusa/tree/develop/packages/modules/payment) | The provider interface plus the authorize → capture → refund payment-session state machine. |
| **Real-time Metering Aggregation** | OpenMeter | [`openmeter/`](https://github.com/openmeterio/openmeter/tree/main/openmeter) | How CloudEvents are aggregated in ClickHouse with windowed SUM/COUNT/MAX queries for live usage. |
| **Subscription State Machine** | Kill Bill | [`subscription`](https://github.com/killbill/killbill/tree/master/subscription) | How a long-lived subscription transitions through trial/active/cancelled with catalog-driven phase changes. |

---

## Functional Patterns

- **Idempotency Keys**: Every money-moving request carries a client-generated key. The server stores `(key -> response)` and replays the stored response on retry, so a network blip never double-charges. This is the single most important payments pattern.
- **Webhook Signature Verification**: Inbound webhooks are authenticated by an HMAC over the raw request body plus a timestamp, compared in constant time, with a tolerance window to reject replays.
- **Provider Adapter Trait**: A single internal request/response shape, with one adapter per processor translating to/from that processor's quirky API. The core orchestration never knows which processor it is talking to.
- **Event-Sourced Usage**: Usage is an append-only event log; the invoice is a *projection* computed by aggregating events in a billing window. Re-runnable, auditable, and corrigible.

## Stealable Snippets

### Webhook signature verification (constant-time, replay-resistant)

The Stripe-style scheme: sign `timestamp.rawBody` with HMAC-SHA256, compare in constant time, and reject stale timestamps to block replays. Always verify against the **raw** body, never the parsed JSON.

```ts
import crypto from "node:crypto";

export function verifyWebhook(opts: {
  rawBody: string;          // exact bytes received, NOT JSON.parse'd
  signatureHeader: string;  // e.g. "t=1718700000,v1=abc123..."
  secret: string;
  toleranceSec?: number;
}): boolean {
  const { rawBody, signatureHeader, secret, toleranceSec = 300 } = opts;
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((kv) => kv.split("=") as [string, string]),
  );
  const timestamp = Number(parts.t);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > toleranceSec) {
    return false; // stale or missing timestamp -> reject replay
  }
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1 ?? "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### An idempotency-key wrapper

Wrap any side-effecting handler so identical retries return the stored result instead of re-executing. The lock prevents two concurrent retries from both running.

```ts
async function withIdempotency<T>(
  store: KVStore,
  key: string,
  handler: () => Promise<T>,
): Promise<T> {
  const cached = await store.get(`idem:${key}`);
  if (cached) return JSON.parse(cached) as T; // replay prior response

  // Reserve the key so a concurrent retry cannot also execute.
  const acquired = await store.setNX(`idem:lock:${key}`, "1", { ttlSec: 60 });
  if (!acquired) throw new Error("request in flight");

  const result = await handler();
  await store.set(`idem:${key}`, JSON.stringify(result), { ttlSec: 86_400 });
  await store.del(`idem:lock:${key}`);
  return result;
}
```

### Usage-metering aggregation (graduated/tiered pricing)

Aggregate a raw event count, then walk pricing tiers — the core of usage-based billing. Each tier bills its slice at its own rate.

```ts
type Tier = { upTo: number | null; unitAmount: number; flatAmount?: number };

function priceUsage(units: number, tiers: Tier[]): number {
  let remaining = units;
  let total = 0;
  let lowerBound = 0;
  for (const tier of tiers) {
    const cap = tier.upTo ?? Infinity;        // null = the "rest" tier
    const span = Math.min(remaining, cap - lowerBound);
    if (span <= 0) break;
    total += span * tier.unitAmount + (tier.flatAmount ?? 0);
    remaining -= span;
    lowerBound = cap;
    if (remaining <= 0) break;
  }
  return total; // in minor units (cents)
}
```

### Subscription proration on a mid-cycle plan change

When a customer upgrades partway through a period, credit the unused time on the old plan and charge the prorated cost of the new plan.

```ts
function prorate(opts: {
  oldPlanCents: number;
  newPlanCents: number;
  periodStart: Date;
  periodEnd: Date;
  changeAt: Date;
}): number {
  const { oldPlanCents, newPlanCents, periodStart, periodEnd, changeAt } = opts;
  const periodMs = periodEnd.getTime() - periodStart.getTime();
  const remainingMs = periodEnd.getTime() - changeAt.getTime();
  const remainingFraction = Math.max(0, remainingMs / periodMs);

  const unusedCredit = Math.round(oldPlanCents * remainingFraction);
  const newCharge = Math.round(newPlanCents * remainingFraction);
  return newCharge - unusedCredit; // positive = owed now, negative = credit
}
```

## The Lift

- **The Idempotency Layer**: A reusable `(key -> stored response)` middleware with a short-lived lock — drop it in front of any non-idempotent endpoint, not just payments.
- **Raw-Body Webhook Verification**: The HMAC-over-raw-bytes + timestamp-tolerance recipe, framework-agnostic, that every webhook receiver needs and most get subtly wrong.
- **Tiered Pricing Walker**: A pure function from `(units, tiers)` to an amount that handles graduated, volume, and package models — testable in isolation.
- **Provider Adapter Interface**: The normalized request/response shape + one-adapter-per-processor structure that keeps your core decoupled from any single gateway.

## Search Inside

`idempotency`, `idempotency_key`, `webhook`, `signature`, `timingSafeEqual`, `HMAC`, `aggregation`, `graduated`, `volume`, `proration`, `prorate`, `invoice`, `fee`, `charge_model`, `connector`, `capture`, `authorize`, `refund`, `dunning`, `CloudEvents`, `billing_period`.
