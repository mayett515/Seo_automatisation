import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { StatusPill } from "@localseo/ui";
import {
  LatestWebsiteImportResponseSchema,
  WebsiteImportQueueResponseSchema,
  type WebsiteImportRun
} from "@localseo/contracts";
import { getJson, postJson } from "../lib/api";

export function ProjectDashboardScreen() {
  const projectId = useProjectId();
  const queryClient = useQueryClient();
  const [sourceUrl, setSourceUrl] = useState("");
  const importQuery = useQuery({
    queryKey: ["website-import-latest", projectId],
    queryFn: () => getJson(projectApiPath(projectId, "/import-website/latest"), LatestWebsiteImportResponseSchema),
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data;
      const status = data?.importRun?.status;
      return status === "queued" || status === "running" ? 3000 : false;
    }
  });
  const importWebsite = useMutation({
    mutationFn: () =>
      postJson(
        projectApiPath(projectId, "/import-website"),
        {
          sourceUrl
        },
        WebsiteImportQueueResponseSchema
      ),
    onSuccess: async (response) => {
      setSourceUrl(response.sourceUrl ?? "");
      await queryClient.invalidateQueries({ queryKey: ["website-import-latest", projectId] });
    }
  });
  const importRun = importQuery.data?.importRun;

  return (
    <section className="screen-grid">
      <header className="screen-header">
        <div>
          <h1>Project Dashboard</h1>
          <p>{projectId}</p>
        </div>
        <StatusPill tone={importRunTone(importRun)}>
          {importRun?.status.replaceAll("_", " ") ?? "not imported"}
        </StatusPill>
      </header>

      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          importWebsite.mutate();
        }}
      >
        <label className="form-field">
          <span>Website URL</span>
          <input
            placeholder="https://example.com"
            type="url"
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            required
          />
        </label>
        <button className="button-primary" type="submit" disabled={importWebsite.isPending || sourceUrl.length === 0}>
          Import
        </button>
      </form>

      {importWebsite.data ? (
        <div className="notice notice--neutral">Import response: {importWebsite.data.status.replaceAll("_", " ")}</div>
      ) : null}
      {importWebsite.isError ? <div className="notice notice--danger">Website import could not be queued.</div> : null}
      {importQuery.isError ? (
        <div className="notice notice--danger">Website import status could not be loaded.</div>
      ) : null}

      <ImportEvidence run={importRun} />
    </section>
  );
}

function ImportEvidence(props: { run?: WebsiteImportRun }) {
  if (!props.run) {
    return (
      <section className="table-panel">
        <h2>Website evidence</h2>
        <div className="notice notice--neutral">No website import has been recorded for this project.</div>
      </section>
    );
  }

  return (
    <section className="table-panel">
      <h2>Website evidence</h2>
      <div className="metric-row">
        <EvidenceMetric title="Source" value={props.run.sourceUrl} />
        <EvidenceMetric title="Pages" value={props.run.pageCount.toString()} />
        <EvidenceMetric title="Artifact" value={props.run.artifactKey ?? "pending"} />
      </div>

      <div className="fact-grid">
        <FactPanel
          title="Brand"
          items={
            props.run.facts?.brand ? [factLabel(props.run.facts.brand.name, props.run.facts.brand.confidence)] : []
          }
        />
        <FactPanel
          title="Services"
          items={props.run.facts?.services.map((fact) => factLabel(fact.value, fact.confidence)) ?? []}
        />
        <FactPanel
          title="Areas"
          items={props.run.facts?.areas.map((fact) => factLabel(fact.value, fact.confidence)) ?? []}
        />
        <FactPanel title="Routes" items={props.run.discoveredRoutes} />
      </div>
    </section>
  );
}

function EvidenceMetric(props: { title: string; value: string }) {
  return (
    <article className="metric-card">
      <span>{props.title}</span>
      <strong className="truncate">{props.value}</strong>
    </article>
  );
}

function FactPanel(props: { title: string; items: string[] }) {
  return (
    <article className="fact-panel">
      <h3>{props.title}</h3>
      <div className="chip-row">
        {props.items.length > 0 ? props.items.map((item) => <span key={item}>{item}</span>) : <span>None yet</span>}
      </div>
    </article>
  );
}

function factLabel(value: string, confidence: "low" | "medium" | "high"): string {
  return `${value} (${confidence})`;
}

function importRunTone(run: WebsiteImportRun | undefined): "neutral" | "success" | "warning" | "danger" {
  if (!run) {
    return "neutral";
  }

  if (run.status === "completed") {
    return "success";
  }

  if (run.status === "failed") {
    return "danger";
  }

  return "warning";
}

function useProjectId(): string {
  const params = useParams({ strict: false });
  return typeof params.projectId === "string" ? params.projectId : "demo-project";
}

function projectApiPath(projectId: string, suffix: string): string {
  return `/projects/${encodeURIComponent(projectId)}${suffix}`;
}
