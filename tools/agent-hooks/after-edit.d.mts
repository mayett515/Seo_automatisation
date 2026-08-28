// The shared hook body stays plain `.mjs` because the host hooks are invoked as
// `node .../post-edit-checks.mjs`, with no loader available to compile
// TypeScript. This declaration exists so its decisions can still be tested.

/** Walk up from a directory to the repository root, or undefined if outside it. */
export function findRepoRoot(startDir: string): string | undefined;

/** The labels of the check groups the given edited paths select. */
export function checkGroupsFor(paths: readonly (string | undefined)[]): string[];

/** Read a hook payload from stdin; undefined for anything unparseable. */
export function readPayload(): Promise<unknown>;

/** Run the selected checks and exit 0, or 2 with findings on stderr. */
export function reportAndExit(paths: readonly (string | undefined)[]): never;
