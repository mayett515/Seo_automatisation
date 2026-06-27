import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { StatusPill } from "@localseo/ui";
import { GscPerformanceSummarySchema, type GscPerformanceSummary } from "@localseo/contracts";
import { getJson } from "../lib/api";

export function PerformanceDashboardScreen() {
  const projectId = useProjectId();
  const performance = useQuery({
    queryKey: ["gsc-performance", projectId],
    queryFn: () => getJson(projectApiPath(projectId, "/gsc/performance"), GscPerformanceSummarySchema),
    retry: false
  });
  const data = performance.data;

  if (performance.isPending) {
    return <section className="screen-grid">Loading performance data</section>;
  }

  if (performance.isError) {
    return (
      <section className="screen-grid">
        <header className="screen-header">
          <div>
            <h1>Performance</h1>
            <p>Could not load performance data.</p>
          </div>
          <StatusPill tone="warning">error</StatusPill>
        </header>
      </section>
    );
  }

  if (!data || data.connection.status !== "connected") {
    return (
      <section className="screen-grid">
        <header className="screen-header">
          <div>
            <h1>Performance</h1>
            <p>{data?.connection.message ?? "Google Search Console connection required"}</p>
          </div>
          <StatusPill tone="warning">connection required</StatusPill>
        </header>
        <Link className="button-link" to="/projects/$projectId/gsc/connect" params={{ projectId }}>
          Connect GSC
        </Link>
      </section>
    );
  }

  return (
    <section className="screen-grid">
      <header className="screen-header">
        <div>
          <h1>Performance</h1>
          <p>{data.connection.propertyUrl}</p>
        </div>
        <StatusPill tone="neutral">internal radar</StatusPill>
      </header>

      <div className="metric-row">
        <Metric title="Latest sync" value={data.latestSync?.status ?? "none"} />
        <Metric title="Rows" value={String(data.latestSync?.rowCount ?? data.rows.length)} />
        <Metric title="Signals" value={String(data.opportunitySignals.length)} />
      </div>

      <section className="table-panel">
        <h2>Search Analytics</h2>
        <div className="data-table">
          <div className="data-table__row data-table__row--head">
            <span>Query</span>
            <span>Page</span>
            <span>Clicks</span>
            <span>Signals</span>
          </div>
          {data.rows.map((row) => (
            <div className="data-table__row" key={`${row.query}-${row.pageUrl}`}>
              <span>{row.query}</span>
              <span className="truncate">{safePathname(row.pageUrl)}</span>
              <span>{row.clicks}</span>
              <span>{signalsForRow(data, row.query, row.pageUrl).join(", ") || "none"}</span>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function Metric(props: { title: string; value: string }) {
  return (
    <article className="metric-card">
      <span>{props.title}</span>
      <strong>{props.value}</strong>
    </article>
  );
}

function signalsForRow(summary: GscPerformanceSummary, query: string, pageUrl: string): string[] {
  return summary.opportunitySignals
    .filter((signal) => signal.query === query && signal.pageUrl === pageUrl)
    .map((signal) => signal.signalType.replaceAll("_", " "));
}

function useProjectId(): string {
  const params = useParams({ strict: false });
  return typeof params.projectId === "string" ? params.projectId : "demo-project";
}

function projectApiPath(projectId: string, suffix: string): string {
  return `/projects/${encodeURIComponent(projectId)}${suffix}`;
}

function safePathname(pageUrl: string): string {
  try {
    return new URL(pageUrl).pathname;
  } catch {
    return pageUrl;
  }
}
