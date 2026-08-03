import { Global, Module } from "@nestjs/common";
import {
  FileSystemObjectStorageAdapter,
  S3ObjectStorageAdapter,
  type ImmutableArtifactReaderPort,
  type MediaAssetStoragePort
} from "@localseo/adapters";
import { parseAppEnv, type AppEnv } from "@localseo/config";

const env = parseAppEnv(process.env);

export const MEDIA_ASSET_STORAGE = Symbol("MEDIA_ASSET_STORAGE");
export const IMMUTABLE_ARTIFACT_READER = Symbol("IMMUTABLE_ARTIFACT_READER");

export function createMediaAssetStorage(
  input: Pick<AppEnv, "NODE_ENV" | "S3_BUCKET" | "AWS_REGION" | "LOCAL_OBJECT_STORAGE_DIR"> = env
): MediaAssetStoragePort & ImmutableArtifactReaderPort {
  if (input.NODE_ENV === "production") {
    if (!input.S3_BUCKET) {
      throw new Error("Production media storage requires S3_BUCKET.");
    }

    return new S3ObjectStorageAdapter({
      bucket: input.S3_BUCKET,
      region: input.AWS_REGION
    });
  }

  return new FileSystemObjectStorageAdapter(input.LOCAL_OBJECT_STORAGE_DIR);
}

@Global()
@Module({
  providers: [
    {
      provide: MEDIA_ASSET_STORAGE,
      useFactory: createMediaAssetStorage
    },
    {
      provide: IMMUTABLE_ARTIFACT_READER,
      useExisting: MEDIA_ASSET_STORAGE
    }
  ],
  exports: [MEDIA_ASSET_STORAGE, IMMUTABLE_ARTIFACT_READER]
})
export class MediaStorageModule {}
