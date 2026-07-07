import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { StatusPill } from "@localseo/ui";
import {
  PageProposalListResponseSchema,
  PageVersionListResponseSchema,
  PageVersionPreviewResponseSchema,
  type PageProposalSummary,
  type PageVersionSummary
} from "@localseo/contracts";
import { getJson } from "../lib/api";

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

  return (
    <section className="screen-grid">
      <header className="screen-header">
        <div>
          <h1>Preview</h1>
          <p>{pageVersionId || "No page selected"}</p>
        </div>
        <StatusPill tone={preview.data ? "success" : preview.isError ? "danger" : "neutral"}>
          {preview.data?.mode ?? (preview.isError ? "error" : "loading")}
        </StatusPill>
      </header>

      <Link className="button-link" to="/projects/$projectId/pages" params={{ projectId }}>
        Back to pages
      </Link>

      {preview.isPending ? <div className="notice notice--neutral">Rendering preview</div> : null}
      {preview.isError ? <div className="notice notice--danger">Preview could not be rendered.</div> : null}

      {preview.data ? (
        <section className="preview-layout">
          <article className="detail-panel">
            <div className="panel-heading">
              <div>
                <h2>{preview.data.route}</h2>
                <p>Rendered by the shared page-registry renderer.</p>
              </div>
              <StatusPill tone="neutral">{preview.data.file.path}</StatusPill>
            </div>
            <div className="metric-row metric-row--compact">
              <Metric title="Robots" value="noindex" />
              <Metric title="Content type" value={preview.data.file.contentType} />
              <Metric title="Bytes" value={preview.data.file.body.length.toString()} />
              <Metric title="Mode" value={preview.data.mode} />
            </div>
          </article>

          <iframe className="preview-frame" sandbox="" srcDoc={preview.data.file.body} title="Page preview" />
        </section>
      ) : null}
    </section>
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

function pageVersionTone(status: PageVersionSummary["status"]): "neutral" | "success" | "warning" | "danger" {
  if (status === "approved" || status === "released") {
    return "success";
  }

  if (status === "changes_requested" || status === "superseded") {
    return "warning";
  }

  return "neutral";
}

function projectApiPath(projectId: string, suffix: string): string {
  return `/projects/${encodeURIComponent(projectId)}${suffix}`;
}
