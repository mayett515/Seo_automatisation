import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveTrustProxy } from "./http-runtime.js";

void describe("resolveTrustProxy", () => {
  void it("keeps proxy trust disabled when configured as false or zero", () => {
    assert.equal(resolveTrustProxy("false"), false);
    assert.equal(resolveTrustProxy("0"), false);
  });

  void it("keeps broad true parseable for local development only", () => {
    assert.equal(resolveTrustProxy("true"), true);
  });

  void it("parses hop counts and proxy allowlists", () => {
    assert.equal(resolveTrustProxy("1"), 1);
    assert.deepEqual(resolveTrustProxy("10.0.0.0/8, 172.16.0.0/12"), ["10.0.0.0/8", "172.16.0.0/12"]);
  });
});
