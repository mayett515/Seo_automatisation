export function mediaQuarantineStorageKey(projectId: string, assetId: string): string {
  return `media/quarantine/${projectId}/${assetId}/source`;
}

export function mediaDerivativeStoragePrefix(projectId: string, assetId: string): string {
  return `media/ready/${projectId}/${assetId}/`;
}

export function mediaDerivativeStorageKey(input: {
  projectId: string;
  assetId: string;
  processorVersion: string;
  sourceSha256: string;
  width: number;
}): string {
  return `${mediaDerivativeStoragePrefix(input.projectId, input.assetId)}${input.processorVersion}/${input.sourceSha256}-w${input.width}.webp`;
}
