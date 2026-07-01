import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  BadRequestException,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import { allowsLocalScaffoldAuth, parseAppEnv } from "@localseo/config";
import {
  CreateTrackingKeyRequestSchema,
  CreateTrackingKeyResponseSchema,
  TrackingEventSchema,
  TrackingIngestResultSchema,
  TrackingKeySummarySchema,
  type TrackingEvent,
  type TrackingIngestResult,
  type TrackingKeySummary,
  type CreateTrackingKeyResponse
} from "@localseo/contracts";
import { projectTrackingKeys, trackingEvents } from "@localseo/db";
import { and, eq, isNull } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { BetterAuthGuard } from "../auth/guards/better-auth.guard.js";
import { PermissionGuard } from "../auth/permissions/permission.guard.js";
import { RequireProjectPermission } from "../auth/permissions/require-permission.decorator.js";
import { ProjectAccessGuard } from "../auth/project-access.guard.js";
import { DatabaseService } from "../database/database.service.js";
import { RedisService } from "../redis/redis.service.js";
import { CsrfGuard } from "../security/csrf/csrf.guard.js";

const trackingRateLimitWindowSeconds = 60;
const trackingRateLimitWindowMs = trackingRateLimitWindowSeconds * 1000;
const trackingProjectRateLimitMax = 120;
const trackingIpRateLimitMax = 600;
const trackingGlobalProjectRateLimitMax = 5000;
const trackingKeyRateLimitMax = 1000;
const trackingKeyProjectRateLimitMax = 1000;
const trackingMemoryBucketMax = 10_000;
const trackingLastUsedAtCoalesceSeconds = 60;
const trackingLastUsedAtCoalesceMs = trackingLastUsedAtCoalesceSeconds * 1000;
const env = parseAppEnv(process.env);
const localScaffoldTrackingEnabled = allowsLocalScaffoldAuth(env);

type TrackingIngestContext = {
  trackingKey?: string;
  origin?: string;
  referer?: string;
};

type MemoryRateLimitBucket = {
  count: number;
  resetAt: number;
};

@Injectable()
export class TrackingRateLimiter {
  private readonly memoryBuckets = new Map<string, MemoryRateLimitBucket>();
  private readonly memoryLastUsedAtFlushes = new Map<string, number>();
  private lastMemoryEvictionAt = 0;

  constructor(private readonly redis: RedisService) {}

  async enforcePreValidationRequest(input: { ip: string; projectId: string }): Promise<void> {
    const keys = trackingRateLimitKeys(input);
    const ipCount = await this.incrementSoftLimit(keys.ip);

    if (ipCount > trackingIpRateLimitMax) {
      throw trackingRateLimitExceeded();
    }

    const ipProjectCount = await this.incrementSoftLimit(keys.ipProject);

    if (ipProjectCount > trackingProjectRateLimitMax) {
      throw trackingRateLimitExceeded();
    }
  }

  async enforceAcceptedEvent(input: { projectId: string; trackingKeyId: string }): Promise<void> {
    const keys = trackingRateLimitKeys(input);
    const projectCount = await this.incrementWriteProtectionLimit(keys.project);

    if (projectCount > trackingGlobalProjectRateLimitMax) {
      throw trackingRateLimitExceeded();
    }

    const keyCount = await this.incrementWriteProtectionLimit(keys.trackingKey);

    if (keyCount > trackingKeyRateLimitMax) {
      throw trackingRateLimitExceeded();
    }

    const keyProjectCount = await this.incrementWriteProtectionLimit(keys.trackingKeyProject);

    if (keyProjectCount > trackingKeyProjectRateLimitMax) {
      throw trackingRateLimitExceeded();
    }
  }

  async shouldFlushTrackingKeyLastUsedAt(trackingKeyId: string): Promise<boolean> {
    if (this.redis.client) {
      try {
        const result = await this.redis.client.set(
          `tracking:last-used:${trackingKeyId}`,
          "1",
          "EX",
          trackingLastUsedAtCoalesceSeconds,
          "NX"
        );
        return result === "OK";
      } catch {
        return this.shouldFlushTrackingKeyLastUsedAtInMemory(trackingKeyId);
      }
    }

    return this.shouldFlushTrackingKeyLastUsedAtInMemory(trackingKeyId);
  }

  protected shouldFailClosedAcceptedEventLimits(): boolean {
    return env.NODE_ENV === "production";
  }

  private async incrementSoftLimit(key: string): Promise<number> {
    const client = this.redis.client;

    if (!client) {
      return this.incrementInMemory(key);
    }

    try {
      return await this.incrementRedisLimit(client, key);
    } catch {
      return this.incrementInMemory(key);
    }
  }

  private async incrementWriteProtectionLimit(key: string): Promise<number> {
    const client = this.redis.client;

    if (!client) {
      if (this.shouldFailClosedAcceptedEventLimits()) {
        throw trackingRateLimitUnavailable();
      }

      return this.incrementInMemory(key);
    }

    try {
      return await this.incrementRedisLimit(client, key);
    } catch {
      if (this.shouldFailClosedAcceptedEventLimits()) {
        throw trackingRateLimitUnavailable();
      }

      return this.incrementInMemory(key);
    }
  }

  private async incrementRedisLimit(client: NonNullable<RedisService["client"]>, key: string): Promise<number> {
    const redisKey = `tracking:rate-limit:${key}`;
    const count = await client.incr(redisKey);

    if (count === 1) {
      await client.expire(redisKey, trackingRateLimitWindowSeconds);
    }

    return count;
  }

  private incrementInMemory(key: string): number {
    const now = Date.now();
    this.evictExpiredMemoryBuckets(now);
    const current = this.memoryBuckets.get(key);

    if (!current || current.resetAt <= now) {
      if (!current && this.memoryBuckets.size >= trackingMemoryBucketMax) {
        return Number.POSITIVE_INFINITY;
      }

      this.memoryBuckets.set(key, {
        count: 1,
        resetAt: now + trackingRateLimitWindowMs
      });
      return 1;
    }

    current.count += 1;
    return current.count;
  }

  private evictExpiredMemoryBuckets(now: number): void {
    if (now - this.lastMemoryEvictionAt < trackingRateLimitWindowMs) {
      return;
    }

    this.lastMemoryEvictionAt = now;

    for (const [key, bucket] of this.memoryBuckets) {
      if (bucket.resetAt <= now) {
        this.memoryBuckets.delete(key);
      }
    }

    for (const [key, lastFlushAt] of this.memoryLastUsedAtFlushes) {
      if (now - lastFlushAt >= trackingLastUsedAtCoalesceMs) {
        this.memoryLastUsedAtFlushes.delete(key);
      }
    }
  }

  private shouldFlushTrackingKeyLastUsedAtInMemory(trackingKeyId: string): boolean {
    const now = Date.now();
    const lastFlushAt = this.memoryLastUsedAtFlushes.get(trackingKeyId);

    if (lastFlushAt && now - lastFlushAt < trackingLastUsedAtCoalesceMs) {
      return false;
    }

    this.memoryLastUsedAtFlushes.set(trackingKeyId, now);
    return true;
  }
}

@Injectable()
export class TrackingService {
  constructor(
    private readonly database: DatabaseService,
    private readonly rateLimiter: TrackingRateLimiter
  ) {}

  async ingest(event: TrackingEvent, context: TrackingIngestContext = {}): Promise<TrackingIngestResult> {
    if (isLocalScaffoldEvent(event, localScaffoldTrackingEnabled)) {
      return TrackingIngestResultSchema.parse({
        accepted: true,
        eventName: event.eventName,
        occurredAt: event.occurredAt ?? new Date().toISOString(),
        persisted: false,
        mode: "dry_run"
      });
    }

    if (!isUuid(event.projectId)) {
      throw new BadRequestException("Persisted tracking project id must be a UUID.");
    }

    const db = this.database.db;

    if (!db) {
      throw new UnauthorizedException("Tracking persistence is required for persisted project events.");
    }

    await this.assertProjectTrackingKey(event, context);

    const occurredAt = event.occurredAt ? new Date(event.occurredAt) : new Date();
    await db.insert(trackingEvents).values({
      projectId: event.projectId,
      eventName: event.eventName,
      route: event.route,
      componentId: event.componentId,
      occurredAt,
      metadataJson: {
        pageId: event.pageId
      }
    });

    return TrackingIngestResultSchema.parse({
      accepted: true,
      eventName: event.eventName,
      occurredAt: occurredAt.toISOString(),
      persisted: true,
      mode: "persisted"
    });
  }

  async listKeys(projectId: string): Promise<{ projectId: string; keys: TrackingKeySummary[] }> {
    const db = this.database.requireDb();
    const rows = await db.select().from(projectTrackingKeys).where(eq(projectTrackingKeys.projectId, projectId));

    return {
      projectId,
      keys: rows.map((row) => mapTrackingKeySummary(row))
    };
  }

  async createKey(projectId: string, body: unknown): Promise<CreateTrackingKeyResponse> {
    const input = CreateTrackingKeyRequestSchema.parse(body ?? {});
    const db = this.database.requireDb();
    const trackingKey = createPublishableTrackingKey();
    const [row] = await db
      .insert(projectTrackingKeys)
      .values({
        projectId,
        keyHash: hashTrackingKey(trackingKey),
        allowedOrigins: uniqueOrigins(input.allowedOrigins),
        status: "active"
      })
      .returning();

    if (!row) {
      throw new Error("Failed to create tracking key");
    }

    return CreateTrackingKeyResponseSchema.parse({
      ...mapTrackingKeySummary(row),
      trackingKey
    });
  }

  async revokeKey(projectId: string, keyId: string): Promise<TrackingKeySummary> {
    if (!isUuid(keyId)) {
      throw new BadRequestException("Tracking key id must be a UUID.");
    }

    const db = this.database.requireDb();
    const [row] = await db
      .update(projectTrackingKeys)
      .set({
        status: "revoked",
        revokedAt: new Date(),
        updatedAt: new Date()
      })
      .where(and(eq(projectTrackingKeys.projectId, projectId), eq(projectTrackingKeys.id, keyId)))
      .returning();

    if (!row) {
      throw new NotFoundException("Tracking key was not found for this project.");
    }

    return mapTrackingKeySummary(row);
  }

  private async assertProjectTrackingKey(event: TrackingEvent, context: TrackingIngestContext): Promise<void> {
    if (!context.trackingKey) {
      throw new UnauthorizedException("Project tracking key is required for persisted project events.");
    }

    const db = this.database.db;

    if (!db) {
      throw new UnauthorizedException("Tracking persistence is required for persisted project events.");
    }

    const keyHash = hashTrackingKey(context.trackingKey);
    const [row] = await db
      .select({
        id: projectTrackingKeys.id,
        keyHash: projectTrackingKeys.keyHash,
        allowedOrigins: projectTrackingKeys.allowedOrigins
      })
      .from(projectTrackingKeys)
      .where(
        and(
          eq(projectTrackingKeys.projectId, event.projectId),
          eq(projectTrackingKeys.status, "active"),
          eq(projectTrackingKeys.keyHash, keyHash),
          isNull(projectTrackingKeys.revokedAt)
        )
      )
      .limit(1);

    if (!row || !timingSafeStringEqual(row.keyHash, keyHash)) {
      throw new UnauthorizedException("Project tracking key is invalid.");
    }

    const requestOrigin = originFromTrackingHeaders(context);

    if (!requestOrigin || !isTrackingOriginAllowed(requestOrigin, row.allowedOrigins)) {
      throw new UnauthorizedException("Project tracking key is not authorized for this origin.");
    }

    await this.rateLimiter.enforceAcceptedEvent({
      projectId: event.projectId,
      trackingKeyId: row.id
    });

    if (await this.rateLimiter.shouldFlushTrackingKeyLastUsedAt(row.id)) {
      await db
        .update(projectTrackingKeys)
        .set({
          lastUsedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(projectTrackingKeys.id, row.id));
    }
  }
}

@Injectable()
class TrackingRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimiter: TrackingRateLimiter) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest<{ Body: Partial<TrackingEvent> }>>();
    const projectId = typeof request.body?.projectId === "string" ? request.body.projectId : "unknown";
    await this.rateLimiter.enforcePreValidationRequest({ ip: request.ip, projectId });
    return true;
  }
}

@Controller("track")
@UseGuards(TrackingRateLimitGuard)
class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Post()
  track(
    @Body() body: unknown,
    @Headers("x-tracking-key") trackingKey: string | string[] | undefined,
    @Headers("origin") origin: string | string[] | undefined,
    @Headers("referer") referer: string | string[] | undefined
  ) {
    const event = TrackingEventSchema.parse(body);
    return this.tracking.ingest(event, {
      trackingKey: readFirstHeader(trackingKey),
      origin: readFirstHeader(origin),
      referer: readFirstHeader(referer)
    });
  }
}

@Controller("projects/:projectId/tracking-keys")
@UseGuards(BetterAuthGuard, CsrfGuard, ProjectAccessGuard, PermissionGuard)
@RequireProjectPermission("tracking:manage")
class TrackingKeysController {
  constructor(private readonly tracking: TrackingService) {}

  @Get()
  list(@Param("projectId") projectId: string) {
    return this.tracking.listKeys(projectId);
  }

  @Post()
  create(@Param("projectId") projectId: string, @Body() body: unknown) {
    return this.tracking.createKey(projectId, body);
  }

  @Post(":keyId/revoke")
  revoke(@Param("projectId") projectId: string, @Param("keyId") keyId: string) {
    return this.tracking.revokeKey(projectId, keyId);
  }
}

@Module({
  controllers: [TrackingController, TrackingKeysController],
  providers: [TrackingService, TrackingRateLimiter, TrackingRateLimitGuard]
})
export class TrackingModule {}

export function isLocalScaffoldEvent(
  event: TrackingEvent,
  localScaffoldEnabled = allowsLocalScaffoldAuth(parseAppEnv(process.env))
): boolean {
  if (!localScaffoldEnabled) {
    return false;
  }

  if (event.projectId === "demo-project") {
    return true;
  }

  if (!isUuid(event.projectId)) {
    return true;
  }

  return false;
}

function readFirstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value.find((item) => item.length > 0);
  }

  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

export function trackingRateLimitKeys(input: { ip?: string; projectId?: string; trackingKeyId?: string }): {
  ip: string;
  ipProject: string;
  project: string;
  trackingKey: string;
  trackingKeyProject: string;
} {
  const ip = input.ip ?? "unknown";
  const projectId = input.projectId ?? "unknown";
  const trackingKeyId = input.trackingKeyId ?? "unknown";

  return {
    ip: `track:ip:${ip}`,
    ipProject: `track:ip-project:${ip}:${projectId}`,
    project: `track:project:${projectId}`,
    trackingKey: `track:key:${trackingKeyId}`,
    trackingKeyProject: `track:key-project:${projectId}:${trackingKeyId}`
  };
}

function trackingRateLimitExceeded(): HttpException {
  return new HttpException("Tracking rate limit exceeded.", HttpStatus.TOO_MANY_REQUESTS);
}

function trackingRateLimitUnavailable(): HttpException {
  return new HttpException("Tracking rate limit temporarily unavailable.", HttpStatus.SERVICE_UNAVAILABLE);
}

export function hashTrackingKey(trackingKey: string): string {
  return createHash("sha256").update(trackingKey).digest("base64url");
}

export function originFromTrackingHeaders(
  context: Pick<TrackingIngestContext, "origin" | "referer">
): string | undefined {
  if (context.origin) {
    return normalizeOrigin(context.origin);
  }

  if (context.referer) {
    return normalizeOrigin(context.referer);
  }

  return undefined;
}

export function isTrackingOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  const normalizedOrigin = normalizeOrigin(origin);

  if (!normalizedOrigin || allowedOrigins.length === 0) {
    return false;
  }

  return allowedOrigins.some((allowedOrigin) => normalizeOrigin(allowedOrigin) === normalizedOrigin);
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function createPublishableTrackingKey(): string {
  return `pk_live_${randomBytes(32).toString("base64url")}`;
}

function uniqueOrigins(origins: string[]): string[] {
  return [
    ...new Set(origins.map((origin) => normalizeOrigin(origin)).filter((origin): origin is string => Boolean(origin)))
  ];
}

function normalizeOrigin(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

function mapTrackingKeySummary(row: typeof projectTrackingKeys.$inferSelect): TrackingKeySummary {
  return TrackingKeySummarySchema.parse({
    keyId: row.id,
    projectId: row.projectId,
    status: row.revokedAt || row.status !== "active" ? "revoked" : "active",
    allowedOrigins: row.allowedOrigins,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString(),
    revokedAt: row.revokedAt?.toISOString()
  });
}
