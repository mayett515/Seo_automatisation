import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { LeafFile } from "./core.js";
import { checkApiRegistryRelationship, checkDomainParents, loadLeaves } from "./intake.js";

/**
 * These three finding codes are emitted only by the shell's intake, never by
 * the pure core, and they were named test debt in SCHEMA.md for two rounds. The
 * gap was real rather than theoretical: the core suite could stay green while
 * the front-matter parser or the wiring around it regressed, because the core
 * never sees this layer. A checker that stops catching things while reporting
 * success is the failure this whole inventory exists to prevent.
 */

function leafSource(overrides: Partial<Record<string, string>> = {}): string {
  const fields: Record<string, string> = {
    lane: "deploy",
    domain: "release",
    state: "built",
    missing: "[]",
    reason: '""',
    trigger: '""',
    proof: "apps/worker/src/handlers/deploy.integration.ts",
    ...overrides
  };
  const body = Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  return `---\n${body}\n---\n\n# deploy\n`;
}

function reader(files: Record<string, string>): (path: string) => string {
  return (path) => {
    const source = files[path];
    if (source === undefined) throw new Error(`unexpected read: ${path}`);
    return source;
  };
}

void describe("loadLeaves", () => {
  void it("accepts a well-formed leaf and returns it parsed", () => {
    const findings: Parameters<typeof loadLeaves>[2] = [];
    const loaded = loadLeaves(["a.lane.md"], reader({ "a.lane.md": leafSource() }), findings);

    assert.equal(findings.length, 0, JSON.stringify(findings));
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0]?.leaf.lane, "deploy");
    assert.equal(loaded[0]?.file, "a.lane.md");
  });

  void it("reports a file with no front matter (LEAF_SHAPE_INVALID)", () => {
    const findings: Parameters<typeof loadLeaves>[2] = [];
    const loaded = loadLeaves(["a.lane.md"], reader({ "a.lane.md": "# just a heading\n" }), findings);

    assert.deepEqual(
      findings.map((finding) => finding.code),
      ["LEAF_SHAPE_INVALID"]
    );
    assert.ok(findings[0]?.message.includes("no front matter"));
    assert.equal(loaded.length, 0, "an unparseable leaf must be dropped, not guessed at");
  });

  void it("reports front matter the contract schema rejects (LEAF_SHAPE_INVALID)", () => {
    // A `built` leaf may not carry a missing list; the schema owns that rule and
    // this asserts the shell actually asks it.
    const findings: Parameters<typeof loadLeaves>[2] = [];
    const loaded = loadLeaves(
      ["a.lane.md"],
      reader({ "a.lane.md": leafSource({ missing: '["something"]' }) }),
      findings
    );

    assert.deepEqual(
      findings.map((finding) => finding.code),
      ["LEAF_SHAPE_INVALID"]
    );
    assert.equal(loaded.length, 0);
  });

  void it("keeps the valid leaves when one file in the set is broken", () => {
    const findings: Parameters<typeof loadLeaves>[2] = [];
    const loaded = loadLeaves(
      ["good.lane.md", "bad.lane.md"],
      reader({ "good.lane.md": leafSource(), "bad.lane.md": "nothing\n" }),
      findings
    );

    assert.equal(loaded.length, 1);
    assert.equal(findings.length, 1);
  });
});

void describe("checkApiRegistryRelationship", () => {
  void it("accepts admitted queues that the registry declares", () => {
    assert.deepEqual(checkApiRegistryRelationship(["deploy", "report"], ["deploy", "report", "gsc-sync"]), []);
  });

  void it("reports an admitted queue the registry does not declare (API_QUEUE_NOT_IN_REGISTRY)", () => {
    // Fail closed: every fact the checker derives afterwards would otherwise be
    // about a queue that does not exist.
    const findings = checkApiRegistryRelationship(["deploy", "ghost"], ["deploy"]);

    assert.deepEqual(
      findings.map((finding) => finding.code),
      ["API_QUEUE_NOT_IN_REGISTRY"]
    );
    assert.ok(findings[0]?.message.includes("ghost"));
  });

  void it("reports every unknown admission, not only the first", () => {
    const findings = checkApiRegistryRelationship(["ghost", "phantom"], []);
    assert.equal(findings.length, 2);
  });
});

void describe("checkDomainParents", () => {
  const leaf = (domain: string): LeafFile => ({
    file: `apps/worker/src/handlers/deploy.lane.md`,
    leaf: {
      lane: "deploy",
      domain,
      state: "built",
      missing: [],
      reason: "",
      trigger: "",
      proof: "apps/worker/src/handlers/deploy.integration.ts"
    }
  });

  void it("accepts a domain whose parent document exists", () => {
    assert.deepEqual(
      checkDomainParents([leaf("release")], "docs/agents/lanes", () => true),
      []
    );
  });

  void it("reports a domain with no parent document (LEAF_DOMAIN_PARENT_MISSING)", () => {
    const findings = checkDomainParents([leaf("ghost")], "docs/agents/lanes", () => false);

    assert.deepEqual(
      findings.map((finding) => finding.code),
      ["LEAF_DOMAIN_PARENT_MISSING"]
    );
    assert.ok(findings[0]?.message.includes("docs/agents/lanes/ghost.md"));
  });

  void it("looks for the parent under the directory it was given", () => {
    const asked: string[] = [];
    checkDomainParents([leaf("release")], "somewhere/else", (path) => {
      asked.push(path);
      return true;
    });

    assert.deepEqual(asked, ["somewhere/else/release.md"]);
  });
});
