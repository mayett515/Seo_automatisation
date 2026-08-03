import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  MediaAssetCleanupStoragePort,
  MediaAssetStoragePort,
  MediaPrivateObjectListing,
  MediaStoredObjectMetadata,
  ImmutableArtifactStoragePort,
  ImmutableArtifactStoredObject,
  ObjectStoragePort
} from "./index.js";

export class FileSystemObjectStorageAdapter
  implements ObjectStoragePort, MediaAssetStoragePort, MediaAssetCleanupStoragePort, ImmutableArtifactStoragePort
{
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

  async putImmutableArtifact(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
    sha256: string;
    metadata?: Record<string, string>;
  }): Promise<ImmutableArtifactStoredObject> {
    if (sha256Bytes(input.body) !== input.sha256) {
      throw new Error(`Immutable artifact checksum does not match its bytes: ${input.key}`);
    }
    const targetPath = this.pathForKey(input.key);
    await mkdir(path.dirname(targetPath), { recursive: true });
    try {
      await writeFile(targetPath, input.body, { flag: "wx" });
    } catch (error) {
      if (!isFileExists(error)) throw error;
      const existing = await readFile(targetPath);
      if (sha256Bytes(existing) !== input.sha256 || !Buffer.from(existing).equals(Buffer.from(input.body))) {
        throw new Error(`Immutable artifact key already contains different bytes: ${input.key}`, { cause: error });
      }
    }

    const metadata = { ...input.metadata, contentType: input.contentType, sha256: input.sha256 };
    try {
      await writeFile(this.metadataPath(input.key), `${JSON.stringify(metadata, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx"
      });
    } catch (error) {
      if (!isFileExists(error)) throw error;
      const existing = await this.readMetadata(input.key);
      if (!sameStringRecord(existing, metadata)) {
        throw new Error(`Immutable artifact key already contains different metadata: ${input.key}`, { cause: error });
      }
    }

    return {
      key: input.key,
      contentType: input.contentType,
      contentLength: input.body.byteLength,
      sha256: input.sha256
    };
  }

  async readImmutableArtifact(input: { key: string; maxBytes: number }): Promise<Uint8Array> {
    return this.readPrivateObject(input);
  }

  async headImmutableArtifact(input: { key: string }): Promise<ImmutableArtifactStoredObject | undefined> {
    const metadata = await this.headPrivateObject(input);
    if (metadata?.contentLength === undefined || !metadata.sha256) return undefined;
    return { ...metadata, contentLength: metadata.contentLength, sha256: metadata.sha256 };
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

  async listPrivateObjectKeys(input: { prefix: string; maxKeys: number }): Promise<MediaPrivateObjectListing> {
    const prefixPath = this.pathForKey(input.prefix);
    const keys: string[] = [];

    await visitFiles(prefixPath, (targetPath) => {
      if (targetPath.endsWith(".metadata.json")) {
        return true;
      }

      keys.push(path.relative(this.rootDir, targetPath).replaceAll("\\", "/"));
      return keys.length <= input.maxKeys;
    });

    return {
      keys: keys.slice(0, input.maxKeys).sort(),
      truncated: keys.length > input.maxKeys
    };
  }

  private async readMetadata(key: string): Promise<Record<string, string> | undefined> {
    try {
      return JSON.parse(await readFile(this.metadataPath(key), "utf8")) as Record<string, string>;
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

function sameStringRecord(left: Record<string, string> | undefined, right: Record<string, string>): boolean {
  if (!left) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key])
  );
}

function isFileNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

function isFileExists(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "EEXIST");
}

function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
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

async function visitFiles(
  targetPath: string,
  visit: (filePath: string) => boolean | Promise<boolean>
): Promise<boolean> {
  let entries;
  try {
    entries = await readdir(targetPath, { withFileTypes: true });
  } catch (error) {
    if (isFileNotFound(error)) {
      return true;
    }
    throw error;
  }

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      if (!(await visitFiles(entryPath, visit))) {
        return false;
      }
      continue;
    }

    if (entry.isFile() && !(await visit(entryPath))) {
      return false;
    }
  }

  return true;
}
