import type { QueueName } from "@localseo/contracts";

// The lanes whose registry entry carries a handler. This list exists as a
// runtime value so the lane-inventory checker can import the fact instead of
// parsing source; the handler registry derives its type from it, so the list
// and the actual dispatch table cannot drift - a mismatch is a compile error,
// not a review finding.
//
// Membership proves only that a handler is registered for the lane. It does
// not prove the handler executes successfully, and it says nothing about why
// the remaining lanes have none - that lives in each lane leaf.
export const executableLaneNames = [
  "website-import",
  "opportunity-scout",
  "opportunity-research",
  "serp-scout",
  "technical-audit",
  "page-generation",
  "media-processing",
  "deploy",
  "rollback",
  "release-verification",
  "gsc-sync",
  "report"
] as const satisfies readonly QueueName[];

export type ExecutableLane = (typeof executableLaneNames)[number];
export type UnhandledLane = Exclude<QueueName, ExecutableLane>;

export function isExecutableLane(lane: QueueName): lane is ExecutableLane {
  return (executableLaneNames as readonly QueueName[]).includes(lane);
}
