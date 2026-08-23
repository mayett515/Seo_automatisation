import { createHash } from "node:crypto";
import type { MediaAssetStoragePort } from "@localseo/adapters";
import { PageJsonSchema, type PageJson } from "@localseo/contracts";
import type { DatabaseClient } from "@localseo/db";
import {
  MediaManifestInvariantError,
  loadResolvedPageVersionMediaVariants,
  pageVersionProjectScope,
  pageProposals,
  pageVersions,
  type ResolvedPageVersionMediaVariantRecord
} from "@localseo/db";
import type { SelectablePageMediaVariantRecord } from "@localseo/db";
import {
  buildPageMediaVariantPath,
  collectPageMediaAssetIds,
  type ResolvedPageMediaVariant,
  validatePageJsonAgainstRegistry
} from "@localseo/page-registry";
import { and, eq } from "@localseo/db/query";
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
  const manifests = await loadPreviewMediaManifests(db, projectId, [{ pageVersionId, pageJson: storedPageJson }]);
  const manifest = manifests.get(pageVersionId);
  if (!manifest) {
    throw new MediaManifestInvariantError("Page version media manifest was not resolved.");
  }
  return manifest;
}

export async function loadPreviewMediaManifests(
  db: PreviewMediaReader,
  projectId: string,
  pages: readonly { pageVersionId: string; pageJson: PageJson }[]
): Promise<Map<string, PreviewMediaManifest>> {
  const records = await loadResolvedPageVersionMediaVariants(db, {
    projectId,
    pageVersions: pages.map((page) => ({
      pageVersionId: page.pageVersionId,
      assetIds: collectPageMediaAssetIds(page.pageJson)
    }))
  });
  const recordsByPageVersionId = new Map<string, ResolvedPageVersionMediaVariantRecord[]>();
  for (const page of pages) {
    recordsByPageVersionId.set(page.pageVersionId, []);
  }
  for (const record of records) {
    const pageRecords = recordsByPageVersionId.get(record.pageVersionId);
    if (pageRecords) {
      pageRecords.push(record);
    }
  }

  const manifests = new Map<string, PreviewMediaManifest>();
  for (const page of pages) {
    manifests.set(page.pageVersionId, previewManifestFromRecords(recordsByPageVersionId.get(page.pageVersionId) ?? []));
  }
  return manifests;
}

function previewManifestFromRecords(records: readonly ResolvedPageVersionMediaVariantRecord[]): PreviewMediaManifest {
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

const maxConcurrentManifestByteReads = 5;

export async function verifyPreviewMediaManifestBytes(
  storage: Pick<MediaAssetStoragePort, "readPrivateObject">,
  manifest: PreviewMediaManifest
): Promise<void> {
  await verifyPreviewMediaManifestsBytes(storage, [manifest]);
}

export async function verifyPreviewMediaManifestsBytes(
  storage: Pick<MediaAssetStoragePort, "readPrivateObject">,
  manifests: Iterable<PreviewMediaManifest>
): Promise<void> {
  const entries = [...manifests].flatMap((manifest) => manifest.entries);
  await mapWithConcurrency(entries, maxConcurrentManifestByteReads, async (entry) => {
    const body = await storage.readPrivateObject({ key: entry.storageKey, maxBytes: entry.bytes });
    if (body.byteLength !== entry.bytes || sha256Hex(body) !== entry.sha256) {
      throw new Error(`Media bytes do not match immutable manifest path '${entry.path}'.`);
    }
  });
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  limit: number,
  mapper: (value: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index] as T);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => worker()));

  return results;
}

function sha256Hex(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function loadStoredPageJson(db: PreviewMediaReader, projectId: string, pageVersionId: string): Promise<PageJson> {
  const projectScope = pageVersionProjectScope(projectId);
  const [row] = await db
    .select({ pageJson: pageVersions.pageJson })
    .from(pageVersions)
    .innerJoin(pageProposals, projectScope.joinCondition)
    .where(and(eq(pageVersions.id, pageVersionId), projectScope.projectCondition))
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
