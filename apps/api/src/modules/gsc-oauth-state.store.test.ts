import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GscOAuthStateStore, type GscOAuthNonceRecord } from "./gsc-oauth-state.store.js";

void describe("GscOAuthStateStore", () => {
  void it("stores nonce records with a TTL and consumes them once", async () => {
    const redis = new FakeRedis();
    const store = new GscOAuthStateStore(redis);
    const record = nonceRecord();

    assert.equal(await store.store(record, new Date("2026-06-26T10:00:00.000Z")), true);
    assert.equal(redis.lastTtlSeconds, 600);
    assert.deepEqual(await store.consume(record.nonce), record);
    assert.equal(await store.consume(record.nonce), undefined);
  });

  void it("returns undefined when Redis is not configured", async () => {
    const store = new GscOAuthStateStore();

    assert.equal(store.isConfigured(), false);
    assert.equal(await store.store(nonceRecord()), false);
    assert.equal(await store.consume("nonce-1"), undefined);
  });
});

class FakeRedis {
  readonly values = new Map<string, string>();
  lastTtlSeconds = 0;

  set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown> {
    assert.equal(mode, "EX");
    this.lastTtlSeconds = ttlSeconds;
    this.values.set(key, value);
    return Promise.resolve("OK");
  }

  getdel(key: string): Promise<string | null> {
    const value = this.values.get(key) ?? null;
    this.values.delete(key);
    return Promise.resolve(value);
  }
}

function nonceRecord(): GscOAuthNonceRecord {
  return {
    provider: "google_search_console",
    nonce: "nonce-1",
    projectId: "11111111-1111-4111-8111-111111111111",
    customerId: "33333333-3333-4333-8333-333333333333",
    userId: "22222222-2222-4222-8222-222222222222",
    sessionId: "session-1",
    redirectTo: "/projects/11111111-1111-4111-8111-111111111111/gsc/connect",
    codeVerifier: "code-verifier",
    expiresAt: "2026-06-26T10:10:00.000Z"
  };
}
