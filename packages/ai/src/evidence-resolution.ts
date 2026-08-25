import type { EvidenceSourceType } from "@localseo/contracts";

export type ResolvableEvidenceRef = {
  sourceType: EvidenceSourceType;
  sourceId: string;
  rank?: number;
  query?: string;
  pageUrl?: string;
};

export function evidenceResolutionKey(sourceType: EvidenceSourceType, sourceId: string): string {
  return `${sourceType}:${sourceId}`;
}

export function normalizeRoute(route: string): string {
  const normalized = route.trim().toLowerCase();
  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.slice(0, -1);
  }
  return normalized;
}
