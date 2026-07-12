import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MediaAssetStoragePort, MediaStoredObjectMetadata, ObjectStoragePort } from "./index.js";

export class FileSystemObjectStorageAdapter implements ObjectStoragePort, MediaAssetStoragePort {
  constructor(private readonly rootDir: string) {}

  async putJson(input: { key: string; value: unknown }): Promise<{ key: string }> {
    const targetPath = this.pathForKey(input.key);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, `${JSON.stringify(input.value, null, 2)}\n`, "utf8");
    return { key: input.key };
  }

  async getJson(input: { key: string }): Promise<unknown> {
    const targetPath = this.pathForKey(input.key);
    return JSON.parse(await readFile(targetPath, "utf8")) as unknown;
  }

  createUploadGrant(input: {
    key: string;
    contentType: string;
    contentLength: number;
    sha256: string;
    projectId: string;
    assetId: string;
    expiresAt: Date;
    apiPutUrl?: string;
  }) {
    if (!input.apiPutUrl) {
      throw new Error("Filesystem media upload grants require an API PUT URL.");
    }

    return Promise.resolve({
      kind: "api_put" as const,
      url: input.apiPutUrl,
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(input.contentLength),
        "x-media-content-type": input.contentType,
        "x-media-sha256": input.sha256
      },
      expiresAt: input.expiresAt.toISOString()
    });
  }

  async headPrivateObject(input: { key: string }): Promise<MediaStoredObjectMetadata | undefined> {
    const targetPath = this.pathForKey(input.key);
    try {
      const [file, metadata] = await Promise.all([stat(targetPath), this.readMetadata(input.key)]);
      return {
        key: input.key,
        contentLength: file.size,
        contentType: metadata?.contentType,
        sha256: metadata?.sha256
      };
    } catch (error) {
      if (isFileNotFound(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async readPrivateObject(input: { key: string; maxBytes: number }): Promise<Uint8Array> {
    const targetPath = this.pathForKey(input.key);
    const file = await stat(targetPath);
    if (file.size > input.maxBytes) {
      throw new Error(`Media object exceeds the bounded read limit: ${input.key}`);
    }
    return readFile(targetPath);
  }

  async putPrivateObject(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
    sha256: string;
    metadata?: Record<string, string>;
  }): Promise<MediaStoredObjectMetadata> {
    const targetPath = this.pathForKey(input.key);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await Promise.all([
      writeFile(targetPath, input.body),
      writeFile(
        this.metadataPath(input.key),
        `${JSON.stringify({ contentType: input.contentType, sha256: input.sha256, ...input.metadata }, null, 2)}\n`,
        "utf8"
      )
    ]);
    return {
      key: input.key,
      contentType: input.contentType,
      contentLength: input.body.byteLength,
      sha256: input.sha256
    };
  }

  async deletePrivateObject(input: { key: string }): Promise<void> {
    await Promise.all([unlinkIfPresent(this.pathForKey(input.key)), unlinkIfPresent(this.metadataPath(input.key))]);
  }

  private async readMetadata(key: string): Promise<{ contentType?: string; sha256?: string } | undefined> {
    try {
      return JSON.parse(await readFile(this.metadataPath(key), "utf8")) as {
        contentType?: string;
        sha256?: string;
      };
    } catch (error) {
      if (isFileNotFound(error)) {
        return undefined;
      }
      throw error;
    }
  }

  private metadataPath(key: string): string {
    return `${this.pathForKey(key)}.metadata.json`;
  }

  private pathForKey(key: string): string {
    const normalizedKey = key.replaceAll("\\", "/");
    const segments = normalizedKey.split("/").filter(Boolean);

    if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
      throw new Error(`Invalid object storage key: ${key}`);
    }

    return path.join(this.rootDir, ...segments);
  }
}

function isFileNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

async function unlinkIfPresent(targetPath: string): Promise<void> {
  try {
    await unlink(targetPath);
  } catch (error) {
    if (!isFileNotFound(error)) {
      throw error;
    }
  }
}
