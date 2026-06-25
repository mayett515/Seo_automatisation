import { randomUUID } from "node:crypto";
import { AesGcmTokenCipher, GoogleSearchConsoleAdapter } from "@localseo/adapters";
import { parseAppEnv } from "@localseo/config";
import {
  GscConnectionSchema,
  GscOAuthCallbackQuerySchema,
  GscOAuthIntentSchema,
  GscPerformanceSummarySchema,
  GscSearchAnalyticsRowSchema,
  GscSyncRequestSchema,
  GscSyncRunSchema,
  QueueJobSchema,
  type GscConnection,
  type GscOAuthIntent,
  type GscPerformanceSummary,
  type GscSearchAnalyticsRow,
  type GscSyncRun,
  type QueueJob
} from "@localseo/contracts";
import {
  createDatabaseClient,
  gscConnections,
  gscOpportunitySignals,
  gscSearchAnalyticsRows,
  gscSyncRuns
} from "@localseo/db";
import { Body, Controller, Get, Inject, Injectable, Module, Param, Post, Query, Res } from "@nestjs/common";
import { and, desc, eq, ne } from "drizzle-orm";
import type { FastifyReply } from "fastify";
import { Queue, type ConnectionOptions } from "bullmq";

const env = parseAppEnv(process.env);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type DbHandle = ReturnType<typeof createDatabaseClient>;
type Db = DbHandle["db"];

@Injectable()
class GscService {
  private readonly dbHandle?: DbHandle;
  private readonly searchConsole?: GoogleSearchConsoleAdapter;
  private readonly tokenCipher?: AesGcmTokenCipher;
  private readonly gscQueue?: Queue;

  constructor() {
    this.dbHandle = env.DATABASE_URL ? createDatabaseClient(env.DATABASE_URL) : undefined;

    const redirectUri = env.GOOGLE_OAUTH_REDIRECT_URI ?? `${env.API_PUBLIC_URL}/gsc/callback`;
    const stateSecret = env.GSC_OAUTH_STATE_SECRET ?? env.BETTER_AUTH_SECRET;

    if (env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET && stateSecret) {
      this.searchConsole = new GoogleSearchConsoleAdapter({
        clientId: env.GOOGLE_OAUTH_CLIENT_ID,
        clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
        redirectUri,
        stateSecret
      });
    }

    if (env.GSC_TOKEN_ENCRYPTION_KEY) {
      this.tokenCipher = new AesGcmTokenCipher(env.GSC_TOKEN_ENCRYPTION_KEY);
    }

    const redisConnection = env.REDIS_URL ? createRedisConnection(env.REDIS_URL) : undefined;
    this.gscQueue = redisConnection ? new Queue("gsc-sync", { connection: redisConnection }) : undefined;
  }

  async getConnection(projectId: string): Promise<GscConnection> {
    if (!isPersistedProjectId(projectId)) {
      return connectionRequired(projectId, "Select a persisted project before connecting Google Search Console.");
    }

    if (!this.dbHandle) {
      return connectionRequired(projectId, "DATABASE_URL is required before Google Search Console connections can be stored.");
    }

    const connection = await findLatestConnection(this.dbHandle.db, projectId);

    if (!connection) {
      return connectionRequired(projectId, "Connect Google Search Console with OAuth before performance sync, opportunity mining, or reports can use GSC data.");
    }

    return GscConnectionSchema.parse({
      projectId,
      status: connection.status,
      propertyUrl: connection.propertyUrl ?? undefined,
      lastSyncedAt: connection.lastSyncedAt?.toISOString(),
      message: connection.failureJson ? "Google Search Console connection needs attention." : undefined
    });
  }

  createOAuthIntent(projectId: string): GscOAuthIntent {
    if (!isPersistedProjectId(projectId)) {
      return oauthUnavailable(projectId, "Create or select a persisted project before starting Google OAuth.");
    }

    if (!this.dbHandle) {
      return oauthUnavailable(projectId, "DATABASE_URL is required before Google OAuth can store a connection.");
    }

    if (!this.searchConsole || !this.tokenCipher) {
      return oauthUnavailable(projectId, "Google OAuth credentials, a state secret, and GSC_TOKEN_ENCRYPTION_KEY are required before connecting Search Console.");
    }

    return this.searchConsole.createAuthorizationUrl({
      projectId,
      redirectTo: `${env.WEB_ORIGIN}/projects/${projectId}/gsc/connect`
    });
  }

  async handleOAuthCallback(queryInput: unknown): Promise<string> {
    const query = GscOAuthCallbackQuerySchema.parse(queryInput);

    if (query.error) {
      return `${env.WEB_ORIGIN}/?gsc=error&reason=${encodeURIComponent(query.error)}`;
    }

    if (!query.code || !query.state || !this.searchConsole || !this.tokenCipher || !this.dbHandle) {
      return `${env.WEB_ORIGIN}/?gsc=error&reason=missing_oauth_configuration`;
    }

    let redirectTo = `${env.WEB_ORIGIN}/`;

    try {
      const state = this.searchConsole.verifyState({ state: query.state });
      redirectTo = state.redirectTo ?? `${env.WEB_ORIGIN}/projects/${state.projectId}/gsc/connect`;
      const tokens = await this.searchConsole.exchangeCode({ code: query.code });

      if (!tokens.refreshToken) {
        return `${redirectTo}?gsc=error&reason=missing_refresh_token`;
      }

      const properties = await this.searchConsole.listSites({
        accessToken: tokens.accessToken,
        projectId: state.projectId
      });
      const selectedProperty = properties.properties[0];

      if (!selectedProperty) {
        await revokeProjectConnections(this.dbHandle.db, state.projectId, "no_search_console_property");
        await this.dbHandle.db.insert(gscConnections).values({
          projectId: state.projectId,
          status: "error",
          failureJson: { reason: "no_search_console_property" }
        });

        return `${redirectTo}?gsc=error&reason=no_search_console_property`;
      }

      const [insertedConnection] = await this.dbHandle.db.insert(gscConnections).values({
        projectId: state.projectId,
        propertyUrl: selectedProperty.siteUrl,
        status: "connected",
        encryptedRefreshToken: this.tokenCipher.encrypt(tokens.refreshToken),
        connectedAt: new Date(),
        failureJson: null
      }).returning({ id: gscConnections.id });

      if (insertedConnection) {
        await revokeOtherProjectConnections(this.dbHandle.db, state.projectId, insertedConnection.id, "replaced_by_reconnect");
      }

      return `${redirectTo}?gsc=connected`;
    } catch {
      return `${redirectTo}?gsc=error&reason=oauth_callback_failed`;
    }
  }

  async queueSync(projectId: string, requestInput: unknown): Promise<QueueJob | GscConnection> {
    const request = GscSyncRequestSchema.parse(requestInput ?? {});
    const connection = await this.getConnection(projectId);

    if (connection.status !== "connected" || !connection.propertyUrl || !this.dbHandle) {
      return connection;
    }

    const persistedConnection = await findLatestConnection(this.dbHandle.db, projectId);

    if (!persistedConnection?.encryptedRefreshToken) {
      return connectionRequired(projectId, "Reconnect Google Search Console before syncing performance data.");
    }

    const dateRange = request.dateRange ?? defaultFinalizedDateRange();
    const [syncRun] = await this.dbHandle.db.insert(gscSyncRuns).values({
      projectId,
      connectionId: persistedConnection.id,
      propertyUrl: request.propertyUrl ?? connection.propertyUrl,
      dateFrom: dateRange.from,
      dateTo: dateRange.to,
      dimensions: ["query", "page"],
      status: "queued"
    }).returning();

    if (!syncRun) {
      throw new Error("Failed to create GSC sync run");
    }

    const jobId = randomUUID();
    const job = QueueJobSchema.parse({
      jobId,
      projectId,
      type: "gsc_sync",
      status: "queued",
      inputRef: syncRun.id,
      createdAt: new Date().toISOString()
    });

    await this.gscQueue?.add("gsc_sync", {
      projectId,
      syncRunId: syncRun.id
    }, {
      jobId,
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 1000
      }
    });

    return job;
  }

  async getPerformance(projectId: string): Promise<GscPerformanceSummary> {
    const connection = await this.getConnection(projectId);

    if (!this.dbHandle || connection.status !== "connected") {
      return GscPerformanceSummarySchema.parse({
        projectId,
        connection,
        rows: [],
        opportunitySignals: []
      });
    }

    const db = this.dbHandle.db;
    const latestSync = await findLatestSyncRun(db, projectId);
    let rows: (typeof gscSearchAnalyticsRows.$inferSelect)[] = [];
    let signals: (typeof gscOpportunitySignals.$inferSelect)[] = [];

    if (latestSync) {
      rows = await db.select().from(gscSearchAnalyticsRows)
        .where(eq(gscSearchAnalyticsRows.syncRunId, latestSync.id))
        .orderBy(desc(gscSearchAnalyticsRows.impressions))
        .limit(25);
      signals = await db.select().from(gscOpportunitySignals)
        .where(eq(gscOpportunitySignals.syncRunId, latestSync.id))
        .orderBy(desc(gscOpportunitySignals.createdAt))
        .limit(25);
    }

    return GscPerformanceSummarySchema.parse({
      projectId,
      connection,
      latestSync: latestSync ? mapSyncRun(latestSync) : undefined,
      rows: rows.map((row) => mapSearchAnalyticsRow(row)),
      opportunitySignals: signals.map((signal) => ({
        projectId,
        syncRunId: signal.syncRunId,
        rowId: signal.rowId ?? undefined,
        signalType: signal.signalType,
        status: signal.status,
        query: signal.query,
        pageUrl: signal.pageUrl,
        evidence: signal.evidenceJson ?? undefined
      }))
    });
  }
}

@Controller("projects/:projectId/gsc")
class GscController {
  constructor(@Inject(GscService) private readonly gsc: GscService) {}

  @Get("connection")
  getConnection(@Param("projectId") projectId: string) {
    return this.gsc.getConnection(projectId);
  }

  @Get("connect")
  getConnectIntent(@Param("projectId") projectId: string) {
    return this.gsc.createOAuthIntent(projectId);
  }

  @Post("connect")
  connect(@Param("projectId") projectId: string) {
    return this.gsc.createOAuthIntent(projectId);
  }

  @Post("sync")
  sync(@Param("projectId") projectId: string, @Body() body: unknown) {
    return this.gsc.queueSync(projectId, body);
  }

  @Get("performance")
  performance(@Param("projectId") projectId: string) {
    return this.gsc.getPerformance(projectId);
  }
}

@Controller("gsc")
class GscOAuthController {
  constructor(@Inject(GscService) private readonly gsc: GscService) {}

  @Get("callback")
  async callback(@Query() query: unknown, @Res() reply: FastifyReply) {
    const redirectTo = await this.gsc.handleOAuthCallback(query);
    return reply.redirect(redirectTo);
  }
}

@Module({
  controllers: [GscController, GscOAuthController],
  providers: [GscService]
})
export class GscModule {}

function connectionRequired(projectId: string, message: string): GscConnection {
  return GscConnectionSchema.parse({
    projectId,
    status: "connection_required",
    message
  });
}

function oauthUnavailable(projectId: string, message: string): GscOAuthIntent {
  return GscOAuthIntentSchema.parse({
    projectId,
    status: "connection_required",
    provider: "google_search_console",
    message
  });
}

async function findLatestConnection(db: Db, projectId: string) {
  const [connection] = await db.select().from(gscConnections)
    .where(eq(gscConnections.projectId, projectId))
    .orderBy(desc(gscConnections.createdAt))
    .limit(1);

  return connection;
}

async function revokeProjectConnections(db: Db, projectId: string, reason: string): Promise<void> {
  await db.update(gscConnections).set({
    status: "revoked",
    encryptedRefreshToken: null,
    failureJson: { reason },
    updatedAt: new Date()
  }).where(eq(gscConnections.projectId, projectId));
}

async function revokeOtherProjectConnections(db: Db, projectId: string, activeConnectionId: string, reason: string): Promise<void> {
  await db.update(gscConnections).set({
    status: "revoked",
    encryptedRefreshToken: null,
    failureJson: { reason },
    updatedAt: new Date()
  }).where(and(eq(gscConnections.projectId, projectId), ne(gscConnections.id, activeConnectionId)));
}

async function findLatestSyncRun(db: Db, projectId: string) {
  const [syncRun] = await db.select().from(gscSyncRuns)
    .where(and(eq(gscSyncRuns.projectId, projectId), eq(gscSyncRuns.status, "completed")))
    .orderBy(desc(gscSyncRuns.completedAt))
    .limit(1);

  return syncRun;
}

function mapSyncRun(syncRun: typeof gscSyncRuns.$inferSelect): GscSyncRun {
  return GscSyncRunSchema.parse({
    syncRunId: syncRun.id,
    projectId: syncRun.projectId,
    connectionId: syncRun.connectionId ?? undefined,
    propertyUrl: syncRun.propertyUrl,
    dateRange: {
      from: syncRun.dateFrom,
      to: syncRun.dateTo
    },
    dimensions: syncRun.dimensions,
    status: syncRun.status,
    rowCount: syncRun.rowCount,
    startedAt: syncRun.startedAt?.toISOString(),
    completedAt: syncRun.completedAt?.toISOString()
  });
}

function mapSearchAnalyticsRow(row: typeof gscSearchAnalyticsRows.$inferSelect): GscSearchAnalyticsRow {
  return GscSearchAnalyticsRowSchema.parse({
    syncRunId: row.syncRunId,
    projectId: row.projectId,
    propertyUrl: row.propertyUrl,
    query: row.query,
    pageUrl: row.pageUrl,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position
  });
}

function defaultFinalizedDateRange(): { from: string; to: string } {
  const to = new Date();
  to.setUTCDate(to.getUTCDate() - 3);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 27);

  return {
    from: formatIsoDate(from),
    to: formatIsoDate(to)
  };
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isPersistedProjectId(projectId: string): boolean {
  return uuidPattern.test(projectId);
}

function createRedisConnection(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);

  return {
    host: url.hostname,
    port: Number(url.port || "6379"),
    username: url.username || undefined,
    password: url.password || undefined,
    maxRetriesPerRequest: null
  };
}
