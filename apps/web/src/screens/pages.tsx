import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { StatusPill } from "@localseo/ui";
import {
  PageProposalListResponseSchema,
  PageSectionNoteListResponseSchema,
  PageSectionNoteSchema,
  PageVersionDetailSchema,
  PageVersionListResponseSchema,
  PageVersionPreviewResponseSchema,
  PageVersionReviewResponseSchema,
  ReviewPageVersionRequestSchema,
  pageSectionNoteInstructionTypes,
  type PageProposalSummary,
  type PageSectionNote,
  type PageSectionNoteInstructionType,
  type PageVersionDetail,
  type PageVersionReviewDecision,
  type PageVersionReviewResponse,
  type PageVersionSummary
} from "@localseo/contracts";
import { getJson, patchJson, postJson } from "../lib/api";

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
  const [decisionNote, setDecisionNote] = useState("");
  const [latestReview, setLatestReview] = useState<PageVersionReviewResponse | undefined>();
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
  const notesQueryKey = pageSectionNotesQueryKey(projectId, pageVersionId);
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

          <PageVersionReviewPanel
            decisionNote={decisionNote}
            isPending={reviewVersion.isPending}
            pageVersion={version.data}
            projectId={projectId}
            onDecisionNoteChange={setDecisionNote}
            onReview={(decision) => reviewVersion.mutate(decision)}
          />

          <iframe className="preview-frame" sandbox="" srcDoc={preview.data.file.body} title="Page preview" />
          <PageSectionNotesPanel pageVersionId={pageVersionId} projectId={projectId} />
        </section>
      ) : null}
    </section>
  );
}

function PageVersionReviewPanel(props: {
  decisionNote: string;
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
  const openBlockers =
    notes.data?.notes.filter((note) => note.status === "open" && note.instructionType === "approval_blocker") ?? [];
  const reviewable = props.pageVersion.status === "preview" || props.pageVersion.status === "changes_requested";
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
      {!reviewable ? (
        <div className="notice notice--neutral">This page version is not in a reviewable state.</div>
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

function PageSectionNotesPanel(props: { projectId: string; pageVersionId: string }) {
  const queryClient = useQueryClient();
  const [sectionId, setSectionId] = useState("hero-1");
  const [instructionType, setInstructionType] = useState<PageSectionNoteInstructionType>("general");
  const [note, setNote] = useState("");
  const notesQueryKey = pageSectionNotesQueryKey(props.projectId, props.pageVersionId);
  const notes = useQuery({
    queryKey: notesQueryKey,
    queryFn: () =>
      getJson(
        projectApiPath(props.projectId, `/pages/${encodeURIComponent(props.pageVersionId)}/notes`),
        PageSectionNoteListResponseSchema
      ),
    retry: false
  });
  const createNote = useMutation({
    mutationFn: () =>
      postJson(
        projectApiPath(props.projectId, `/pages/${encodeURIComponent(props.pageVersionId)}/notes`),
        {
          sectionId,
          instructionType,
          note
        },
        PageSectionNoteSchema
      ),
    onSuccess: async () => {
      setNote("");
      await queryClient.invalidateQueries({ queryKey: notesQueryKey });
    }
  });
  const resolveNote = useMutation({
    mutationFn: (noteId: string) =>
      patchJson(
        projectApiPath(
          props.projectId,
          `/pages/${encodeURIComponent(props.pageVersionId)}/notes/${encodeURIComponent(noteId)}/resolve`
        ),
        {},
        PageSectionNoteSchema
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notesQueryKey });
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
          createNote.mutate();
        }}
      >
        <label className="form-field">
          <span>Section id</span>
          <input value={sectionId} onChange={(event) => setSectionId(event.currentTarget.value)} />
        </label>
        <label className="form-field">
          <span>Instruction</span>
          <select
            value={instructionType}
            onChange={(event) => setInstructionType(event.currentTarget.value as PageSectionNoteInstructionType)}
          >
            {pageSectionNoteInstructionTypes.map((value) => (
              <option key={value} value={value}>
                {labelFromInstructionType(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Note</span>
          <textarea value={note} onChange={(event) => setNote(event.currentTarget.value)} />
        </label>
        <button className="button-primary" disabled={createNote.isPending || note.trim().length === 0} type="submit">
          {createNote.isPending ? "Adding" : "Add note"}
        </button>
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
