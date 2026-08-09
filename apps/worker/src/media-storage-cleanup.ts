import {
  mediaDerivativeStoragePrefix,
  mediaQuarantineStorageKey,
  type MediaAssetCleanupStoragePort
} from "@localseo/adapters";
import { mediaAssets, pageVersionMediaAssets } from "@localseo/db";
import { decideMediaStorageCleanup, failedMediaDiagnosticRetentionMs } from "@localseo/domain";
import { and, asc, eq, inArray, isNotNull, isNull, lte, ne, or, sql } from "@localseo/db/query";
import type { WorkerDb } from "./job-run.js";

const maxFailedDerivativeObjects = 16;

type MediaStorageCleanupCandidate = {
  id: string;
  projectId: string;
  status: "ready" | "failed" | "archived";
  failureCode: string | null;
  sourceStorageKey: string;
  processedAt: Date | null;
  updatedAt: Date;
  cleanupAttemptCount: number;
  cleanupClaimedAt: Date | null;
  cleanupCompletedAt: Date | null;
};

type MediaStorageCleanupClaim = MediaStorageCleanupCandidate & {
  scope: "source_only" | "failed_asset_objects";
  cleanupAttemptCount: number;
  claimedAt: Date;
};

export type MediaStorageCleanupResult = {
  checked: number;
  claimed: number;
  cleaned: number;
  deleteRequests: number;
  retryableFailures: number;
  exhausted: number;
  noops: number;
  staleNoop: number;
  errors: number;
};

export async function scanMediaStorageCleanup(input: {
  db: WorkerDb;
  storage: MediaAssetCleanupStoragePort;
  now?: Date;
  claimStaleAfterMs: number;
  maxAttempts: number;
  batchSize: number;
}): Promise<MediaStorageCleanupResult> {
  const result = emptyMediaStorageCleanupResult();
  const now = input.now ?? new Date();
  const claimStaleBefore = new Date(now.getTime() - input.claimStaleAfterMs);
  const failedBefore = new Date(now.getTime() - failedMediaDiagnosticRetentionMs);
  let candidates: MediaStorageCleanupCandidate[];

  try {
    candidates = await loadCleanupCandidates({
      db: input.db,
      claimStaleBefore,
      readyBefore: now,
      failedBefore,
      batchSize: input.batchSize
    });
  } catch (error) {
    result.errors += 1;
    console.error("Media storage cleanup failed to load candidates", normalizeCleanupError(error).message);
    return result;
  }

  for (const candidate of candidates) {
    result.checked += 1;
    const decision = decideMediaStorageCleanup({
      status: candidate.status,
      failureCode: candidate.failureCode,
      processedAt: candidate.processedAt,
      updatedAt: candidate.updatedAt,
      cleanupCompletedAt: candidate.cleanupCompletedAt,
      cleanupClaimedAt: candidate.cleanupClaimedAt,
      cleanupAttemptCount: candidate.cleanupAttemptCount,
      maxAttempts: input.maxAttempts,
      claimStaleBefore,
      readyBefore: now,
      failedBefore
    });

    if (decision.kind !== "cleanup") {
      if (decision.kind === "exhausted") {
        try {
          const marked = await markCleanupExhausted({
            db: input.db,
            candidate,
            now,
            claimStaleBefore,
            readyBefore: now,
            failedBefore,
            maxAttempts: input.maxAttempts
          });
          if (marked) {
            result.exhausted += 1;
          } else {
            result.staleNoop += 1;
          }
        } catch (error) {
          result.errors += 1;
          console.error(
            `Media storage cleanup exhaustion could not be persisted for ${candidate.id}`,
            normalizeCleanupError(error).message
          );
        }
      } else if (decision.kind === "invalid") {
        result.errors += 1;
        console.error(`Media storage cleanup found invalid durable state for ${candidate.id}`, decision.reason);
      } else {
        result.noops += 1;
      }
      continue;
    }

    let claim: MediaStorageCleanupClaim | undefined;
    try {
      claim = await claimCleanupCandidate({
        db: input.db,
        candidate,
        scope: decision.scope,
        now,
        claimStaleBefore,
        readyBefore: now,
        failedBefore
      });
    } catch (error) {
      result.errors += 1;
      console.error(`Media storage cleanup claim failed for ${candidate.id}`, normalizeCleanupError(error).message);
      continue;
    }

    if (!claim) {
      result.staleNoop += 1;
      continue;
    }
    result.claimed += 1;

    try {
      const deleteRequests = await deleteClaimedStorage(input.storage, claim);
      const completed = await markCleanupCompleted(input.db, claim, now);
      if (!completed) {
        result.staleNoop += 1;
        continue;
      }
      result.cleaned += 1;
      result.deleteRequests += deleteRequests;
    } catch (error) {
      try {
        const cleanupError = normalizeCleanupError(error);
        const exhausted = claim.cleanupAttemptCount >= input.maxAttempts;
        const marked = await markCleanupFailed(input.db, claim, now, cleanupError, exhausted);
        if (!marked) {
          result.staleNoop += 1;
        } else if (exhausted) {
          result.exhausted += 1;
        } else {
          result.retryableFailures += 1;
        }
      } catch (markError) {
        result.errors += 1;
        console.error(`Media storage cleanup failure could not be persisted for ${candidate.id}`, {
          cleanupError: normalizeCleanupError(error).message,
          persistenceError: normalizeCleanupError(markError).message
        });
      }
    }
  }

  return result;
}

export function emptyMediaStorageCleanupResult(): MediaStorageCleanupResult {
  return {
    checked: 0,
    claimed: 0,
    cleaned: 0,
    deleteRequests: 0,
    retryableFailures: 0,
    exhausted: 0,
    noops: 0,
    staleNoop: 0,
    errors: 0
  };
}

async function loadCleanupCandidates(input: {
  db: WorkerDb;
  claimStaleBefore: Date;
  readyBefore: Date;
  failedBefore: Date;
  batchSize: number;
}): Promise<MediaStorageCleanupCandidate[]> {
  const rows = await input.db
    .select({
      id: mediaAssets.id,
      projectId: mediaAssets.projectId,
      status: mediaAssets.status,
      failureCode: mediaAssets.failureCode,
      sourceStorageKey: mediaAssets.sourceStorageKey,
      processedAt: mediaAssets.processedAt,
      updatedAt: mediaAssets.updatedAt,
      cleanupAttemptCount: mediaAssets.storageCleanupAttemptCount,
      cleanupClaimedAt: mediaAssets.storageCleanupClaimedAt,
      cleanupCompletedAt: mediaAssets.storageCleanupCompletedAt
    })
    .from(mediaAssets)
    .where(
      and(
        isNull(mediaAssets.storageCleanupCompletedAt),
        or(
          isNull(mediaAssets.storageCleanupFailureCode),
          ne(mediaAssets.storageCleanupFailureCode, "storage_cleanup_exhausted")
        ),
        or(
          isNull(mediaAssets.storageCleanupClaimedAt),
          lte(mediaAssets.storageCleanupClaimedAt, input.claimStaleBefore)
        ),
        or(
          and(
            inArray(mediaAssets.status, ["ready", "archived"]),
            isNotNull(mediaAssets.processedAt),
            lte(mediaAssets.processedAt, input.readyBefore)
          ),
          and(
            eq(mediaAssets.status, "failed"),
            or(eq(mediaAssets.failureCode, "upload_expired"), lte(mediaAssets.updatedAt, input.failedBefore)),
            noPageVersionReferences()
          )
        )
      )
    )
    .orderBy(asc(mediaAssets.updatedAt), asc(mediaAssets.id))
    .limit(input.batchSize);

  return rows.flatMap((row) => {
    if (!isCleanupTerminalStatus(row.status)) {
      return [];
    }
    return [{ ...row, status: row.status }];
  });
}

async function markCleanupExhausted(input: {
  db: WorkerDb;
  candidate: MediaStorageCleanupCandidate;
  now: Date;
  claimStaleBefore: Date;
  readyBefore: Date;
  failedBefore: Date;
  maxAttempts: number;
}): Promise<boolean> {
  const eligibility =
    input.candidate.status === "failed"
      ? and(
          eq(mediaAssets.status, "failed"),
          or(eq(mediaAssets.failureCode, "upload_expired"), lte(mediaAssets.updatedAt, input.failedBefore)),
          noPageVersionReferences()
        )
      : and(
          eq(mediaAssets.status, input.candidate.status),
          isNotNull(mediaAssets.processedAt),
          lte(mediaAssets.processedAt, input.readyBefore)
        );
  const [updated] = await input.db
    .update(mediaAssets)
    .set({
      storageCleanupClaimedAt: null,
      lastStorageCleanupAt: input.now,
      storageCleanupFailureCode: "storage_cleanup_exhausted",
      storageCleanupFailureMessage: `Media storage cleanup did not complete after ${input.maxAttempts} bounded attempts.`
    })
    .where(
      and(
        eq(mediaAssets.id, input.candidate.id),
        eq(mediaAssets.projectId, input.candidate.projectId),
        eq(mediaAssets.storageCleanupAttemptCount, input.candidate.cleanupAttemptCount),
        isNull(mediaAssets.storageCleanupCompletedAt),
        or(
          isNull(mediaAssets.storageCleanupFailureCode),
          ne(mediaAssets.storageCleanupFailureCode, "storage_cleanup_exhausted")
        ),
        or(
          isNull(mediaAssets.storageCleanupClaimedAt),
          lte(mediaAssets.storageCleanupClaimedAt, input.claimStaleBefore)
        ),
        eligibility
      )
    )
    .returning({ id: mediaAssets.id });
  return Boolean(updated);
}

async function claimCleanupCandidate(input: {
  db: WorkerDb;
  candidate: MediaStorageCleanupCandidate;
  scope: MediaStorageCleanupClaim["scope"];
  now: Date;
  claimStaleBefore: Date;
  readyBefore: Date;
  failedBefore: Date;
}): Promise<MediaStorageCleanupClaim | undefined> {
  const eligibility =
    input.scope === "source_only"
      ? and(
          inArray(mediaAssets.status, ["ready", "archived"]),
          isNotNull(mediaAssets.processedAt),
          lte(mediaAssets.processedAt, input.readyBefore)
        )
      : and(
          eq(mediaAssets.status, "failed"),
          or(eq(mediaAssets.failureCode, "upload_expired"), lte(mediaAssets.updatedAt, input.failedBefore)),
          noPageVersionReferences()
        );
  const [claimed] = await input.db
    .update(mediaAssets)
    .set({
      storageCleanupAttemptCount: sql<number>`${mediaAssets.storageCleanupAttemptCount} + 1`,
      lastStorageCleanupAt: input.now,
      storageCleanupClaimedAt: input.now
    })
    .where(
      and(
        eq(mediaAssets.id, input.candidate.id),
        eq(mediaAssets.projectId, input.candidate.projectId),
        eq(mediaAssets.storageCleanupAttemptCount, input.candidate.cleanupAttemptCount),
        isNull(mediaAssets.storageCleanupCompletedAt),
        or(
          isNull(mediaAssets.storageCleanupClaimedAt),
          lte(mediaAssets.storageCleanupClaimedAt, input.claimStaleBefore)
        ),
        eligibility
      )
    )
    .returning({
      id: mediaAssets.id,
      projectId: mediaAssets.projectId,
      status: mediaAssets.status,
      failureCode: mediaAssets.failureCode,
      sourceStorageKey: mediaAssets.sourceStorageKey,
      processedAt: mediaAssets.processedAt,
      updatedAt: mediaAssets.updatedAt,
      cleanupAttemptCount: mediaAssets.storageCleanupAttemptCount,
      cleanupClaimedAt: mediaAssets.storageCleanupClaimedAt,
      cleanupCompletedAt: mediaAssets.storageCleanupCompletedAt
    });

  if (!claimed?.cleanupClaimedAt || !isCleanupTerminalStatus(claimed.status)) {
    return undefined;
  }
  const status = claimed.status;

  return {
    ...claimed,
    status,
    scope: input.scope,
    claimedAt: claimed.cleanupClaimedAt
  };
}

async function deleteClaimedStorage(
  storage: MediaAssetCleanupStoragePort,
  claim: MediaStorageCleanupClaim
): Promise<number> {
  const expectedSourceKey = mediaQuarantineStorageKey(claim.projectId, claim.id);
  if (claim.sourceStorageKey !== expectedSourceKey) {
    throw new MediaStorageCleanupInvariantError(
      "Media cleanup refused a source key outside the asset quarantine boundary.",
      "source_key_mismatch"
    );
  }

  const keys = new Set<string>([expectedSourceKey]);
  if (claim.scope === "failed_asset_objects") {
    const prefix = mediaDerivativeStoragePrefix(claim.projectId, claim.id);
    const listing = await storage.listPrivateObjectKeys({ prefix, maxKeys: maxFailedDerivativeObjects });
    if (listing.truncated) {
      throw new MediaStorageCleanupInvariantError(
        "Failed media cleanup found more derivative objects than the bounded processor can create.",
        "derivative_listing_overflow"
      );
    }
    for (const key of listing.keys) {
      if (!key.startsWith(prefix)) {
        throw new MediaStorageCleanupInvariantError(
          "Media cleanup refused a derivative key outside the asset prefix.",
          "derivative_key_mismatch"
        );
      }
      keys.add(key);
    }
  }

  for (const key of [...keys].sort()) {
    await storage.deletePrivateObject({ key });
  }
  return keys.size;
}

async function markCleanupCompleted(db: WorkerDb, claim: MediaStorageCleanupClaim, now: Date): Promise<boolean> {
  const [updated] = await db
    .update(mediaAssets)
    .set({
      storageCleanupClaimedAt: null,
      storageCleanupCompletedAt: now,
      storageCleanupFailureCode: null,
      storageCleanupFailureMessage: null
    })
    .where(claimPredicate(claim))
    .returning({ id: mediaAssets.id });
  return Boolean(updated);
}

async function markCleanupFailed(
  db: WorkerDb,
  claim: MediaStorageCleanupClaim,
  now: Date,
  error: MediaStorageCleanupError,
  exhausted: boolean
): Promise<boolean> {
  const [updated] = await db
    .update(mediaAssets)
    .set({
      storageCleanupClaimedAt: null,
      lastStorageCleanupAt: now,
      storageCleanupFailureCode: exhausted ? "storage_cleanup_exhausted" : error.code,
      storageCleanupFailureMessage: error.message.slice(0, 500)
    })
    .where(claimPredicate(claim))
    .returning({ id: mediaAssets.id });
  return Boolean(updated);
}

function claimPredicate(claim: MediaStorageCleanupClaim) {
  return and(
    eq(mediaAssets.id, claim.id),
    eq(mediaAssets.projectId, claim.projectId),
    eq(mediaAssets.storageCleanupAttemptCount, claim.cleanupAttemptCount),
    eq(mediaAssets.storageCleanupClaimedAt, claim.claimedAt),
    isNull(mediaAssets.storageCleanupCompletedAt)
  );
}

function noPageVersionReferences() {
  return sql`not exists (
    select 1 from ${pageVersionMediaAssets}
    where ${pageVersionMediaAssets.mediaAssetId} = ${mediaAssets.id}
  )`;
}

function isCleanupTerminalStatus(status: string): status is MediaStorageCleanupCandidate["status"] {
  return status === "ready" || status === "failed" || status === "archived";
}

class MediaStorageCleanupInvariantError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
  }
}

type MediaStorageCleanupError = { code: string; message: string };

function normalizeCleanupError(error: unknown): MediaStorageCleanupError {
  if (error instanceof MediaStorageCleanupInvariantError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: "storage_cleanup_failed",
    message: error instanceof Error ? error.message.slice(0, 500) : "Unknown media storage cleanup failure."
  };
}
