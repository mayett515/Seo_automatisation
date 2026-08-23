import type { MediaAssetSummary, PageVersionSummary, SectionCopySuggestion } from "@localseo/contracts";

/**
 * A remote read in exactly one of three states: still loading, failed, or
 * resolved. Replaces parallel `isPending`/`isError` flags so a read cannot be
 * both pending and errored at once.
 */
export type PageStudioRemote<T> =
  | { status: "pending" }
  | { status: "error"; error: Error }
  | { status: "success"; data: T };

/**
 * A single user-triggered write in exactly one of idle / running / failed.
 * Successes collapse to `idle` because none of these actions surface a
 * success notice inside the editor — they invalidate and refetch instead.
 */
export type PageStudioAction = { status: "idle" } | { status: "pending" } | { status: "error"; error: Error };

export type PageStudioCopySuggestionsState = {
  suggestions: PageStudioRemote<readonly SectionCopySuggestion[]>;
  action: PageStudioAction;
};

export type PageStudioMediaLibraryState = {
  assets: PageStudioRemote<readonly MediaAssetSummary[]>;
  upload: PageStudioAction;
};

export type PageStudioVersionHistoryState = {
  state: PageStudioRemote<readonly PageVersionSummary[]>;
  latestVersion: PageVersionSummary | undefined;
};
