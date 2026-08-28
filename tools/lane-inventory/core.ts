// Pure functional core of the lane-inventory check. No filesystem access, no
// registry imports, no CLI side effects. The shell (tools/check-lane-inventory.ts)
// reads the world and hands it in here; this module decides and returns values.
//
// This is what the negative tests exercise directly. Kept pure so a test can
// feed a malformed leaf, a duplicated lane, a reachable scaffold, or a drifted
// map and observe the exact failure without touching disk.

export type Failure = { readonly check: string; readonly message: string };

export type Leaf = {
  readonly file: string;
  readonly lane: string;
  readonly domain: string;
  readonly state: string;
  readonly missing: readonly string[];
  readonly reason: string;
  readonly trigger: string;
  readonly proof: string;
};

export const LEAF_STATES = ["built", "partial", "scaffold", "absent-by-decision"] as const;

/** A parent uses this marker to say a rule is held by code that is not a lane. */
export const MECHANISED_MARKER = "_Mechanised at:_";

/** `path` or `path:exportedSymbol`, anchored to the workspace roots. */
const CITATION_SOURCE =
  "(?<![\\w.])((?:apps|packages|docs|tools)/[A-Za-z0-9_./-]+\\.(?:ts|md|mmd))(?::([A-Za-z_$][\\w$]*))?";

// The field names a leaf is allowed to carry. This list is the single source
// both the checker and SCHEMA.md are checked against (check 10), so the two
// cannot drift.
export const LEAF_FIELDS = ["lane", "domain", "state", "missing", "reason", "trigger", "proof"] as const;

export type CheckInput = {
  /** Runtime queue names from the code-owned registry (packages/contracts). */
  readonly queueNames: readonly string[];
  /** Queues the API may enqueue into (apps/api/src/queue-producer.ts:apiQueueNames). */
  readonly apiQueueNames: readonly string[];
  /** Leaves loaded from apps/worker/src/handlers/*.lane.md. */
  readonly leaves: readonly Leaf[];
  /** The generated map file path, for stale-map reporting. */
  readonly mapFile: string;
  /** The current on-disk generated map content, or undefined if missing. */
  readonly existingMap: string | undefined;
  /** SCHEMA.md content, to check the documented field list matches. */
  readonly schemaSource: string;
};

export type CheckResult = {
  readonly failures: readonly Failure[];
  readonly map: string;
};

export type AddressCheck = {
  /** Paths that may cite addresses (leaves + lane parents, excluding the map). */
  readonly files: readonly string[];
  /** Reads a file to string; injected so the core stays free of fs. */
  readonly readFile: (path: string) => string;
  /** Answers whether a cited path exists on disk. */
  readonly pathExists: (path: string) => boolean;
};

function push(acc: Failure[], check: string, message: string): void {
  acc.push({ check, message });
}

/**
 * Build the generated map from leaves. The map is a summary, not a graph:
 * artifact edges were free strings and produced a false data-flow model, so
 * they are dropped rather than re-derived.
 */
export function buildMap(leaves: readonly Leaf[], mapFile: string): string {
  const byDomain = new Map<string, Leaf[]>();
  for (const leaf of [...leaves].sort((left, right) => left.lane.localeCompare(right.lane))) {
    byDomain.set(leaf.domain, [...(byDomain.get(leaf.domain) ?? []), leaf]);
  }

  const lines: string[] = [
    "# Lane map (generated)",
    "",
    "Do not edit. Regenerate with `corepack pnpm exec tsx tools/check-lane-inventory.ts --write`.",
    'This file answers "what exists and in what state". It is a review starting',
    "point, not unquestionable truth: the reason and proof for each state live in",
    "the leaf next to the handler named in the first column.",
    ""
  ];

  for (const domain of [...byDomain.keys()].sort()) {
    const domainLeaves = byDomain.get(domain) ?? [];
    lines.push(`## ${domain}`, "", "| Lane | State | Missing | Proof |", "| --- | --- | --- | --- |");
    for (const leaf of domainLeaves) {
      const missing = leaf.missing.length === 0 ? "-" : String(leaf.missing.length);
      const proof = leaf.proof === "" ? "-" : leaf.proof;
      lines.push(`| \`${leaf.lane}\` | ${leaf.state} | ${missing} | ${proof} |`);
    }
    lines.push("");
  }

  void mapFile;
  return lines.join("\n");
}

/**
 * Run every check against the supplied world and return failures, open items,
 * and the freshly generated map. No side effects.
 */
export function checkLaneInventory(input: CheckInput, address: AddressCheck): CheckResult {
  const failures: Failure[] = [];
  const { leaves } = input;

  // 1. registry and leaves are a bijection
  const registryFailure = (message: string): void => push(failures, "1-registry", message);
  const byLane = new Map<string, Leaf[]>();
  for (const leaf of leaves) {
    byLane.set(leaf.lane, [...(byLane.get(leaf.lane) ?? []), leaf]);
  }
  for (const lane of input.queueNames) {
    const matches = byLane.get(lane) ?? [];
    if (matches.length === 0) registryFailure(`${lane}: declared in queueNames but has no lane leaf`);
    if (matches.length > 1) registryFailure(`${lane}: ${matches.length} leaves claim this lane`);
  }

  for (const leaf of leaves) {
    if (!input.queueNames.includes(leaf.lane)) {
      registryFailure(`${leaf.file}: lane "${leaf.lane}" is not in queueNames`);
    }
    if (!LEAF_STATES.includes(leaf.state as (typeof LEAF_STATES)[number])) {
      push(failures, "2-shape", `${leaf.file}: state "${leaf.state}" is not one of ${LEAF_STATES.join(", ")}`);
    }

    // 2. anything not built owes a reason and a trigger
    if (leaf.state !== "built" && (leaf.reason === "" || leaf.trigger === "")) {
      push(failures, "2-reason", `${leaf.file}: state "${leaf.state}" requires both reason and trigger`);
    }

    // 3. built owes a proof path that exists, and claims nothing missing
    if (leaf.state === "built") {
      if (leaf.proof === "") {
        push(failures, "3-proof", `${leaf.file}: state "built" requires a proof path`);
      } else if (!address.pathExists(leaf.proof)) {
        push(failures, "3-proof", `${leaf.file}: proof "${leaf.proof}" does not exist`);
      }
      if (leaf.missing.length > 0) {
        push(failures, "3-proof", `${leaf.file}: state "built" cannot list missing pieces`);
      }
    }

    // 6. a lane that cannot run must not be reachable from an HTTP request
    if ((leaf.state === "scaffold" || leaf.state === "absent-by-decision") && input.apiQueueNames.includes(leaf.lane)) {
      push(
        failures,
        "6-reachable",
        `${leaf.file}: lane is "${leaf.state}" but appears in apiQueueNames, so an HTTP request can enqueue work nothing can process`
      );
    }
  }

  // 7. a mechanisation claim must carry an address. `_Mechanised at:_` used to
  // be satisfied by the phrase alone, which made it the same shape as the
  // artifact edges this layer already removed: a claim that stays green because
  // nothing binds it. A parent may state a rule with no mechanism at all - that
  // is honest - but it may not claim one without saying where.
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
          failures,
          "7-unaddressed-mechanism",
          `${file}: "${MECHANISED_MARKER}" without an address. State the rule without the marker, or name the file and symbol that holds it.`
        );
      }
    }
  }

  // 12. every address a leaf or parent cites must still resolve. The address
  // format is `path + exported symbol` (or `path + named database mechanism`).
  // Validation is bounded and existence-only: it proves the path and the cited
  // symbol exist, never that the symbol means what the prose claims.
  for (const file of address.files) {
    const source = address.readFile(file);
    for (const cite of source.matchAll(new RegExp(CITATION_SOURCE, "gu"))) {
      const path = cite[1];
      const symbol = cite[2];
      if (path === undefined) continue;
      if (!address.pathExists(path)) {
        push(failures, "12-address", `${file}: cites "${cite[0]}" which does not exist`);
        continue;
      }
      if (symbol !== undefined) {
        const target = address.readFile(path);
        if (!hasExportedSymbol(target, symbol)) {
          push(failures, "12-address", `${file}: cites "${cite[0]}" but "${symbol}" is not an exported symbol there`);
        }
      }
    }
  }

  // 10. the documented field list and the validated field list must agree
  for (const field of LEAF_FIELDS) {
    if (!input.schemaSource.includes(`${field}:`)) {
      push(failures, "10-schema-drift", `SCHEMA.md: field "${field}" is validated but not documented`);
    }
  }

  const map = buildMap(leaves, input.mapFile);
  // 11. the generated map is never hand-written, so a drifted one is a failure
  if (input.existingMap !== undefined && input.existingMap !== map) {
    push(failures, "11-stale-map", `${input.mapFile}: out of date; regenerate with --write`);
  }

  return { failures, map };
}

/**
 * A bounded, existence-only check that `name` is exported from a TypeScript
 * or JavaScript source file. This is deliberately not a parser: it looks for
 * `export ... <name>` in a few common shapes. It proves the symbol exists,
 * never what it does.
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
