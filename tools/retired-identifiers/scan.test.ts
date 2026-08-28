import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { collectFiles, exportedNames, ACTIVE_ROOTS } from "./scan.js";

type Tree = Record<string, readonly { name: string; isDirectory: boolean }[]>;

function readerFor(tree: Tree, contents: Record<string, string>) {
  return {
    readDirectory: (path: string) => tree[path] ?? [],
    readFile: (path: string) => contents[path] ?? "",
    pathExists: (path: string) => path in tree || path in contents
  };
}

void describe("active-source collection", () => {
  void it("collects markdown and typescript under an active root", () => {
    const tree: Tree = {
      "docs/agents": [
        { name: "lanes", isDirectory: true },
        { name: "domain.md", isDirectory: false }
      ],
      "docs/agents/lanes": [{ name: "SCHEMA.md", isDirectory: false }]
    };
    const contents = { "docs/agents/domain.md": "a", "docs/agents/lanes/SCHEMA.md": "b" };
    const { readDirectory, readFile, pathExists } = readerFor(tree, contents);

    const files = collectFiles(["docs/agents"], [], readDirectory, readFile, pathExists);

    assert.deepEqual(
      files.map((file) => file.path),
      ["docs/agents/lanes/SCHEMA.md", "docs/agents/domain.md"]
    );
  });

  void it("skips a file type it does not scan", () => {
    const tree: Tree = { tools: [{ name: "notes.txt", isDirectory: false }] };
    const { readDirectory, readFile, pathExists } = readerFor(tree, { "tools/notes.txt": "x" });

    assert.deepEqual(collectFiles(["tools"], [], readDirectory, readFile, pathExists), []);
  });

  // The historical roots are the reason this check can be strict elsewhere.
  void it("skips a historical root reached from inside an active one", () => {
    const tree: Tree = {
      docs: [
        { name: "progress", isDirectory: true },
        { name: "agents", isDirectory: true }
      ],
      "docs/progress": [{ name: "2026-08-26-lane-inventory.md", isDirectory: false }],
      "docs/agents": [{ name: "domain.md", isDirectory: false }]
    };
    const contents = {
      "docs/progress/2026-08-26-lane-inventory.md": "widgetNames",
      "docs/agents/domain.md": "a"
    };
    const { readDirectory, readFile, pathExists } = readerFor(tree, contents);

    const files = collectFiles(["docs"], [], readDirectory, readFile, pathExists);

    assert.deepEqual(
      files.map((file) => file.path),
      ["docs/agents/domain.md"]
    );
  });

  void it("skips a root that is not installed rather than failing", () => {
    const { readDirectory, readFile, pathExists } = readerFor({}, {});
    assert.deepEqual(collectFiles([".codex/rules"], [], readDirectory, readFile, pathExists), []);
  });

  // The layer the incident left unguarded. If this root ever leaves the list,
  // the live product-rule documents stop being checked and nothing else says so.
  //
  // Only the active half is asserted here. That the root is absent from
  // HISTORICAL_ROOTS is already a compile error to state, because both lists
  // are literal unions - the typechecker owns that half, and a runtime
  // assertion for it can never fail.
  void it("keeps the live product-rule layer in the active roots", () => {
    assert.ok(ACTIVE_ROOTS.includes(".ai-project-rules"));
  });
});

void describe("static export extraction", () => {
  void it("finds an exported const", () => {
    assert.ok(exportedNames("widgets.ts", "export const sharedWidgetNames = [];").has("sharedWidgetNames"));
  });

  // The half a runtime import cannot prove: a type is gone by then.
  void it("finds an exported type alias", () => {
    assert.ok(exportedNames("widgets.ts", "export type SharedWidgetName = string;").has("SharedWidgetName"));
  });

  void it("finds exported functions, classes, interfaces and enums", () => {
    const names = exportedNames(
      "x.ts",
      "export function f() {}\nexport class C {}\nexport interface I {}\nexport enum E { A }\n"
    );
    assert.deepEqual([...names].sort(), ["C", "E", "I", "f"]);
  });

  void it("finds a renamed re-export under its exported name", () => {
    const names = exportedNames("x.ts", 'export { inner as outer } from "./y.js";');
    assert.ok(names.has("outer"));
    assert.ok(!names.has("inner"));
  });

  void it("does not report a name that is declared but not exported", () => {
    assert.ok(!exportedNames("x.ts", "const widgetNames = [];").has("widgetNames"));
  });

  void it("returns nothing for an unparseable file instead of throwing", () => {
    assert.deepEqual([...exportedNames("x.ts", "export const = = =")], []);
  });
});
