import { and, asc, eq, inArray } from "drizzle-orm";
import type { DatabaseClient } from "./client.js";
import { mediaAssets, mediaAssetVariants, pageProposals, pageVersionMediaAssets, pageVersions } from "./schema.js";

export type ResolvedPageVersionMediaVariantRecord = {
  pageVersionId: string;
  assetId: string;
  variantKey: string;
  storageKey: string;
  contentType: "image/webp";
  width: number;
  height: number;
  bytes: number;
  checksumSha256: string;
};

export class MediaManifestInvariantError extends Error {}

export async function loadResolvedPageVersionMediaVariants(
  db: DatabaseClient,
  input: { projectId: string; pageVersionIds: string[] }
): Promise<ResolvedPageVersionMediaVariantRecord[]> {
  const pageVersionIds = [...new Set(input.pageVersionIds)].sort();
  if (pageVersionIds.length === 0) {
    return [];
  }

  const projectedAssets = await db
    .select({
      pageVersionId: pageVersionMediaAssets.pageVersionId,
      assetId: mediaAssets.id,
      assetProjectId: mediaAssets.projectId,
      status: mediaAssets.status,
      requiredVariantKeys: mediaAssets.requiredVariantKeys
    })
    .from(pageVersionMediaAssets)
    .innerJoin(pageVersions, eq(pageVersions.id, pageVersionMediaAssets.pageVersionId))
    .innerJoin(pageProposals, eq(pageProposals.id, pageVersions.pageProposalId))
    .innerJoin(mediaAssets, eq(mediaAssets.id, pageVersionMediaAssets.mediaAssetId))
    .where(
      and(inArray(pageVersionMediaAssets.pageVersionId, pageVersionIds), eq(pageProposals.projectId, input.projectId))
    )
    .orderBy(asc(pageVersionMediaAssets.pageVersionId), asc(mediaAssets.id));

  const assetIds = [...new Set(projectedAssets.map((row) => row.assetId))];
  const variants =
    assetIds.length === 0
      ? []
      : await db
          .select()
          .from(mediaAssetVariants)
          .where(inArray(mediaAssetVariants.mediaAssetId, assetIds))
          .orderBy(asc(mediaAssetVariants.mediaAssetId), asc(mediaAssetVariants.width));
  const variantsByAsset = new Map<string, typeof variants>();
  for (const variant of variants) {
    variantsByAsset.set(variant.mediaAssetId, [...(variantsByAsset.get(variant.mediaAssetId) ?? []), variant]);
  }

  const resolved: ResolvedPageVersionMediaVariantRecord[] = [];
  for (const projected of projectedAssets) {
    if (projected.assetProjectId !== input.projectId) {
      throw new MediaManifestInvariantError("Projected media asset belongs to a different project.");
    }
    if (projected.status !== "ready" && projected.status !== "archived") {
      throw new MediaManifestInvariantError("Projected media asset is not renderable.");
    }

    const assetVariants = variantsByAsset.get(projected.assetId) ?? [];
    const expectedKeys = [...(projected.requiredVariantKeys ?? [])].sort();
    const actualKeys = assetVariants.map((variant) => variant.variantKey).sort();
    if (expectedKeys.length === 0 || JSON.stringify(expectedKeys) !== JSON.stringify(actualKeys)) {
      throw new MediaManifestInvariantError("Projected media asset does not have its exact ready variant set.");
    }

    for (const variant of assetVariants) {
      if (variant.contentType !== "image/webp") {
        throw new MediaManifestInvariantError("Projected media variant has an unsupported content type.");
      }
      resolved.push({
        pageVersionId: projected.pageVersionId,
        assetId: projected.assetId,
        variantKey: variant.variantKey,
        storageKey: variant.storageKey,
        contentType: "image/webp",
        width: variant.width,
        height: variant.height,
        bytes: variant.bytes,
        checksumSha256: variant.checksumSha256
      });
    }
  }

  return resolved;
}
