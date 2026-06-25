import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRedisConnection } from "./redis-connection.js";

void describe("createRedisConnection", () => {
  void it("parses redis:// URLs without TLS", () => {
    const connection = createRedisConnection("redis://user:pass@example.test:6380");

    assert.equal(connection.host, "example.test");
    assert.equal(connection.port, 6380);
    assert.equal(connection.username, "user");
    assert.equal(connection.password, "pass");
    assert.equal(connection.tls, undefined);
    assert.equal(connection.maxRetriesPerRequest, null);
  });

  void it("enables TLS for rediss:// URLs", () => {
    const connection = createRedisConnection("rediss://:secret@example.test");

    assert.equal(connection.host, "example.test");
    assert.equal(connection.port, 6379);
    assert.equal(connection.username, undefined);
    assert.equal(connection.password, "secret");
    assert.deepEqual(connection.tls, {});
  });
});
