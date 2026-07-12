import { createHash } from "node:crypto";
import type { MediaAssetStoragePort } from "@localseo/adapters";
import {
  MediaProcessingJobDataSchema,
  type MediaProcessingJobData,
  type MediaUploadContentType
} from "@localseo/contracts";
import { mediaAssets, mediaAssetVariants } from "@localseo/db";
import type { Job } from "bullmq";
import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import type { WorkerDb, WorkerDbHandle } from "../job-run.js";

const maxSourceBytes = 10 * 1024 * 1024;
const maxInputPixels = 40_000_000;
const maxInputDimension = 16_384;
const derivativeWidths = [640, 960, 1440, 1920] as const;
export const mediaProcessorVersion = "sharp-webp-v1-q82-e4";

type MediaAssetRow = typeof mediaAssets.$inferSelect;

export type ProcessedMediaVariant = {
  variantKey: string;
  storageKey: string;
  contentType: "image/webp";
  width: number;
  height: number;
  bytes: number;
  checksumSha256: string;
};

export type MediaProcessingRepository = {
  loadAsset(data: MediaProcessingJobData): Promise<MediaAssetRow | undefined>;
  persistReady(input: {
    data: MediaProcessingJobData;
    detectedContentType: MediaUploadContentType;
    sourceBytes: number;
    sourceWidth: number;
    sourceHeight: number;
    checksumSha256: string;
    processorVersion: string;
    variants: ProcessedMediaVariant[];
  }): Promise<void>;
  markFailed(input: { data: MediaProcessingJobData; failureCode: string; failureMessage: string }): Promise<void>;
};

export class MediaProcessingConfigurationError extends Error {}
export class MediaProcessingEvidenceError extends Error {
  constructor(
    message: string,
    readonly failureCode: string
  ) {
    super(message);
  }
}

export async function handleMediaProcessingJob(
  job: Job,
  dbHandle: WorkerDbHandle | undefined,
  storage: MediaAssetStoragePort
): Promise<Record<string, unknown>> {
  const data = parseMediaProcessingJobData(job.data);
  if (!dbHandle) {
    throw new MediaProcessingConfigurationError("DATABASE_URL is required for media processing jobs");
  }
  return executeMediaProcessing({
    data,
    repository: createDrizzleMediaProcessingRepository(dbHandle.db),
    storage
  });
}

export async function executeMediaProcessing(input: {
  data: MediaProcessingJobData;
  repository: MediaProcessingRepository;
  storage: MediaAssetStoragePort;
}): Promise<Record<string, unknown>> {
  const asset = await input.repository.loadAsset(input.data);
  if (!asset) {
    throw new MediaProcessingEvidenceError(`Media asset ${input.data.assetId} was not found.`, "asset_not_found");
  }
  if (asset.status === "ready" || asset.status === "archived") {
    return { status: "already_ready", assetId: asset.id };
  }
  if (asset.status !== "processing") {
    throw new MediaProcessingEvidenceError(
      `Media asset ${asset.id} is not in processing state.`,
      "invalid_asset_status"
    );
  }

  try {
    const sourceObject = await input.storage.headPrivateObject({ key: asset.sourceStorageKey });
    if (!sourceObject) {
      throw new MediaProcessingEvidenceError("Media source object is missing.", "source_missing");
    }
    if (sourceObject.contentLength !== asset.expectedBytes || sourceObject.contentLength > maxSourceBytes) {
      throw new MediaProcessingEvidenceError(
        "Media source byte length does not match the upload intent.",
        "size_mismatch"
      );
    }

    const source = await input.storage.readPrivateObject({
      key: asset.sourceStorageKey,
      maxBytes: maxSourceBytes
    });
    if (source.byteLength !== asset.expectedBytes) {
      throw new MediaProcessingEvidenceError("Media source byte length changed before processing.", "size_mismatch");
    }
    const sourceSha256 = sha256Hex(source);
    if (sourceSha256 !== asset.expectedSha256) {
      throw new MediaProcessingEvidenceError(
        "Media source checksum does not match the upload intent.",
        "checksum_mismatch"
      );
    }

    const metadata = await readBoundedMetadata(source);
    const detectedContentType = contentTypeFromSharpFormat(metadata.format);
    if (!detectedContentType) {
      throw new MediaProcessingEvidenceError("Media source type is not supported.", "unsupported_type");
    }
    if ((metadata.pages ?? 1) !== 1) {
      throw new MediaProcessingEvidenceError("Animated or multi-page media is not supported.", "animation_rejected");
    }
    if (!metadata.width || !metadata.height) {
      throw new MediaProcessingEvidenceError("Media source dimensions could not be detected.", "invalid_image");
    }
    if (metadata.width * metadata.height > maxInputPixels) {
      throw new MediaProcessingEvidenceError("Media source exceeds the pixel limit.", "pixel_limit");
    }
    if (metadata.width > maxInputDimension || metadata.height > maxInputDimension) {
      throw new MediaProcessingEvidenceError("Media source exceeds the dimension limit.", "dimension_limit");
    }

    const { width: sourceWidth, height: sourceHeight } = orientedDimensions(
      metadata.width,
      metadata.height,
      metadata.orientation
    );
    const widths = requiredWidths(sourceWidth);
    const variants: ProcessedMediaVariant[] = [];

    for (const width of widths) {
      const output = await renderMediaVariant(source, width);
      const variantKey = `w${output.info.width}_webp`;
      const checksumSha256 = sha256Hex(output.data);
      const storageKey = mediaDerivativeKey(input.data.projectId, input.data.assetId, sourceSha256, output.info.width);
      await input.storage.putPrivateObject({
        key: storageKey,
        body: output.data,
        contentType: "image/webp",
        sha256: checksumSha256,
        metadata: {
          projectId: input.data.projectId,
          assetId: input.data.assetId,
          processorVersion: mediaProcessorVersion,
          variantKey
        }
      });
      variants.push({
        variantKey,
        storageKey,
        contentType: "image/webp",
        width: output.info.width,
        height: output.info.height,
        bytes: output.data.byteLength,
        checksumSha256
      });
    }

    await input.repository.persistReady({
      data: input.data,
      detectedContentType,
      sourceBytes: source.byteLength,
      sourceWidth,
      sourceHeight,
      checksumSha256: sourceSha256,
      processorVersion: mediaProcessorVersion,
      variants
    });

    return {
      status: "ready",
      assetId: input.data.assetId,
      variantCount: variants.length,
      processorVersion: mediaProcessorVersion
    };
  } catch (error) {
    const evidenceError = normalizeMediaEvidenceError(error);
    if (evidenceError) {
      await input.repository.markFailed({
        data: input.data,
        failureCode: evidenceError.failureCode,
        failureMessage: evidenceError.message
      });
      throw evidenceError;
    }
    throw error;
  }
}

export function parseMediaProcessingJobData(value: unknown): MediaProcessingJobData {
  const parsed = MediaProcessingJobDataSchema.safeParse(value);
  if (!parsed.success) {
    throw new MediaProcessingEvidenceError("Media processing jobs require projectId and assetId.", "invalid_job");
  }
  return parsed.data;
}

export function createDrizzleMediaProcessingRepository(db: WorkerDb): MediaProcessingRepository {
  return {
    async loadAsset(data) {
      const [row] = await db
        .select()
        .from(mediaAssets)
        .where(and(eq(mediaAssets.id, data.assetId), eq(mediaAssets.projectId, data.projectId)))
        .limit(1);
      return row;
    },

    async persistReady(input) {
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`select id from media_assets where id = ${input.data.assetId} and project_id = ${input.data.projectId} for update`
        );
        const [current] = await tx
          .select({ status: mediaAssets.status })
          .from(mediaAssets)
          .where(and(eq(mediaAssets.id, input.data.assetId), eq(mediaAssets.projectId, input.data.projectId)))
          .limit(1);
        if (current?.status === "ready" || current?.status === "archived") {
          return;
        }
        if (current?.status !== "processing") {
          throw new MediaProcessingEvidenceError(
            `Media asset ${input.data.assetId} lost its processing claim.`,
            "invalid_asset_status"
          );
        }

        const now = new Date();
        for (const variant of input.variants) {
          await tx
            .insert(mediaAssetVariants)
            .values({
              mediaAssetId: input.data.assetId,
              ...variant,
              updatedAt: now
            })
            .onConflictDoUpdate({
              target: [mediaAssetVariants.mediaAssetId, mediaAssetVariants.variantKey],
              set: {
                storageKey: variant.storageKey,
                contentType: variant.contentType,
                width: variant.width,
                height: variant.height,
                bytes: variant.bytes,
                checksumSha256: variant.checksumSha256,
                updatedAt: now
              }
            });
        }

        const [updated] = await tx
          .update(mediaAssets)
          .set({
            status: "ready",
            detectedContentType: input.detectedContentType,
            sourceBytes: input.sourceBytes,
            width: input.sourceWidth,
            height: input.sourceHeight,
            checksumSha256: input.checksumSha256,
            processorVersion: input.processorVersion,
            requiredVariantKeys: input.variants.map((variant) => variant.variantKey).sort(),
            failureCode: null,
            failureMessage: null,
            processedAt: now,
            updatedAt: now
          })
          .where(
            and(
              eq(mediaAssets.id, input.data.assetId),
              eq(mediaAssets.projectId, input.data.projectId),
              eq(mediaAssets.status, "processing")
            )
          )
          .returning({ id: mediaAssets.id });
        if (!updated) {
          throw new MediaProcessingEvidenceError(
            `Media asset ${input.data.assetId} could not be marked ready.`,
            "invalid_asset_status"
          );
        }
      });
    },

    async markFailed(input) {
      await db
        .update(mediaAssets)
        .set({
          status: "failed",
          failureCode: input.failureCode,
          failureMessage: input.failureMessage.slice(0, 500),
          updatedAt: new Date()
        })
        .where(
          and(
            eq(mediaAssets.id, input.data.assetId),
            eq(mediaAssets.projectId, input.data.projectId),
            eq(mediaAssets.status, "processing")
          )
        );
    }
  };
}

async function readBoundedMetadata(source: Uint8Array): Promise<sharp.Metadata> {
  try {
    return await sharp(source, { limitInputPixels: maxInputPixels, animated: true, failOn: "error" }).metadata();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image decoder rejected the media source.";
    if (/pixel limit|input image exceeds pixel limit/iu.test(message)) {
      throw new MediaProcessingEvidenceError("Media source exceeds the pixel limit.", "pixel_limit");
    }
    throw new MediaProcessingEvidenceError("Media source could not be decoded.", "invalid_image");
  }
}

async function renderMediaVariant(source: Uint8Array, width: number) {
  try {
    return await sharp(source, { limitInputPixels: maxInputPixels, animated: false, failOn: "error" })
      .rotate()
      .toColourspace("srgb")
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 82, effort: 4, smartSubsample: true })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new MediaProcessingEvidenceError("Media derivative processing failed.", "processing_failure");
  }
}

function contentTypeFromSharpFormat(format: string | undefined): MediaUploadContentType | undefined {
  switch (format) {
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return undefined;
  }
}

function orientedDimensions(width: number, height: number, orientation: number | undefined) {
  return orientation && orientation >= 5 && orientation <= 8 ? { width: height, height: width } : { width, height };
}

export function requiredWidths(sourceWidth: number): number[] {
  const filtered = derivativeWidths.filter((width) => width <= sourceWidth);
  return filtered.length > 0 ? [...filtered] : [sourceWidth];
}

function mediaDerivativeKey(projectId: string, assetId: string, checksum: string, width: number): string {
  return `media/ready/${projectId}/${assetId}/${mediaProcessorVersion}/${checksum}-w${width}.webp`;
}

function sha256Hex(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeMediaEvidenceError(error: unknown): MediaProcessingEvidenceError | undefined {
  if (error instanceof MediaProcessingEvidenceError) {
    return error;
  }
  if (
    error &&
    typeof error === "object" &&
    "name" in error &&
    error.name === "InputBufferContainsUnsupportedImageFormat"
  ) {
    return new MediaProcessingEvidenceError("Media source could not be decoded.", "invalid_image");
  }
  return undefined;
}
