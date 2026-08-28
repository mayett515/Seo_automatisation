import { z } from "zod";

// The shape of a lane leaf (`apps/worker/src/handlers/*.lane.md` front matter).
// It lives here because the leaf is a contract between the worker's handlers,
// the lane documentation, and the checker that reads both; the checker parses
// untrusted markdown and must not carry its own idea of the shape.
//
// Every variant is strict: an undocumented field is a drift signal, not a
// harmless extra, so it is rejected rather than silently stripped.

const laneIdentity = {
  lane: z.string().min(1),
  domain: z.string().min(1)
};

/** Nothing is missing, and a proof file is named. */
const BuiltLaneLeafSchema = z.strictObject({
  ...laneIdentity,
  state: z.literal("built"),
  missing: z.array(z.string()).length(0),
  reason: z.literal(""),
  trigger: z.literal(""),
  proof: z.string().min(1)
});

/** Runs, with at least one named gap; the proof field is optional evidence. */
const PartialLaneLeafSchema = z.strictObject({
  ...laneIdentity,
  state: z.literal("partial"),
  missing: z.array(z.string().min(1)).min(1),
  reason: z.string().min(1),
  trigger: z.string().min(1),
  proof: z.string()
});

/** Declared but not executable, so there is nothing a proof could point at. */
const ScaffoldLaneLeafSchema = z.strictObject({
  ...laneIdentity,
  state: z.literal("scaffold"),
  missing: z.array(z.string().min(1)),
  reason: z.string().min(1),
  trigger: z.string().min(1),
  proof: z.literal("")
});

/** Not built on purpose, with the decision and its revisit trigger recorded. */
const AbsentByDecisionLaneLeafSchema = z.strictObject({
  ...laneIdentity,
  state: z.literal("absent-by-decision"),
  missing: z.array(z.string().min(1)),
  reason: z.string().min(1),
  trigger: z.string().min(1),
  proof: z.literal("")
});

export const LaneLeafSchema = z.discriminatedUnion("state", [
  BuiltLaneLeafSchema,
  PartialLaneLeafSchema,
  ScaffoldLaneLeafSchema,
  AbsentByDecisionLaneLeafSchema
]);

export type LaneLeaf = z.output<typeof LaneLeafSchema>;

/**
 * The field names a leaf may carry, derived from the schema rather than
 * retyped. Every variant shares one field set, so one variant answers for all.
 * SCHEMA.md is checked against this list in both directions.
 */
/**
 * The field names a leaf may carry, read from the schema rather than retyped.
 * Every variant carries the same set by construction; `laneLeafVariantFields`
 * makes tsc reject a variant that drifts from that, so this list speaks for all
 * four without asserting it.
 */
export const laneLeafFieldNames: readonly string[] = Object.keys(BuiltLaneLeafSchema.shape);

// A variant whose field names differ from the built variant's stops compiling
// here, which is what lets `laneLeafFieldNames` be read from one of them.
type SameFieldNames<Left, Right> = [keyof Left] extends [keyof Right]
  ? [keyof Right] extends [keyof Left]
    ? true
    : never
  : never;

const laneLeafVariantsShareFieldNames: [
  SameFieldNames<typeof BuiltLaneLeafSchema.shape, typeof PartialLaneLeafSchema.shape>,
  SameFieldNames<typeof BuiltLaneLeafSchema.shape, typeof ScaffoldLaneLeafSchema.shape>,
  SameFieldNames<typeof BuiltLaneLeafSchema.shape, typeof AbsentByDecisionLaneLeafSchema.shape>
] = [true, true, true];
void laneLeafVariantsShareFieldNames;
