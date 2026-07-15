import type { DatabaseClient } from "@localseo/db";
import { loadResolvedPageVersionMediaVariants } from "@localseo/db";
import { buildPageMediaVariantPath } from "@localseo/page-registry";
import { previewMediaManifestSha256, type PreviewMediaManifestEntry } from "./preview-capability.js";

export type PreviewMediaVariant = PreviewMediaManifestEntry & {
  storageKey: string;
};

export type PreviewMediaManifest = {
  entries: PreviewMediaVariant[];
  sha256: string;
};

export async function loadPreviewMediaManifest(
  db: DatabaseClient,
  projectId: string,
  pageVersionId: string
): Promise<PreviewMediaManifest> {
  const records = await loadResolvedPageVersionMediaVariants(db, { projectId, pageVersionIds: [pageVersionId] });
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
