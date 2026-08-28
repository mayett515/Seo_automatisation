import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  checkRetiredIdentifiers,
  type CheckInput,
  type FindingCode,
  type RetiredIdentifier,
  type ScannedFile
} from "./core.js";

const REGISTRY = "tools/retired-identifiers/registry.ts";

/** The registry as it really looks: the retired name appears as a declaration. */
function registryFile(...retired: string[]): ScannedFile {
  return {
    path: REGISTRY,
    text: `export const retiredIdentifiers = [\n${retired
      .map((name) => `  { retired: "${name}", reason: "The old name overstated what the list proves." }`)
      .join(",\n")}\n];\n`
  };
}

function entry(overrides: Partial<RetiredIdentifier> = {}): RetiredIdentifier {
  return {
    retired: "widgetNames",
    reason: "The list admits the shared producer only.",
    replacement: { owner: "packages/contracts/src/widgets.ts", exportName: "sharedWidgetNames" },
    ...overrides
  };
}

function baseInput(overrides: Partial<CheckInput> = {}): CheckInput {
  return {
    entries: [entry()],
    files: [registryFile("widgetNames")],
    registryPath: REGISTRY,
    exportsByOwner: new Map([["packages/contracts/src/widgets.ts", new Set(["sharedWidgetNames"])]]),
    ...overrides
  };
}

function codes(input: CheckInput): FindingCode[] {
  return checkRetiredIdentifiers(input).map((finding) => finding.code);
}

void describe("retired identifier check", () => {
  void it("passes a clean tree where only the registry declares the retired name", () => {
    assert.deepEqual(codes(baseInput()), []);
  });

  void it("fails an empty registry rather than passing silently", () => {
    assert.deepEqual(codes(baseInput({ entries: [] })), ["REGISTRY_EMPTY"]);
  });

  // The incident this check exists for: the rename reached the code and stopped
  // at the prose.
  void it("fails a retired name in active markdown", () => {
    const files = [
      registryFile("widgetNames"),
      { path: "docs/agents/lanes/SCHEMA.md", text: "absent from `widgetNames`\n" }
    ];
    assert.deepEqual(codes(baseInput({ files })), ["RETIRED_IDENTIFIER_PRESENT"]);
  });

  void it("fails a retired name in active typescript", () => {
    const files = [
      registryFile("widgetNames"),
      { path: "tools/check-lane-inventory.ts", text: "import { widgetNames } from x;\n" }
    ];
    assert.deepEqual(codes(baseInput({ files })), ["RETIRED_IDENTIFIER_PRESENT"]);
  });

  void it("reports the line so the finding is actionable", () => {
    const files = [
      registryFile("widgetNames"),
      { path: "docs/agents/lanes/SCHEMA.md", text: "one\ntwo\nabsent from `widgetNames`\n" }
    ];
    const [finding] = checkRetiredIdentifiers(baseInput({ files }));
    assert.match(finding?.message ?? "", /SCHEMA\.md:3/u);
  });

  // A retired name is a whole identifier, and the neighbours that matter are
  // the ones a substring match would hit. `sharedWidgetNames` is not one of
  // them: it contains `WidgetNames` with a capital W, so a case-sensitive
  // search never reaches it and asserting on it proves nothing. This assertion
  // was written that way first, and removing the word boundaries left it green.
  // These two do reach it - one grows the name to the right, one to the left.
  void it("does not match the retired name inside a longer identifier", () => {
    const files = [
      registryFile("widgetNames"),
      { path: "packages/contracts/src/widgets.ts", text: "export const widgetNamesV2 = [];\n" },
      { path: "packages/contracts/src/legacy.ts", text: "export const legacywidgetNames = [];\n" }
    ];
    assert.deepEqual(codes(baseInput({ files })), []);
  });

  // Structural, not a blanket file exemption: the declaration form is skipped,
  // any other use of the name in that same file is still a finding.
  void it("does not report the registry's own declaration", () => {
    assert.deepEqual(codes(baseInput()), []);
  });

  void it("still reports a retired name used outside the declaration in the registry", () => {
    const files = [
      {
        path: REGISTRY,
        text:
          `export const retiredIdentifiers = [\n` +
          `  { retired: "widgetNames", reason: "widgetNames was read as reachability." }\n];\n`
      }
    ];
    assert.deepEqual(codes(baseInput({ files })), ["RETIRED_IDENTIFIER_PRESENT"]);
  });

  void describe("allowances", () => {
    const decision = "docs/architecture/decisions/0031-lane-inventory.md";

    void it("accepts an allowed historical mention within its budget", () => {
      const files = [registryFile("widgetNames"), { path: decision, text: "The decision retired `widgetNames`.\n" }];
      const entries = [
        entry({ allowed: [{ path: decision, maxOccurrences: 1, why: "Quoted as part of the accepted decision." }] })
      ];
      assert.deepEqual(codes(baseInput({ files, entries })), []);
    });

    // The point of a budget: a second, careless use in an allowed file cannot
    // hide behind the first one's exception.
    void it("fails a second occurrence in an allowed file", () => {
      const files = [
        registryFile("widgetNames"),
        { path: decision, text: "The decision retired `widgetNames`.\nSee `widgetNames` above.\n" }
      ];
      const entries = [
        entry({ allowed: [{ path: decision, maxOccurrences: 1, why: "Quoted as part of the accepted decision." }] })
      ];
      assert.deepEqual(codes(baseInput({ files, entries })), ["RETIRED_IDENTIFIER_OVER_ALLOWANCE"]);
    });

    void it("fails an allowance with no reason", () => {
      const files = [registryFile("widgetNames"), { path: decision, text: "`widgetNames`\n" }];
      const entries = [entry({ allowed: [{ path: decision, maxOccurrences: 1, why: "  " }] })];
      assert.deepEqual(codes(baseInput({ files, entries })), ["ALLOWANCE_REASON_MISSING"]);
    });

    // An allowance that no longer covers anything is a dead exception, and dead
    // exceptions are how an allowlist becomes a graveyard.
    void it("fails an allowance whose file no longer mentions the name", () => {
      const entries = [
        entry({ allowed: [{ path: decision, maxOccurrences: 1, why: "Quoted as part of the accepted decision." }] })
      ];
      assert.deepEqual(codes(baseInput({ entries })), ["ALLOWANCE_UNUSED"]);
    });
  });

  void describe("replacement proof", () => {
    void it("fails when the named replacement is not exported by its owner", () => {
      const exportsByOwner = new Map([["packages/contracts/src/widgets.ts", new Set(["queueNames"])]]);
      assert.deepEqual(codes(baseInput({ exportsByOwner })), ["REPLACEMENT_EXPORT_MISSING"]);
    });

    void it("fails when the owner file could not be read", () => {
      assert.deepEqual(codes(baseInput({ exportsByOwner: new Map() })), ["REPLACEMENT_OWNER_UNREADABLE"]);
    });

    // Not every retirement is a rename. A deletion has no replacement to prove,
    // and demanding one would push authors to invent a successor.
    void it("accepts an entry with no replacement", () => {
      const entries = [entry({ replacement: undefined })];
      assert.deepEqual(codes(baseInput({ entries, exportsByOwner: new Map() })), []);
    });
  });
});
