import { randomUUID } from "node:crypto";
import { AesGcmTokenCipher, GoogleSearchConsoleAdapter, createRedisConnection } from "@localseo/adapters";
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
  gscConnections,
  gscOpportunitySignals,
  gscSearchAnalyticsRows,
  gscSyncRuns,
  jobRuns,
  type DatabaseClient
} from "@localseo/db";
import {
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Logger,
  Module,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  type OnModuleDestroy,
  type Provider
} from "@nestjs/common";
import { and, desc, eq, ne } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Queue } from "bullmq";
import { BetterAuthService } from "../auth/better-auth/better-auth.service.js";
import { BetterAuthGuard } from "../auth/guards/better-auth.guard.js";
import { PermissionGuard } from "../auth/permissions/permission.guard.js";
import { RequireProjectPermission } from "../auth/permissions/require-permission.decorator.js";
import { ProjectAccessGuard } from "../auth/project-access.guard.js";
import { ProjectMembershipService } from "../auth/project-membership.service.js";
import type {
  AuthenticatedRequestContext,
  ProjectAccessContext,
  RequestWithAuth
} from "../auth/types/authenticated-request.js";
import { DatabaseService } from "../database/database.service.js";
import { GscOAuthStateStore, type GscOAuthNonceRecord } from "./gsc-oauth-state.store.js";
import { CsrfGuard } from "../security/csrf/csrf.guard.js";

const env = parseAppEnv(process.env);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type Db = DatabaseClient;
type OptionalSearchConsole = GoogleSearchConsoleAdapter | undefined;
type OptionalTokenCipher = AesGcmTokenCipher | undefined;
type OptionalQueue = Queue | undefined;

const GSC_SEARCH_CONSOLE = Symbol("GSC_SEARCH_CONSOLE");
const GSC_TOKEN_CIPHER = Symbol("GSC_TOKEN_CIPHER");
const GSC_QUEUE = Symbol("GSC_QUEUE");

const gscInfrastructureProviders: Provider[] = [
  {
    provide: GSC_SEARCH_CONSOLE,
    useFactory: (): OptionalSearchConsole => {
      const redirectUri = env.GOOGLE_OAUTH_REDIRECT_URI ?? `${env.API_PUBLIC_URL}/gsc/callback`;
      const stateSecret = env.GSC_OAUTH_STATE_SECRET ?? env.BETTER_AUTH_SECRET;

      if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET || !stateSecret) {
        return undefined;
      }

      return new GoogleSearchConsoleAdapter({
        clientId: env.GOOGLE_OAUTH_CLIENT_ID,
        clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
        redirectUri,
        stateSecret
      });
    }
  },
  {
    provide: GSC_TOKEN_CIPHER,
    useFactory: (): OptionalTokenCipher =>
      env.GSC_TOKEN_ENCRYPTION_KEY ? new AesGcmTokenCipher(env.GSC_TOKEN_ENCRYPTION_KEY) : undefined
  },
  {
    provide: GSC_QUEUE,
    useFactory: (): OptionalQueue => {
      const redisConnection = env.REDIS_URL ? createRedisConnection(env.REDIS_URL) : undefined;
      return redisConnection ? new Queue("gsc-sync", { connection: redisConnection }) : undefined;
    }
  }
];

@Injectable()
class GscService implements OnModuleDestroy {
  private readonly logger = new Logger(GscService.name);

  constructor(
    @Inject(GSC_SEARCH_CONSOLE) private readonly searchConsole: OptionalSearchConsole,
    @Inject(GSC_TOKEN_CIPHER) private readonly tokenCipher: OptionalTokenCipher,
    @Inject(GSC_QUEUE) private readonly gscQueue: OptionalQueue,
    private readonly database: DatabaseService,
    private readonly oauthStateStore: GscOAuthStateStore,
    private readonly betterAuth: BetterAuthService,
    private readonly memberships: ProjectMembershipService
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.gscQueue?.close();
  }

  async getConnection(projectId: string): Promise<GscConnection> {
    if (!isPersistedProjectId(projectId)) {
      return connectionRequired(projectId, "Select a persisted project before connecting Google Search Console.");
    }

    const db = this.database.db;

    if (!db) {
      return connectionRequired(
        projectId,
        "DATABASE_URL is required before Google Search Console connections can be stored."
      );
    }

    const connection = await findLatestConnection(db, projectId);

    if (!connection) {
      return connectionRequired(
        projectId,
        "Connect Google Search Console with OAuth before performance sync, opportunity mining, or reports can use GSC data."
      );
    }

    return GscConnectionSchema.parse({
      projectId,
      status: connection.status,
      propertyUrl: connection.propertyUrl ?? undefined,
      lastSyncedAt: connection.lastSyncedAt?.toISOString(),
      message: connection.failureJson ? "Google Search Console connection needs attention." : undefined
    });
  }

  async createOAuthIntent(input: {
    projectId: string;
    auth: AuthenticatedRequestContext;
    projectAccess: ProjectAccessContext;
  }): Promise<GscOAuthIntent> {
    const { projectId, auth, projectAccess } = input;

    if (!isPersistedProjectId(projectId)) {
      return oauthUnavailable(projectId, "Create or select a persisted project before starting Google OAuth.");
    }

    if (!this.database.db) {
      return oauthUnavailable(projectId, "DATABASE_URL is required before Google OAuth can store a connection.");
    }

    if (!this.searchConsole || !this.tokenCipher) {
      return oauthUnavailable(
        projectId,
        "Google OAuth credentials, a state secret, and GSC_TOKEN_ENCRYPTION_KEY are required before connecting Search Console."
      );
    }

    if (!this.oauthStateStore.isConfigured()) {
      return oauthUnavailable(projectId, "REDIS_URL is required before Google OAuth state can be consumed once.");
    }

    const authorizationRequest = this.searchConsole.createAuthorizationRequest({
      projectId,
      customerId: projectAccess.customerId,
      userId: auth.user.id,
      sessionId: auth.session.id,
      redirectTo: `/projects/${projectId}/gsc/connect`
    });
    const stored = await this.oauthStateStore.store({
      provider: "google_search_console",
      nonce: authorizationRequest.statePayload.nonce,
      projectId,
      customerId: projectAccess.customerId,
      userId: auth.user.id,
      sessionId: auth.session.id,
      redirectTo: authorizationRequest.statePayload.redirectTo,
      codeVerifier: authorizationRequest.codeVerifier,
      expiresAt: authorizationRequest.statePayload.expiresAt
    });

    if (!stored) {
      return oauthUnavailable(projectId, "Google OAuth state storage is not configured.");
    }

    return authorizationRequest.intent;
  }

  async handleOAuthCallback(queryInput: unknown, headers: FastifyRequest["headers"]): Promise<string> {
    const query = GscOAuthCallbackQuerySchema.parse(queryInput);

    if (query.error) {
      return this.safeOAuthRedirect(undefined, undefined, "provider_error");
    }

    const db = this.database.db;

    if (!query.code || !query.state || !this.searchConsole || !this.tokenCipher || !db) {
      return this.safeOAuthRedirect(undefined, undefined, "missing_oauth_configuration");
    }

    let redirectPath: string | undefined;
    let projectId: string | undefined;

    try {
      const state = this.searchConsole.verifyState({ state: query.state });
      redirectPath = state.redirectTo;
      projectId = state.projectId;
      const nonceRecord = await this.oauthStateStore.consume(state.nonce);

      if (!nonceRecord) {
        return this.safeOAuthRedirect(redirectPath, projectId, "oauth_state_replayed_or_expired");
      }

      assertNonceRecordMatchesState(nonceRecord, state);

      const auth = await this.betterAuth.getSessionFromHeaders(headers);

      if (!auth || auth.user.id !== state.userId) {
        return this.safeOAuthRedirect(redirectPath, projectId, "session_mismatch");
      }

      const projectAccess = await this.memberships.getProjectAccess({
        userId: auth.user.id,
        projectId: state.projectId
      });

      if (!projectAccess || projectAccess.customerId !== state.customerId) {
        return this.safeOAuthRedirect(redirectPath, projectId, "project_access_lost");
      }

      const tokens = await this.searchConsole.exchangeCode({
        code: query.code,
        codeVerifier: nonceRecord.codeVerifier
      });

      if (!tokens.refreshToken) {
        return this.safeOAuthRedirect(redirectPath, projectId, "missing_refresh_token");
      }

      const properties = await this.searchConsole.listSites({
        accessToken: tokens.accessToken,
        projectId: state.projectId
      });
      const selectedProperty = properties.properties[0];

      if (!selectedProperty) {
        await revokeProjectConnections(db, state.projectId, "no_search_console_property");
        await db.insert(gscConnections).values({
          projectId: state.projectId,
          status: "error",
          failureJson: { reason: "no_search_console_property" }
        });

        return this.safeOAuthRedirect(redirectPath, projectId, "no_search_console_property");
      }

      const [insertedConnection] = await db
        .insert(gscConnections)
        .values({
          projectId: state.projectId,
          propertyUrl: selectedProperty.siteUrl,
          status: "connected",
          encryptedRefreshToken: this.tokenCipher.encrypt(tokens.refreshToken),
          connectedAt: new Date(),
          failureJson: null
        })
        .returning({ id: gscConnections.id });

      if (insertedConnection) {
        await revokeOtherProjectConnections(db, state.projectId, insertedConnection.id, "replaced_by_reconnect");
      }

      return this.safeOAuthRedirect(redirectPath, projectId, undefined, "connected");
    } catch (error) {
      this.logger.error("GSC OAuth callback failed", normalizeOAuthCallbackFailure(error));
      return this.safeOAuthRedirect(redirectPath, projectId, "oauth_callback_failed");
    }
  }

  private safeOAuthRedirect(
    redirectPath: string | undefined,
    projectId: string | undefined,
    errorReason?: string,
    successStatus?: "connected"
  ): string {
    const path = safeRedirectPath(redirectPath, projectId);
    const url = new URL(path, env.WEB_ORIGIN);

    if (successStatus) {
      url.searchParams.set("gsc", successStatus);
    } else {
      url.searchParams.set("gsc", "error");
      url.searchParams.set("reason", errorReason ?? "oauth_callback_failed");
    }

    return url.toString();
  }

  async queueSync(projectId: string, requestInput: unknown, userId?: string): Promise<QueueJob | GscConnection> {
    const request = GscSyncRequestSchema.parse(requestInput ?? {});
    const connection = await this.getConnection(projectId);

    const db = this.database.db;

    if (connection.status !== "connected" || !connection.propertyUrl || !db) {
      return connection;
    }

    const persistedConnection = await findLatestConnection(db, projectId);

    if (!persistedConnection?.encryptedRefreshToken) {
      return connectionRequired(projectId, "Reconnect Google Search Console before syncing performance data.");
    }

    if (!this.gscQueue) {
      return connectionRequired(
        projectId,
        "GSC sync queue is not configured. REDIS_URL is required before sync jobs can be queued."
      );
    }

    const dateRange = request.dateRange ?? defaultFinalizedDateRange();
    const [syncRun] = await db
      .insert(gscSyncRuns)
      .values({
        projectId,
        connectionId: persistedConnection.id,
        propertyUrl: request.propertyUrl ?? connection.propertyUrl,
        dateFrom: dateRange.from,
        dateTo: dateRange.to,
        dimensions: ["query", "page"],
        status: "queued"
      })
      .returning();

    if (!syncRun) {
      throw new Error("Failed to create GSC sync run");
    }

    const jobId = randomUUID();
    const jobRunId = randomUUID();
    const job = QueueJobSchema.parse({
      jobId,
      projectId,
      type: "gsc_sync",
      status: "queued",
      inputRef: syncRun.id,
      createdBy: userId,
      createdAt: new Date().toISOString()
    });

    await db.insert(jobRuns).values({
      id: jobRunId,
      projectId,
      externalJobId: jobId,
      queueName: "gsc-sync",
      type: "gsc_sync",
      status: "queued",
      inputRef: syncRun.id,
      actorType: userId ? "user" : "system",
      actorUserId: userId,
      triggerSource: "user_action"
    });

    try {
      await this.gscQueue.add(
        "gsc_sync",
        {
          projectId,
          syncRunId: syncRun.id,
          jobRunId,
          triggeredByUserId: userId ?? null,
          triggerSource: "user_action"
        },
        {
          jobId,
          attempts: 5,
          backoff: {
            type: "exponential",
            delay: 1000
          }
        }
      );
    } catch (error) {
      await db
        .update(jobRuns)
        .set({
          status: "failed",
          completedAt: new Date(),
          updatedAt: new Date(),
          failureJson: {
            message: error instanceof Error ? error.message : "gsc_queue_add_failed"
          }
        })
        .where(eq(jobRuns.id, jobRunId));
      await db
        .update(gscSyncRuns)
        .set({
          status: "failed",
          completedAt: new Date(),
          updatedAt: new Date(),
          failureJson: {
            message: "gsc_queue_add_failed"
          }
        })
        .where(eq(gscSyncRuns.id, syncRun.id));
      throw error;
    }

    return job;
  }

  async getPerformance(projectId: string): Promise<GscPerformanceSummary> {
    const connection = await this.getConnection(projectId);

    const db = this.database.db;

    if (!db || connection.status !== "connected") {
      return GscPerformanceSummarySchema.parse({
        projectId,
        connection,
        rows: [],
        opportunitySignals: []
      });
    }

    const latestSync = await findLatestSyncRun(db, projectId);
    let rows: (typeof gscSearchAnalyticsRows.$inferSelect)[] = [];
    let signals: (typeof gscOpportunitySignals.$inferSelect)[] = [];

    if (latestSync) {
      rows = await db
        .select()
        .from(gscSearchAnalyticsRows)
        .where(eq(gscSearchAnalyticsRows.syncRunId, latestSync.id))
        .orderBy(desc(gscSearchAnalyticsRows.impressions))
        .limit(25);
      signals = await db
        .select()
        .from(gscOpportunitySignals)
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
@UseGuards(BetterAuthGuard, CsrfGuard, ProjectAccessGuard, PermissionGuard)
class GscController {
  constructor(private readonly gsc: GscService) {}

  @Get("connection")
  getConnection(@Param("projectId") projectId: string) {
    return this.gsc.getConnection(projectId);
  }

  @Post("connect")
  @RequireProjectPermission("gsc:connect")
  connect(@Param("projectId") projectId: string, @Req() request: RequestWithAuth) {
    return this.gsc.createOAuthIntent({
      projectId,
      auth: requireAuthContext(request),
      projectAccess: requireProjectAccessContext(request)
    });
  }

  @Post("sync")
  @RequireProjectPermission("gsc:sync")
  sync(@Param("projectId") projectId: string, @Body() body: unknown, @Req() request: RequestWithAuth) {
    return this.gsc.queueSync(projectId, body, request.auth?.user.id);
  }

  @Get("performance")
  performance(@Param("projectId") projectId: string) {
    return this.gsc.getPerformance(projectId);
  }
}

@Controller("gsc")
class GscOAuthController {
  constructor(private readonly gsc: GscService) {}

  @Get("callback")
  async callback(@Query() query: unknown, @Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    const redirectTo = await this.gsc.handleOAuthCallback(query, request.headers);
    return reply.redirect(redirectTo);
  }
}

@Module({
  controllers: [GscController, GscOAuthController],
  providers: [GscOAuthStateStore, GscService, ...gscInfrastructureProviders]
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
  const [connection] = await db
    .select()
    .from(gscConnections)
    .where(eq(gscConnections.projectId, projectId))
    .orderBy(desc(gscConnections.createdAt))
    .limit(1);

  return connection;
}

async function revokeProjectConnections(db: Db, projectId: string, reason: string): Promise<void> {
  await db
    .update(gscConnections)
    .set({
      status: "revoked",
      encryptedRefreshToken: null,
      failureJson: { reason },
      updatedAt: new Date()
    })
    .where(eq(gscConnections.projectId, projectId));
}

async function revokeOtherProjectConnections(
  db: Db,
  projectId: string,
  activeConnectionId: string,
  reason: string
): Promise<void> {
  await db
    .update(gscConnections)
    .set({
      status: "revoked",
      encryptedRefreshToken: null,
      failureJson: { reason },
      updatedAt: new Date()
    })
    .where(and(eq(gscConnections.projectId, projectId), ne(gscConnections.id, activeConnectionId)));
}

async function findLatestSyncRun(db: Db, projectId: string) {
  const [syncRun] = await db
    .select()
    .from(gscSyncRuns)
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

function requireAuthContext(request: RequestWithAuth): AuthenticatedRequestContext {
  if (!request.auth) {
    throw new Error("GSC connect requires authenticated request context");
  }

  return request.auth;
}

function requireProjectAccessContext(request: RequestWithAuth): ProjectAccessContext {
  if (!request.projectAccess) {
    throw new Error("GSC connect requires resolved project access context");
  }

  return request.projectAccess;
}

function assertNonceRecordMatchesState(
  record: GscOAuthNonceRecord,
  state: ReturnType<GoogleSearchConsoleAdapter["verifyState"]>
): void {
  if (
    record.provider !== state.provider ||
    record.nonce !== state.nonce ||
    record.projectId !== state.projectId ||
    record.customerId !== state.customerId ||
    record.userId !== state.userId ||
    record.sessionId !== state.sessionId
  ) {
    throw new Error("OAuth state nonce record did not match signed state");
  }
}

function safeRedirectPath(redirectPath: string | undefined, projectId: string | undefined): string {
  const fallback = projectId ? `/projects/${projectId}/gsc/connect` : "/";

  if (!redirectPath || !redirectPath.startsWith("/") || redirectPath.startsWith("//") || redirectPath.includes("\\")) {
    return fallback;
  }

  try {
    const url = new URL(redirectPath, env.WEB_ORIGIN);
    const allowedOrigin = new URL(env.WEB_ORIGIN).origin;

    return url.origin === allowedOrigin ? `${url.pathname}${url.search}` : fallback;
  } catch {
    return fallback;
  }
}

function normalizeOAuthCallbackFailure(error: unknown): string {
  if (!(error instanceof Error)) {
    return "unknown_oauth_callback_failure";
  }

  if (error.message.includes("Search Console API request failed")) {
    return "search_console_api_request_failed";
  }

  if (error.message.includes("OAuth state")) {
    return "oauth_state_invalid";
  }

  if (error.message.includes("Google OAuth")) {
    return "google_oauth_exchange_failed";
  }

  return "oauth_callback_failed";
}
