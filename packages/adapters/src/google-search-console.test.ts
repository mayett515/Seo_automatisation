import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GoogleSearchConsoleAdapter,
  createPkcePair,
  signOAuthState,
  verifyOAuthState,
  type SearchConsoleAuthorizationState
} from "./google-search-console.js";

const secret = "test-state-secret-with-at-least-32-characters";
const now = new Date("2026-06-26T10:00:00.000Z");

void describe("Google Search Console OAuth state", () => {
  void it("round-trips a signed state payload", () => {
    const payload = statePayload({ expiresAt: "2026-06-26T10:10:00.000Z" });
    const state = signOAuthState(payload, secret);

    assert.deepEqual(verifyOAuthState(state, secret, now), payload);
  });

  void it("rejects tampered payloads", () => {
    const payload = statePayload({ expiresAt: "2026-06-26T10:10:00.000Z" });
    const [encodedPayload, signature] = signOAuthState(payload, secret).split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({ ...payload, projectId: "other-project" }), "utf8").toString(
      "base64url"
    );

    assert.throws(() => verifyOAuthState(`${tamperedPayload}.${signature ?? ""}`, secret, now), /signature/u);
    assert.notEqual(encodedPayload, tamperedPayload);
  });

  void it("rejects expired states", () => {
    const state = signOAuthState(statePayload({ expiresAt: "2026-06-26T09:59:59.000Z" }), secret);

    assert.throws(() => verifyOAuthState(state, secret, now), /Expired/u);
  });

  void it("creates authorization URLs with signed state and PKCE", () => {
    const adapter = new GoogleSearchConsoleAdapter({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "https://api.example.test/gsc/callback",
      stateSecret: secret
    });
    const request = adapter.createAuthorizationRequest({
      projectId: "11111111-1111-4111-8111-111111111111",
      customerId: "33333333-3333-4333-8333-333333333333",
      userId: "22222222-2222-4222-8222-222222222222",
      sessionId: "session-1",
      redirectTo: "/projects/11111111-1111-4111-8111-111111111111/gsc/connect",
      now
    });
    const authUrl = new URL(request.intent.authUrl ?? "");

    assert.equal(authUrl.searchParams.get("code_challenge_method"), "S256");
    assert.ok(authUrl.searchParams.get("code_challenge"));
    assert.ok(request.codeVerifier.length >= 43);
    assert.deepEqual(verifyOAuthState(request.state, secret, now), request.statePayload);
  });

  void it("creates high-entropy PKCE verifier/challenge pairs", () => {
    const first = createPkcePair();
    const second = createPkcePair();

    assert.notEqual(first.codeVerifier, second.codeVerifier);
    assert.notEqual(first.codeChallenge, second.codeChallenge);
    assert.ok(first.codeVerifier.length >= 43);
    assert.ok(first.codeChallenge.length >= 43);
  });
});

function statePayload(input: Pick<SearchConsoleAuthorizationState, "expiresAt">): SearchConsoleAuthorizationState {
  return {
    provider: "google_search_console",
    projectId: "project-1",
    customerId: "customer-1",
    userId: "user-1",
    sessionId: "session-1",
    issuedAt: "2026-06-26T10:00:00.000Z",
    expiresAt: input.expiresAt,
    nonce: "nonce-1",
    redirectTo: "/projects/project-1/gsc/connect"
  };
}
