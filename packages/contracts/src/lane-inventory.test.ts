import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LaneLeafSchema, laneLeafFieldNames } from "./lane-inventory.js";

const built = {
  lane: "deploy",
  domain: "release",
  state: "built",
  missing: [],
  reason: "",
  trigger: "",
  proof: "apps/worker/src/handlers/deploy.integration.ts"
};

const partial = {
  lane: "serp-scout",
  domain: "evidence",
  state: "partial",
  missing: ["real SERP provider adapter"],
  reason: "ADR 0015 chose a no-paid-SERP-API proof strategy",
  trigger: "a decision to pay for a SERP provider",
  proof: "apps/worker/src/handlers/serp-scout.integration.ts"
};

const scaffold = {
  lane: "analytics",
  domain: "evidence",
  state: "scaffold",
  missing: ["worker handler"],
  reason: "never built",
  trigger: "event volume that makes synchronous persistence untenable",
  proof: ""
};

const absentByDecision = { ...scaffold, lane: "notifications", state: "absent-by-decision" };

void describe("LaneLeafSchema", () => {
  void it("accepts one leaf per state", () => {
    for (const leaf of [built, partial, scaffold, absentByDecision]) {
      const result = LaneLeafSchema.safeParse(leaf);
      assert.equal(result.success, true, JSON.stringify(result.error?.issues));
    }
  });

  void it("rejects a field the schema does not document", () => {
    assert.equal(LaneLeafSchema.safeParse({ ...built, enforces: ["G1"] }).success, false);
  });

  void it("rejects a built leaf that lists missing pieces", () => {
    assert.equal(LaneLeafSchema.safeParse({ ...built, missing: ["handler"] }).success, false);
  });

  void it("rejects a built leaf with no proof path", () => {
    assert.equal(LaneLeafSchema.safeParse({ ...built, proof: "" }).success, false);
  });

  void it("rejects a built leaf that carries a reason or a trigger", () => {
    assert.equal(LaneLeafSchema.safeParse({ ...built, reason: "because" }).success, false);
    assert.equal(LaneLeafSchema.safeParse({ ...built, trigger: "someday" }).success, false);
  });

  void it("rejects a scaffold leaf that claims a proof", () => {
    assert.equal(LaneLeafSchema.safeParse({ ...scaffold, proof: "apps/worker/src/x.ts" }).success, false);
  });

  void it("rejects a partial leaf without a reason", () => {
    assert.equal(LaneLeafSchema.safeParse({ ...partial, reason: "" }).success, false);
  });

  void it("rejects a partial leaf with nothing named as missing", () => {
    assert.equal(LaneLeafSchema.safeParse({ ...partial, missing: [] }).success, false);
  });

  void it("rejects a state that is not one of the four", () => {
    assert.equal(LaneLeafSchema.safeParse({ ...built, state: "nope" }).success, false);
  });
});

void describe("laneLeafFieldNames", () => {
  void it("names every field of the leaf shape, in schema order", () => {
    assert.deepEqual(laneLeafFieldNames, ["lane", "domain", "state", "missing", "reason", "trigger", "proof"]);
  });
});
