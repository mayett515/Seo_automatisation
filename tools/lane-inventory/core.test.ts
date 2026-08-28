import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildMap, checkLaneInventory, hasExportedSymbol, type CheckInput, type Leaf } from "./core.js";

const queueNames = ["deploy", "report", "pre-audit"] as const;

function leaf(overrides: Partial<Leaf> = {}): Leaf {
  return {
    file: `apps/worker/src/handlers/${overrides.lane ?? "deploy"}.lane.md`,
    lane: "deploy",
    domain: "release",
    state: "built",
    missing: [],
    reason: "",
    trigger: "",
    proof: "apps/worker/src/handlers/deploy.integration.ts",
    ...overrides
  };
}

function baseInput(overrides: Partial<CheckInput> = {}): CheckInput {
  return {
    queueNames,
    apiQueueNames: ["deploy", "report"],
    leaves: [leaf()],
    mapFile: "docs/agents/lanes/generated-map.md",
    existingMap: undefined,
    schemaSource: "lane:\ndomain:\nstate:\nmissing:\nreason:\ntrigger:\nproof:\n",
    ...overrides
  };
}

function noAddress() {
  return { files: [], readFile: () => "", pathExists: () => true };
}

function run(input: CheckInput) {
  return checkLaneInventory(input, noAddress());
}

void describe("checkLaneInventory", () => {
  void it("passes a well-formed input", () => {
    const result = run(
      baseInput({
        leaves: [
          leaf({}),
          leaf({ lane: "report", domain: "report" }),
          leaf({
            lane: "pre-audit",
            domain: "intake",
            state: "scaffold",
            missing: ["handler"],
            reason: "unbuilt",
            trigger: "build it",
            proof: ""
          })
        ]
      })
    );

    assert.equal(result.failures.length, 0, JSON.stringify(result.failures));
  });

  void it("fails when a queueName has no leaf (1-registry)", () => {
    const result = run(baseInput({ leaves: [] }));
    assert.ok(result.failures.some((f) => f.check === "1-registry"));
  });

  void it("fails when two leaves claim one lane (1-registry)", () => {
    const result = run(baseInput({ leaves: [leaf(), leaf({ file: "x.lane.md" })] }));
    assert.ok(result.failures.some((f) => f.check === "1-registry" && f.message.includes("2 leaves")));
  });

  void it("fails when a leaf names a lane not in the registry (1-registry)", () => {
    const l = leaf({ lane: "ghost" });
    const result = run(baseInput({ leaves: [l] }));
    assert.ok(result.failures.some((f) => f.check === "1-registry" && f.message.includes("ghost")));
  });

  void it("fails an invalid state (2-shape)", () => {
    const result = run(baseInput({ leaves: [leaf({ state: "nope" })] }));
    assert.ok(result.failures.some((f) => f.check === "2-shape"));
  });

  void it("fails a non-built lane without reason or trigger (2-reason)", () => {
    const result = run(baseInput({ leaves: [leaf({ state: "partial", missing: ["x"], reason: "", trigger: "" })] }));
    assert.ok(result.failures.some((f) => f.check === "2-reason"));
  });

  void it("fails a built lane with no proof path at all (3-proof)", () => {
    const result = run(baseInput({ leaves: [leaf({ proof: "" })] }));
    assert.ok(result.failures.some((f) => f.check === "3-proof" && f.message.includes("requires a proof path")));
  });

  void it("fails a built lane that lists missing pieces (3-proof)", () => {
    const result = run(baseInput({ leaves: [leaf({ missing: ["gap"] })] }));
    assert.ok(result.failures.some((f) => f.check === "3-proof" && f.message.includes("missing")));
  });

  void it("fails a scaffold lane reachable from the API (6-reachable)", () => {
    const result = run(
      baseInput({
        apiQueueNames: ["deploy", "report", "pre-audit"],
        leaves: [leaf({ state: "scaffold", missing: ["h"], reason: "r", trigger: "t" })]
      })
    );
    assert.ok(result.failures.some((f) => f.check === "6-reachable"));
  });

  void it("fails a missing proof path when the file does not exist", () => {
    const result = checkLaneInventory(baseInput({ leaves: [leaf({ proof: "apps/missing.ts" })] }), {
      files: [],
      readFile: () => "",
      pathExists: (p) => p !== "apps/missing.ts"
    });
    assert.ok(result.failures.some((f) => f.check === "3-proof" && f.message.includes("missing.ts")));
  });

  void it("fails a mechanisation claim that names no address (7-unaddressed-mechanism)", () => {
    const result = checkLaneInventory(baseInput(), {
      files: ["docs/agents/lanes/website.md"],
      readFile: () => "### D3 - a rule\n\n_Mechanised at:_ the release domain owns this; see release.md D1\n",
      pathExists: () => true
    });
    assert.equal(result.failures.filter((f) => f.check === "7-unaddressed-mechanism").length, 1);
  });

  void it("accepts a mechanisation claim that names a path and symbol", () => {
    const result = checkLaneInventory(baseInput(), {
      files: ["docs/agents/lanes/website.md"],
      readFile: (p) =>
        p.endsWith("website.md")
          ? "_Mechanised at:_ apps/api/src/modules/projects.module.ts:ProjectsService - preview is noindex\n"
          : "export class ProjectsService {}",
      pathExists: () => true
    });
    assert.equal(result.failures.filter((f) => f.check === "7-unaddressed-mechanism").length, 0);
  });

  void it("fails a stale generated map (11-stale-map)", () => {
    const result = run(baseInput({ existingMap: "hand-edited\n" }));
    assert.ok(result.failures.some((f) => f.check === "11-stale-map"));
  });

  void it("fails a schema that omits a validated field (10-schema-drift)", () => {
    const result = run(baseInput({ schemaSource: "lane:\n" }));
    assert.ok(result.failures.some((f) => f.check === "10-schema-drift"));
  });

  void it("fails a cited address whose symbol is not exported (12-address)", () => {
    const result = checkLaneInventory(baseInput(), {
      files: ["docs/agents/lanes/release.md"],
      readFile: () => "the owner is packages/domain/src/index.ts:doesNotExist",
      pathExists: (p) => p === "packages/domain/src/index.ts"
    });
    assert.ok(result.failures.some((f) => f.check === "12-address" && f.message.includes("doesNotExist")));
  });

  void it("fails a cited address whose path does not exist (12-address)", () => {
    const result = checkLaneInventory(baseInput(), {
      files: ["docs/agents/lanes/release.md"],
      readFile: () => "the owner is packages/nowhere/nope.ts:Something",
      pathExists: () => false
    });
    assert.ok(result.failures.some((f) => f.check === "12-address"));
  });

  void it("accepts an exported-symbol address that exists (12-address)", () => {
    const result = checkLaneInventory(baseInput(), {
      files: ["docs/agents/lanes/release.md"],
      readFile: (path) =>
        path === "docs/agents/lanes/release.md"
          ? "the owner is packages/domain/src/index.ts:deployStartingReleasePlanStatuses"
          : "export const deployStartingReleasePlanStatuses = [];",
      pathExists: () => true
    });
    assert.equal(result.failures.filter((f) => f.check === "12-address").length, 0);
  });
});

void describe("hasExportedSymbol", () => {
  void it("matches export const/function/class and export async function", () => {
    assert.ok(hasExportedSymbol("export const x = 1;", "x"));
    assert.ok(hasExportedSymbol("export async function routeJob() {}", "routeJob"));
    assert.ok(hasExportedSymbol("export class ReleaseExecutionCapability {}", "ReleaseExecutionCapability"));
    assert.ok(hasExportedSymbol("export type ApiQueueName = void;", "ApiQueueName"));
  });

  void it("rejects a symbol that is not exported", () => {
    assert.ok(!hasExportedSymbol("function privateThing() {}", "privateThing"));
    assert.ok(!hasExportedSymbol("const internal = 1;", "internal"));
  });

  void it("escapes regex metacharacters in the symbol", () => {
    assert.ok(!hasExportedSymbol("export const a = 1;", "a."));
  });
});

void describe("buildMap", () => {
  void it("includes a review-starting-point disclaimer and no hand-written flow", () => {
    const map = buildMap([leaf({ lane: "deploy", domain: "release" })], "docs/agents/lanes/generated-map.md");
    assert.ok(map.includes("review starting"));
    assert.ok(!map.includes("flowchart"));
  });
});
