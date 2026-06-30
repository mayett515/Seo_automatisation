import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { ObjectStoragePort } from "./index.js";

export type S3ObjectStorageAdapterOptions = {
  bucket: string;
  region: string;
  client?: S3Client;
};

export class S3ObjectStorageAdapter implements ObjectStoragePort {
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
}
