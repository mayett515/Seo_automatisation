import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { LaneLeaf } from "@localseo/contracts";

import {
  buildMap,
  checkLaneInventory,
  documentedLeafFields,
  hasExportedSymbol,
  type CheckInput,
  type LeafFile
} from "./core.js";

const queueNames = ["deploy", "report", "pre-audit"] as const;

type BuiltLeaf = Extract<LaneLeaf, { state: "built" }>;
type PartialLeaf = Extract<LaneLeaf, { state: "partial" }>;
type ScaffoldLeaf = Extract<LaneLeaf, { state: "scaffold" }>;

// The leaf shape itself is validated by the contract schema and tested in
// packages/contracts/src/lane-inventory.test.ts. These factories build leaves
// that are already valid, so each test below isolates one derived fact.
function at(lane: string): string {
  return `apps/worker/src/handlers/${lane}.lane.md`;
}

function built(overrides: Partial<BuiltLeaf> = {}): LeafFile {
  const leaf: BuiltLeaf = {
    lane: "deploy",
    domain: "release",
    state: "built",
    missing: [],
    reason: "",
    trigger: "",
    proof: "apps/worker/src/handlers/deploy.integration.ts",
    ...overrides
  };
  return { file: at(leaf.lane), leaf };
}

function partial(overrides: Partial<PartialLeaf> = {}): LeafFile {
  const leaf: PartialLeaf = {
    lane: "report",
    domain: "report",
    state: "partial",
    missing: ["the analyst status vocabulary"],
    reason: "the framing half was never started",
    trigger: "implement the six analyst status labels",
    proof: "apps/worker/src/handlers/customer-report.integration.ts",
    ...overrides
  };
  return { file: at(leaf.lane), leaf };
}

function scaffold(overrides: Partial<ScaffoldLeaf> = {}): LeafFile {
  const leaf: ScaffoldLeaf = {
    lane: "pre-audit",
    domain: "intake",
    state: "scaffold",
    missing: ["worker handler"],
    reason: "unbuilt",
    trigger: "build it",
    proof: "",
    ...overrides
  };
  return { file: at(leaf.lane), leaf };
}

const schemaSource = [
  "```yaml",
  "---",
  "lane: deploy",
  "domain: release",
  "state: built",
  "missing: []",
  'reason: ""',
  'trigger: ""',
  "proof: apps/worker/src/handlers/deploy.integration.ts",
  "---",
  "```"
].join("\n");

function baseInput(overrides: Partial<CheckInput> = {}): CheckInput {
  return {
    queueNames,
    apiQueueNames: ["deploy", "report"],
    lanesWithRegisteredHandler: new Set(["deploy", "report"]),
    leaves: [built(), partial(), scaffold()],
    mapFile: "docs/agents/lanes/generated-map.md",
    existingMap: undefined,
    schemaSource,
    ...overrides
  };
}

function noAddress() {
  return { files: [], readFile: () => "", pathExists: () => true, pathIsFile: () => true };
}

function run(input: CheckInput) {
  return checkLaneInventory(input, noAddress());
}

function codes(result: ReturnType<typeof run>): string[] {
  return result.findings.map((finding) => finding.code);
}

void describe("checkLaneInventory", () => {
  void it("passes a well-formed input", () => {
    const result = run(baseInput());
    assert.equal(result.findings.length, 0, JSON.stringify(result.findings));
  });

  void it("reports every finding rather than stopping at the first", () => {
    const result = run(
      baseInput({
        leaves: [built({ lane: "ghost" }), scaffold({ lane: "deploy", domain: "release" })]
      })
    );

    assert.ok(codes(result).includes("LEAF_LANE_UNKNOWN"));
    assert.ok(codes(result).includes("LANE_LEAF_MISSING"));
    assert.ok(codes(result).includes("LANE_HANDLER_UNEXPECTED"));
    assert.ok(result.findings.length >= 3);
  });

  void it("fails when a queueName has no leaf (LANE_LEAF_MISSING)", () => {
    const result = run(baseInput({ leaves: [] }));
    assert.ok(codes(result).includes("LANE_LEAF_MISSING"));
  });

  void it("fails when two leaves claim one lane (LANE_LEAF_DUPLICATE)", () => {
    const result = run(baseInput({ leaves: [built(), built(), partial(), scaffold()] }));
    assert.ok(result.findings.some((f) => f.code === "LANE_LEAF_DUPLICATE" && f.message.includes("2 leaves")));
  });

  void it("fails when a leaf names a lane not in the registry (LEAF_LANE_UNKNOWN)", () => {
    const result = run(baseInput({ leaves: [built(), partial(), scaffold(), built({ lane: "ghost" })] }));
    assert.ok(result.findings.some((f) => f.code === "LEAF_LANE_UNKNOWN" && f.message.includes("ghost")));
  });

  void it("fails a built lane whose proof file is not on disk (LANE_PROOF_FILE_MISSING)", () => {
    const result = checkLaneInventory(baseInput({ leaves: [built({ proof: "apps/missing.ts" })] }), {
      files: [],
      readFile: () => "",
      pathExists: (path) => path !== "apps/missing.ts",
      pathIsFile: (path) => path !== "apps/missing.ts"
    });
    assert.ok(result.findings.some((f) => f.code === "LANE_PROOF_FILE_MISSING" && f.message.includes("missing.ts")));
  });

  void it("accepts a built lane whose proof file is on disk", () => {
    const result = checkLaneInventory(baseInput({ leaves: [built()] }), {
      files: [],
      readFile: () => "",
      pathExists: (path) => path === "apps/worker/src/handlers/deploy.integration.ts",
      pathIsFile: (path) => path === "apps/worker/src/handlers/deploy.integration.ts"
    });
    assert.equal(result.findings.filter((f) => f.code === "LANE_PROOF_FILE_MISSING").length, 0);
  });

  void it("fails a built lane whose proof path is a directory, not a file", () => {
    // The check ran on existence alone while its message said "is not a file on
    // disk", so `proof: apps/worker/src/handlers` passed for all seventeen
    // lanes. A reviewer found it by writing exactly that value.
    const result = checkLaneInventory(baseInput({ leaves: [built({ proof: "apps/worker/src/handlers" })] }), {
      files: [],
      readFile: () => "",
      pathExists: () => true,
      pathIsFile: (path) => path !== "apps/worker/src/handlers"
    });
    assert.ok(result.findings.some((f) => f.code === "LANE_PROOF_FILE_MISSING" && f.message.includes("handlers")));
  });

  void it("fails a built lane with no registered handler (LANE_HANDLER_MISSING)", () => {
    const result = run(baseInput({ lanesWithRegisteredHandler: new Set(["report"]) }));
    assert.ok(result.findings.some((f) => f.code === "LANE_HANDLER_MISSING" && f.message.includes("deploy")));
  });

  void it("fails a partial lane with no registered handler (LANE_HANDLER_MISSING)", () => {
    const result = run(baseInput({ lanesWithRegisteredHandler: new Set(["deploy"]) }));
    assert.ok(result.findings.some((f) => f.code === "LANE_HANDLER_MISSING" && f.message.includes("report")));
  });

  void it("accepts a built and a partial lane that both have a registered handler", () => {
    const result = run(baseInput({ leaves: [built(), partial(), scaffold()] }));
    assert.equal(result.findings.filter((f) => f.code === "LANE_HANDLER_MISSING").length, 0);
  });

  void it("fails a scaffold lane that has a registered handler (LANE_HANDLER_UNEXPECTED)", () => {
    const result = run(baseInput({ lanesWithRegisteredHandler: new Set(["deploy", "report", "pre-audit"]) }));
    assert.ok(result.findings.some((f) => f.code === "LANE_HANDLER_UNEXPECTED" && f.message.includes("pre-audit")));
  });

  void it("accepts a scaffold lane with no registered handler", () => {
    const result = run(baseInput());
    assert.equal(result.findings.filter((f) => f.code === "LANE_HANDLER_UNEXPECTED").length, 0);
  });

  void it("fails a scaffold lane admitted to apiQueueNames (LANE_HTTP_REACHABILITY_CONTRADICTION)", () => {
    const result = run(baseInput({ apiQueueNames: ["deploy", "report", "pre-audit"] }));
    assert.ok(result.findings.some((f) => f.code === "LANE_HTTP_REACHABILITY_CONTRADICTION"));
  });

  void it("fails an absent-by-decision lane admitted to apiQueueNames", () => {
    const result = run(
      baseInput({
        apiQueueNames: ["deploy", "report", "pre-audit"],
        leaves: [
          built(),
          partial(),
          {
            file: at("pre-audit"),
            leaf: {
              lane: "pre-audit",
              domain: "intake",
              state: "absent-by-decision",
              missing: [],
              reason: "decided against",
              trigger: "a workflow that needs it",
              proof: ""
            }
          }
        ]
      })
    );
    assert.ok(result.findings.some((f) => f.code === "LANE_HTTP_REACHABILITY_CONTRADICTION"));
  });

  void it("accepts a scaffold lane that is absent from apiQueueNames", () => {
    const result = run(baseInput());
    assert.equal(result.findings.filter((f) => f.code === "LANE_HTTP_REACHABILITY_CONTRADICTION").length, 0);
  });

  void it("fails a mechanisation claim that names no address (MECHANISM_ADDRESS_MISSING)", () => {
    const result = checkLaneInventory(baseInput(), {
      files: ["docs/agents/lanes/website.md"],
      readFile: () => "### D3 - a rule\n\n_Mechanised at:_ the release domain owns this; see release.md D1\n",
      pathExists: () => true,
      pathIsFile: () => true
    });
    assert.equal(result.findings.filter((f) => f.code === "MECHANISM_ADDRESS_MISSING").length, 1);
  });

  void it("accepts a mechanisation claim that names a path and symbol", () => {
    const result = checkLaneInventory(baseInput(), {
      files: ["docs/agents/lanes/website.md"],
      readFile: (path) =>
        path.endsWith("website.md")
          ? "_Mechanised at:_ apps/api/src/modules/projects.module.ts:ProjectsService - preview is noindex\n"
          : "export class ProjectsService {}",
      pathExists: () => true,
      pathIsFile: () => true
    });
    assert.equal(result.findings.filter((f) => f.code === "MECHANISM_ADDRESS_MISSING").length, 0);
  });

  void it("fails a cited address whose path does not exist (ADDRESS_PATH_MISSING)", () => {
    const result = checkLaneInventory(baseInput(), {
      files: ["docs/agents/lanes/release.md"],
      readFile: () => "the owner is packages/nowhere/nope.ts:Something",
      pathExists: () => false,
      pathIsFile: () => false
    });
    assert.ok(result.findings.some((f) => f.code === "ADDRESS_PATH_MISSING"));
  });

  void it("fails a cited address whose symbol is not exported (ADDRESS_SYMBOL_MISSING)", () => {
    const result = checkLaneInventory(baseInput(), {
      files: ["docs/agents/lanes/release.md"],
      readFile: () => "the owner is packages/domain/src/index.ts:doesNotExist",
      pathExists: (path) => path === "packages/domain/src/index.ts",
      pathIsFile: (path) => path === "packages/domain/src/index.ts"
    });
    assert.ok(result.findings.some((f) => f.code === "ADDRESS_SYMBOL_MISSING" && f.message.includes("doesNotExist")));
  });

  void it("accepts an exported-symbol address that exists", () => {
    const result = checkLaneInventory(baseInput(), {
      files: ["docs/agents/lanes/release.md"],
      readFile: (path) =>
        path === "docs/agents/lanes/release.md"
          ? "the owner is packages/domain/src/index.ts:deployStartingReleasePlanStatuses"
          : "export const deployStartingReleasePlanStatuses = [];",
      pathExists: () => true,
      pathIsFile: () => true
    });
    assert.equal(
      result.findings.filter((f) => f.code === "ADDRESS_PATH_MISSING" || f.code === "ADDRESS_SYMBOL_MISSING").length,
      0
    );
  });

  void it("fails a schema that omits a validated field (SCHEMA_FIELD_DRIFT)", () => {
    const result = run(baseInput({ schemaSource: ["```yaml", "---", "lane: deploy", "---", "```"].join("\n") }));
    assert.ok(result.findings.some((f) => f.code === "SCHEMA_FIELD_DRIFT" && f.message.includes("not documented")));
  });

  void it("fails a schema that documents a field nothing validates (SCHEMA_FIELD_DRIFT)", () => {
    const result = run(baseInput({ schemaSource: `${schemaSource.replace("---\n```", "enforces: []\n---\n```")}` }));
    assert.ok(result.findings.some((f) => f.code === "SCHEMA_FIELD_DRIFT" && f.message.includes("not validated")));
  });

  void it("fails a stale generated map (MAP_STALE)", () => {
    const result = run(baseInput({ existingMap: "hand-edited\n" }));
    assert.ok(codes(result).includes("MAP_STALE"));
  });
});

void describe("documentedLeafFields", () => {
  void it("reads the field names out of the SCHEMA.md example block", () => {
    assert.deepEqual(documentedLeafFields(schemaSource), [
      "lane",
      "domain",
      "state",
      "missing",
      "reason",
      "trigger",
      "proof"
    ]);
  });

  void it("returns nothing when the example block is absent", () => {
    assert.deepEqual(documentedLeafFields("# SCHEMA\n\nno example here\n"), []);
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
    const map = buildMap([built()], "docs/agents/lanes/generated-map.md", {
      lanesWithRegisteredHandler: new Set(["deploy"]),
      apiQueueNames: ["deploy"]
    });
    assert.ok(map.includes("review starting"));
    assert.ok(!map.includes("flowchart"));
  });
});
