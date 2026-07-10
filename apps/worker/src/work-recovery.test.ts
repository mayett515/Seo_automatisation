import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { transportStateFromBullMqJobState } from "./work-recovery.js";

void describe("work recovery transport mapping", () => {
  void it("maps runnable BullMQ states to active transport", () => {
    for (const state of ["active", "waiting", "waiting-children", "delayed", "prioritized"]) {
      assert.equal(transportStateFromBullMqJobState(state), "active", state);
    }
  });

  void it("keeps terminal and unknown BullMQ states distinct", () => {
    assert.equal(transportStateFromBullMqJobState("completed"), "completed");
    assert.equal(transportStateFromBullMqJobState("failed"), "failed");
    assert.equal(transportStateFromBullMqJobState("unknown"), "unknown");
    assert.equal(transportStateFromBullMqJobState("paused"), "unknown");
  });
});
