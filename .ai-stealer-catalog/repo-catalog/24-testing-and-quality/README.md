# Testing And Quality

This is where you come to lift the tooling that proves code works and keeps it working as it changes — the part you'd otherwise reinvent badly. Testing is a layered discipline: fast **unit** tests for pure logic, **integration** tests that exercise real boundaries (a database, an HTTP API), and **end-to-end** tests that drive a real browser like a user would. On top of that sit the techniques that separate adequate suites from great ones — network mocking that intercepts at the wire level, property-based testing that *generates* adversarial inputs instead of hardcoding examples, ephemeral real dependencies via containers, and load testing that surfaces failures only volume reveals. The repos here are the tools the JavaScript and polyglot ecosystems standardized on, so take from the standard rather than rolling your own.

None of these is just "a test runner." Playwright is a request-interception layer, a browser-protocol client, an auto-waiting locator engine, and a trace recorder; MSW is a runtime-agnostic interception algorithm with two thin adapters (Service Worker in the browser, an interceptor in Node) sharing one handler syntax. The parts worth taking are the *mechanisms*: how auto-waiting removes flakiness, how a shrinker minimizes a failing case, how a fixture's lifecycle is scoped. Lift the mechanism, not the whole framework.

---

## 1. Test Runners & Browser Automation

The engines that execute your tests, and the parts inside worth lifting — from millisecond-fast unit runs to full cross-browser e2e.

### Runners & Drivers

| Link | Good For | What to steal |
| --- | --- | --- |
| [vitest-dev/vitest](https://github.com/vitest-dev/vitest) | Fast, Vite-native unit/integration test runner for TS/JS. | Steal the worker-pool execution model, the Vite-powered transform/HMR for tests, the `expect` matcher registry, and the in-source/snapshot testing support. |
| [microsoft/playwright](https://github.com/microsoft/playwright) | Cross-browser end-to-end testing & automation (Chromium/Firefox/WebKit). | Steal the auto-waiting locator engine (no manual sleeps), the fixtures system, request interception (`page.route`), and the trace viewer recorder. |
| [testing-library/react-testing-library](https://github.com/testing-library/react-testing-library) | Testing UI the way a user interacts with it (queries by role/text). | Steal the "query by accessibility role" philosophy, `findBy*` async queries, and how it discourages testing implementation details. |

---

## 2. Mocking, Generation & Real Dependencies

Tools that control the inputs and boundaries of a test, each with a mechanism worth taking — fake network, generated data, generated inputs, and throwaway real services.

### Mocking & Data

| Link | Good For | What to steal |
| --- | --- | --- |
| [mswjs/msw](https://github.com/mswjs/msw) | API mocking at the network layer, shared across browser & Node. | Steal how one set of `http.get`/`http.post` handlers runs via a Service Worker in the browser and a request interceptor in Node, plus passthrough and one-time handlers. |
| [dubzzz/fast-check](https://github.com/dubzzz/fast-check) | Property-based testing — generate adversarial inputs automatically. | Steal the arbitraries (`fc.string`, `fc.record`), the **shrinking** algorithm that minimizes a failing input, and seed-based reproducibility. |
| [testcontainers/testcontainers-node](https://github.com/testcontainers/testcontainers-node) | Ephemeral real dependencies (Postgres, Redis, Kafka) in Docker. | Steal the container lifecycle (start/wait-for-ready/stop), the wait strategies (log/port/healthcheck), and the prebuilt module containers. |
| [faker-js/faker](https://github.com/faker-js/faker) | Realistic fake data for fixtures and seeds. | Steal the locale-aware data modules and the seeded RNG (`faker.seed`) for deterministic fixtures. |
| [grafana/k6](https://github.com/grafana/k6) | Scriptable load & performance testing (JS API, Go engine). | Steal the VU (virtual user) execution model, `thresholds` as pass/fail criteria, and the scenarios/executors for ramping load. |

---

## 3. The Anatomy of Large Repos: Decomposing "Stealable" Modules

Test frameworks are deceptively large because they bundle several independent engines. The parts worth taking live in the sub-modules: Playwright's interception layer, fast-check's shrinker, testcontainers' wait strategies.

### Decomposed Module Index

| Intent | Product / Repo | Target Module / Directory | What to steal |
| --- | --- | --- | --- |
| **Runtime-Agnostic Interception** | MSW | [`src/core/handlers`](https://github.com/mswjs/msw/tree/main/src/core/handlers) | How one handler abstraction (`RequestHandler`) serves both a browser Service Worker and a Node interceptor with identical syntax. |
| **Auto-Waiting Locators** | Playwright | [`packages/playwright-core/src/client`](https://github.com/microsoft/playwright/tree/main/packages/playwright-core/src/client) | How `locator.click()` retries until the element is visible, stable, and actionable — eliminating manual sleeps and most flakiness. |
| **Test Fixtures System** | Playwright | [`packages/playwright/src/common`](https://github.com/microsoft/playwright/tree/main/packages/playwright/src/common) | How fixtures declare dependencies, are scoped (per-test vs per-worker), and are torn down deterministically. |
| **Input Shrinking** | fast-check | [`packages/fast-check/src/arbitrary`](https://github.com/dubzzz/fast-check/tree/main/packages/fast-check/src/arbitrary) | How a failing random input is iteratively shrunk to the *minimal* reproducing case, the single most valuable PBT feature. |
| **Container Wait Strategies** | testcontainers-node | [`packages/testcontainers/src/wait-strategies`](https://github.com/testcontainers/testcontainers-node/tree/main/packages/testcontainers/src/wait-strategies) | How "is this dependency ready?" is decided via log regex, port listen, or healthcheck before the test proceeds. |
| **Matcher Registry** | Vitest | [`packages/expect/src`](https://github.com/vitest-dev/vitest/tree/main/packages/expect/src) | How `expect().toEqual()` matchers are registered, made extensible (`expect.extend`), and produce readable diffs on failure. |
| **VU Execution Engine** | k6 | [`js`](https://github.com/grafana/k6/tree/master/js) | How a JS test script is executed across many concurrent virtual users by a Go runtime with per-iteration metric collection. |

---

## Functional Patterns

- **The Testing Pyramid**: Many fast unit tests, fewer integration tests, very few slow e2e tests. Push assertions as far down the pyramid as correctness allows.
- **Mock at the Boundary, Not the Module**: Intercept the *network* (MSW) rather than stubbing your own `fetch`/`axios` calls. Tests then exercise your real client code and survive refactors.
- **Generate, Don't Enumerate**: Instead of a handful of hand-picked example inputs, declare a *property* ("reverse twice == identity") and let the framework throw thousands of generated inputs at it, then shrink any failure to a minimal case.
- **Real Dependencies, Disposable**: Spin up an actual Postgres/Redis in a container per test suite (testcontainers) instead of mocking the database — you test against real behavior, then throw the container away.
- **Deterministic Fixtures**: Seed the fake-data RNG (`faker.seed(n)`) so a failing test reproduces identically on every run and on CI.
- **Thresholds as Gates**: A load test isn't "info"; it has pass/fail `thresholds` (e.g. p95 latency < 200ms) that fail CI when violated.

## Code Snippets To Steal

**1. An MSW request handler** — mock at the network layer so your real data-fetching code runs unchanged:

```ts
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

export const server = setupServer(
  http.get("https://api.example.com/users/:id", ({ params }) => {
    return HttpResponse.json({ id: params.id, name: "Ada Lovelace" });
  }),
  http.post("https://api.example.com/users", async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({ id: "new", ...body }, { status: 201 });
  }),
);

// In test setup: server.listen(); afterEach -> server.resetHandlers(); afterAll -> server.close();
```

**2. A property-based test (fast-check)** — assert an invariant over generated inputs; failures auto-shrink:

```ts
import fc from "fast-check";
import { test, expect } from "vitest";

test("reversing a list twice returns the original", () => {
  fc.assert(
    fc.property(fc.array(fc.integer()), (xs) => {
      const twice = [...xs].reverse().reverse();
      expect(twice).toEqual(xs); // fast-check finds & SHRINKS any counterexample to its minimal form
    }),
  );
});
```

**3. A testcontainers integration setup** — a real, disposable Postgres for the test suite:

```ts
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { beforeAll, afterAll } from "vitest";

let container, connectionUri: string;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start(); // waits until ready
  connectionUri = container.getConnectionUri(); // hand this to your real DB client
}, 60_000);

afterAll(async () => {
  await container.stop(); // throwaway — no leftover state between runs
});
```

**4. A Playwright e2e assertion** — auto-waiting locators and web-first `expect`, no manual sleeps:

```ts
import { test, expect } from "@playwright/test";

test("user can log in", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("ada@example.com");      // waits for the field
  await page.getByLabel("Password").fill("correct horse");
  await page.getByRole("button", { name: "Sign in" }).click(); // retries until actionable

  // Web-first assertion: polls until the condition is met or times out — no flaky sleeps.
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});
```

## The Lift

- **Wire-Level Interception**: A handler abstraction that mocks HTTP once and runs in both browser and Node (MSW), so tests target the network, not your code's internals.
- **Shrinking**: The algorithm that reduces a failing generated input to its minimal reproducing form — the feature that makes property-based testing actionable.
- **Auto-Waiting Actionability**: Locator logic that retries until an element is visible, stable, and enabled, removing the #1 source of e2e flakiness.
- **Container Wait Strategies**: Deciding readiness via log regex / port / healthcheck so integration tests never race a half-started dependency.
- **Thresholds-as-Gates**: Encoding performance SLAs (p95/error-rate) as pass/fail criteria a load test can fail CI on.

## Search Inside

`describe`, `it`, `expect`, `toEqual`, `expect.extend`, `http.get`, `setupServer`, `resetHandlers`, `fc.assert`, `fc.property`, `fc.array`, `shrink`, `PostgreSqlContainer`, `getConnectionUri`, `wait-strategies`, `getByRole`, `getByLabel`, `toBeVisible`, `page.route`, `fixtures`, `faker.seed`, `thresholds`, `VU`.
