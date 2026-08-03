import { useMemo } from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { StatusPill } from "@localseo/ui";
import {
  CreateCustomerReportGenerationRequestSchema,
  CustomerReportArtifactRetryResponseSchema,
  CustomerReportArtifactSummarySchema,
  CustomerReportCandidateDetailSchema,
  CustomerReportGenerationResponseSchema,
  CustomerReportPublicationResponseSchema,
  CustomerReportPublishedDetailSchema,
  CustomerReportPublishedSummarySchema,
  CustomerReportReviewResponseSchema,
  CustomerReportWorkspaceResponseSchema,
  type CustomerReportArtifactSummary,
  type CustomerReportClaim,
  type CustomerReportEvidenceItem,
  type CustomerReportNavigationRef,
  type CustomerReportPublishedSummary,
  type CustomerReportSnapshot,
  type CustomerReportWorkspaceIssue
} from "@localseo/contracts";
import { apiResourceUrl, getJson, postJson } from "../lib/api";
import {
  customerReportPublicationCommand,
  defaultCustomerReportGeneration,
  isActiveCustomerReportGeneration
} from "./reports-state";

const CustomerReportPublishedListSchema = CustomerReportPublishedSummarySchema.array().max(100);

type ReportListRow = {
  id: string;
  kind: "candidate" | "generation" | "published";
  period: string;
  title: string;
  status: string;
  versionNumber?: number;
  updatedAt: string;
  correctionRequired: boolean;
};

const reportColumn = createColumnHelper<ReportListRow>();

export function ReportsScreen(props: { projectId: string }) {
  const queryClient = useQueryClient();
  const workspaceKey = ["customer-report-workspace", props.projectId] as const;
  const publishedKey = ["customer-report-published", props.projectId] as const;
  const workspace = useQuery({
    queryKey: workspaceKey,
    queryFn: () =>
      getJson(projectApiPath(props.projectId, "/reports/workspace"), CustomerReportWorkspaceResponseSchema),
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.issues.some((issue) => isActiveCustomerReportGeneration(issue.latestGeneration?.status))
        ? 3_000
        : false
  });
  const published = useQuery({
    queryKey: publishedKey,
    queryFn: () => getJson(projectApiPath(props.projectId, "/reports/published"), CustomerReportPublishedListSchema),
    retry: false
  });
  const rows = useMemo(
    () => reportListRows(workspace.data?.issues ?? [], published.data ?? []),
    [published.data, workspace.data?.issues]
  );
  const table = useReportTable(rows, props.projectId);

  return (
    <section className="screen-grid report-workspace">
      <header className="screen-header">
        <div>
          <h1>Customer reports</h1>
          <p>Digest-bound monthly evidence, human review, and immutable publication history.</p>
        </div>
        <StatusPill tone={workspace.isError ? "warning" : "neutral"}>{String(rows.length) + " reports"}</StatusPill>
      </header>

      {workspace.data ? (
        <ReportGenerationPanel
          projectId={props.projectId}
          onCreated={async () => {
            await queryClient.invalidateQueries({ queryKey: workspaceKey });
          }}
        />
      ) : null}
      {workspace.isPending ? <div className="notice notice--neutral">Loading report workspace</div> : null}
      {workspace.isError ? (
        <div className="notice notice--neutral">
          Draft and review controls are unavailable for this account. Published reports remain readable.
        </div>
      ) : null}
      {published.isError ? (
        <div className="notice notice--danger">Published report history could not be loaded.</div>
      ) : null}
      <ReportHistoryTable rowCount={rows.length} table={table} />
    </section>
  );
}

function ReportGenerationPanel(props: { projectId: string; onCreated: () => Promise<void> }) {
  const defaults = useMemo(() => defaultCustomerReportGeneration(new Date()), []);
  const mutation = useMutation({
    mutationFn: (value: { period: string; evidenceCutoffAt: string; correctionReason: string }) => {
      const request = CreateCustomerReportGenerationRequestSchema.parse({
        period: value.period,
        evidenceCutoffAt: new Date(value.evidenceCutoffAt).toISOString(),
        idempotencyKey: crypto.randomUUID(),
        narrativeMode: "fact_only",
        correctionReason: value.correctionReason.trim() || undefined
      });
      return postJson(
        projectApiPath(props.projectId, "/reports/generations"),
        request,
        CustomerReportGenerationResponseSchema
      );
    },
    onSuccess: props.onCreated
  });
  const form = useForm({
    defaultValues: {
      period: defaults.period,
      evidenceCutoffAt: toDateTimeLocal(defaults.evidenceCutoffAt),
      correctionReason: ""
    },
    onSubmit: ({ value }) => mutation.mutateAsync(value)
  });

  return (
    <section className="detail-panel report-generation-panel">
      <div className="panel-heading">
        <div>
          <h2>Generate monthly report</h2>
          <p>Deterministic fact assembly only. Existing published months require a correction reason.</p>
        </div>
        <StatusPill tone="neutral">fact only</StatusPill>
      </div>
      <form
        className="report-generation-form"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="period">
          {(field) => (
            <label className="form-field">
              <span>Reporting month</span>
              <input
                type="month"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.currentTarget.value)}
              />
            </label>
          )}
        </form.Field>
        <form.Field name="evidenceCutoffAt">
          {(field) => (
            <label className="form-field">
              <span>Evidence cutoff</span>
              <input
                type="datetime-local"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.currentTarget.value)}
              />
            </label>
          )}
        </form.Field>
        <form.Field name="correctionReason">
          {(field) => (
            <label className="form-field report-generation-form__reason">
              <span>Correction reason</span>
              <input
                maxLength={2_000}
                placeholder="Required only when correcting a published month"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.currentTarget.value)}
              />
            </label>
          )}
        </form.Field>
        <button className="button-primary" disabled={mutation.isPending} type="submit">
          {mutation.isPending ? "Starting" : "Generate report"}
        </button>
      </form>
      {mutation.isSuccess ? (
        <div className="notice notice--neutral">
          {"Report generation " + mutation.data.status.replaceAll("_", " ") + "."}
        </div>
      ) : null}
      {mutation.isError ? <div className="notice notice--danger">{errorMessage(mutation.error)}</div> : null}
    </section>
  );
}

function useReportTable(rows: ReportListRow[], projectId: string) {
  const columns = useMemo(
    () => [
      reportColumn.accessor("period", { header: "Month" }),
      reportColumn.accessor("title", {
        header: "Report",
        cell: (info) =>
          info.row.original.kind === "candidate" ? (
            <Link
              to="/projects/$projectId/reports/candidates/$reportId"
              params={{ projectId, reportId: info.row.original.id }}
            >
              {info.getValue()}
            </Link>
          ) : info.row.original.kind === "published" ? (
            <Link
              to="/projects/$projectId/reports/published/$reportId"
              params={{ projectId, reportId: info.row.original.id }}
            >
              {info.getValue()}
            </Link>
          ) : (
            <strong>{info.getValue()}</strong>
          )
      }),
      reportColumn.accessor("status", {
        header: "Status",
        cell: (info) => (
          <StatusPill tone={reportStatusTone(info.getValue(), info.row.original.correctionRequired)}>
            {info.row.original.correctionRequired ? "correction required" : info.getValue().replaceAll("_", " ")}
          </StatusPill>
        )
      }),
      reportColumn.accessor("versionNumber", {
        header: "Version",
        cell: (info) => (info.getValue() === undefined ? "-" : "v" + String(info.getValue()))
      }),
      reportColumn.accessor("updatedAt", { header: "Updated", cell: (info) => formatDate(info.getValue()) })
    ],
    [projectId]
  );
  return useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() });
}

function ReportHistoryTable(props: { table: ReturnType<typeof useReportTable>; rowCount: number }) {
  return (
    <section className="table-panel report-history-panel">
      <h2>Report history</h2>
      <div className="data-table data-table--reports">
        {props.table.getHeaderGroups().map((group) => (
          <div className="data-table__row data-table__row--head data-table__row--report" key={group.id}>
            {group.headers.map((header) => (
              <span key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</span>
            ))}
          </div>
        ))}
        {props.table.getRowModel().rows.map((row) => (
          <div className="data-table__row data-table__row--report" key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <span key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</span>
            ))}
          </div>
        ))}
        {props.rowCount === 0 ? <div className="data-table__row">No customer reports yet.</div> : null}
      </div>
    </section>
  );
}

export function ReportCandidateScreen(props: { projectId: string; reportId: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const queryKey = ["customer-report-candidate", props.projectId, props.reportId] as const;
  const detail = useQuery({
    queryKey,
    queryFn: () =>
      getJson(
        projectApiPath(props.projectId, "/reports/candidates/" + encodeURIComponent(props.reportId)),
        CustomerReportCandidateDetailSchema
      ),
    retry: false
  });
  const latestArtifact = detail.data?.artifacts[0];
  const artifact = useQuery({
    queryKey: ["customer-report-artifact", props.projectId, props.reportId, latestArtifact?.artifactId],
    queryFn: () =>
      getJson(
        projectApiPath(
          props.projectId,
          "/reports/" +
            encodeURIComponent(props.reportId) +
            "/artifacts/" +
            encodeURIComponent(latestArtifact?.artifactId ?? "")
        ),
        CustomerReportArtifactSummarySchema
      ),
    enabled: Boolean(latestArtifact),
    initialData: latestArtifact,
    refetchInterval: (query) =>
      query.state.data?.status === "pending" || query.state.data?.status === "running" ? 3_000 : false
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey });
    await queryClient.invalidateQueries({ queryKey: ["customer-report-workspace", props.projectId] });
  };
  const submit = useMutation({
    mutationFn: () => {
      const report = requiredCandidate(detail.data);
      return postJson(
        projectApiPath(props.projectId, "/reports/" + encodeURIComponent(props.reportId) + "/review"),
        {
          command: "submit_for_review",
          requestId: crypto.randomUUID(),
          expectedSnapshotSha256: report.report.snapshotSha256,
          expectedRowVersion: report.report.rowVersion
        },
        CustomerReportReviewResponseSchema
      );
    },
    onSuccess: refresh
  });
  const retry = useMutation({
    mutationFn: () => {
      const report = requiredCandidate(detail.data);
      return postJson(
        projectApiPath(props.projectId, "/reports/" + encodeURIComponent(props.reportId) + "/artifacts/retry"),
        {
          command: "retry_render",
          requestId: crypto.randomUUID(),
          expectedSnapshotSha256: report.report.snapshotSha256,
          expectedRowVersion: report.report.rowVersion
        },
        CustomerReportArtifactRetryResponseSchema
      );
    },
    onSuccess: refresh
  });
  const publish = useMutation({
    mutationFn: () => {
      const report = requiredCandidate(detail.data);
      const staged = requiredStagedArtifact(artifact.data);
      const command = customerReportPublicationCommand(report.report.supersedesReportId);
      const route = command === "publish" ? "/publish" : "/publish-correction";
      return postJson(
        projectApiPath(props.projectId, "/reports/" + encodeURIComponent(props.reportId) + route),
        {
          command,
          artifactId: staged.artifactId,
          requestId: crypto.randomUUID(),
          expectedSnapshotSha256: report.report.snapshotSha256,
          expectedRowVersion: report.report.rowVersion
        },
        CustomerReportPublicationResponseSchema
      );
    },
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ["customer-report-published", props.projectId] });
      await navigate({
        to: "/projects/$projectId/reports/published/$reportId",
        params: { projectId: props.projectId, reportId: response.reportId }
      });
    }
  });

  if (detail.isPending) return <main className="detail-panel">Loading report candidate</main>;
  if (detail.isError || !detail.data) {
    return <main className="notice notice--danger">Report candidate could not be loaded.</main>;
  }
  const currentArtifact = artifact.data ?? latestArtifact;

  return (
    <section className="screen-grid report-detail-screen">
      <ReportDetailHeader
        backProjectId={props.projectId}
        period={detail.data.report.period}
        status={detail.data.report.status}
        title={detail.data.report.title}
        versionNumber={detail.data.report.versionNumber}
      />
      <ReportSnapshotView projectId={props.projectId} snapshot={detail.data.snapshot} />

      <section className="detail-panel report-review-panel">
        <div className="panel-heading">
          <div>
            <h2>Review and publication</h2>
            <p>{"Every decision is bound to snapshot " + shortDigest(detail.data.report.snapshotSha256) + "."}</p>
          </div>
          <StatusPill tone={artifactTone(currentArtifact?.status)}>
            {currentArtifact?.status ?? "not rendered"}
          </StatusPill>
        </div>
        {detail.data.report.status === "draft" ? (
          <button className="button-primary" disabled={submit.isPending} type="button" onClick={() => submit.mutate()}>
            {submit.isPending ? "Submitting" : "Submit for review"}
          </button>
        ) : null}
        {detail.data.report.status === "ready_for_review" ? (
          <ReviewedCandidateControls
            artifact={currentArtifact}
            isPublishing={publish.isPending}
            isRetrying={retry.isPending}
            onChanged={refresh}
            onPublish={() => publish.mutate()}
            onRetry={() => retry.mutate()}
            projectId={props.projectId}
            report={detail.data}
            reportId={props.reportId}
          />
        ) : null}
        {submit.isError ? <div className="notice notice--danger">{errorMessage(submit.error)}</div> : null}
        {retry.isError ? <div className="notice notice--danger">{errorMessage(retry.error)}</div> : null}
        {publish.isError ? <div className="notice notice--danger">{errorMessage(publish.error)}</div> : null}
      </section>

      {currentArtifact?.status === "staged" ? (
        <section className="report-document-pane">
          <iframe
            sandbox=""
            src={apiResourceUrl(
              projectApiPath(
                props.projectId,
                "/reports/" +
                  encodeURIComponent(props.reportId) +
                  "/artifacts/" +
                  encodeURIComponent(currentArtifact.artifactId) +
                  "/document"
              )
            )}
            title="Reviewed customer report artifact"
          />
        </section>
      ) : null}
    </section>
  );
}

function ReviewedCandidateControls(props: {
  artifact?: CustomerReportArtifactSummary;
  isPublishing: boolean;
  isRetrying: boolean;
  onPublish: () => void;
  onRetry: () => void;
  projectId: string;
  reportId: string;
  report: ReturnType<typeof CustomerReportCandidateDetailSchema.parse>;
  onChanged: () => Promise<void>;
}) {
  const requestChanges = useMutation({
    mutationFn: (decisionNote: string) =>
      postJson(
        projectApiPath(props.projectId, "/reports/" + encodeURIComponent(props.reportId) + "/review"),
        {
          command: "request_changes",
          requestId: crypto.randomUUID(),
          expectedSnapshotSha256: props.report.report.snapshotSha256,
          expectedRowVersion: props.report.report.rowVersion,
          decisionNote
        },
        CustomerReportReviewResponseSchema
      ),
    onSuccess: props.onChanged
  });
  const form = useForm({
    defaultValues: { decisionNote: "" },
    onSubmit: async ({ value }) => {
      await requestChanges.mutateAsync(value.decisionNote.trim());
      form.reset();
    }
  });
  const canRetry = props.artifact?.status === "failed" || props.artifact?.status === "expired";
  const canPublish = props.artifact?.status === "staged";

  return (
    <div className="report-review-controls">
      <div className="decision-card__actions">
        {canRetry ? (
          <button className="button-secondary" disabled={props.isRetrying} type="button" onClick={props.onRetry}>
            {props.isRetrying ? "Retrying" : "Retry render"}
          </button>
        ) : null}
        <button
          className="button-primary"
          disabled={!canPublish || props.isPublishing}
          type="button"
          onClick={props.onPublish}
        >
          {props.isPublishing
            ? "Publishing"
            : props.report.report.supersedesReportId
              ? "Publish correction"
              : "Publish report"}
        </button>
      </div>
      <form
        className="report-change-form"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="decisionNote">
          {(field) => (
            <label className="form-field">
              <span>Requested change</span>
              <textarea
                maxLength={2_000}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.currentTarget.value)}
              />
            </label>
          )}
        </form.Field>
        <form.Subscribe selector={(state) => state.values.decisionNote}>
          {(decisionNote) => (
            <button
              className="button-secondary"
              disabled={requestChanges.isPending || decisionNote.trim().length === 0}
              type="submit"
            >
              {requestChanges.isPending ? "Returning" : "Request changes"}
            </button>
          )}
        </form.Subscribe>
      </form>
      {requestChanges.isError ? (
        <div className="notice notice--danger">{errorMessage(requestChanges.error)}</div>
      ) : null}
    </div>
  );
}

export function PublishedReportScreen(props: { projectId: string; reportId: string }) {
  const detail = useQuery({
    queryKey: ["customer-report-published-detail", props.projectId, props.reportId],
    queryFn: () =>
      getJson(
        projectApiPath(props.projectId, "/reports/published/" + encodeURIComponent(props.reportId)),
        CustomerReportPublishedDetailSchema
      ),
    retry: false
  });

  if (detail.isPending) return <main className="detail-panel">Loading published report</main>;
  if (detail.isError || !detail.data) {
    return <main className="notice notice--danger">Published report could not be loaded.</main>;
  }

  return (
    <section className="screen-grid report-detail-screen">
      <ReportDetailHeader
        backProjectId={props.projectId}
        period={detail.data.report.period}
        status={detail.data.report.status}
        title={detail.data.report.title}
        versionNumber={detail.data.report.versionNumber}
      />
      {detail.data.report.correctionRequired ? (
        <div className="notice notice--warning">
          Source evidence changed after publication. Generate a reviewed correction.
        </div>
      ) : null}
      {detail.data.report.supersededByReportId ? (
        <div className="notice notice--neutral">
          This report was superseded by a correction.{" "}
          <Link
            to="/projects/$projectId/reports/published/$reportId"
            params={{ projectId: props.projectId, reportId: detail.data.report.supersededByReportId }}
          >
            Open correction
          </Link>
        </div>
      ) : null}
      <ReportSnapshotView projectId={props.projectId} snapshot={detail.data.snapshot} />
      <section className="report-document-pane">
        <iframe
          sandbox=""
          src={apiResourceUrl(
            projectApiPath(props.projectId, "/reports/published/" + encodeURIComponent(props.reportId) + "/document")
          )}
          title="Published customer report"
        />
      </section>
    </section>
  );
}

function ReportDetailHeader(props: {
  backProjectId: string;
  period: string;
  status: string;
  title: string;
  versionNumber: number;
}) {
  return (
    <header className="screen-header report-detail-header">
      <div>
        <Link to="/projects/$projectId/reports" params={{ projectId: props.backProjectId }}>
          Back to reports
        </Link>
        <h1>{props.title}</h1>
        <p>{props.period + " / version " + String(props.versionNumber)}</p>
      </div>
      <StatusPill tone={reportStatusTone(props.status, false)}>{props.status.replaceAll("_", " ")}</StatusPill>
    </header>
  );
}

function ReportSnapshotView(props: { projectId: string; snapshot: CustomerReportSnapshot }) {
  return (
    <div className="report-fact-grid">
      <section className="detail-panel report-fact-section">
        <div className="panel-heading">
          <div>
            <h2>Verified claims</h2>
            <p>{String(props.snapshot.factProjection.claims.length) + " evidence-backed statements"}</p>
          </div>
        </div>
        <div className="report-fact-list">
          {props.snapshot.factProjection.claims.map((claim) => (
            <ReportClaimItem claim={claim} key={claim.claimKey} />
          ))}
        </div>
      </section>
      <section className="detail-panel report-fact-section">
        <div className="panel-heading">
          <div>
            <h2>Evidence provenance</h2>
            <p>{"Frozen at " + formatDate(props.snapshot.evidenceCutoffAt)}</p>
          </div>
        </div>
        <div className="report-fact-list">
          {props.snapshot.factProjection.evidence.map((evidence) => (
            <ReportEvidenceItem evidence={evidence} key={evidence.evidenceKey} />
          ))}
        </div>
      </section>
      <section className="detail-panel report-next-actions">
        <div className="panel-heading">
          <div>
            <h2>Next actions</h2>
            <p>Navigation only. Product workflows remain authoritative.</p>
          </div>
        </div>
        <div className="decision-card__actions">
          {props.snapshot.factProjection.nextActions.map((action) => (
            <CustomerReportActionLink action={action} key={action.actionKey} projectId={props.projectId} />
          ))}
          {props.snapshot.factProjection.nextActions.length === 0 ? (
            <span className="muted-text">No next actions.</span>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function ReportClaimItem(props: { claim: CustomerReportClaim }) {
  return (
    <article className="report-fact-item">
      <div>
        <strong>{claimTitle(props.claim)}</strong>
        <p>{claimSummary(props.claim)}</p>
      </div>
      <StatusPill tone={props.claim.kind === "release_warning" ? "warning" : "success"}>
        {props.claim.kind.replaceAll("_", " ")}
      </StatusPill>
    </article>
  );
}

function ReportEvidenceItem(props: { evidence: CustomerReportEvidenceItem }) {
  return (
    <article className="report-fact-item">
      <div>
        <strong>{props.evidence.customerLabel}</strong>
        <p>{props.evidence.sourceKind.replaceAll("_", " ") + " / observed " + formatDate(props.evidence.observedAt)}</p>
      </div>
      <StatusPill tone={props.evidence.proofTier === "customer_safe_proof" ? "success" : "neutral"}>
        {props.evidence.proofTier.replaceAll("_", " ")}
      </StatusPill>
    </article>
  );
}

function CustomerReportActionLink(props: { action: CustomerReportNavigationRef; projectId: string }) {
  switch (props.action.target.surface) {
    case "opportunity":
      return (
        <Link className="button-link" to="/projects/$projectId/opportunities" params={{ projectId: props.projectId }}>
          {props.action.label}
        </Link>
      );
    case "page_studio_review":
      return (
        <Link
          className="button-link"
          to="/projects/$projectId/pages/$pageId/preview"
          params={{ projectId: props.projectId, pageId: props.action.target.pageVersionId }}
        >
          {props.action.label}
        </Link>
      );
    case "release_review":
      return (
        <Link
          className="button-link"
          to="/projects/$projectId/releases/$releasePlanId"
          params={{ projectId: props.projectId, releasePlanId: props.action.target.releasePlanId }}
        >
          {props.action.label}
        </Link>
      );
  }
}

function reportListRows(
  issues: CustomerReportWorkspaceIssue[],
  published: CustomerReportPublishedSummary[]
): ReportListRow[] {
  const rows: ReportListRow[] = published.map((report) => ({
    id: report.reportId,
    kind: "published",
    period: report.period,
    title: report.title,
    status: report.status,
    versionNumber: report.versionNumber,
    updatedAt: report.supersededAt ?? report.publishedAt,
    correctionRequired: report.correctionRequired
  }));
  for (const issue of issues) {
    if (issue.candidate) {
      rows.push({
        id: issue.candidate.reportId,
        kind: "candidate",
        period: issue.candidate.period,
        title: issue.candidate.title,
        status: issue.candidate.status,
        versionNumber: issue.candidate.versionNumber,
        updatedAt: issue.candidate.readyAt ?? issue.candidate.createdAt,
        correctionRequired: false
      });
    } else if (issue.latestGeneration) {
      rows.push({
        id: issue.latestGeneration.runId,
        kind: "generation",
        period: issue.period,
        title: "Monthly report generation",
        status: issue.latestGeneration.status,
        updatedAt:
          issue.latestGeneration.finishedAt ?? issue.latestGeneration.startedAt ?? issue.latestGeneration.createdAt,
        correctionRequired: false
      });
    }
  }
  return rows.sort(
    (left, right) => right.period.localeCompare(left.period) || right.updatedAt.localeCompare(left.updatedAt)
  );
}

function claimTitle(claim: CustomerReportClaim): string {
  switch (claim.kind) {
    case "ranking_result":
      return claim.query;
    case "page_delivery":
      return claim.route;
    case "provider_handoff":
      return claim.provider + " handoff";
    case "live_health":
      return claim.health.replaceAll("_", " ");
    case "release_warning":
      return claim.title;
    case "rollback_correction":
      return "Rollback correction verified";
    case "future_opportunity":
      return claim.title;
  }
}

function claimSummary(claim: CustomerReportClaim): string {
  switch (claim.kind) {
    case "ranking_result":
      return "Rank " + String(claim.rank) + " / " + claim.milestone.replaceAll("_", " ");
    case "page_delivery":
      return "Version " + String(claim.versionNumber) + " / " + claim.deliveryState.replaceAll("_", " ");
    case "provider_handoff":
      return "Handed off " + formatDate(claim.handedOffAt);
    case "live_health":
      return "Verified " + formatDate(claim.checkedAt);
    case "release_warning":
      return claim.summary;
    case "rollback_correction":
      return "Restored " + formatDate(claim.occurredAt) + "; verified " + formatDate(claim.verifiedAt);
    case "future_opportunity":
      return claim.recommendedAction.replaceAll("_", " ");
  }
}

function projectApiPath(projectId: string, suffix: string): string {
  return "/projects/" + encodeURIComponent(projectId) + suffix;
}

function requiredCandidate(value: ReturnType<typeof CustomerReportCandidateDetailSchema.parse> | undefined) {
  if (!value) throw new Error("Report candidate is not loaded.");
  return value;
}

function requiredStagedArtifact(value: CustomerReportArtifactSummary | undefined): CustomerReportArtifactSummary {
  if (!value || value.status !== "staged") throw new Error("A staged report artifact is required for publication.");
  return value;
}

function toDateTimeLocal(value: string): string {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function shortDigest(value: string): string {
  return value.slice(0, 8) + "..." + value.slice(-8);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function reportStatusTone(status: string, correctionRequired: boolean): "neutral" | "success" | "warning" | "danger" {
  if (correctionRequired || status === "ready_for_review") return "warning";
  if (status === "published") return "success";
  if (status === "failed") return "danger";
  return "neutral";
}

function artifactTone(status: string | undefined): "neutral" | "success" | "warning" | "danger" {
  if (status === "staged") return "success";
  if (status === "failed" || status === "expired") return "danger";
  if (status === "pending" || status === "running") return "warning";
  return "neutral";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Report operation failed.";
}
