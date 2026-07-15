import { createHash, randomUUID } from "node:crypto";
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
  UseGuards,
  Module
} from "@nestjs/common";
import type { MediaAssetStoragePort } from "@localseo/adapters";
import { parseAppEnv } from "@localseo/config";
import {
  CompleteMediaUploadRequestSchema,
  CreateMediaUploadIntentRequestSchema,
  MediaAssetListResponseSchema,
  MediaAssetSummarySchema,
  MediaProcessingJobDataSchema,
  MediaUploadCompletionResponseSchema,
  MediaUploadIntentResponseSchema,
  type CreateMediaUploadIntentRequest,
  type MediaAssetListResponse,
  type MediaAssetSummary,
  type MediaProcessingQueueStatus,
  type MediaUploadCompletionResponse,
  type MediaUploadIntentResponse
} from "@localseo/contracts";
import { mediaAssets, mediaAssetVariants, type DatabaseClient } from "@localseo/db";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyReply } from "fastify";
import { BetterAuthGuard } from "../auth/guards/better-auth.guard.js";
import { PermissionGuard } from "../auth/permissions/permission.guard.js";
import { RequireProjectPermission } from "../auth/permissions/require-permission.decorator.js";
import { ProjectAccessGuard } from "../auth/project-access.guard.js";
import type { RequestWithAuth } from "../auth/types/authenticated-request.js";
import { DatabaseService } from "../database/database.service.js";
import { MEDIA_ASSET_STORAGE } from "../media-storage.module.js";
import { QueueProducerService } from "../queue-producer.js";
import { CsrfGuard } from "../security/csrf/csrf.guard.js";
import { previewAssetCookiePrefix, readCookieValuesByPrefix, verifyPreviewCapability } from "../preview-capability.js";
import { loadPreviewMediaManifest } from "../preview-media.js";

const env = parseAppEnv(process.env);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
type Db = DatabaseClient;
type MediaAssetRow = typeof mediaAssets.$inferSelect;
type MediaVariantRow = typeof mediaAssetVariants.$inferSelect;

@Injectable()
export class MediaService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(QueueProducerService) private readonly queues: QueueProducerService,
    @Inject(MEDIA_ASSET_STORAGE) private readonly storage: MediaAssetStoragePort
  ) {}

  async createUploadIntent(
    projectId: string,
    input: CreateMediaUploadIntentRequest,
    userId?: string
  ): Promise<MediaUploadIntentResponse> {
    const actorUserId = requirePersistedActor(userId);
    const db = this.database.requireDb();
    assertPersistedId(projectId, "Project id must be a UUID before media upload.");

    if (input.expectedBytes > env.MEDIA_MAX_UPLOAD_BYTES) {
      throw new BadRequestException("Media upload exceeds the configured byte limit.");
    }

    if (!this.queues.isQueueConfigured("media-processing")) {
      throw new ServiceUnavailableException(
        "Media processing is unavailable because the media-processing queue is not configured."
      );
    }

    const assetId = randomUUID();
    const sourceStorageKey = mediaQuarantineKey(projectId, assetId);
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + env.MEDIA_UPLOAD_GRANT_TTL_SECONDS * 1000);

    const row = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from projects where id = ${projectId} for update`);
      await assertMediaQuota(tx, projectId, input.expectedBytes);

      const [inserted] = await tx
        .insert(mediaAssets)
        .values({
          id: assetId,
          projectId,
          status: "pending_upload",
          displayName: input.displayName,
          claimedContentType: input.claimedContentType,
          expectedBytes: input.expectedBytes,
          expectedSha256: input.expectedSha256,
          sourceStorageKey,
          createdByUserId: actorUserId,
          createdAt,
          updatedAt: createdAt
        })
        .returning();

      if (!inserted) {
        throw new ServiceUnavailableException("Media upload intent could not be persisted.");
      }
      return inserted;
    });

    try {
      const upload = await this.storage.createUploadGrant({
        key: sourceStorageKey,
        contentType: input.claimedContentType,
        contentLength: input.expectedBytes,
        sha256: input.expectedSha256,
        projectId,
        assetId,
        expiresAt,
        apiPutUrl: `/projects/${projectId}/media/assets/${assetId}/content`
      });

      return MediaUploadIntentResponseSchema.parse({
        asset: mediaAssetToResponse(row, []),
        upload
      });
    } catch (error) {
      await db
        .update(mediaAssets)
        .set({
          status: "failed",
          failureCode: "upload_grant_failed",
          failureMessage: "A bounded upload target could not be created.",
          updatedAt: new Date()
        })
        .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.status, "pending_upload")));
      throw new ServiceUnavailableException("Media upload target could not be created.", { cause: error });
    }
  }

  async writeLocalUpload(
    projectId: string,
    assetId: string,
    body: unknown,
    headers: Record<string, string | string[] | undefined>
  ): Promise<MediaAssetSummary> {
    if (env.NODE_ENV === "production") {
      throw new NotFoundException("The local media upload transport is not available in production.");
    }
    if (!Buffer.isBuffer(body)) {
      throw new BadRequestException("Local media upload requires an application/octet-stream body.");
    }

    const db = this.database.requireDb();
    const row = await loadProjectMediaAsset(db, projectId, assetId);
    if (row.status !== "pending_upload") {
      throw new ConflictException("Only pending media upload intents accept source bytes.");
    }
    const expiresAt = row.createdAt.getTime() + env.MEDIA_UPLOAD_GRANT_TTL_SECONDS * 1000;
    if (Date.now() > expiresAt) {
      throw new ConflictException("The media upload intent has expired.");
    }

    const claimedContentType = singleHeader(headers["x-media-content-type"]);
    const claimedSha256 = singleHeader(headers["x-media-sha256"]);
    if (claimedContentType !== row.claimedContentType || claimedSha256 !== row.expectedSha256) {
      throw new UnprocessableEntityException("Media upload headers do not match the persisted upload intent.");
    }
    if (body.byteLength !== row.expectedBytes || body.byteLength > env.MEDIA_MAX_UPLOAD_BYTES) {
      throw new UnprocessableEntityException("Media upload byte length does not match the persisted upload intent.");
    }
    const observedSha256 = sha256Hex(body);
    if (observedSha256 !== row.expectedSha256) {
      throw new UnprocessableEntityException("Media upload checksum does not match the persisted upload intent.");
    }

    await this.storage.putPrivateObject({
      key: row.sourceStorageKey,
      body,
      contentType: row.claimedContentType,
      sha256: row.expectedSha256,
      metadata: { projectId, assetId }
    });

    return MediaAssetSummarySchema.parse(mediaAssetToResponse(row, []));
  }

  async completeUpload(projectId: string, assetId: string): Promise<MediaUploadCompletionResponse> {
    const db = this.database.requireDb();
    assertPersistedId(assetId, "Media asset id must be a UUID.");
    if (!this.queues.isQueueConfigured("media-processing")) {
      throw new ServiceUnavailableException(
        "Media processing is unavailable because the media-processing queue is not configured."
      );
    }

    const existing = await loadProjectMediaAsset(db, projectId, assetId);
    if (existing.status === "processing") {
      return mediaCompletionResponse(existing, [], "already_active", "Media processing is already active.");
    }
    if (existing.status !== "pending_upload") {
      throw new ConflictException("Only pending media uploads can be completed.");
    }

    const object = await this.storage.headPrivateObject({ key: existing.sourceStorageKey });
    if (!object) {
      throw new UnprocessableEntityException("The uploaded media source object was not found.");
    }
    if (
      object.contentLength !== existing.expectedBytes ||
      object.contentType !== existing.claimedContentType ||
      object.sha256 !== existing.expectedSha256
    ) {
      throw new UnprocessableEntityException("Uploaded media metadata does not match the persisted upload intent.");
    }

    const now = new Date();
    const transitioned = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from media_assets where id = ${assetId} and project_id = ${projectId} for update`);
      const [current] = await tx
        .select()
        .from(mediaAssets)
        .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.projectId, projectId)))
        .limit(1);
      if (!current) {
        throw new NotFoundException("Media asset was not found for this project.");
      }
      if (current.status === "processing") {
        return { row: current, enqueue: false };
      }
      if (current.status !== "pending_upload") {
        throw new ConflictException("Only pending media uploads can be completed.");
      }

      const [updated] = await tx
        .update(mediaAssets)
        .set({ status: "processing", updatedAt: now })
        .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.status, "pending_upload")))
        .returning();
      if (!updated) {
        throw new ConflictException("Media upload completion lost its lifecycle claim.");
      }
      return { row: updated, enqueue: true };
    });

    if (transitioned.enqueue) {
      const enqueued = await this.queues.enqueue({
        queueName: "media-processing",
        jobName: "media_processing",
        jobId: assetId,
        data: MediaProcessingJobDataSchema.parse({
          projectId,
          assetId,
          triggerSource: "media_upload_completion"
        }),
        options: {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 }
        },
        audit: {
          projectId,
          type: "media_processing",
          inputRef: assetId,
          actorType: "system",
          triggerSource: "media_upload_completion"
        }
      });
      if (!enqueued) {
        await db
          .update(mediaAssets)
          .set({
            status: "failed",
            failureCode: "queue_not_configured",
            failureMessage: "Media processing queue was unavailable after upload completion.",
            updatedAt: new Date()
          })
          .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.status, "processing")));
        throw new ServiceUnavailableException("Media processing queue was unavailable after completion.");
      }
    }

    return mediaCompletionResponse(
      transitioned.row,
      [],
      transitioned.enqueue ? "queued" : "already_active",
      transitioned.enqueue ? undefined : "Media processing is already active."
    );
  }

  async listAssets(projectId: string): Promise<MediaAssetListResponse> {
    const db = this.database.requireDb();
    const rows = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.projectId, projectId))
      .orderBy(desc(mediaAssets.createdAt))
      .limit(500);
    const variants = await loadVariantsForAssets(
      db,
      rows.map((row) => row.id)
    );

    return MediaAssetListResponseSchema.parse({
      projectId,
      assets: rows.map((row) => mediaAssetToResponse(row, variants.get(row.id) ?? []))
    });
  }

  async archiveAsset(projectId: string, assetId: string, userId?: string): Promise<MediaAssetSummary> {
    const actorUserId = requirePersistedActor(userId);
    const db = this.database.requireDb();
    const now = new Date();
    const [updated] = await db
      .update(mediaAssets)
      .set({
        status: "archived",
        archivedByUserId: actorUserId,
        archivedAt: now,
        updatedAt: now
      })
      .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.projectId, projectId), eq(mediaAssets.status, "ready")))
      .returning();
    if (!updated) {
      await loadProjectMediaAsset(db, projectId, assetId);
      throw new ConflictException("Only ready media assets can be archived.");
    }
    const variants = await loadVariantsForAssets(db, [assetId]);
    return MediaAssetSummarySchema.parse(mediaAssetToResponse(updated, variants.get(assetId) ?? []));
  }

  async readPreviewAsset(capabilityTokens: string[], assetId: string, fileName: string) {
    assertPersistedId(assetId, "Preview media asset id must be a UUID.");
    if (!/^[0-9a-f]{64}-[1-9][0-9]*\.webp$/u.test(fileName)) {
      throw new UnauthorizedException("Preview media capability does not authorize this path.");
    }
    const requestedPath = `/assets/${assetId}/${fileName}`;
    const db = this.database.requireDb();

    for (const token of capabilityTokens) {
      const claims = verifyPreviewCapability(token, env.PREVIEW_CAPABILITY_SECRET, "assets");
      if (!claims) {
        continue;
      }
      const manifest = await loadPreviewMediaManifest(db, claims.projectId, claims.pageVersionId);
      if (manifest.sha256 !== claims.manifestSha256) {
        continue;
      }
      const entry = manifest.entries.find((candidate) => candidate.path === requestedPath);
      if (!entry) {
        continue;
      }

      let body: Uint8Array;
      try {
        body = await this.storage.readPrivateObject({ key: entry.storageKey, maxBytes: entry.bytes });
      } catch {
        throw new ServiceUnavailableException("Preview media bytes are unavailable.");
      }
      if (body.byteLength !== entry.bytes || sha256Hex(body) !== entry.sha256) {
        throw new ServiceUnavailableException("Preview media bytes do not match the immutable manifest.");
      }
      return { body, contentType: entry.contentType };
    }

    throw new UnauthorizedException("Preview media capability is invalid, expired, or does not authorize this path.");
  }
}

@Controller("projects/:projectId/media")
@UseGuards(BetterAuthGuard, CsrfGuard, ProjectAccessGuard, PermissionGuard)
@RequireProjectPermission("project:read")
class MediaController {
  constructor(@Inject(MediaService) private readonly media: MediaService) {}

  @Get("assets")
  listAssets(@Param("projectId") projectId: string) {
    return this.media.listAssets(projectId);
  }

  @Post("upload-intents")
  @RequireProjectPermission("media:write")
  createUploadIntent(@Param("projectId") projectId: string, @Body() body: unknown, @Req() request: RequestWithAuth) {
    const parsed = CreateMediaUploadIntentRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException("Media upload intent requires bounded image metadata and SHA-256.");
    }
    return this.media.createUploadIntent(projectId, parsed.data, persistedActorUserId(request));
  }

  @Put("assets/:assetId/content")
  @RequireProjectPermission("media:write")
  uploadLocalContent(
    @Param("projectId") projectId: string,
    @Param("assetId") assetId: string,
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>
  ) {
    return this.media.writeLocalUpload(projectId, assetId, body, headers);
  }

  @Post("assets/:assetId/complete")
  @RequireProjectPermission("media:write")
  completeUpload(@Param("projectId") projectId: string, @Param("assetId") assetId: string, @Body() body: unknown) {
    const parsed = CompleteMediaUploadRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException("Media upload completion does not accept mutable metadata.");
    }
    return this.media.completeUpload(projectId, assetId);
  }

  @Patch("assets/:assetId/archive")
  @RequireProjectPermission("media:write")
  archiveAsset(
    @Param("projectId") projectId: string,
    @Param("assetId") assetId: string,
    @Req() request: RequestWithAuth
  ) {
    return this.media.archiveAsset(projectId, assetId, persistedActorUserId(request));
  }
}

@Controller("assets")
class PreviewMediaAssetController {
  constructor(@Inject(MediaService) private readonly media: MediaService) {}

  @Get(":assetId/:fileName")
  async get(
    @Param("assetId") assetId: string,
    @Param("fileName") fileName: string,
    @Headers("cookie") cookieHeader: string | undefined,
    @Res() reply: FastifyReply
  ) {
    const asset = await this.media.readPreviewAsset(
      readCookieValuesByPrefix(cookieHeader, previewAssetCookiePrefix),
      assetId,
      fileName
    );
    reply.header("content-type", asset.contentType);
    reply.header("content-length", asset.body.byteLength);
    reply.header("cache-control", "private, no-store");
    reply.header("x-content-type-options", "nosniff");
    return reply.send(Buffer.from(asset.body));
  }
}

@Module({
  controllers: [MediaController, PreviewMediaAssetController],
  providers: [MediaService]
})
export class MediaModule {}

async function assertMediaQuota(
  db: Pick<Db, "select">,
  projectId: string,
  incomingExpectedBytes: number
): Promise<void> {
  const [counts] = await db
    .select({
      unresolved: sql<number>`count(*) filter (where ${mediaAssets.status} in ('pending_upload', 'processing'))::int`,
      retained: sql<number>`count(*) filter (where ${mediaAssets.status} in ('ready', 'archived'))::int`,
      reservedDerivativeBytes: sql<number>`coalesce(sum(${mediaAssets.expectedBytes} * 4) filter (where ${mediaAssets.status} in ('pending_upload', 'processing')), 0)::bigint`
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.projectId, projectId));
  if ((counts?.unresolved ?? 0) >= env.MEDIA_MAX_UNRESOLVED_ASSETS) {
    throw new ConflictException("The project has reached its unresolved media upload limit.");
  }
  if ((counts?.retained ?? 0) >= env.MEDIA_MAX_RETAINED_ASSETS) {
    throw new ConflictException("The project has reached its retained media asset limit.");
  }

  const [storage] = await db
    .select({ total: sql<number>`coalesce(sum(${mediaAssetVariants.bytes}), 0)::bigint` })
    .from(mediaAssetVariants)
    .innerJoin(mediaAssets, eq(mediaAssetVariants.mediaAssetId, mediaAssets.id))
    .where(eq(mediaAssets.projectId, projectId));
  const projectedTotal =
    Number(storage?.total ?? 0) + Number(counts?.reservedDerivativeBytes ?? 0) + incomingExpectedBytes * 4;
  if (projectedTotal > env.MEDIA_MAX_DERIVATIVE_BYTES) {
    throw new ConflictException("The project has reached its normalized media storage limit.");
  }
}

async function loadProjectMediaAsset(db: Db, projectId: string, assetId: string): Promise<MediaAssetRow> {
  assertPersistedId(assetId, "Media asset id must be a UUID.");
  const [row] = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.projectId, projectId)))
    .limit(1);
  if (!row) {
    throw new NotFoundException("Media asset was not found for this project.");
  }
  return row;
}

async function loadVariantsForAssets(db: Db, assetIds: string[]): Promise<Map<string, MediaVariantRow[]>> {
  if (assetIds.length === 0) {
    return new Map();
  }
  const rows = await db
    .select()
    .from(mediaAssetVariants)
    .where(inArray(mediaAssetVariants.mediaAssetId, assetIds))
    .orderBy(asc(mediaAssetVariants.width));
  const result = new Map<string, MediaVariantRow[]>();
  for (const row of rows) {
    result.set(row.mediaAssetId, [...(result.get(row.mediaAssetId) ?? []), row]);
  }
  return result;
}

function mediaAssetToResponse(row: MediaAssetRow, variants: MediaVariantRow[]): MediaAssetSummary {
  return MediaAssetSummarySchema.parse({
    id: row.id,
    projectId: row.projectId,
    status: row.status,
    displayName: row.displayName,
    claimedContentType: row.claimedContentType,
    expectedBytes: row.expectedBytes,
    expectedSha256: row.expectedSha256,
    detectedContentType: row.detectedContentType ?? undefined,
    sourceBytes: row.sourceBytes ?? undefined,
    checksumSha256: row.checksumSha256 ?? undefined,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    processorVersion: row.processorVersion ?? undefined,
    variants: variants.map((variant) => ({
      variantKey: variant.variantKey,
      width: variant.width,
      height: variant.height,
      contentType: "image/webp" as const,
      byteSize: variant.bytes,
      sha256: variant.checksumSha256
    })),
    failureCode: row.failureCode ?? undefined,
    failureMessage: row.failureMessage ?? undefined,
    createdByUserId: row.createdByUserId,
    archivedByUserId: row.archivedByUserId ?? undefined,
    readyAt: row.processedAt?.toISOString(),
    archivedAt: row.archivedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  });
}

function mediaCompletionResponse(
  row: MediaAssetRow,
  variants: MediaVariantRow[],
  status: MediaProcessingQueueStatus,
  message?: string
): MediaUploadCompletionResponse {
  return MediaUploadCompletionResponseSchema.parse({
    asset: mediaAssetToResponse(row, variants),
    processing: {
      jobId: row.id,
      projectId: row.projectId,
      type: "media_processing",
      status,
      inputRef: row.id,
      message,
      createdAt: row.updatedAt.toISOString()
    }
  });
}

function mediaQuarantineKey(projectId: string, assetId: string): string {
  return `media/quarantine/${projectId}/${assetId}/source`;
}

function requirePersistedActor(userId: string | undefined): string {
  if (!userId || !uuidPattern.test(userId)) {
    throw new BadRequestException("Media mutations require a persisted user actor.");
  }
  return userId;
}

function assertPersistedId(value: string, message: string): void {
  if (!uuidPattern.test(value)) {
    throw new BadRequestException(message);
  }
}

function persistedActorUserId(request: RequestWithAuth): string | undefined {
  const userId = request.auth?.user.id;
  return userId && uuidPattern.test(userId) ? userId : undefined;
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function sha256Hex(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
