import { createHash } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import type {
  MediaAssetCleanupStoragePort,
  MediaAssetStoragePort,
  MediaPrivateObjectListing,
  MediaStoredObjectMetadata,
  ImmutableArtifactStoragePort,
  ImmutableArtifactStoredObject,
  ObjectStoragePort
} from "./index.js";

export type S3ObjectStorageAdapterOptions = {
  bucket: string;
  region: string;
  client?: S3Client;
};

export class S3ObjectStorageAdapter
  implements ObjectStoragePort, MediaAssetStoragePort, MediaAssetCleanupStoragePort, ImmutableArtifactStoragePort
{
  private readonly client: S3Client;

  constructor(private readonly options: S3ObjectStorageAdapterOptions) {
    this.client = options.client ?? new S3Client({ region: options.region });
  }

  async putJson(input: { key: string; value: unknown }): Promise<{ key: string }> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: input.key,
        Body: `${JSON.stringify(input.value, null, 2)}\n`,
        ContentType: "application/json; charset=utf-8"
      })
    );

    return { key: input.key };
  }

  async getJson(input: { key: string }): Promise<unknown> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.options.bucket,
        Key: input.key
      })
    );

    const body = await response.Body?.transformToString("utf-8");

    if (!body) {
      throw new Error(`S3 object body is empty: ${input.key}`);
    }

    return JSON.parse(body) as unknown;
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
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.options.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          ChecksumSHA256: sha256HexToBase64(input.sha256),
          IfNoneMatch: "*",
          Metadata: { ...input.metadata, sha256: input.sha256 }
        })
      );
    } catch (error) {
      if (!isS3PreconditionFailed(error)) throw error;
      const existing = await this.readImmutableArtifact({ key: input.key, maxBytes: input.body.byteLength + 1 });
      if (existing.byteLength !== input.body.byteLength || sha256Bytes(existing) !== input.sha256) {
        throw new Error(`Immutable artifact key already contains different bytes: ${input.key}`, { cause: error });
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

  async createUploadGrant(input: {
    key: string;
    contentType: string;
    contentLength: number;
    sha256: string;
    projectId: string;
    assetId: string;
    expiresAt: Date;
  }) {
    const expires = Math.max(1, Math.floor((input.expiresAt.getTime() - Date.now()) / 1000));
    const checksumSha256 = sha256HexToBase64(input.sha256);
    const fields = {
      "Content-Type": input.contentType,
      "x-amz-checksum-algorithm": "SHA256",
      "x-amz-checksum-sha256": checksumSha256,
      "x-amz-meta-sha256": input.sha256,
      "x-amz-meta-project-id": input.projectId,
      "x-amz-meta-asset-id": input.assetId
    };
    const grant = await createPresignedPost(this.client, {
      Bucket: this.options.bucket,
      Key: input.key,
      Expires: expires,
      Fields: fields,
      Conditions: [
        ["content-length-range", input.contentLength, input.contentLength],
        { "Content-Type": input.contentType },
        { "x-amz-checksum-algorithm": "SHA256" },
        { "x-amz-checksum-sha256": checksumSha256 },
        { "x-amz-meta-sha256": input.sha256 },
        { "x-amz-meta-project-id": input.projectId },
        { "x-amz-meta-asset-id": input.assetId }
      ]
    });

    return {
      kind: "presigned_post" as const,
      url: grant.url,
      fields: grant.fields,
      expiresAt: input.expiresAt.toISOString()
    };
  }

  async headPrivateObject(input: { key: string }): Promise<MediaStoredObjectMetadata | undefined> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.options.bucket,
          Key: input.key
        })
      );

      return {
        key: input.key,
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        sha256: response.Metadata?.sha256
      };
    } catch (error) {
      if (isS3NotFound(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async readPrivateObject(input: { key: string; maxBytes: number }): Promise<Uint8Array> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.options.bucket,
        Key: input.key
      })
    );

    if (typeof response.ContentLength === "number" && response.ContentLength > input.maxBytes) {
      throw new Error(`Media object exceeds the bounded read limit: ${input.key}`);
    }

    if (!response.Body) {
      throw new Error(`S3 object body is empty: ${input.key}`);
    }
    return readS3BodyBounded(response.Body, input.key, input.maxBytes);
  }

  async putPrivateObject(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
    sha256: string;
    metadata?: Record<string, string>;
  }): Promise<MediaStoredObjectMetadata> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        ChecksumSHA256: sha256HexToBase64(input.sha256),
        Metadata: {
          ...input.metadata,
          sha256: input.sha256
        }
      })
    );

    return {
      key: input.key,
      contentType: input.contentType,
      contentLength: input.body.byteLength,
      sha256: input.sha256
    };
  }

  async deletePrivateObject(input: { key: string }): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.options.bucket,
        Key: input.key
      })
    );
  }

  async listPrivateObjectKeys(input: { prefix: string; maxKeys: number }): Promise<MediaPrivateObjectListing> {
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.options.bucket,
        Prefix: input.prefix,
        MaxKeys: input.maxKeys + 1
      })
    );
    const keys = (response.Contents ?? []).flatMap((object) => (object.Key ? [object.Key] : []));

    return {
      keys: keys.slice(0, input.maxKeys),
      truncated: Boolean(response.IsTruncated) || keys.length > input.maxKeys
    };
  }
}

function sha256HexToBase64(value: string): string {
  return Buffer.from(value, "hex").toString("base64");
}

function isS3NotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return candidate.name === "NotFound" || candidate.$metadata?.httpStatusCode === 404;
}

function isS3PreconditionFailed(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return candidate.name === "PreconditionFailed" || candidate.$metadata?.httpStatusCode === 412;
}

function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function readS3BodyBounded(body: unknown, key: string, maxBytes: number): Promise<Uint8Array> {
  if (isAsyncByteIterable(body)) {
    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of body) {
      const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      total += bytes.byteLength;
      if (total > maxBytes) {
        throw new Error(`Media object exceeds the bounded read limit: ${key}`);
      }
      chunks.push(bytes);
    }
    return Buffer.concat(chunks, total);
  }

  if (hasTransformToByteArray(body)) {
    const bytes = await body.transformToByteArray();
    if (bytes.byteLength > maxBytes) {
      throw new Error(`Media object exceeds the bounded read limit: ${key}`);
    }
    return bytes;
  }

  throw new Error(`S3 object body is not readable: ${key}`);
}

function isAsyncByteIterable(value: unknown): value is AsyncIterable<Uint8Array | string> {
  return Boolean(
    value &&
    typeof value === "object" &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === "function"
  );
}

function hasTransformToByteArray(value: unknown): value is { transformToByteArray(): Promise<Uint8Array> } {
  return Boolean(
    value &&
    typeof value === "object" &&
    "transformToByteArray" in value &&
    typeof value.transformToByteArray === "function"
  );
}
