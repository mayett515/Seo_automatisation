# Auth And Identity

This is where you come to lift the part that proves *who a user is* (authentication) and *what they are allowed to do* (authorization) — without rediscovering the footguns yourself. Auth is the canonical "do not roll your own" subsystem: it spans stateless tokens (JWT/JWS), stateful server sessions, OAuth2/OIDC delegation flows, password hashing with memory-hard KDFs, passwordless flows (magic links, passkeys/WebAuthn), and multi-factor enrollment, and each one has a "boring but correct" implementation where a single wrong detail (a non-constant-time comparison, a loose cookie `SameSite`, a token replay window) silently becomes a vulnerability. The repos here are the reference implementations the rest of the ecosystem copies from, so copy from them directly.

You almost never want the *whole* platform. Keycloak and Ory Kratos are enormous, but the part you walk in for is one piece — their session store, their token introspection endpoint, their account-recovery state machine. And the part travels: a TypeScript library like Better Auth and a Go identity server like Kratos share the same portable intents — "rotate a session on privilege change," "hash a password with Argon2id," "verify a signed JWT against a JWKS." Find the one you need and lift it.

---

## 1. Auth Libraries & Frameworks

Application-level libraries you wire directly into your app and lift pieces from. They favor convention, adapters, and type-safety over running a separate identity server.

### Application Auth Libraries

| Link | Good For | What to steal |
| --- | --- | --- |
| [better-auth/better-auth](https://github.com/better-auth/better-auth) | Framework-agnostic TypeScript auth (sessions, OAuth, 2FA, passkeys). | Steal the plugin architecture, the session table + cookie-cache design, how adapters abstract Drizzle/Prisma/Kysely, and the organization/RBAC plugin. |
| [nextauthjs/next-auth](https://github.com/nextauthjs/next-auth) | OAuth/OIDC provider integration for Next.js & frameworks (Auth.js). | Steal the provider config model, the JWT-vs-database session strategy switch, the adapter interface (`@auth/*-adapter`), and CSRF/`state` handling in the callback. |
| [lucia-auth/lucia](https://github.com/lucia-auth/lucia) | Reference for implementing sessions from scratch (**v3 deprecated March 2025** — now a teaching reference). | Treat as a textbook, not a dependency. Lift the session ID hashing, the validate-and-extend session flow, and the "auth is just a table + a cookie" framing. |
| [panva/jose](https://github.com/panva/jose) | Zero-dependency JWS/JWE/JWT primitives for all JS runtimes. | Steal `jwtVerify`, `SignJWT`, `createRemoteJWKSet` (cached JWKS fetch), and how it stays runtime-agnostic over WebCrypto. The correct building block for token handling. |

---

## 2. Identity Servers & Standards

These run as a standalone service you delegate login, token issuance, and user management to over OAuth2/OIDC — or that you raid for a single proven module.

### Standalone Identity Platforms

| Link | Good For | What to steal |
| --- | --- | --- |
| [keycloak/keycloak](https://github.com/keycloak/keycloak) | Full-featured OIDC/SAML identity provider (Java/Quarkus). | Steal realm/client modeling, the token introspection + refresh-token rotation flow, and how authorization "policies" (RBAC/ABAC) are evaluated server-side. |
| [ory/hydra](https://github.com/ory/hydra) | Certified OAuth2 & OIDC **provider** (token issuance only — no user DB). | Steal the consent/login redirect handshake, how it deliberately delegates user auth to your app, and PKCE + client-credentials grant handling. |
| [ory/kratos](https://github.com/ory/kratos) | Headless identity & user management (registration, login, recovery, MFA) in Go. | Steal the `selfservice` flow state machine, the `session` package, and the `hash` package's pluggable Argon2id/bcrypt comparator. |
| [supertokens/supertokens-core](https://github.com/supertokens/supertokens-core) | Self-hosted auth core with rotating refresh tokens (Java). | Steal the rotating-refresh-token + short-lived-access-token scheme and its session theft detection (refresh-token family invalidation). |

---

## 3. The Anatomy of Large Repos: Decomposing "Stealable" Modules

Identity platforms are some of the largest repos you will encounter. Do not approach Keycloak as "an SSO product"; treat it as a shelf of modules — a token store, a credential hasher, a policy evaluator — each one a part you can lift into your own codebase.

### Decomposed Module Index

| Intent | Product / Repo | Target Module / Directory | What to steal |
| --- | --- | --- | --- |
| **Self-Service Flow State Machine** | Ory Kratos | [`selfservice`](https://github.com/ory/kratos/tree/master/selfservice) | How registration, login, recovery, and verification are modeled as resumable, expiring "flow" objects rather than one-shot endpoints. |
| **Pluggable Password Hashing** | Ory Kratos | [`hash`](https://github.com/ory/kratos/tree/master/hash) | How to abstract Argon2id/bcrypt/scrypt behind one `Comparator` interface and migrate hashes on next successful login. |
| **Server Session Lifecycle** | Ory Kratos | [`session`](https://github.com/ory/kratos/tree/master/session) | How sessions carry AAL (authenticator assurance level), get persisted, and are revoked on logout or credential change. |
| **OAuth2 Consent Handshake** | Ory Hydra | [`consent`](https://github.com/ory/hydra/tree/master/consent) | How an OAuth2 provider bounces the user to *your* login/consent UI and back, keeping user credentials out of the token server. |
| **Adapter Abstraction** | Auth.js (next-auth) | [`packages/adapter-drizzle`](https://github.com/nextauthjs/next-auth/tree/main/packages/adapter-drizzle) | How a single `Adapter` interface (createUser, getSessionAndUser, linkAccount) lets one auth core target any database. |
| **Plugin-Based Capabilities** | Better Auth | [`packages/better-auth/src/plugins`](https://github.com/better-auth/better-auth/tree/main/packages/better-auth/src/plugins) | How 2FA, passkeys, organizations, and magic-link are bolt-on plugins that register routes, schema, and hooks rather than core code. |
| **JWKS-backed Verification** | jose | [`src/jwks`](https://github.com/panva/jose/tree/main/src/jwks) | How `createRemoteJWKSet` caches a provider's public keys and selects the right key by `kid` to verify a token offline. |

---

## Functional Patterns

- **Stateless vs. Stateful Trade-off**: A JWT is self-contained and scales horizontally but cannot be revoked before expiry; a server session is instantly revocable but requires a lookup. The mature pattern is *short-lived access JWT + long-lived rotating refresh token stored as a session* (the SuperTokens model).
- **Session Rotation on Privilege Change**: Whenever a user logs in, elevates privilege, or changes their password, you issue a **new** session ID and invalidate the old one. This defeats session-fixation attacks.
- **Memory-Hard Password Hashing**: Never store plaintext or fast-hashed (SHA-256) passwords. Use Argon2id or bcrypt, store the algorithm + parameters *inside* the hash string, and re-hash on next login when parameters change.
- **Delegated Authorization (OAuth2/OIDC)**: The app never sees the user's password at the provider; it receives a signed token (`id_token`) and verifies it against the provider's published JWKS. PKCE protects public clients against authorization-code interception.
- **Capability/Role Checks at the Boundary**: Authorization is enforced at every protected entry point (middleware/guard), not scattered through business logic.

## Code Snippets To Steal

**1. Verify a JWT against a remote JWKS (`jose`)** — the correct way to validate a provider-issued token offline after a one-time key fetch:

```ts
import { jwtVerify, createRemoteJWKSet } from "jose";

// Cached: fetches & caches the provider's public keys, picks the right one by `kid`.
const JWKS = createRemoteJWKSet(new URL("https://issuer.example.com/.well-known/jwks.json"));

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: "https://issuer.example.com/",
    audience: "my-api",
  });
  return payload; // throws on bad signature, expiry, issuer/audience mismatch
}
```

**2. Session-cookie rotation on login** — issue a fresh session, invalidate the old one, set a hardened cookie:

```ts
import { randomBytes, createHash } from "node:crypto";

function newSessionId() {
  return randomBytes(32).toString("base64url");
}
// Store only a HASH of the session id, so a DB leak can't be replayed as a live cookie.
const hashId = (id: string) => createHash("sha256").update(id).digest("hex");

export async function rotateSession(res, db, userId: string, oldId?: string) {
  if (oldId) await db.deleteSession(hashId(oldId)); // kill the previous session
  const id = newSessionId();
  await db.createSession({ id: hashId(id), userId, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7 });

  res.cookie("session", id, {
    httpOnly: true,    // not readable by JS -> mitigates XSS token theft
    secure: true,      // HTTPS only
    sameSite: "lax",   // mitigates CSRF on top-level navigation
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });
  return id;
}
```

**3. Hash + verify a password with Argon2id** — parameters travel inside the hash, enabling transparent upgrades:

```ts
import argon2 from "argon2";

export const hashPassword = (plain: string) =>
  argon2.hash(plain, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });

export async function verifyPassword(stored: string, plain: string) {
  const ok = await argon2.verify(stored, plain); // constant-time, parses params from `stored`
  // Transparently upgrade legacy/weaker hashes on a successful login.
  const needsRehash = ok && argon2.needsRehash(stored, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2 });
  return { ok, needsRehash };
}
```

**4. A minimal RBAC check** — authorization expressed as a permission lookup, enforced at the boundary:

```ts
const ROLE_PERMISSIONS: Record<string, Set<string>> = {
  admin: new Set(["post:create", "post:delete", "post:read"]),
  editor: new Set(["post:create", "post:read"]),
  viewer: new Set(["post:read"]),
};

export const can = (role: string, permission: string) =>
  ROLE_PERMISSIONS[role]?.has(permission) ?? false;

// Express-style guard applied at the route boundary, not inside business logic.
export const requirePermission = (permission: string) => (req, res, next) =>
  can(req.user?.role, permission) ? next() : res.status(403).json({ error: "forbidden" });
```

## The Lift

- **Rotating Refresh-Token Scheme**: How short-lived access tokens pair with a refresh-token *family* whose reuse signals theft and invalidates the whole chain (SuperTokens).
- **Adapter Interface**: The minimal set of methods (`createUser`, `getSessionAndUser`, `linkAccount`, `deleteSession`) that lets one auth core run on any database.
- **Flow State Machines**: Modeling registration/recovery as resumable, expiring server-side objects instead of stateless endpoints (Kratos `selfservice`).
- **JWKS Caching + Key Selection**: Verifying tokens offline by caching a provider's public keys and choosing the key by `kid`.
- **Hash Migration on Login**: Detecting outdated KDF parameters during a successful verify and re-hashing transparently.

## Search Inside

`jwtVerify`, `SignJWT`, `createRemoteJWKSet`, `jwks`, `kid`, `argon2id`, `bcrypt`, `needsRehash`, `httpOnly`, `sameSite`, `refreshToken`, `rotateSession`, `selfservice`, `consent`, `Adapter`, `getSessionAndUser`, `PKCE`, `WebAuthn`, `passkey`, `RBAC`, `requirePermission`.
