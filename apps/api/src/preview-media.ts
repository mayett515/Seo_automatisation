import { createHash } from "node:crypto";
import type { MediaAssetStoragePort } from "@localseo/adapters";
import { PageJsonSchema, type PageJson } from "@localseo/contracts";
import type { DatabaseClient } from "@localseo/db";
import {
  MediaManifestInvariantError,
  loadResolvedPageVersionMediaVariants,
  pageProposals,
  pageVersions
} from "@localseo/db";
import type { SelectablePageMediaVariantRecord } from "@localseo/db";
import {
  buildPageMediaVariantPath,
  collectPageMediaAssetIds,
  type ResolvedPageMediaVariant,
  validatePageJsonAgainstRegistry
} from "@localseo/page-registry";
import { and, eq } from "drizzle-orm";
import { previewMediaManifestSha256, type PreviewMediaManifestEntry } from "./preview-capability.js";

export type PreviewMediaVariant = PreviewMediaManifestEntry & {
  storageKey: string;
};

export type PreviewMediaManifest = {
  entries: PreviewMediaVariant[];
  sha256: string;
};

type PreviewMediaReader = Pick<DatabaseClient, "select">;

export async function loadPreviewMediaManifest(
  db: PreviewMediaReader,
  projectId: string,
  pageVersionId: string,
  pageJson?: PageJson
): Promise<PreviewMediaManifest> {
  const storedPageJson = pageJson ?? (await loadStoredPageJson(db, projectId, pageVersionId));
  const records = await loadResolvedPageVersionMediaVariants(db, {
    projectId,
    pageVersions: [{ pageVersionId, assetIds: collectPageMediaAssetIds(storedPageJson) }]
  });
  const entries = records.map((record) => ({
    assetId: record.assetId,
    variantKey: record.variantKey,
    path: buildPageMediaVariantPath({
      assetId: record.assetId,
      sha256: record.checksumSha256,
      width: record.width
    }),
    storageKey: record.storageKey,
    contentType: record.contentType,
    width: record.width,
    height: record.height,
    bytes: record.bytes,
    sha256: record.checksumSha256
  }));

  return {
    entries,
    sha256: previewMediaManifestSha256(entries)
  };
}

export function mediaVariantRecordsToRenderVariants(
  records: readonly SelectablePageMediaVariantRecord[]
): ResolvedPageMediaVariant[] {
  return records.map((record) => ({
    assetId: record.assetId,
    variantKey: record.variantKey,
    path: buildPageMediaVariantPath({
      assetId: record.assetId,
      sha256: record.checksumSha256,
      width: record.width
    }),
    contentType: record.contentType,
    width: record.width,
    height: record.height,
    byteSize: record.bytes,
    sha256: record.checksumSha256
  }));
}

export function previewMediaManifestToRenderVariants(manifest: PreviewMediaManifest): ResolvedPageMediaVariant[] {
  return manifest.entries.map((entry) => ({
    assetId: entry.assetId,
    variantKey: entry.variantKey,
    path: entry.path,
    contentType: entry.contentType,
    width: entry.width,
    height: entry.height,
    byteSize: entry.bytes,
    sha256: entry.sha256
  }));
}

export async function verifyPreviewMediaManifestBytes(
  storage: Pick<MediaAssetStoragePort, "readPrivateObject">,
  manifest: PreviewMediaManifest
): Promise<void> {
  for (const entry of manifest.entries) {
    const body = await storage.readPrivateObject({ key: entry.storageKey, maxBytes: entry.bytes });
    if (body.byteLength !== entry.bytes || sha256Hex(body) !== entry.sha256) {
      throw new Error(`Media bytes do not match immutable manifest path '${entry.path}'.`);
    }
  }
}

function sha256Hex(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function loadStoredPageJson(db: PreviewMediaReader, projectId: string, pageVersionId: string): Promise<PageJson> {
  const [row] = await db
    .select({ pageJson: pageVersions.pageJson })
    .from(pageVersions)
    .innerJoin(pageProposals, eq(pageVersions.pageProposalId, pageProposals.id))
    .where(and(eq(pageVersions.id, pageVersionId), eq(pageProposals.projectId, projectId)))
    .limit(1);
  const parsed = PageJsonSchema.safeParse(row?.pageJson);
  if (!parsed.success) {
    throw new MediaManifestInvariantError("Page version does not contain valid PageJson for media resolution.");
  }
  const registryValidation = validatePageJsonAgainstRegistry(parsed.data);
  if (!registryValidation.success) {
    throw new MediaManifestInvariantError("Page version failed registry validation for media resolution.");
  }
  return registryValidation.pageJson;
}
