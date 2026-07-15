import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { StatusPill } from "@localseo/ui";
import {
  PageProposalListResponseSchema,
  PageSectionNoteListResponseSchema,
  PageSectionNoteSchema,
  SectionCopySuggestionListResponseSchema,
  SectionCopySuggestionQueueResponseSchema,
  SectionCopySuggestionSchema,
  PageVersionDetailSchema,
  PageVersionListResponseSchema,
  PageVersionPreviewResponseSchema,
  PageVersionReviewResponseSchema,
  ReleasePlanSchema,
  ReviewPageVersionRequestSchema,
  CreatePageSectionNoteRequestSchema,
  CreateSectionCopySuggestionRequestSchema,
  CreateReleasePlanRequestSchema,
  EditPageVersionRequestSchema,
  MediaAssetListResponseSchema,
  PageVersionEditResponseSchema,
  pageSectionNoteInstructionTypes,
  type PageProposalSummary,
  type PageSectionNote,
  type PageSectionNoteInstructionType,
  type PageStudioEditCommand,
  type EditPageVersionRequest,
  type SectionCopySuggestion,
  type PageVersionDetail,
  type PageVersionReviewDecision,
  type PageVersionReviewResponse,
  type PageVersionSummary,
  type ReleasePlan
} from "@localseo/contracts";
import { apiResourceUrl, getJson, patchJson, postJson } from "../lib/api";
import { PageStudioEditor } from "../features/page-studio/page-studio-editor";
import { uploadProjectMediaAsset } from "../features/page-studio/media-upload";
import { latestVersionForProposal, pageVersionAncestors } from "../features/page-studio/page-studio-state";
import { ReleaseLifecyclePanel } from "./release-detail";

export function PagesScreen(props: { projectId: string }) {
  const projectId = props.projectId;
  const proposals = useQuery({
    queryKey: ["page-proposals", projectId],
    queryFn: () => getJson(projectApiPath(projectId, "/pages/proposals"), PageProposalListResponseSchema),
    retry: false
  });
  const pages = useQuery({
    queryKey: ["page-versions", projectId],
    queryFn: () => getJson(projectApiPath(projectId, "/pages"), PageVersionListResponseSchema),
    retry: false
  });
  const pageProposals = proposals.data?.pageProposals ?? [];
  const pageVersions = pages.data?.pageVersions ?? [];

  return (
    <section className="screen-grid">
      <header className="screen-header">
        <div>
          <h1>Local Pages</h1>
          <p>{projectId}</p>
        </div>
        <StatusPill tone={pageVersions.length > 0 ? "success" : "neutral"}>
          {`${pageVersions.length} versions`}
        </StatusPill>
      </header>

      {proposals.isPending ? <div className="notice notice--neutral">Loading page proposals</div> : null}
      {proposals.isError ? <div className="notice notice--danger">Page proposals could not be loaded.</div> : null}
      {pages.isPending ? <div className="notice notice--neutral">Loading page versions</div> : null}
      {pages.isError ? <div className="notice notice--danger">Page versions could not be loaded.</div> : null}

      <section className="table-panel">
        <h2>Page proposals</h2>
        <div className="data-table">
          <div className="data-table__row data-table__row--head data-table__row--pages">
            <span>Route</span>
            <span>Keyword</span>
            <span>Status</span>
            <span>Versions</span>
            <span>Sitemap</span>
          </div>
          {pageProposals.map((pageProposal) => (
            <PageProposalRow key={pageProposal.id} pageProposal={pageProposal} />
          ))}
          {!proposals.isPending && pageProposals.length === 0 ? (
            <div className="data-table__row">No page proposals have been recorded.</div>
          ) : null}
        </div>
      </section>

      <section className="table-panel">
        <h2>Page versions</h2>
        <div className="data-table">
          <div className="data-table__row data-table__row--head data-table__row--pages">
            <span>Route</span>
            <span>Keyword</span>
            <span>Status</span>
            <span>Version</span>
            <span>Preview</span>
          </div>
          {pageVersions.map((pageVersion) => (
            <PageVersionRow key={pageVersion.id} pageVersion={pageVersion} projectId={projectId} />
          ))}
          {!pages.isPending && pageVersions.length === 0 ? (
            <div className="data-table__row">No page versions have been recorded.</div>
          ) : null}
        </div>
      </section>
    </section>
  );
}

export function PagePreviewScreen(props: { projectId: string; pageVersionId: string }) {
  const projectId = props.projectId;
  const pageVersionId = props.pageVersionId;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [decisionNote, setDecisionNote] = useState("");
  const [latestReview, setLatestReview] = useState<PageVersionReviewResponse | undefined>();
  const [latestReleasePlan, setLatestReleasePlan] = useState<ReleasePlan | undefined>();
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
  const latestVersion =
    version.data && versions.data ? latestVersionForProposal(version.data, versions.data.pageVersions) : undefined;
  const ancestorVersions =
    version.data && versions.data ? pageVersionAncestors(version.data, versions.data.pageVersions).slice(0, 20) : [];
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
      setLatestReview(response);
      setDecisionNote("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["page-version-detail", projectId, pageVersionId] }),
        queryClient.invalidateQueries({ queryKey: ["page-version-preview", projectId, pageVersionId] }),
        queryClient.invalidateQueries({ queryKey: ["page-versions", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["page-proposals", projectId] }),
        queryClient.invalidateQueries({ queryKey: notesQueryKey })
      ]);
    }
  });
  const createReleasePlan = useMutation({
    mutationFn: () => {
      const body = CreateReleasePlanRequestSchema.parse({ pageVersionIds: [pageVersionId] });

      return postJson(projectApiPath(projectId, "/releases/plan"), body, ReleasePlanSchema);
    },
    onSuccess: (response) => {
      setLatestReleasePlan(response);
    }
  });

  return (
    <section className="screen-grid">
      <header className="screen-header">
        <div>
          <h1>Preview</h1>
          <p>{pageVersionId || "No page selected"}</p>
        </div>
        <StatusPill tone={version.data ? pageVersionTone(version.data.status) : preview.isError ? "danger" : "neutral"}>
          {version.data?.status.replaceAll("_", " ") ?? (preview.isError ? "error" : "loading")}
        </StatusPill>
      </header>

      <Link className="button-link" to="/projects/$projectId/pages" params={{ projectId }}>
        Back to pages
      </Link>

      {preview.isPending ? <div className="notice notice--neutral">Rendering preview</div> : null}
      {preview.isError ? <div className="notice notice--danger">Preview could not be rendered.</div> : null}
      {version.isPending ? <div className="notice notice--neutral">Loading page version</div> : null}
      {version.isError ? <div className="notice notice--danger">Page version could not be loaded.</div> : null}
      {versions.isError ? <div className="notice notice--danger">Page version history could not be loaded.</div> : null}
      {latestReview ? (
        <div className="notice notice--neutral">
          Page version review saved: {latestReview.approval.status}
          {latestReview.approval.decisionNote ? ` (${latestReview.approval.decisionNote})` : ""}
        </div>
      ) : null}
      {reviewVersion.isError ? (
        <div className="notice notice--danger">
          {errorMessage(reviewVersion.error, "Page version review could not be saved.")}
        </div>
      ) : null}
      {createReleasePlan.isError ? (
        <div className="notice notice--danger">
          {errorMessage(createReleasePlan.error, "Release plan could not be created.")}
        </div>
      ) : null}
      {latestReleasePlan ? (
        <div className="notice notice--neutral">
          Release plan created:{" "}
          <Link
            to="/projects/$projectId/releases/$releasePlanId"
            params={{ projectId, releasePlanId: latestReleasePlan.releasePlanId }}
          >
            Open release plan
          </Link>
        </div>
      ) : null}

      {preview.data && version.data ? (
        <section className="preview-layout">
          <article className="detail-panel">
            <div className="panel-heading">
              <div>
                <h2>{preview.data.route}</h2>
                <p>Editor preview</p>
              </div>
              <StatusPill tone="neutral">{preview.data.file.path}</StatusPill>
            </div>
            <div className="metric-row metric-row--compact">
              <Metric title="Robots" value="noindex" />
              <Metric title="Status" value={version.data.status.replaceAll("_", " ")} />
              <Metric title="Content type" value={preview.data.file.contentType} />
              <Metric title="Approved" value={version.data.approvedAt ? "yes" : "not yet"} />
            </div>
          </article>

          <section className="page-studio-workspace">
            <PageStudioEditor
              copyActionError={requestCopySuggestion.error ?? dismissCopySuggestion.error}
              copySuggestions={copySuggestions.data?.suggestions ?? []}
              isCopyActionPending={requestCopySuggestion.isPending || dismissCopySuggestion.isPending}
              isCopySuggestionsError={copySuggestions.isError}
              isCopySuggestionsPending={copySuggestions.isPending}
              isMediaLibraryError={mediaAssets.isError}
              isMediaLibraryPending={mediaAssets.isPending}
              isMediaUploadPending={uploadMedia.isPending}
              error={editVersion.error}
              isSaving={editVersion.isPending}
              isVersionListError={versions.isError}
              isVersionListPending={versions.isPending}
              latestVersion={latestVersion}
              mediaAssets={mediaAssets.data?.assets ?? []}
              mediaUploadError={uploadMedia.error}
              pageVersion={version.data}
              projectId={projectId}
              onApplyCopySuggestion={(suggestion: SectionCopySuggestion, sectionProps: Record<string, unknown>) =>
                editVersion.mutate({
                  suggestionId: suggestion.id,
                  command: {
                    type: "update_section_props",
                    sectionId: suggestion.sectionId,
                    props: sectionProps
                  }
                })
              }
              onCommand={(command: PageStudioEditCommand) => editVersion.mutate({ command })}
              onDismissCopySuggestion={(suggestionId) => dismissCopySuggestion.mutate(suggestionId)}
              onRequestCopySuggestion={(sectionId, instruction) =>
                requestCopySuggestion.mutate({ sectionId, instruction: normalizedText(instruction) })
              }
              onUploadMedia={(file) => uploadMedia.mutate(file)}
            />
            <div className="page-studio-preview-pane">
              <div className="page-studio-preview-heading">
                <strong>Rendered preview</strong>
                <StatusPill tone="neutral">noindex</StatusPill>
              </div>
              <iframe
                className="preview-frame"
                sandbox=""
                src={apiResourceUrl(preview.data.documentPath)}
                title="Page preview"
              />
            </div>
          </section>

          <PageVersionReviewPanel
            ancestorVersions={ancestorVersions}
            decisionNote={decisionNote}
            isLatest={latestVersion?.id === version.data.id}
            isLatestStateReady={versions.isSuccess}
            isPending={reviewVersion.isPending}
            pageVersion={version.data}
            projectId={projectId}
            onDecisionNoteChange={setDecisionNote}
            onReview={(decision) => reviewVersion.mutate(decision)}
          />
          <PageVersionReleasePlanPanel
            isPending={createReleasePlan.isPending}
            pageVersion={version.data}
            onCreate={() => createReleasePlan.mutate()}
          />
          {latestReleasePlan ? (
            <ReleaseLifecyclePanel
              initialPlan={latestReleasePlan}
              projectId={projectId}
              releasePlanId={latestReleasePlan.releasePlanId}
            />
          ) : null}

          <PageSectionNotesPanel pageVersion={version.data} projectId={projectId} />
        </section>
      ) : null}
    </section>
  );
}

function PageVersionReviewPanel(props: {
  ancestorVersions: readonly PageVersionSummary[];
  decisionNote: string;
  isLatest: boolean;
  isLatestStateReady: boolean;
  isPending: boolean;
  pageVersion: PageVersionDetail;
  projectId: string;
  onDecisionNoteChange: (value: string) => void;
  onReview: (decision: PageVersionReviewDecision) => void;
}) {
  const notesQueryKey = pageSectionNotesQueryKey(props.projectId, props.pageVersion.id);
  const notes = useQuery({
    queryKey: notesQueryKey,
    queryFn: () =>
      getJson(
        projectApiPath(props.projectId, `/pages/${encodeURIComponent(props.pageVersion.id)}/notes`),
        PageSectionNoteListResponseSchema
      ),
    retry: false
  });
  const ancestorNotes = useQueries({
    queries: props.ancestorVersions.map((version) => ({
      queryKey: pageSectionNotesQueryKey(props.projectId, version.id),
      queryFn: () =>
        getJson(
          projectApiPath(props.projectId, `/pages/${encodeURIComponent(version.id)}/notes`),
          PageSectionNoteListResponseSchema
        ),
      retry: false
    }))
  });
  const openBlockers =
    notes.data?.notes.filter((note) => note.status === "open" && note.instructionType === "approval_blocker") ?? [];
  const ancestorBlockers = props.ancestorVersions.flatMap((version, index) =>
    (ancestorNotes[index]?.data?.notes ?? [])
      .filter((note) => note.status === "open" && note.instructionType === "approval_blocker")
      .map((note) => ({ note, version }))
  );
  const ancestorNotesPending = ancestorNotes.some((query) => query.isPending);
  const ancestorNotesError = ancestorNotes.some((query) => query.isError);
  const reviewable =
    props.isLatestStateReady &&
    props.isLatest &&
    (props.pageVersion.status === "preview" || props.pageVersion.status === "changes_requested");
  const canApprove = reviewable && openBlockers.length === 0;
  const canRequestChanges = reviewable && normalizedText(props.decisionNote) !== undefined;

  return (
    <article className="detail-panel review-panel">
      <div className="panel-heading">
        <div>
          <h2>Version review</h2>
          <p>{`Version ${props.pageVersion.versionNumber} / ${props.pageVersion.primaryKeyword}`}</p>
        </div>
        <StatusPill tone={openBlockers.length > 0 ? "warning" : pageVersionTone(props.pageVersion.status)}>
          {openBlockers.length > 0
            ? `${openBlockers.length} blocker${openBlockers.length === 1 ? "" : "s"}`
            : props.pageVersion.status}
        </StatusPill>
      </div>

      <label className="form-field">
        <span>Decision note</span>
        <textarea
          placeholder="Decision rationale"
          value={props.decisionNote}
          onChange={(event) => props.onDecisionNoteChange(event.currentTarget.value)}
        />
      </label>

      {notes.isPending ? <div className="notice notice--neutral">Checking approval blockers</div> : null}
      {notes.isError ? <div className="notice notice--danger">Approval blockers could not be checked.</div> : null}
      {openBlockers.length > 0 ? (
        <div className="notice notice--danger">Resolve approval blocker notes before approving this version.</div>
      ) : null}
      {ancestorNotesPending ? <div className="notice notice--neutral">Loading earlier review context</div> : null}
      {ancestorNotesError ? (
        <div className="notice notice--danger">Earlier review context could not be loaded.</div>
      ) : null}
      {ancestorBlockers.length > 0 ? (
        <section className="lineage-blocker-context">
          <div className="page-studio-props-heading">
            <div>
              <h3>Earlier version blockers</h3>
              <p>Historical context for this version.</p>
            </div>
            <StatusPill tone="warning">{`${ancestorBlockers.length} open`}</StatusPill>
          </div>
          <div className="lineage-blocker-list">
            {ancestorBlockers.map(({ note, version }) => (
              <div className="lineage-blocker-row" key={note.id}>
                <div>
                  <strong>{`v${version.versionNumber} / ${note.sectionId}`}</strong>
                  <p>{note.note}</p>
                </div>
                <Link
                  className="button-link"
                  to="/projects/$projectId/pages/$pageId/preview"
                  params={{ projectId: props.projectId, pageId: version.id }}
                >
                  Open source
                </Link>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {props.isLatestStateReady && !props.isLatest ? (
        <div className="notice notice--neutral">Only the latest page version can be reviewed.</div>
      ) : null}
      {!reviewable ? (
        props.isLatest ? (
          <div className="notice notice--neutral">This page version is not in a reviewable state.</div>
        ) : null
      ) : null}

      <div className="decision-card__actions">
        <button
          className="button-primary"
          disabled={!canApprove || props.isPending || notes.isPending || notes.isError}
          type="button"
          onClick={() => props.onReview("approve")}
        >
          {props.isPending ? "Saving" : "Approve version"}
        </button>
        <button
          className="button-secondary"
          disabled={!canRequestChanges || props.isPending}
          type="button"
          onClick={() => props.onReview("request_changes")}
        >
          Request changes
        </button>
      </div>
    </article>
  );
}

function PageVersionReleasePlanPanel(props: {
  isPending: boolean;
  pageVersion: PageVersionDetail;
  onCreate: () => void;
}) {
  const canCreateReleasePlan = props.pageVersion.status === "approved" && Boolean(props.pageVersion.approvedAt);

  return (
    <article className="detail-panel review-panel">
      <div className="panel-heading">
        <div>
          <h2>Release planning</h2>
          <p>{props.pageVersion.route}</p>
        </div>
        <StatusPill tone={canCreateReleasePlan ? "success" : "neutral"}>
          {canCreateReleasePlan ? "approved" : "not ready"}
        </StatusPill>
      </div>

      {!canCreateReleasePlan ? (
        <div className="notice notice--neutral">Approve this page version before creating a release plan.</div>
      ) : null}

      <button
        className="button-primary"
        disabled={!canCreateReleasePlan || props.isPending}
        type="button"
        onClick={props.onCreate}
      >
        {props.isPending ? "Creating" : "Create release plan"}
      </button>
    </article>
  );
}

type PageSectionNoteFormValues = {
  sectionId: string;
  instructionType: PageSectionNoteInstructionType;
  note: string;
};

function PageSectionNotesPanel(props: { projectId: string; pageVersion: PageVersionDetail }) {
  const queryClient = useQueryClient();
  const notesQueryKey = pageSectionNotesQueryKey(props.projectId, props.pageVersion.id);
  const notes = useQuery({
    queryKey: notesQueryKey,
    queryFn: () =>
      getJson(
        projectApiPath(props.projectId, `/pages/${encodeURIComponent(props.pageVersion.id)}/notes`),
        PageSectionNoteListResponseSchema
      ),
    retry: false
  });
  const createNote = useMutation({
    mutationFn: (input: PageSectionNoteFormValues) => {
      const body = CreatePageSectionNoteRequestSchema.parse({
        sectionId: input.sectionId,
        instructionType: input.instructionType,
        note: input.note
      });

      return postJson(
        projectApiPath(props.projectId, `/pages/${encodeURIComponent(props.pageVersion.id)}/notes`),
        body,
        PageSectionNoteSchema
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notesQueryKey });
    }
  });
  const resolveNote = useMutation({
    mutationFn: (noteId: string) =>
      patchJson(
        projectApiPath(
          props.projectId,
          `/pages/${encodeURIComponent(props.pageVersion.id)}/notes/${encodeURIComponent(noteId)}/resolve`
        ),
        {},
        PageSectionNoteSchema
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notesQueryKey });
    }
  });
  const form = useForm({
    defaultValues: {
      sectionId: props.pageVersion.pageJson.sections[0]?.id ?? "",
      instructionType: "general" as PageSectionNoteInstructionType,
      note: ""
    } satisfies PageSectionNoteFormValues,
    onSubmit: async ({ value }) => {
      await createNote.mutateAsync(value);
      form.reset();
    }
  });
  const noteItems = notes.data?.notes ?? [];

  return (
    <aside className="detail-panel notes-panel">
      <div className="panel-heading">
        <div>
          <h2>Section notes</h2>
          <p>Notes for this version.</p>
        </div>
        <StatusPill tone={noteItems.some((item) => item.status === "open") ? "warning" : "neutral"}>
          {`${noteItems.length} notes`}
        </StatusPill>
      </div>

      <form
        className="note-form"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="sectionId">
          {(field) => (
            <label className="form-field">
              <span>Section</span>
              <select value={field.state.value} onChange={(event) => field.handleChange(event.currentTarget.value)}>
                {props.pageVersion.pageJson.sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {`${pageSectionTypeLabel(section.type)} / ${section.id}`}
                  </option>
                ))}
              </select>
            </label>
          )}
        </form.Field>
        <form.Field name="instructionType">
          {(field) => (
            <label className="form-field">
              <span>Instruction</span>
              <select
                value={field.state.value}
                onChange={(event) => field.handleChange(event.currentTarget.value as PageSectionNoteInstructionType)}
              >
                {pageSectionNoteInstructionTypes.map((value) => (
                  <option key={value} value={value}>
                    {labelFromInstructionType(value)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </form.Field>
        <form.Field name="note">
          {(field) => (
            <label className="form-field">
              <span>Note</span>
              <textarea value={field.state.value} onChange={(event) => field.handleChange(event.currentTarget.value)} />
            </label>
          )}
        </form.Field>
        <form.Subscribe selector={(state) => ({ isSubmitting: state.isSubmitting, note: state.values.note })}>
          {(state) => (
            <button
              className="button-primary"
              disabled={createNote.isPending || state.isSubmitting || state.note.trim().length === 0}
              type="submit"
            >
              {createNote.isPending ? "Adding" : "Add note"}
            </button>
          )}
        </form.Subscribe>
      </form>

      {createNote.isError ? <div className="notice notice--danger">Note could not be added.</div> : null}
      {resolveNote.isError ? <div className="notice notice--danger">Note could not be resolved.</div> : null}
      {notes.isPending ? <div className="notice notice--neutral">Loading notes</div> : null}
      {notes.isError ? <div className="notice notice--danger">Notes could not be loaded.</div> : null}

      <div className="note-list">
        {noteItems.map((item) => (
          <PageSectionNoteItem
            key={item.id}
            isResolving={resolveNote.isPending}
            note={item}
            onResolve={(noteId) => resolveNote.mutate(noteId)}
          />
        ))}
        {!notes.isPending && noteItems.length === 0 ? <p className="muted-text">No section notes yet.</p> : null}
      </div>
    </aside>
  );
}

function PageSectionNoteItem(props: {
  isResolving: boolean;
  note: PageSectionNote;
  onResolve: (noteId: string) => void;
}) {
  return (
    <article className="note-item">
      <div className="decision-card__header">
        <div>
          <strong>{props.note.sectionId}</strong>
          <p>{props.note.fieldPath.length > 0 ? props.note.fieldPath.join(".") : "section"}</p>
        </div>
        <StatusPill tone={props.note.status === "open" ? "warning" : "success"}>{props.note.status}</StatusPill>
      </div>
      <p>{props.note.note}</p>
      <span className="muted-text">{props.note.instructionType.replaceAll("_", " ")}</span>
      {props.note.status === "open" ? (
        <button
          className="button-secondary"
          disabled={props.isResolving}
          type="button"
          onClick={() => props.onResolve(props.note.id)}
        >
          Resolve
        </button>
      ) : null}
    </article>
  );
}

function PageProposalRow(props: { pageProposal: PageProposalSummary }) {
  return (
    <div className="data-table__row data-table__row--pages">
      <span className="truncate">{props.pageProposal.route}</span>
      <span className="truncate">{props.pageProposal.primaryKeyword}</span>
      <StatusPill tone="neutral">{props.pageProposal.status.replaceAll("_", " ")}</StatusPill>
      <span>{props.pageProposal.versionCount}</span>
      <StatusPill tone={props.pageProposal.sitemapReady ? "success" : "warning"}>
        {props.pageProposal.sitemapReady ? "ready" : "not ready"}
      </StatusPill>
    </div>
  );
}

function PageVersionRow(props: { projectId: string; pageVersion: PageVersionSummary }) {
  return (
    <div className="data-table__row data-table__row--pages">
      <span className="truncate">{props.pageVersion.route}</span>
      <span className="truncate">{props.pageVersion.primaryKeyword}</span>
      <StatusPill tone={pageVersionTone(props.pageVersion.status)}>
        {props.pageVersion.status.replaceAll("_", " ")}
      </StatusPill>
      <span>{props.pageVersion.versionNumber}</span>
      <Link
        className="button-link"
        to="/projects/$projectId/pages/$pageId/preview"
        params={{ projectId: props.projectId, pageId: props.pageVersion.id }}
      >
        Open
      </Link>
    </div>
  );
}

function Metric(props: { title: string; value: string }) {
  return (
    <article className="metric-card metric-card--compact">
      <span>{props.title}</span>
      <strong className="truncate">{props.value}</strong>
    </article>
  );
}

function labelFromInstructionType(value: PageSectionNoteInstructionType): string {
  return value
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function pageSectionTypeLabel(value: string): string {
  return value.replace(/([a-z])([A-Z])/gu, "$1 $2");
}

function pageVersionTone(status: PageVersionSummary["status"]): "neutral" | "success" | "warning" | "danger" {
  if (status === "approved" || status === "released") {
    return "success";
  }

  if (status === "changes_requested" || status === "superseded") {
    return "warning";
  }

  return "neutral";
}

function pageSectionNotesQueryKey(projectId: string, pageVersionId: string) {
  return ["page-section-notes", projectId, pageVersionId] as const;
}

function normalizedText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${fallback} ${error.message}`;
  }

  return fallback;
}

function projectApiPath(projectId: string, suffix: string): string {
  return `/projects/${encodeURIComponent(projectId)}${suffix}`;
}
