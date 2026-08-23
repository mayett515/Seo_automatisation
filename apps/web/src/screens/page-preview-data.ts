import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  CreateReleasePlanRequestSchema,
  CreateSectionCopySuggestionRequestSchema,
  EditPageVersionRequestSchema,
  MediaAssetListResponseSchema,
  PageVersionDetailSchema,
  PageVersionEditResponseSchema,
  PageVersionListResponseSchema,
  PageVersionPreviewResponseSchema,
  PageVersionReviewResponseSchema,
  ReleasePlanSchema,
  ReviewPageVersionRequestSchema,
  SectionCopySuggestionListResponseSchema,
  SectionCopySuggestionQueueResponseSchema,
  SectionCopySuggestionSchema,
  type EditPageVersionRequest,
  type PageStudioEditCommand,
  type PageVersionDetail,
  type PageVersionPreviewResponse,
  type PageVersionReviewDecision,
  type PageVersionReviewResponse,
  type PageVersionSummary,
  type ReleasePlan,
  type SectionCopySuggestion
} from "@localseo/contracts";
import { getJson, patchJson, postJson } from "../lib/api";
import { projectApiPath } from "../lib/api-path";
import { uploadProjectMediaAsset } from "../features/page-studio/media-upload";
import { latestVersionForProposal, pageVersionAncestors } from "../features/page-studio/page-studio-state";
import type {
  PageStudioAction,
  PageStudioCopySuggestionsState,
  PageStudioMediaLibraryState,
  PageStudioRemote
} from "../features/page-studio/page-studio-types";

export type PagePreviewActionResult =
  | { kind: "review_saved"; review: PageVersionReviewResponse }
  | { kind: "review_failed"; error: unknown }
  | { kind: "release_plan_created"; plan: ReleasePlan }
  | { kind: "release_plan_failed"; error: unknown };

export type PageVersionHistory = {
  state: PageStudioRemote<readonly PageVersionSummary[]>;
  latestVersion: PageVersionSummary | undefined;
  ancestorVersions: readonly PageVersionSummary[];
};

export type PageStudioData = {
  version: PageStudioRemote<PageVersionDetail>;
  preview: PageStudioRemote<PageVersionPreviewResponse>;
  versionHistory: PageVersionHistory;
  copySuggestions: PageStudioCopySuggestionsState;
  mediaLibrary: PageStudioMediaLibraryState;
  save: PageStudioAction;
  review: {
    decisionNote: string;
    isPending: boolean;
    onDecisionNoteChange: (value: string) => void;
    onReview: (decision: PageVersionReviewDecision) => void;
  };
  releasePlan: {
    plan: ReleasePlan | undefined;
    isPending: boolean;
    onCreate: () => void;
  };
  latestAction: PagePreviewActionResult | undefined;
  onApplyCopySuggestion: (suggestion: SectionCopySuggestion, props: Record<string, unknown>) => void;
  onCommand: (command: PageStudioEditCommand) => void;
  onDismissCopySuggestion: (suggestionId: string) => void;
  onRequestCopySuggestion: (sectionId: string, instruction: string) => void;
  onUploadMedia: (file: File) => void;
};

export function pageSectionNotesQueryKey(projectId: string, pageVersionId: string) {
  return ["page-section-notes", projectId, pageVersionId] as const;
}

export function normalizedText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Owns every query and mutation the page preview screen needs, grouped into
 * one discriminated object per remote concern so the screen only renders and
 * the editor only consumes the state it actually uses.
 */
export function usePageStudioData(projectId: string, pageVersionId: string): PageStudioData {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [decisionNote, setDecisionNote] = useState("");
  const [latestAction, setLatestAction] = useState<PagePreviewActionResult | undefined>();
  const [releasePlan, setReleasePlan] = useState<ReleasePlan | undefined>();

  const version = useQuery({
    queryKey: ["page-version-detail", projectId, pageVersionId],
    queryFn: () =>
      getJson(projectApiPath(projectId, `/pages/${encodeURIComponent(pageVersionId)}`), PageVersionDetailSchema),
    retry: false,
    enabled: pageVersionId.length > 0
  });
  const preview = useQuery({
    queryKey: ["page-version-preview", projectId, pageVersionId],
    queryFn: () =>
      getJson(
        projectApiPath(projectId, `/pages/${encodeURIComponent(pageVersionId)}/preview`),
        PageVersionPreviewResponseSchema
      ),
    retry: false,
    enabled: pageVersionId.length > 0
  });
  const versions = useQuery({
    queryKey: ["page-versions", projectId],
    queryFn: () => getJson(projectApiPath(projectId, "/pages"), PageVersionListResponseSchema),
    retry: false
  });
  const copySuggestionsQueryKey = ["page-section-copy-suggestions", projectId, pageVersionId] as const;
  const mediaAssetsQueryKey = ["media-assets", projectId] as const;
  const copySuggestions = useQuery({
    queryKey: copySuggestionsQueryKey,
    queryFn: () =>
      getJson(
        projectApiPath(projectId, `/pages/${encodeURIComponent(pageVersionId)}/copy-suggestions`),
        SectionCopySuggestionListResponseSchema
      ),
    retry: false,
    enabled: pageVersionId.length > 0,
    refetchInterval: (query) =>
      query.state.data?.suggestions.some(
        (suggestion) => suggestion.status === "queued" || suggestion.status === "generating"
      )
        ? 3000
        : false
  });
  const mediaAssets = useQuery({
    queryKey: mediaAssetsQueryKey,
    queryFn: () => getJson(projectApiPath(projectId, "/media/assets"), MediaAssetListResponseSchema),
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.assets.some((asset) => asset.status === "pending_upload" || asset.status === "processing")
        ? 3000
        : false
  });

  const notesQueryKey = pageSectionNotesQueryKey(projectId, pageVersionId);

  const editVersion = useMutation({
    mutationFn: (input: EditPageVersionRequest) => {
      const body = EditPageVersionRequestSchema.parse(input);
      return postJson(
        projectApiPath(projectId, `/pages/${encodeURIComponent(pageVersionId)}/edits`),
        body,
        PageVersionEditResponseSchema
      );
    },
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["page-versions", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["page-proposals", projectId] }),
        queryClient.invalidateQueries({ queryKey: copySuggestionsQueryKey })
      ]);
      await navigate({
        to: "/projects/$projectId/pages/$pageId/preview",
        params: { projectId, pageId: response.pageVersion.id }
      });
    },
    onError: async () => {
      await queryClient.invalidateQueries({ queryKey: ["page-versions", projectId] });
    }
  });
  const requestCopySuggestion = useMutation({
    mutationFn: (input: { sectionId: string; instruction?: string }) => {
      const body = CreateSectionCopySuggestionRequestSchema.parse(input);
      return postJson(
        projectApiPath(projectId, `/pages/${encodeURIComponent(pageVersionId)}/copy-suggestions`),
        body,
        SectionCopySuggestionQueueResponseSchema
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: copySuggestionsQueryKey });
    }
  });
  const dismissCopySuggestion = useMutation({
    mutationFn: (suggestionId: string) =>
      patchJson(
        projectApiPath(
          projectId,
          `/pages/${encodeURIComponent(pageVersionId)}/copy-suggestions/${encodeURIComponent(suggestionId)}/dismiss`
        ),
        {},
        SectionCopySuggestionSchema
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: copySuggestionsQueryKey });
    }
  });
  const uploadMedia = useMutation({
    mutationFn: (file: File) => uploadProjectMediaAsset(projectId, file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mediaAssetsQueryKey });
    }
  });
  const reviewVersion = useMutation({
    mutationFn: (decision: PageVersionReviewDecision) => {
      const body = ReviewPageVersionRequestSchema.parse({
        decision,
        decisionNote: normalizedText(decisionNote)
      });

      return postJson(
        projectApiPath(projectId, `/pages/${encodeURIComponent(pageVersionId)}/review`),
        body,
        PageVersionReviewResponseSchema
      );
    },
    onSuccess: async (response) => {
      setLatestAction({ kind: "review_saved", review: response });
      setDecisionNote("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["page-version-detail", projectId, pageVersionId] }),
        queryClient.invalidateQueries({ queryKey: ["page-version-preview", projectId, pageVersionId] }),
        queryClient.invalidateQueries({ queryKey: ["page-versions", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["page-proposals", projectId] }),
        queryClient.invalidateQueries({ queryKey: notesQueryKey })
      ]);
    },
    onError: (error) => {
      setLatestAction({ kind: "review_failed", error });
    }
  });
  const createReleasePlan = useMutation({
    mutationFn: () => {
      if (!version.data) {
        throw new Error("Page version details are required to prepare a release plan.");
      }

      const body = CreateReleasePlanRequestSchema.parse({
        pageVersions: [
          {
            pageVersionId,
            expected: { status: version.data.status, rowVersion: version.data.rowVersion }
          }
        ]
      });

      return postJson(projectApiPath(projectId, "/releases/plan"), body, ReleasePlanSchema);
    },
    onSuccess: (response) => {
      setLatestAction({ kind: "release_plan_created", plan: response });
      setReleasePlan(response);
    },
    onError: async (error) => {
      setLatestAction({ kind: "release_plan_failed", error });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["page-version-detail", projectId, pageVersionId] }),
        queryClient.invalidateQueries({ queryKey: ["page-versions", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["page-proposals", projectId] })
      ]);
    }
  });

  return {
    version: queryState(version),
    preview: queryState(preview),
    versionHistory: {
      state: longListState(versions, (response) => response.pageVersions),
      latestVersion:
        version.data && versions.data ? latestVersionForProposal(version.data, versions.data.pageVersions) : undefined,
      ancestorVersions:
        version.data && versions.data ? pageVersionAncestors(version.data, versions.data.pageVersions).slice(0, 20) : []
    },
    copySuggestions: {
      suggestions: longListState(copySuggestions, (response) => response.suggestions),
      action: mergeActions(actionState(requestCopySuggestion), actionState(dismissCopySuggestion))
    },
    mediaLibrary: {
      assets: longListState(mediaAssets, (response) => response.assets),
      upload: actionState(uploadMedia)
    },
    save: actionState(editVersion),
    review: {
      decisionNote,
      isPending: reviewVersion.isPending,
      onDecisionNoteChange: setDecisionNote,
      onReview: (decision) => reviewVersion.mutate(decision)
    },
    releasePlan: {
      plan: releasePlan,
      isPending: createReleasePlan.isPending,
      onCreate: () => createReleasePlan.mutate()
    },
    latestAction,
    onApplyCopySuggestion: (suggestion, sectionProps) =>
      editVersion.mutate({
        suggestionId: suggestion.id,
        command: {
          type: "update_section_props",
          sectionId: suggestion.sectionId,
          props: sectionProps
        }
      }),
    onCommand: (command) => editVersion.mutate({ command }),
    onDismissCopySuggestion: (suggestionId) => dismissCopySuggestion.mutate(suggestionId),
    onRequestCopySuggestion: (sectionId, instruction) =>
      requestCopySuggestion.mutate({ sectionId, instruction: normalizedText(instruction) }),
    onUploadMedia: (file) => uploadMedia.mutate(file)
  };
}

function queryState<T>(query: {
  isError: boolean;
  isPending: boolean;
  data: T | undefined;
  error: Error | null;
}): PageStudioRemote<T> {
  // TanStack guarantees `error` is set when `isError` and `data` is set once
  // the query is neither pending nor errored; the assertions only drop the
  // null/undefined from the library's public types.
  if (query.isError) {
    return { status: "error", error: query.error as Error };
  }
  if (query.isPending) {
    return { status: "pending" };
  }
  return { status: "success", data: query.data as T };
}

function longListState<T, TItem>(
  query: { isError: boolean; isPending: boolean; data: T | undefined; error: Error | null },
  select: (data: T) => readonly TItem[]
): PageStudioRemote<readonly TItem[]> {
  const state = queryState(query);
  if (state.status === "success") {
    return { status: "success", data: select(state.data) };
  }
  return state;
}

function actionState(action: { isPending: boolean; isError: boolean; error: Error | null }): PageStudioAction {
  // TanStack sets `pending` (idle false, not errored) during a mutation; the
  // precedence below preserves that ordering.
  if (action.isPending) {
    return { status: "pending" };
  }
  if (action.isError) {
    return { status: "error", error: action.error as Error };
  }
  return { status: "idle" };
}

function mergeActions(...actions: readonly PageStudioAction[]): PageStudioAction {
  for (const action of actions) {
    if (action.status === "pending") {
      return action;
    }
  }
  for (const action of actions) {
    if (action.status === "error") {
      return action;
    }
  }
  return { status: "idle" };
}
