import type { QueueName } from "@localseo/contracts";

// The lanes the dispatch registry holds a handler for. This list exists as a
// runtime value so the lane-inventory checker can import the fact instead of
// parsing source; the handler registry derives its type from it, so the list
// and the actual dispatch table cannot drift - a mismatch is a compile error,
// not a review finding.
//
// Membership proves exactly one thing: a handler is registered for the lane.
// It does not prove the handler runs, that its dependencies are configured, or
// that a job would succeed. The remaining lanes have no registered handler;
// why they have none is recorded in each lane leaf, never here.
export const lanesWithRegisteredHandler = [
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

export type LaneWithRegisteredHandler = (typeof lanesWithRegisteredHandler)[number];
export type LaneWithoutRegisteredHandler = Exclude<QueueName, LaneWithRegisteredHandler>;

export function hasRegisteredHandler(lane: QueueName): lane is LaneWithRegisteredHandler {
  return (lanesWithRegisteredHandler as readonly QueueName[]).includes(lane);
}
