import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { signOAuthState, verifyOAuthState, type SearchConsoleAuthorizationState } from "./google-search-console.js";

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
});

function statePayload(input: Pick<SearchConsoleAuthorizationState, "expiresAt">): SearchConsoleAuthorizationState {
  return {
    projectId: "project-1",
    expiresAt: input.expiresAt,
    nonce: "nonce-1",
    redirectTo: "http://localhost:5173/projects/project-1/gsc/connect"
  };
}
