# Backend Frameworks And Patterns

Walk in here to lift the machinery every backend framework eventually needs: routing, validation, serialization, middleware, plugin systems, dependency injection, module boundaries, and the request/response lifecycle. Underneath, each framework is the same machine: accept a raw request, pass it through ordered cross-cutting concerns, dispatch to a handler, and serialize the response. The valuable part is the composition model: Express's linear `(req, res, next)` chain, Fastify's encapsulated plugin tree, NestJS's guard/interceptor/pipe stack, FastAPI's dependency graph, or Django's middleware onion plus ORM.

Do not take the whole framework unless you need it. Take the module: the middleware dispatcher, DI container, schema validator, ORM query builder, error pipeline, or platform adapter. The repos below pair throughput-focused Node frameworks with canonical reference implementations in other ecosystems so you can compare the same intent across languages and lift the version that fits your stack.

## Fastify — High-Performance Node.js Web Framework

Fastify is a low-overhead web framework optimized for throughput and developer experience. It pairs declarative routing with JSON Schema-driven validation and serialization, so requests are validated at the edge and responses serialized efficiently.

### Core Repos

| Link | Good For | What to steal |
| --- | --- | --- |
| [fastify/fastify](https://github.com/fastify/fastify) | Core web framework with plugin architecture. | Steal the encapsulation model, hook lifecycle (onRequest, preHandler, onSend, onResponse), JSON Schema validation, serialization, and the plugin system. |
| [fastify/benchmarks](https://github.com/fastify/benchmarks) | Automated benchmarks against other Node.js frameworks. | Steal what "fast" actually means: request overhead, throughput, latency distribution. Good for understanding framework overhead patterns. |
| [israeleriston/awesome-fastify](https://github.com/israeleriston/awesome-fastify) | Curated list of Fastify plugins, tools, and resources. | Use to discover the ecosystem: swagger, rate-limit, JWT, CORS, WebSocket, multipart, static, cookie, and community plugins. |

### Key Ecosystem Plugins (all under `@fastify/` or `fastify-` org)

- `fastify/fastify-swagger` — OpenAPI/Swagger docs generation from route schemas.
- `fastify/fastify-rate-limit` — Low-overhead rate limiting for routes.
- `fastify/fastify-jwt` — JWT authentication utilities.
- `fastify/fastify-cors` — CORS middleware.
- `fastify/fastify-websocket` — WebSocket support.
- `fastify/fastify-multipart` — Multipart form/file upload handling.
- `fastify/fastify-cookie` — Cookie parsing and signing.
- `fastify/fastify-static` — Static file serving.

## NestJS — Progressive Node.js Server-Side Framework

NestJS brings Angular-inspired architecture to Node.js backends: modules, controllers, providers, dependency injection, guards, interceptors, pipes, and filters. It can run on Express or Fastify via platform adapters.

### Core Repos

| Link | Good For | What to steal |
| --- | --- | --- |
| [nestjs/nest](https://github.com/nestjs/nest) | Core progressive Node.js framework. | Steal module architecture, dependency injection container, guards/interceptors/pipes/filters pipeline, platform adapters (Express/Fastify), and GraphQL/microservice modules. |
| [nestjs/awesome-nestjs](https://github.com/nestjs/awesome-nestjs) | Curated list of NestJS resources and projects. | Use to find example projects, boilerplates, admin panels, and community tools built on NestJS. |

## Fastify + NestJS Bridge

NestJS can use Fastify as its HTTP adapter (`@nestjs/platform-fastify`), giving you NestJS architecture with Fastify throughput. Reach for this combination when you want:
- NestJS module/DII architecture
- Fastify's JSON Schema validation and serialization speed
- Lower latency than Express defaults

## Reference Frameworks — Other Ecosystems

Use these to compare the same request-lifecycle intent across languages. The vocabulary changes; the machine does not.

| Link | Good For | What to steal |
| --- | --- | --- |
| [expressjs/express](https://github.com/expressjs/express) | The canonical linear-middleware model. | Steal the `(req, res, next)` chain in `lib/application.js` and the routing layer — the simplest possible "ordered pipeline" dispatcher. |
| [fastapi/fastapi](https://github.com/fastapi/fastapi) | Dependency injection done elegantly (Python). | Steal `fastapi/dependencies/` and `params.py`: how `Depends()` builds a resolution graph, caches sub-dependencies per request, and wires validation via Pydantic. |
| [django/django](https://github.com/django/django) | Batteries-included framework + a mature ORM. | Steal `django/db/models/` for the active-record ORM and the middleware onion in `django/core/handlers/` — request/response wrapping at scale. |

## 1. The Anatomy of Large Repos: Decomposing "Stealable" Modules

A framework looks like one indivisible thing, but it is really a handful of cooperating modules: a router, a middleware/hook dispatcher, a validator, a DI container, an error pipeline. Decompose the repo by intent and each module becomes a pattern you can lift on its own, regardless of which framework you actually ship.

### Decomposed Module Index

| Intent | Product / Repo | Target Module / Directory | What to steal |
| --- | --- | --- | --- |
| **Linear middleware dispatch** | Express | [`lib/`](https://github.com/expressjs/express/tree/master/lib) | How `application.js` layers an ordered list of `(req, res, next)` handlers and threads control via `next()`, including error-handling middleware (`(err, req, res, next)`). |
| **Encapsulated plugin tree + hooks** | Fastify | [`lib/hooks.js`](https://github.com/fastify/fastify/blob/main/lib/hooks.js) | How `onRequest`/`preHandler`/`onSend`/`onResponse` hooks run per encapsulation context, so a plugin's middleware never leaks to siblings. |
| **Schema-driven validation/serialization** | Fastify | [`lib/validation.js`](https://github.com/fastify/fastify/blob/main/lib/validation.js) | How JSON Schema compiles to fast validators at boot, rejecting bad input at the edge and serializing responses without reflection. |
| **DI container & module tree** | NestJS | [`packages/core`](https://github.com/nestjs/nest/tree/master/packages/core) | How the injector resolves a provider graph, manages scopes (DEFAULT/REQUEST/TRANSIENT), and bootstraps the module tree. |
| **Guard → interceptor → pipe pipeline** | NestJS | [`packages/common`](https://github.com/nestjs/nest/tree/master/packages/common) | How decorators register cross-cutting concerns that wrap controller methods in a deterministic order. |
| **Dependency-injection via callables** | FastAPI | [`fastapi/dependencies`](https://github.com/fastapi/fastapi/tree/master/fastapi/dependencies) | How `Depends()` builds a resolution tree, caches shared sub-dependencies per request, and supports yield-based teardown. |
| **Active-record ORM** | Django | [`django/db/models`](https://github.com/django/django/tree/main/django/db/models) | How model classes map to tables, a lazy `QuerySet` builds SQL, and migrations diff model state — object ↔ relational mapping. |
| **Platform adapter abstraction** | NestJS | [`packages/platform-fastify`](https://github.com/nestjs/nest/tree/master/packages/platform-fastify) | How the same framework runs on Express or Fastify behind one `HttpAdapter` interface — swappable HTTP backends. |

### Code You Can Steal

The entire essence of Express in one function — a middleware dispatcher that threads control through an ordered list via `next()`:

```js
function runPipeline(middlewares, req, res) {
  let i = 0;
  function next(err) {
    const fn = middlewares[i++];
    if (!fn) return;
    try {
      // error middleware has 4 args; skip it unless we're in an error state
      if (err) { if (fn.length === 4) fn(err, req, res, next); else next(err); }
      else     { if (fn.length === 4) next();                 else fn(req, res, next); }
    } catch (e) { next(e); }
  }
  next();
}
```

A clean Fastify hook + JSON-Schema route — validation and serialization declared as data, not code:

```js
fastify.addHook('preHandler', async (req, reply) => {
  if (!req.headers.authorization) throw fastify.httpErrors.unauthorized();
});

fastify.post('/users', {
  schema: {
    body: { type: 'object', required: ['email'],
            properties: { email: { type: 'string', format: 'email' } } },
    response: { 201: { type: 'object', properties: { id: { type: 'string' } } } },
  },
}, async (req, reply) => {
  const user = await createUser(req.body);   // body already validated
  reply.code(201).send(user);                // response serialized by schema
});
```

FastAPI dependency injection — declare what a handler needs and the framework resolves, caches, and tears it down:

```python
from fastapi import Depends, FastAPI

app = FastAPI()

async def get_db():
    db = SessionLocal()
    try:
        yield db          # injected into the handler
    finally:
        db.close()        # teardown runs after the response

async def current_user(db=Depends(get_db), token: str = Depends(oauth2_scheme)):
    return verify(db, token)

@app.get("/me")
async def me(user=Depends(current_user)):   # whole graph resolved per request
    return user
```

## Functional Patterns

- **Fastify**: Plugin encapsulation, hook lifecycle, schema-driven input/output, route options as configuration, decorators for request/response.
- **NestJS**: Module tree, dependency injection, provider scopes (DEFAULT/REQUEST/TRANSIENT), guard → interceptor → pipe → controller → interceptor → filter pipeline.
- **Cross-cutting**: Request ID propagation, structured logging hooks, graceful shutdown, health checks, config management, error formatting.

## The Lift

- How the framework registers routes and middleware.
- How validation and serialization are wired (Fastify: JSON Schema; NestJS: class-validator/class-transformer + ValidationPipe).
- Plugin/module lifecycle and initialization order.
- Error handling pipeline: where errors are caught, how they're formatted.
- How dependency injection works under the hood.
- Performance patterns: avoiding closures, reusing schemas, pooling connections.

## Search Inside

`fastify`, `plugin`, `hook`, `onRequest`, `preHandler`, `schema`, `serialize`, `decorate`, `register`, `nestjs`, `module`, `controller`, `provider`, `injectable`, `guard`, `interceptor`, `pipe`, `filter`, `dependency injection`, `platform adapter`, `lifecycle`.
