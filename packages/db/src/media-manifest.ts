import { and, asc, eq, inArray, sql } from "drizzle-orm";
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

export type SelectablePageMediaVariantRecord = Omit<ResolvedPageVersionMediaVariantRecord, "pageVersionId">;

export class MediaManifestInvariantError extends Error {}

export class MediaAssetSelectionError extends Error {}

export type PageVersionMediaReferenceSet = {
  pageVersionId: string;
  assetIds: readonly string[];
};

type MediaManifestReader = Pick<DatabaseClient, "select">;
type MediaManifestWriter = Pick<DatabaseClient, "execute" | "insert" | "select">;

export async function persistPageVersionMediaAssetProjection(
  db: MediaManifestWriter,
  input: {
    projectId: string;
    pageVersionId: string;
    assetIds: readonly string[];
    inheritedAssetIds?: readonly string[];
  }
): Promise<void> {
  const assetIds = [...new Set(input.assetIds)].sort();
  if (assetIds.length === 0) {
    return;
  }

  await loadSelectablePageMediaVariants(db, {
    projectId: input.projectId,
    assetIds,
    inheritedAssetIds: input.inheritedAssetIds
  });

  await db.insert(pageVersionMediaAssets).values(
    assetIds.map((mediaAssetId) => ({
      pageVersionId: input.pageVersionId,
      mediaAssetId
    }))
  );
}

export async function loadSelectablePageMediaVariants(
  db: MediaManifestWriter,
  input: {
    projectId: string;
    assetIds: readonly string[];
    inheritedAssetIds?: readonly string[];
  }
): Promise<SelectablePageMediaVariantRecord[]> {
  const assetIds = [...new Set(input.assetIds)].sort();
  if (assetIds.length === 0) {
    return [];
  }

  for (const assetId of assetIds) {
    await db.execute(sql`
      SELECT "id"
      FROM "media_assets"
      WHERE "id" = ${assetId}
        AND "project_id" = ${input.projectId}
      FOR UPDATE
    `);
  }

  const rows = await db
    .select({ id: mediaAssets.id, status: mediaAssets.status, requiredVariantKeys: mediaAssets.requiredVariantKeys })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.projectId, input.projectId), inArray(mediaAssets.id, assetIds)))
    .orderBy(asc(mediaAssets.id));
  if (rows.length !== assetIds.length) {
    throw new MediaAssetSelectionError("Every PageJson media reference must belong to the page project.");
  }

  const inheritedAssetIds = new Set(input.inheritedAssetIds ?? []);
  const unavailable = rows.find(
    (row) => row.status !== "ready" && !(row.status === "archived" && inheritedAssetIds.has(row.id))
  );
  if (unavailable) {
    throw new MediaAssetSelectionError(
      "New PageJson media selections require ready assets; archived assets may only be retained from the base version."
    );
  }

  const variants = await db
    .select()
    .from(mediaAssetVariants)
    .where(inArray(mediaAssetVariants.mediaAssetId, assetIds))
    .orderBy(asc(mediaAssetVariants.mediaAssetId), asc(mediaAssetVariants.width));
  const variantsByAsset = new Map<string, typeof variants>();
  for (const variant of variants) {
    variantsByAsset.set(variant.mediaAssetId, [...(variantsByAsset.get(variant.mediaAssetId) ?? []), variant]);
  }

  const result: SelectablePageMediaVariantRecord[] = [];
  for (const row of rows) {
    const assetVariants = variantsByAsset.get(row.id) ?? [];
    const expectedKeys = [...(row.requiredVariantKeys ?? [])].sort();
    const actualKeys = assetVariants.map((variant) => variant.variantKey).sort();
    if (expectedKeys.length === 0 || JSON.stringify(expectedKeys) !== JSON.stringify(actualKeys)) {
      throw new MediaAssetSelectionError("Selected media asset does not have its exact ready variant set.");
    }

    for (const variant of assetVariants) {
      if (variant.contentType !== "image/webp") {
        throw new MediaAssetSelectionError("Selected media asset has an unsupported derivative content type.");
      }
      result.push({
        assetId: row.id,
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

  return result;
}

export async function loadResolvedPageVersionMediaVariants(
  db: MediaManifestReader,
  input: { projectId: string; pageVersions: readonly PageVersionMediaReferenceSet[] }
): Promise<ResolvedPageVersionMediaVariantRecord[]> {
  const referenceSets = new Map(
    input.pageVersions.map((pageVersion) => [pageVersion.pageVersionId, [...new Set(pageVersion.assetIds)].sort()])
  );
  const pageVersionIds = [...referenceSets.keys()].sort();
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

  const projectedIdsByVersion = new Map<string, string[]>();
  for (const projected of projectedAssets) {
    projectedIdsByVersion.set(projected.pageVersionId, [
      ...(projectedIdsByVersion.get(projected.pageVersionId) ?? []),
      projected.assetId
    ]);
  }
  for (const pageVersionId of pageVersionIds) {
    const expected = referenceSets.get(pageVersionId) ?? [];
    const projected = [...new Set(projectedIdsByVersion.get(pageVersionId) ?? [])].sort();
    if (JSON.stringify(expected) !== JSON.stringify(projected)) {
      throw new MediaManifestInvariantError(
        "PageJson media references do not exactly match the page-version media projection."
      );
    }
  }

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
