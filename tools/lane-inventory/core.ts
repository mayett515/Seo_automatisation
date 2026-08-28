// Pure functional core of the lane-inventory check. No filesystem access, no
// registry imports, no CLI side effects. The shell (tools/check-lane-inventory.ts)
// reads the world and hands it in here; this module decides and returns values.
//
// Every fact this core reasons over is named for what its source proves, never
// for what a reader might hope it proves. `lanesWithRegisteredHandler` says a
// handler is registered, not that a job succeeds. `reachableFromHttp` says the
// API may enqueue, not that anything does. Proof existence says a file is on
// disk, not that its contents prove anything. Findings state facts; the reason
// behind a fact lives in the leaf's `reason` field, never in a message here.

import { laneLeafFieldNames, type LaneLeaf } from "@localseo/contracts";

/** Stable identifiers for what went wrong. Callers branch on the code. */
export type FindingCode =
  | "LANE_LEAF_MISSING"
  | "LANE_LEAF_DUPLICATE"
  | "LEAF_LANE_UNKNOWN"
  | "LEAF_SHAPE_INVALID"
  | "LEAF_DOMAIN_PARENT_MISSING"
  | "LANE_PROOF_FILE_MISSING"
  | "LANE_HANDLER_MISSING"
  | "LANE_HANDLER_UNEXPECTED"
  | "LANE_HTTP_REACHABILITY_CONTRADICTION"
  | "API_QUEUE_NOT_IN_REGISTRY"
  | "MECHANISM_ADDRESS_MISSING"
  | "ADDRESS_PATH_MISSING"
  | "ADDRESS_SYMBOL_MISSING"
  | "SCHEMA_FIELD_DRIFT"
  | "MAP_STALE";

export type Finding = { readonly code: FindingCode; readonly message: string };

/** A parsed leaf plus the file it came from. The shape itself is contract-owned. */
export type LeafFile = { readonly file: string; readonly leaf: LaneLeaf };

/** A parent uses this marker to say a rule is held by code that is not a lane. */
export const MECHANISED_MARKER = "_Mechanised at:_";

/** `path` or `path:exportedSymbol`, anchored to the workspace roots. */
const CITATION_SOURCE =
  "(?<![\\w.])((?:apps|packages|docs|tools)/[A-Za-z0-9_./-]+\\.(?:ts|md|mmd))(?::([A-Za-z_$][\\w$]*))?";

export type CheckInput = {
  /** Runtime queue names from the code-owned registry (packages/contracts). */
  readonly queueNames: readonly string[];
  /**
   * Queues the API may enqueue into (`packages/contracts/src/jobs.ts:apiQueueNames`).
   * This is the reachable-from-HTTP fact, and it covers HTTP only.
   */
  readonly apiQueueNames: readonly string[];
  /**
   * Lanes whose handler-registry entry carries a handler
   * (`apps/worker/src/lane-handler-registration.ts:lanesWithRegisteredHandler`, which the
   * registry type is derived from). Membership proves registration, nothing more.
   */
  readonly lanesWithRegisteredHandler: ReadonlySet<string>;
  /** Leaves loaded and shape-validated from apps/worker/src/handlers/*.lane.md. */
  readonly leaves: readonly LeafFile[];
  /** The generated map file path, for stale-map reporting. */
  readonly mapFile: string;
  /** The current on-disk generated map content, or undefined if missing. */
  readonly existingMap: string | undefined;
  /** SCHEMA.md content, to check the documented field list matches. */
  readonly schemaSource: string;
};

export type CheckResult = {
  readonly findings: readonly Finding[];
  readonly map: string;
};

export type AddressCheck = {
  /** Paths that may cite addresses (leaves + lane parents, excluding the map). */
  readonly files: readonly string[];
  /** Reads a file to string; injected so the core stays free of fs. */
  readonly readFile: (path: string) => string;
  /** Answers whether a cited path exists on disk, as a file or a directory. */
  readonly pathExists: (path: string) => boolean;
  /**
   * Answers whether a path is a regular file. Separate from `pathExists`
   * because a proof that resolves to a directory passed the existence check
   * while the finding message said "is not a file on disk" - the name claimed
   * more than the source carried, which is the exact defect this layer exists
   * to catch, found here by a reviewer.
   */
  readonly pathIsFile: (path: string) => boolean;
};

function push(acc: Finding[], code: FindingCode, message: string): void {
  acc.push({ code, message });
}

/** The code-owned facts the map projects alongside each leaf's own claims. */
export type MapRegistries = {
  readonly lanesWithRegisteredHandler: ReadonlySet<string>;
  readonly apiQueueNames: readonly string[];
};

/**
 * Build the generated map from leaves. The map is a summary, not a graph:
 * artifact edges were free strings and produced a false data-flow model, so
 * they are dropped rather than re-derived.
 */
export function buildMap(leaves: readonly LeafFile[], mapFile: string, registries: MapRegistries): string {
  const byDomain = new Map<string, LaneLeaf[]>();
  for (const { leaf } of [...leaves].sort((left, right) => left.leaf.lane.localeCompare(right.leaf.lane))) {
    byDomain.set(leaf.domain, [...(byDomain.get(leaf.domain) ?? []), leaf]);
  }

  const lines: string[] = [
    "# Lane map (generated)",
    "",
    "Do not edit. Regenerate with `corepack pnpm exec tsx tools/check-lane-inventory.ts --write`.",
    'This file answers "what exists and in what state". It is a review starting',
    "point, not unquestionable truth: the reason and proof for each state live in",
    "that lane's leaf, under apps/worker/src/handlers/. Handler registered and",
    "HTTP reachable are read from the code; every other column is the leaf's own",
    "claim about itself.",
    ""
  ];

  for (const domain of [...byDomain.keys()].sort()) {
    const domainLeaves = byDomain.get(domain) ?? [];
    lines.push(
      `## ${domain}`,
      "",
      "| Lane | State | Handler registered | HTTP reachable | Missing | Proof |",
      "| --- | --- | --- | --- | --- | --- |"
    );
    for (const leaf of domainLeaves) {
      const missing = leaf.missing.length === 0 ? "-" : String(leaf.missing.length);
      const proof = leaf.proof === "" ? "-" : leaf.proof;
      // Both of these are read from the registries the checker already holds.
      // Without them a reader equates `built` with reachable from the API and
      // counts one lane too many: `gsc-sync` has a handler and is deliberately
      // not admitted. Projecting facts the checker owns adds no new place for
      // the documentation to drift.
      const registered = registries.lanesWithRegisteredHandler.has(leaf.lane) ? "yes" : "no";
      const reachable = registries.apiQueueNames.includes(leaf.lane) ? "yes" : "no";
      lines.push(`| \`${leaf.lane}\` | ${leaf.state} | ${registered} | ${reachable} | ${missing} | ${proof} |`);
    }
    lines.push("");
  }

  void mapFile;
  return lines.join("\n");
}

/**
 * The field names SCHEMA.md documents, read from its front-matter example.
 * Extracted so the documented list and the validated list can be compared in
 * both directions rather than one.
 */
export function documentedLeafFields(schemaSource: string): readonly string[] {
  const block = /```yaml\r?\n---\r?\n([\s\S]*?)\r?\n---\r?\n```/u.exec(schemaSource);
  if (!block) return [];

  const fields: string[] = [];
  for (const line of (block[1] ?? "").split(/\r?\n/u)) {
    const key = /^([a-z]+):/u.exec(line);
    if (key?.[1] !== undefined) fields.push(key[1]);
  }
  return fields;
}

/**
 * Run every check against the supplied world and return findings plus the
 * freshly generated map. No side effects.
 */
export function checkLaneInventory(input: CheckInput, address: AddressCheck): CheckResult {
  const findings: Finding[] = [];
  const { leaves } = input;

  // The registry and the leaves are a bijection.
  const byLane = new Map<string, LeafFile[]>();
  for (const entry of leaves) {
    byLane.set(entry.leaf.lane, [...(byLane.get(entry.leaf.lane) ?? []), entry]);
  }
  for (const lane of input.queueNames) {
    const matches = byLane.get(lane) ?? [];
    if (matches.length === 0) {
      push(findings, "LANE_LEAF_MISSING", `${lane}: declared in queueNames and has no lane leaf`);
    }
    if (matches.length > 1) {
      push(findings, "LANE_LEAF_DUPLICATE", `${lane}: ${matches.length} leaves claim this lane`);
    }
  }

  for (const { file, leaf } of leaves) {
    if (!input.queueNames.includes(leaf.lane)) {
      push(findings, "LEAF_LANE_UNKNOWN", `${file}: lane "${leaf.lane}" is not in queueNames`);
    }

    const hasRegisteredHandler = input.lanesWithRegisteredHandler.has(leaf.lane);
    const reachableFromHttp = input.apiQueueNames.includes(leaf.lane);
    const runnableState = leaf.state === "built" || leaf.state === "partial";

    // A `built` leaf names a proof file. File existence only: this establishes
    // that a regular file is on disk at that path, never that it proves the
    // lane behaves correctly.
    if (leaf.state === "built" && !address.pathIsFile(leaf.proof)) {
      push(findings, "LANE_PROOF_FILE_MISSING", `${file}: proof "${leaf.proof}" is not a file on disk`);
    }

    // A state that says the lane runs, against a lane the dispatch registry has
    // no handler for.
    if (runnableState && !hasRegisteredHandler) {
      push(
        findings,
        "LANE_HANDLER_MISSING",
        `${file}: state "${leaf.state}" against a lane with no handler in the dispatch registry`
      );
    }

    // A state that says the lane does not run, against a registered handler.
    if (!runnableState && hasRegisteredHandler) {
      push(
        findings,
        "LANE_HANDLER_UNEXPECTED",
        `${file}: state "${leaf.state}" against a lane with a handler in the dispatch registry`
      );
    }

    // Two facts that cannot both be intended: the leaf claims a state in which
    // the lane does not run, and the API may enqueue into it. The predicate says
    // nothing about whether a handler exists - a lane that is both registered
    // and claimed non-running is reported separately by LANE_HANDLER_UNEXPECTED,
    // and both findings are collected.
    if (!runnableState && reachableFromHttp) {
      push(
        findings,
        "LANE_HTTP_REACHABILITY_CONTRADICTION",
        `${file}: state "${leaf.state}" claims the lane does not run, and apiQueueNames admits it, so the API may enqueue into it`
      );
    }
  }

  // A mechanisation claim must carry an address. `_Mechanised at:_` used to be
  // satisfied by the phrase alone, which made it the same shape as the artifact
  // edges this layer already removed: a claim that stays green because nothing
  // binds it. A parent may state a rule with no mechanism at all - that is
  // honest - but it may not claim one without saying where.
  for (const file of address.files) {
    const source = address.readFile(file);
    for (const line of source.split(/\r?\n/u)) {
      // Only a line that opens with the marker is a claim. SCHEMA.md mentions
      // it mid-sentence to define it, and that is documentation, not a claim.
      if (!line.trimStart().startsWith(MECHANISED_MARKER)) {
        continue;
      }
      if (!new RegExp(CITATION_SOURCE, "u").test(line)) {
        push(
          findings,
          "MECHANISM_ADDRESS_MISSING",
          `${file}: "${MECHANISED_MARKER}" without an address. State the rule without the marker, or name the file and symbol that holds it.`
        );
      }
    }
  }

  // Every address a leaf or parent cites must still resolve. The address format
  // is `path + exported symbol` (or `path + named database mechanism`).
  // Validation is bounded and existence-only: it establishes that the path and
  // the cited symbol exist, never that the symbol means what the prose claims.
  for (const file of address.files) {
    const source = address.readFile(file);
    for (const cite of source.matchAll(new RegExp(CITATION_SOURCE, "gu"))) {
      const path = cite[1];
      const symbol = cite[2];
      if (path === undefined) continue;
      if (!address.pathExists(path)) {
        push(findings, "ADDRESS_PATH_MISSING", `${file}: cites "${cite[0]}" which does not exist`);
        continue;
      }
      if (symbol !== undefined) {
        const target = address.readFile(path);
        if (!hasExportedSymbol(target, symbol)) {
          push(
            findings,
            "ADDRESS_SYMBOL_MISSING",
            `${file}: cites "${cite[0]}" and "${symbol}" is not an exported symbol there`
          );
        }
      }
    }
  }

  // The documented field list and the validated field list must agree, in both
  // directions. The validated list is derived from the contract schema, so this
  // compares documentation against the one owner rather than against a copy.
  const documented = documentedLeafFields(input.schemaSource);
  for (const field of laneLeafFieldNames) {
    if (!documented.includes(field)) {
      push(findings, "SCHEMA_FIELD_DRIFT", `SCHEMA.md: field "${field}" is validated and not documented`);
    }
  }
  for (const field of documented) {
    if (!laneLeafFieldNames.includes(field)) {
      push(findings, "SCHEMA_FIELD_DRIFT", `SCHEMA.md: field "${field}" is documented and not validated`);
    }
  }

  const map = buildMap(leaves, input.mapFile, {
    lanesWithRegisteredHandler: input.lanesWithRegisteredHandler,
    apiQueueNames: input.apiQueueNames
  });
  // The generated map is never hand-written, so a drifted one is a finding.
  if (input.existingMap !== undefined && input.existingMap !== map) {
    push(findings, "MAP_STALE", `${input.mapFile}: out of date; regenerate with --write`);
  }

  return { findings, map };
}

/**
 * A bounded, existence-only check that `name` is exported from a TypeScript
 * or JavaScript source file. This is deliberately not a parser: it looks for
 * `export ... <name>` in a few common shapes. It establishes that the symbol
 * exists, never what it does.
 */
export function hasExportedSymbol(source: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const patterns = [
    new RegExp(
      `export\\s+(?:(?:default\\s+)|(?:async\\s+))?(?:const|let|var|function|class|type|interface|enum)\\s+${escaped}\\b`,
      "u"
    ),
    new RegExp(`export\\s+\\{[^}]*\\b${escaped}\\b[^}]*\\}`, "u"),
    new RegExp(`export\\s+\\*\\s+as\\s+${escaped}\\b`, "u")
  ];
  return patterns.some((pattern) => pattern.test(source));
}
