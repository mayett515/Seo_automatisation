import type { MediaAssetStoragePort } from "@localseo/adapters";
import { UnauthorizedException, UnprocessableEntityException } from "@nestjs/common";
import { parseAppEnv } from "@localseo/config";
import { type PageVersionPreviewResponse } from "@localseo/contracts";
import { renderPagePreviewFile } from "@localseo/page-registry";
import { DatabaseService } from "../../database/database.service.js";
import { signPreviewCapability, verifyPreviewCapability } from "../../preview-capability.js";
import {
  loadPreviewMediaManifest,
  previewMediaManifestToRenderVariants,
  verifyPreviewMediaManifestBytes
} from "../../preview-media.js";
import { loadPageVersion, pageVersionPreviewResponse, parseStoredPageJson } from "./page-aggregate-store.js";

const env = parseAppEnv(process.env);

export class PagePreviewCapability {
  constructor(
    private readonly database: DatabaseService,
    private readonly mediaStorage: Pick<MediaAssetStoragePort, "readPrivateObject">
  ) {}

  async previewPageVersion(projectId: string, pageVersionId: string): Promise<PageVersionPreviewResponse> {
    const rendered = await this.renderPageVersionPreview(projectId, pageVersionId);
    await this.assertPreviewMediaBytes(rendered.manifest);
    return pageVersionPreviewResponse(projectId, rendered.row, rendered.file);
  }

  async preparePageVersionPreview(projectId: string, pageVersionId: string) {
    const rendered = await this.renderPageVersionPreview(projectId, pageVersionId);
    await this.assertPreviewMediaBytes(rendered.manifest);
    const response = pageVersionPreviewResponse(projectId, rendered.row, rendered.file);
    const documentToken = signPreviewCapability(
      {
        kind: "document",
        projectId,
        pageVersionId,
        manifestSha256: rendered.manifest.sha256
      },
      env.PREVIEW_CAPABILITY_SECRET
    );

    return { response, documentToken };
  }

  async previewPageVersionDocument(projectId: string, pageVersionId: string, documentToken: string | undefined) {
    const claims = documentToken
      ? verifyPreviewCapability(documentToken, env.PREVIEW_CAPABILITY_SECRET, "document")
      : undefined;
    if (!claims || claims.projectId !== projectId || claims.pageVersionId !== pageVersionId) {
      throw new UnauthorizedException("Preview document capability is invalid or expired.");
    }

    const { file, manifest } = await this.renderPageVersionPreview(projectId, pageVersionId);
    if (claims.manifestSha256 !== manifest.sha256) {
      throw new UnauthorizedException("Preview document capability no longer matches the media manifest.");
    }
    if (file.encoding !== "utf8") {
      throw new UnprocessableEntityException("Preview document must use UTF-8 encoding.");
    }

    return {
      file,
      assetToken: signPreviewCapability(
        {
          kind: "assets",
          projectId,
          pageVersionId,
          manifestSha256: manifest.sha256
        },
        env.PREVIEW_CAPABILITY_SECRET
      )
    };
  }

  private async renderPageVersionPreview(projectId: string, pageVersionId: string) {
    const row = await loadPageVersion(this.database.requireDb(), projectId, pageVersionId);
    const pageJson = parseStoredPageJson(row);

    try {
      const manifest = await loadPreviewMediaManifest(this.database.requireDb(), projectId, row.id, pageJson);
      return {
        row,
        manifest,
        file: renderPagePreviewFile({
          pageJson,
          pageVersionId: row.id,
          previewId: row.id,
          targetUrl: row.route,
          mode: "editor",
          mediaVariants: previewMediaManifestToRenderVariants(manifest)
        })
      };
    } catch (error) {
      throw new UnprocessableEntityException("Page version cannot be rendered as a preview.", { cause: error });
    }
  }

  private async assertPreviewMediaBytes(manifest: Awaited<ReturnType<typeof loadPreviewMediaManifest>>): Promise<void> {
    try {
      await verifyPreviewMediaManifestBytes(this.mediaStorage, manifest);
    } catch (error) {
      throw new UnprocessableEntityException(
        "Page version media bytes are unavailable or do not match the immutable manifest.",
        { cause: error }
      );
    }
  }
}
