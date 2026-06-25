import { randomUUID } from "node:crypto";
import { AesGcmTokenCipher, GoogleSearchConsoleAdapter } from "@localseo/adapters";
import { agentDescriptors, mastraWorkflows } from "@localseo/ai";
import { parseAppEnv } from "@localseo/config";
import { createDatabaseClient, gscConnections, gscOpportunitySignals, gscSearchAnalyticsRows, gscSyncRuns } from "@localseo/db";
import type { GscOpportunitySignalType, GscSearchAnalyticsRow } from "@localseo/contracts";
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";

const env = parseAppEnv(process.env);

type DbHandle = ReturnType<typeof createDatabaseClient>;
type Db = DbHandle["db"];
type StoredSearchAnalyticsRow = {
  rowId: string;
  row: GscSearchAnalyticsRow;
};

const sharedDbHandle: DbHandle | undefined = env.DATABASE_URL ? createDatabaseClient(env.DATABASE_URL) : undefined;

export async function handleJob(job: Job): Promise<Record<string, unknown>> {
  if (job.queueName === "gsc-sync" || job.name === "gsc_sync") {
    return handleGscSyncJob(job);
  }

  return {
    jobId: job.id,
    queueName: job.queueName,
    processedAt: new Date().toISOString(),
    mastraWorkflows,
    availableAgents: agentDescriptors.map((agent) => agent.name)
  };
}

async function handleGscSyncJob(job: Job): Promise<Record<string, unknown>> {
  const data = parseGscSyncJobData(job.data);

  if (!sharedDbHandle) {
    throw new Error("DATABASE_URL is required for GSC sync jobs");
  }

  try {
    return await runGscSync(sharedDbHandle.db, data);
  } catch (error) {
    await markSyncRunFailed(sharedDbHandle.db, data.syncRunId, error);
    throw error;
  }
}

async function runGscSync(db: Db, data: { projectId: string; syncRunId: string }): Promise<Record<string, unknown>> {
  const searchConsole = createSearchConsoleAdapter();
  const tokenCipher = createTokenCipher();
  const [syncRun] = await db.select().from(gscSyncRuns).where(eq(gscSyncRuns.id, data.syncRunId)).limit(1);

  if (!syncRun) {
    throw new Error(`GSC sync run not found: ${data.syncRunId}`);
  }

  const [connection] = await db.select().from(gscConnections).where(eq(gscConnections.id, syncRun.connectionId ?? "")).limit(1);

  if (!connection?.encryptedRefreshToken || connection.status !== "connected") {
    throw new Error("GSC connection is not connected or has no encrypted refresh token");
  }

  await db.update(gscSyncRuns).set({
    status: "running",
    startedAt: new Date(),
    failureJson: null
  }).where(eq(gscSyncRuns.id, syncRun.id));

  await resetSyncRunData(db, syncRun.id);

  const refreshToken = tokenCipher.decrypt(connection.encryptedRefreshToken);
  const tokenSet = await searchConsole.refreshAccessToken({ refreshToken });
  const rows = await searchConsole.querySearchAnalytics({
    accessToken: tokenSet.accessToken,
    projectId: data.projectId,
    propertyUrl: syncRun.propertyUrl,
    dateRange: {
      from: syncRun.dateFrom,
      to: syncRun.dateTo
    },
    dimensions: syncRun.dimensions,
    rowLimit: 25000
  });

  const storedRows = await insertSearchAnalyticsRows(db, syncRun.id, rows);
  await insertOpportunitySignals(db, syncRun.id, storedRows);

  await db.update(gscSyncRuns).set({
    status: "completed",
    rowCount: rows.length,
    completedAt: new Date()
  }).where(eq(gscSyncRuns.id, syncRun.id));

  await db.update(gscConnections).set({
    lastSyncedAt: new Date(),
    failureJson: null
  }).where(eq(gscConnections.id, connection.id));

  return {
    jobId: data.syncRunId,
    projectId: data.projectId,
    status: "completed",
    rowCount: rows.length,
    opportunitySignals: storedRows.flatMap((stored) => classifyOpportunitySignals(stored.row)).length
  };
}

async function resetSyncRunData(db: Db, syncRunId: string): Promise<void> {
  await db.delete(gscOpportunitySignals).where(eq(gscOpportunitySignals.syncRunId, syncRunId));
  await db.delete(gscSearchAnalyticsRows).where(eq(gscSearchAnalyticsRows.syncRunId, syncRunId));
}

async function insertSearchAnalyticsRows(db: Db, syncRunId: string, rows: GscSearchAnalyticsRow[]): Promise<StoredSearchAnalyticsRow[]> {
  const storedRows = rows.map((row) => ({
    rowId: randomUUID(),
    row
  }));

  for (const chunk of chunkArray(storedRows, 500)) {
    await db.insert(gscSearchAnalyticsRows).values(chunk.map((row) => ({
      id: row.rowId,
      syncRunId,
      projectId: row.row.projectId,
      propertyUrl: row.row.propertyUrl,
      query: row.row.query,
      pageUrl: row.row.pageUrl,
      clicks: Math.round(row.row.clicks),
      impressions: Math.round(row.row.impressions),
      ctr: row.row.ctr,
      position: row.row.position
    })));
  }

  return storedRows;
}

async function insertOpportunitySignals(db: Db, syncRunId: string, rows: StoredSearchAnalyticsRow[]): Promise<void> {
  const signals = rows.flatMap((stored) => classifyOpportunitySignals(stored.row).map((signalType) => ({
    projectId: stored.row.projectId,
    syncRunId,
    rowId: stored.rowId,
    signalType,
    status: "internal_radar" as const,
    query: stored.row.query,
    pageUrl: stored.row.pageUrl,
    evidenceJson: {
      clicks: stored.row.clicks,
      impressions: stored.row.impressions,
      position: stored.row.position,
      source: "gsc_search_analytics"
    }
  })));

  for (const chunk of chunkArray(signals, 500)) {
    await db.insert(gscOpportunitySignals).values(chunk);
  }
}

function classifyOpportunitySignals(row: GscSearchAnalyticsRow): GscOpportunitySignalType[] {
  const signals: GscOpportunitySignalType[] = [];

  if (row.impressions > 0 && row.clicks === 0) {
    signals.push("impressions_no_clicks");
  }

  if (row.position >= 11 && row.position <= 100) {
    signals.push("positions_11_100");
  }

  if (looksLikeServiceLocationQuery(row.query)) {
    signals.push("service_location_query");

    if (looksLikeWrongPageMatch(row.query, row.pageUrl)) {
      signals.push("wrong_page_service_location");
    }
  }

  return [...new Set(signals)];
}

function looksLikeServiceLocationQuery(query: string): boolean {
  const terms = normalize(query).split(" ").filter((term) => term.length >= 4);
  return terms.length >= 2;
}

function looksLikeWrongPageMatch(query: string, pageUrl: string): boolean {
  const pathname = safePathname(pageUrl);
  const terms = normalize(query).split(" ").filter((term) => term.length >= 4);
  const missingTerms = terms.filter((term) => !pathname.includes(term));
  return terms.length >= 2 && missingTerms.length >= 1;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/\u00e4/gu, "ae")
    .replace(/\u00f6/gu, "oe")
    .replace(/\u00fc/gu, "ue")
    .replace(/\u00df/gu, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

function safePathname(pageUrl: string): string {
  try {
    return normalize(new URL(pageUrl).pathname);
  } catch {
    return "";
  }
}

function createSearchConsoleAdapter(): GoogleSearchConsoleAdapter {
  const stateSecret = env.GSC_OAUTH_STATE_SECRET ?? env.BETTER_AUTH_SECRET;

  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET || !stateSecret) {
    throw new Error("Google OAuth client credentials and a state secret are required for GSC sync jobs");
  }

  return new GoogleSearchConsoleAdapter({
    clientId: env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri: env.GOOGLE_OAUTH_REDIRECT_URI ?? `${env.API_PUBLIC_URL}/gsc/callback`,
    stateSecret
  });
}

function createTokenCipher(): AesGcmTokenCipher {
  if (!env.GSC_TOKEN_ENCRYPTION_KEY) {
    throw new Error("GSC_TOKEN_ENCRYPTION_KEY is required for GSC sync jobs");
  }

  return new AesGcmTokenCipher(env.GSC_TOKEN_ENCRYPTION_KEY);
}

async function markSyncRunFailed(db: Db, syncRunId: string, error: unknown): Promise<void> {
  await db.update(gscSyncRuns).set({
    status: "failed",
    completedAt: new Date(),
    failureJson: {
      message: normalizeFailureReason(error)
    }
  }).where(eq(gscSyncRuns.id, syncRunId));
}

function normalizeFailureReason(error: unknown): string {
  if (!(error instanceof Error)) {
    return "unknown_gsc_sync_failure";
  }

  if (error.message.includes("Search Console API request failed")) {
    return "search_console_api_request_failed";
  }

  if (error.message.includes("Google OAuth")) {
    return "google_oauth_configuration_missing";
  }

  if (error.message.includes("GSC connection")) {
    return "gsc_connection_not_ready";
  }

  return "gsc_sync_failed";
}

function parseGscSyncJobData(data: unknown): { projectId: string; syncRunId: string } {
  if (!data || typeof data !== "object") {
    throw new Error("GSC sync job data must be an object");
  }

  const record = data as Record<string, unknown>;

  if (typeof record.projectId !== "string" || typeof record.syncRunId !== "string") {
    throw new Error("GSC sync job data requires projectId and syncRunId");
  }

  return {
    projectId: record.projectId,
    syncRunId: record.syncRunId
  };
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
