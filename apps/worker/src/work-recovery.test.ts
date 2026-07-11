import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scanStaleWork, transportStateFromBullMqJobState, type WorkRecoveryQueue } from "./work-recovery.js";

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

  void it("continues loading the other lane when one candidate query fails", async () => {
    let selectCount = 0;
    const db = {
      select() {
        selectCount += 1;
        const shouldFail = selectCount === 1;
        const builder: Record<string, (...args: unknown[]) => unknown> = {};

        for (const method of ["from", "innerJoin", "where", "orderBy"]) {
          builder[method] = () => builder;
        }

        builder.limit = () =>
          shouldFail ? Promise.reject(new Error("page proposal candidate query failed")) : Promise.resolve([]);
        return builder;
      }
    } as unknown as Parameters<typeof scanStaleWork>[0]["db"];
    const queue: WorkRecoveryQueue = {
      getJob: () => Promise.resolve(undefined),
      add: () => Promise.resolve(undefined),
      close: () => Promise.resolve()
    };
    const originalConsoleError = console.error;
    const errors: string[] = [];
    console.error = (...values: unknown[]) => errors.push(values.map(String).join(" "));

    try {
      const result = await scanStaleWork({
        db,
        queues: {
          "page-generation": queue,
          "release-verification": queue
        },
        now: new Date("2026-07-11T10:00:00.000Z"),
        staleAfterMs: 60_000,
        maxRecoveryCount: 3,
        batchSize: 25
      });

      assert.equal(selectCount, 2);
      assert.equal(result.errors, 1);
      assert.equal(result.checked, 0);
      assert.match(errors[0] ?? "", /page_proposal candidates/u);
    } finally {
      console.error = originalConsoleError;
    }
  });
});
