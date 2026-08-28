// Names this repository has retired, and what replaced them.
//
// One entry per confirmed rename or deletion. The checker reads this list and
// proves two narrow things about the current tree: the retired name is gone
// from the active sources, and a named replacement really is exported by the
// file that claims it. It proves nothing about the sentences around either
// name.
//
// Adding an entry is the last step of a rename, not the first: repair the
// mentions, then record the retirement so the tree cannot drift back.
//
// Write the old name here only in the `retired` field. The checker blanks that
// declaration form before it searches this file, so a mention anywhere else -
// a reason, a comment, an allowance - is reported like any other. That is
// deliberate: the exemption is structural, not a pass for the whole file.

import type { RetiredIdentifier } from "./core.js";

export const retiredIdentifiers: readonly RetiredIdentifier[] = [
  {
    retired: "apiQueueNames",
    reason:
      "The list admits the shared API producer and nothing wider. Under the old name it was read as proof that a lane could not be reached over HTTP, and gsc-sync disproved that: a module built its own queue behind an endpoint, so the lane was reachable and absent from the list. The rename reached the code, the tests, the generated map and the finding codes, and stopped at the prose.",
    replacement: { owner: "packages/contracts/src/jobs.ts", exportName: "sharedApiQueueNames" },
    // The check's own explanation of why it exists. A mechanism that cannot
    // name the incident it was built for teaches nobody, and the budget of one
    // means a second, careless use in either file is still reported.
    allowed: [
      {
        path: "tools/check-retired-identifiers.ts",
        maxOccurrences: 1,
        why: "The header names the rename this check was built for; without the literal the account is unverifiable."
      },
      {
        path: "tools/retired-identifiers/core.ts",
        maxOccurrences: 1,
        why: "The core states what the check cannot prove, using the incident's own names as the example."
      }
    ]
  },
  {
    retired: "ApiQueueName",
    reason: "The same ownership correction at the type level, retired together with its value.",
    replacement: { owner: "packages/contracts/src/jobs.ts", exportName: "SharedApiQueueName" }
  }
];
