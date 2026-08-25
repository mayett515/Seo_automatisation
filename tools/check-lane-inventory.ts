import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

// The lane inventory is the answer to "what exists and in what state". It is
// derived from the registry the code already owns, so it cannot quietly drift
// away from the code the way a hand-written status page does. See
// docs/agents/lanes/SCHEMA.md for the field meanings.

type Failure = { readonly check: string; readonly message: string };

type Leaf = {
  readonly file: string;
  readonly lane: string;
  readonly domain: string;
  readonly state: string;
  readonly enforces: readonly string[];
  readonly missing: readonly string[];
  readonly consumes: readonly string[];
  readonly produces: readonly string[];
  readonly terminal: readonly string[];
  readonly external: readonly string[];
  readonly reason: string;
  readonly trigger: string;
  readonly proof: string;
};

const LANES_DIR = "docs/agents/lanes";
const HANDLERS_DIR = "apps/worker/src/handlers";
const MAP_FILE = `${LANES_DIR}/generated-map.md`;
const LEAF_STATES = ["built", "partial", "scaffold", "absent-by-decision"] as const;
const LEAF_FIELDS = [
  "lane",
  "domain",
  "state",
  "enforces",
  "missing",
  "consumes",
  "produces",
  "terminal",
  "external",
  "reason",
  "trigger",
  "proof"
] as const;

const failures: Failure[] = [];
const openItems: Failure[] = [];

function fail(check: string, message: string): void {
  failures.push({ check, message });
}

// An invariant nobody holds yet is an open item, not a regression: intake is
// unbuilt, so its rules have nowhere to live. Listing them keeps them visible;
// the ceiling keeps the list from growing quietly. Lowering it is progress,
// raising it needs a reason in the diff.
const acceptedOpenInvariants = 6;

function openItem(check: string, message: string): void {
  openItems.push({ check, message });
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/** A capture group that did not participate is not a registry entry, so drop it. */
function quotedStrings(source: string): string[] {
  return [...source.matchAll(/"([^"]+)"/gu)].flatMap((entry) => (entry[1] === undefined ? [] : [entry[1]]));
}

/** Front matter uses a small, fixed subset: scalars, quoted strings, and flat lists. */
function parseFrontMatter(source: string, file: string): Record<string, string> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(source);
  if (!match) {
    fail("2-shape", `${file}: no front matter block`);
    return {};
  }

  const entries: Record<string, string> = {};
  let key = "";
  for (const line of (match[1] ?? "").split(/\r?\n/u)) {
    const start = /^([a-z]+):\s*(.*)$/u.exec(line);
    if (start) {
      key = start[1] ?? "";
      entries[key] = start[2] ?? "";
      continue;
    }
    if (key) {
      entries[key] = `${entries[key] ?? ""} ${line.trim()}`.trim();
    }
  }
  return entries;
}

function parseList(raw: string): string[] {
  const inner = raw.replace(/^\[/u, "").replace(/\]$/u, "").trim();
  if (inner === "") {
    return [];
  }
  return inner
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/u)
    .map((item) => item.trim().replace(/^"/u, "").replace(/"$/u, ""))
    .filter((item) => item !== "");
}

function parseScalar(raw: string): string {
  return raw.trim().replace(/^"/u, "").replace(/"$/u, "");
}

function readRegistryList(path: string, exportName: string): string[] {
  const source = read(path);
  const pattern = new RegExp(`export const ${exportName}\\s*=\\s*\\[([\\s\\S]*?)\\]`, "u");
  const match = pattern.exec(source);
  if (!match) {
    fail("1-registry", `${path}: could not read ${exportName}`);
    return [];
  }
  return quotedStrings(match[1] ?? "");
}

function readApiQueueNames(path: string): string[] {
  const source = read(path);
  const match = /export type ApiQueueName = Extract<([\s\S]*?)>;/u.exec(source);
  if (!match) {
    fail("1-registry", `${path}: could not read ApiQueueName`);
    return [];
  }
  return quotedStrings(match[1] ?? "");
}

function readInvariants(path: string): string[] {
  return [...read(path).matchAll(/^###\s+([GD]\d+)\b/gmu)].flatMap((entry) =>
    entry[1] === undefined ? [] : [entry[1]]
  );
}

/**
 * An invariant may be held by code that is not a lane: a controller boundary, a
 * contract, a pure function. The parent then carries the address, and the rule
 * counts as enforced. Without this the check would push rules into lanes that
 * have no business holding them.
 */
function readOutsideEnforced(path: string): Set<string> {
  const held = new Set<string>();
  for (const section of read(path).split(/^### /mu).slice(1)) {
    const id = /^([GD]\d+)\b/u.exec(section)?.[1];
    if (id && section.includes("_Enforced outside the lanes:_")) {
      held.add(id);
    }
  }
  return held;
}

function loadLeaves(): Leaf[] {
  return readdirSync(HANDLERS_DIR)
    .filter((name) => name.endsWith(".lane.md"))
    .map((name) => {
      const file = `${HANDLERS_DIR}/${name}`;
      const fields = parseFrontMatter(read(file), file);

      for (const field of LEAF_FIELDS) {
        if (!(field in fields)) {
          fail("2-shape", `${file}: missing field "${field}"`);
        }
      }
      for (const field of Object.keys(fields)) {
        if (!LEAF_FIELDS.includes(field as (typeof LEAF_FIELDS)[number])) {
          fail("10-schema-drift", `${file}: field "${field}" is not documented in SCHEMA.md`);
        }
      }

      return {
        file,
        lane: parseScalar(fields.lane ?? ""),
        domain: parseScalar(fields.domain ?? ""),
        state: parseScalar(fields.state ?? ""),
        enforces: parseList(fields.enforces ?? "[]"),
        missing: parseList(fields.missing ?? "[]"),
        consumes: parseList(fields.consumes ?? "[]"),
        produces: parseList(fields.produces ?? "[]"),
        terminal: parseList(fields.terminal ?? "[]"),
        external: parseList(fields.external ?? "[]"),
        reason: parseScalar(fields.reason ?? ""),
        trigger: parseScalar(fields.trigger ?? ""),
        proof: parseScalar(fields.proof ?? "")
      };
    });
}

function buildMap(leaves: readonly Leaf[]): string {
  const byDomain = new Map<string, Leaf[]>();
  for (const leaf of [...leaves].sort((left, right) => left.lane.localeCompare(right.lane))) {
    byDomain.set(leaf.domain, [...(byDomain.get(leaf.domain) ?? []), leaf]);
  }

  const lines: string[] = [
    "# Lane map (generated)",
    "",
    "Do not edit. Regenerate with `corepack pnpm exec tsx tools/check-lane-inventory.ts --write`.",
    'This file answers "what exists and in what state"; the reason for each state lives in the leaf.',
    ""
  ];

  for (const domain of [...byDomain.keys()].sort()) {
    const domainLeaves = byDomain.get(domain) ?? [];
    lines.push(
      `## ${domain}`,
      "",
      "| Lane | State | Consumes | Produces | Missing |",
      "| --- | --- | --- | --- | --- |"
    );
    for (const leaf of domainLeaves) {
      const missing = leaf.missing.length === 0 ? "-" : String(leaf.missing.length);
      lines.push(
        `| \`${leaf.lane}\` | ${leaf.state} | ${leaf.consumes.join(", ") || "-"} | ${leaf.produces.join(", ") || "-"} | ${missing} |`
      );
    }
    lines.push("");
  }

  lines.push("## Flow", "", "```mermaid", "flowchart LR");
  for (const leaf of [...leaves].sort((left, right) => left.lane.localeCompare(right.lane))) {
    for (const artifact of leaf.consumes) {
      lines.push(`  ${artifact.replace(/-/gu, "_")} --> ${leaf.lane.replace(/-/gu, "_")}`);
    }
    for (const artifact of leaf.produces) {
      lines.push(`  ${leaf.lane.replace(/-/gu, "_")} --> ${artifact.replace(/-/gu, "_")}`);
    }
  }
  lines.push("```", "");
  return lines.join("\n");
}

const queueNames = readRegistryList("packages/contracts/src/jobs.ts", "queueNames");
const apiQueueNames = readApiQueueNames("apps/api/src/queue-producer.ts");
const leaves = loadLeaves();

// 1. registry and leaves are a bijection
for (const lane of queueNames) {
  const matches = leaves.filter((leaf) => leaf.lane === lane);
  if (matches.length === 0) {
    fail("1-registry", `${lane}: declared in queueNames but has no lane leaf`);
  }
  if (matches.length > 1) {
    fail("1-registry", `${lane}: ${matches.length} leaves claim this lane`);
  }
}
for (const leaf of leaves) {
  if (!queueNames.includes(leaf.lane)) {
    fail("1-registry", `${leaf.file}: lane "${leaf.lane}" is not in queueNames`);
  }
  if (!LEAF_STATES.includes(leaf.state as (typeof LEAF_STATES)[number])) {
    fail("2-shape", `${leaf.file}: state "${leaf.state}" is not one of ${LEAF_STATES.join(", ")}`);
  }
}

for (const leaf of leaves) {
  // 2. anything not built owes a reason and a trigger
  if (leaf.state !== "built" && (leaf.reason === "" || leaf.trigger === "")) {
    fail("2-reason", `${leaf.file}: state "${leaf.state}" requires both reason and trigger`);
  }

  // 3. built owes a proof that exists, and claims nothing missing
  if (leaf.state === "built") {
    if (leaf.proof === "") {
      fail("3-proof", `${leaf.file}: state "built" requires a proof path`);
    } else if (!existsSync(leaf.proof)) {
      fail("3-proof", `${leaf.file}: proof "${leaf.proof}" does not exist`);
    }
    if (leaf.missing.length > 0) {
      fail("3-proof", `${leaf.file}: state "built" cannot list missing pieces`);
    }
  }

  // 6. a lane that cannot run must not be reachable from an HTTP request
  if ((leaf.state === "scaffold" || leaf.state === "absent-by-decision") && apiQueueNames.includes(leaf.lane)) {
    fail(
      "6-reachable",
      `${leaf.file}: lane is "${leaf.state}" but appears in ApiQueueName, so an HTTP request can enqueue work nothing can process`
    );
  }

  // 9. the domain parent must exist
  if (!existsSync(`${LANES_DIR}/${leaf.domain}.md`)) {
    fail("9-domain", `${leaf.file}: domain "${leaf.domain}" has no parent at ${LANES_DIR}/${leaf.domain}.md`);
  }
}

// 4 and 5. the edges must close
const produced = new Set(leaves.flatMap((leaf) => leaf.produces));
const consumed = new Set(leaves.flatMap((leaf) => leaf.consumes));
for (const leaf of leaves) {
  for (const artifact of leaf.consumes) {
    if (!produced.has(artifact) && !leaf.external.includes(artifact)) {
      fail(
        "4-dangling",
        `${leaf.file}: consumes "${artifact}" which no lane produces and which is not declared external`
      );
    }
  }
  for (const artifact of leaf.produces) {
    if (!consumed.has(artifact) && !leaf.terminal.includes(artifact)) {
      fail(
        "5-dead-end",
        `${leaf.file}: produces "${artifact}" which no lane consumes and which is not declared terminal`
      );
    }
  }
}

// 12. every address a leaf or parent cites must still resolve. An address is
// the whole point of this layer: it is what separates a rule from a wish. A
// path that moved, or a line number that drifted, turns the address back into
// prose without anything failing.
const citing = [
  ...readdirSync(HANDLERS_DIR)
    .filter((name) => name.endsWith(".lane.md"))
    .map((name) => `${HANDLERS_DIR}/${name}`),
  ...readdirSync(LANES_DIR)
    .filter((name) => name.endsWith(".md") && name !== "generated-map.md")
    .map((name) => `${LANES_DIR}/${name}`)
];
for (const file of citing) {
  const source = read(file);
  for (const cite of source.matchAll(
    /\b((?:apps|packages|docs|tools)\/[A-Za-z0-9_./-]+\.(?:ts|md|mmd))(?::(\d+))?/gu
  )) {
    const path = cite[1];
    if (path === undefined || !existsSync(path)) {
      fail("12-address", `${file}: cites "${cite[0]}" which does not exist`);
      continue;
    }
    const line = cite[2] === undefined ? undefined : Number(cite[2]);
    if (line !== undefined && read(path).split(/\r?\n/u).length < line) {
      fail("12-address", `${file}: cites "${cite[0]}" but that file has fewer lines`);
    }
  }
}

// 7 and 8. invariants and their enforcement must match in both directions
const globalInvariants = readInvariants(`${LANES_DIR}/ROOT.md`);
const globalOutside = readOutsideEnforced(`${LANES_DIR}/ROOT.md`);
const domainInvariants = new Map<string, string[]>();
const domainOutside = new Map<string, Set<string>>();
for (const entry of readdirSync(LANES_DIR)) {
  if (!entry.endsWith(".md") || entry === "ROOT.md" || entry === "SCHEMA.md" || entry === "generated-map.md") {
    continue;
  }
  const domain = entry.replace(/\.md$/u, "");
  domainInvariants.set(domain, readInvariants(`${LANES_DIR}/${entry}`));
  domainOutside.set(domain, readOutsideEnforced(`${LANES_DIR}/${entry}`));
}

const enforcedIds = new Set<string>();
for (const leaf of leaves) {
  for (const id of leaf.enforces) {
    const qualified = id.includes(".");
    const domain = qualified ? id.slice(0, id.indexOf(".")) : leaf.domain;
    const local = qualified ? id.slice(id.indexOf(".") + 1) : id;

    const known = local.startsWith("G")
      ? globalInvariants.includes(local)
      : (domainInvariants.get(domain) ?? []).includes(local);
    if (!known) {
      fail("7-unknown-invariant", `${leaf.file}: enforces "${id}" which no parent defines`);
      continue;
    }
    enforcedIds.add(local.startsWith("G") ? local : `${domain}.${local}`);
  }
}

for (const id of globalInvariants) {
  if (!enforcedIds.has(id) && !globalOutside.has(id)) {
    fail("8-unenforced", `ROOT.md: ${id} is enforced by no lane, so it is an intention rather than a rule`);
  }
}
for (const [domain, ids] of domainInvariants) {
  for (const id of ids) {
    if (!enforcedIds.has(`${domain}.${id}`) && !(domainOutside.get(domain) ?? new Set()).has(id)) {
      openItem(
        "8-unenforced",
        `${domain}.md: ${id} is enforced by no lane and names no address outside them, so it is an intention rather than a rule`
      );
    }
  }
}

// 10. the documented field list and the validated field list must agree
const schema = read(`${LANES_DIR}/SCHEMA.md`);
for (const field of LEAF_FIELDS) {
  if (!schema.includes(`${field}:`)) {
    fail("10-schema-drift", `SCHEMA.md: field "${field}" is validated but not documented`);
  }
}

// The map is generated, never hand-written, so a stale one is a failure.
const map = buildMap(leaves);
if (process.argv.includes("--write")) {
  writeFileSync(MAP_FILE, map, "utf8");
  console.log(`Lane map written to ${MAP_FILE}.`);
} else if (!existsSync(MAP_FILE) || read(MAP_FILE) !== map) {
  fail("11-stale-map", `${MAP_FILE}: out of date; regenerate with --write`);
}

if (openItems.length > acceptedOpenInvariants) {
  fail(
    "8-unenforced",
    `${openItems.length} invariants are held by nobody, above the accepted ${acceptedOpenInvariants}. Hold a rule or drop it; do not raise the ceiling without saying why.`
  );
}

for (const item of openItems) {
  console.warn(`- open [${item.check}] ${item.message}`);
}

if (failures.length > 0) {
  console.error(`Lane inventory check failed with ${failures.length} problem(s):`);
  for (const failure of failures) {
    console.error(`- [${failure.check}] ${failure.message}`);
  }
  process.exit(1);
}

console.log(
  `Lane inventory check passed for ${leaves.length} lanes, with ${openItems.length} invariant(s) held by nobody.`
);
