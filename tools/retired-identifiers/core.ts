// Pure functional core of the retired-identifier check. No filesystem access,
// no compiler invocation, no CLI side effects. The shell
// (tools/check-retired-identifiers.ts) reads the world - files to scan, and the
// exported names of each replacement owner - and hands it in here; this module
// decides and returns values.
//
// What this check proves, and nothing wider:
//
// - a retired name does not occur in the active sources the shell handed in;
// - a named replacement is an exported declaration of the file that claims it;
// - every historical exception is named, budgeted, and still needed.
//
// What it does NOT prove, and must not be cited as proving: that the sentence
// around a name is true. `apiQueueNames` became `sharedApiQueueNames` and two
// lane leaves kept a conclusion that was wrong under either name. Renaming
// repairs the word; only a reader repairs the claim.
//
// It also deliberately does not require the replacement to stand where the
// retired name stood. Sometimes the honest repair is deleting the sentence, and
// a rule demanding the successor teaches authors to paste a name in to turn a
// check green.

/** Stable identifiers for what went wrong. Callers branch on the code. */
export type FindingCode =
  | "REGISTRY_EMPTY"
  | "RETIRED_IDENTIFIER_PRESENT"
  | "RETIRED_IDENTIFIER_OVER_ALLOWANCE"
  | "ALLOWANCE_REASON_MISSING"
  | "ALLOWANCE_UNUSED"
  | "REPLACEMENT_EXPORT_MISSING"
  | "REPLACEMENT_OWNER_UNREADABLE";

export type Finding = { readonly code: FindingCode; readonly message: string };

/**
 * One legitimate surviving mention, scoped to a path and a count.
 *
 * The count is the point. A blanket per-file exception lets a second, careless
 * use of the name arrive later under the cover of the first one's reason.
 */
export type Allowance = {
  readonly path: string;
  readonly maxOccurrences: number;
  readonly why: string;
};

/**
 * `replacement` is optional on purpose: not every retirement is a rename. An
 * export can be deleted outright, and an entry that must name a successor would
 * invite an invented one.
 */
export type RetiredIdentifier = {
  readonly retired: string;
  readonly reason: string;
  readonly replacement?: { readonly owner: string; readonly exportName: string };
  readonly allowed?: readonly Allowance[];
};

export type ScannedFile = { readonly path: string; readonly text: string };

export type CheckInput = {
  readonly entries: readonly RetiredIdentifier[];
  readonly files: readonly ScannedFile[];
  /**
   * The registry's own path. Its declarations are skipped by their declaration
   * form, not by exempting the file: a retired name used anywhere else in that
   * file - a reason string, a comment - is still a finding.
   */
  readonly registryPath: string;
  /**
   * Exported names per replacement owner, extracted statically by the shell.
   * A missing key means the file could not be read or parsed, which is a
   * finding rather than a silent pass. Values and types arrive here alike;
   * nothing was executed to produce them.
   */
  readonly exportsByOwner: ReadonlyMap<string, ReadonlySet<string>>;
};

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * A retired name is a whole identifier. `sharedApiQueueNames` contains
 * `ApiQueueNames`, so a substring search would report the replacement as its
 * own predecessor.
 */
function occurrencePattern(retired: string): RegExp {
  return new RegExp(`(?<![\\w$])${escapeForRegExp(retired)}(?![\\w$])`, "gu");
}

/** The registry's own declaration of a retired name, in its only written form. */
function declarationPattern(retired: string): RegExp {
  return new RegExp(`retired:\\s*"${escapeForRegExp(retired)}"`, "gu");
}

type Occurrence = { readonly path: string; readonly line: number };

function occurrencesIn(file: ScannedFile, retired: string, registryPath: string): Occurrence[] {
  // In the registry, blank out the declarations themselves before searching, so
  // what remains is every *other* use of the name in that file.
  const text =
    file.path === registryPath
      ? file.text.replace(declarationPattern(retired), (match) => " ".repeat(match.length))
      : file.text;

  const found: Occurrence[] = [];
  text.split(/\r?\n/u).forEach((line, index) => {
    const pattern = occurrencePattern(retired);
    if (pattern.test(line)) found.push({ path: file.path, line: index + 1 });
  });
  return found;
}

function checkAllowances(entry: RetiredIdentifier, found: readonly Occurrence[]): Finding[] {
  const findings: Finding[] = [];

  for (const allowance of entry.allowed ?? []) {
    const hits = found.filter((occurrence) => occurrence.path === allowance.path).length;

    if (allowance.why.trim() === "") {
      findings.push({
        code: "ALLOWANCE_REASON_MISSING",
        message: `${allowance.path}: allows \`${entry.retired}\` without saying why. An exception nobody can read is an exception nobody can review.`
      });
      continue;
    }

    if (hits === 0) {
      findings.push({
        code: "ALLOWANCE_UNUSED",
        message: `${allowance.path}: no longer mentions \`${entry.retired}\`, so its allowance is dead. Remove the allowance from the registry in the change that removed the mention.`
      });
      continue;
    }

    if (hits > allowance.maxOccurrences) {
      findings.push({
        code: "RETIRED_IDENTIFIER_OVER_ALLOWANCE",
        message: `${allowance.path}: mentions \`${entry.retired}\` ${hits} times, ${allowance.maxOccurrences} allowed (${allowance.why}). A later mention cannot inherit an earlier one's reason.`
      });
    }
  }

  return findings;
}

function checkReplacement(entry: RetiredIdentifier, exportsByOwner: CheckInput["exportsByOwner"]): Finding[] {
  const { replacement } = entry;
  if (!replacement) return [];

  const exported = exportsByOwner.get(replacement.owner);
  if (!exported) {
    return [
      {
        code: "REPLACEMENT_OWNER_UNREADABLE",
        message: `${replacement.owner}: named as the owner of \`${replacement.exportName}\`, but could not be read or parsed. A replacement nobody can locate is not a replacement.`
      }
    ];
  }

  if (!exported.has(replacement.exportName)) {
    return [
      {
        code: "REPLACEMENT_EXPORT_MISSING",
        message: `${replacement.owner}: does not export \`${replacement.exportName}\`, named as the replacement for \`${entry.retired}\`. Either the replacement moved, or the registry entry is stale.`
      }
    ];
  }

  return [];
}

export function checkRetiredIdentifiers(input: CheckInput): readonly Finding[] {
  // A registry read that yields nothing fails, it does not silently pass: an
  // empty list and a healthy tree are indistinguishable at the exit code.
  if (input.entries.length === 0) {
    return [
      {
        code: "REGISTRY_EMPTY",
        message:
          "tools/retired-identifiers/registry.ts: no entries. An empty registry passes every tree, which is indistinguishable from a check that is not running."
      }
    ];
  }

  const findings: Finding[] = [];

  for (const entry of input.entries) {
    const found = input.files.flatMap((file) => occurrencesIn(file, entry.retired, input.registryPath));
    const allowedPaths = new Set((entry.allowed ?? []).map((allowance) => allowance.path));

    findings.push(...checkAllowances(entry, found));

    for (const occurrence of found) {
      if (allowedPaths.has(occurrence.path)) continue;
      findings.push({
        code: "RETIRED_IDENTIFIER_PRESENT",
        message: `${occurrence.path}:${occurrence.line}: \`${entry.retired}\` is retired (${entry.reason}). Repair the claim - the replacement is not required to stand where this name stood, and deleting the sentence is often the honest fix.`
      });
    }

    findings.push(...checkReplacement(entry, input.exportsByOwner));
  }

  return findings;
}
