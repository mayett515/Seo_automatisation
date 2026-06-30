import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldCoalesceExistingBullMqJob } from "./queue-producer.js";

void describe("shouldCoalesceExistingBullMqJob", () => {
  void it("coalesces only jobs that can still run", () => {
    for (const state of ["active", "waiting", "waiting-children", "delayed", "prioritized"]) {
      assert.equal(shouldCoalesceExistingBullMqJob(state), true, state);
    }

    for (const state of ["completed", "failed", "unknown"]) {
      assert.equal(shouldCoalesceExistingBullMqJob(state), false, state);
    }
  });
});
