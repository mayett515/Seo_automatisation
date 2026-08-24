import type { AgentRunSummary } from "@localseo/contracts";
import { StatusPill } from "@localseo/ui";
import { agentRunDescription, runStatusTone } from "./opportunity-explorer-utils";

export function AgentRunList(props: {
  emptyMessage: string;
  isError: boolean;
  isPending: boolean;
  runs: AgentRunSummary[];
  title: string;
}) {
  return (
    <section className="table-panel">
      <h2>{props.title}</h2>
      {props.isPending ? <div className="notice notice--neutral">Loading runs</div> : null}
      {props.isError ? <div className="notice notice--danger">Agent runs could not be loaded.</div> : null}
      <div className="run-list">
        {props.runs.map((run) => (
          <article className="run-item" key={run.id}>
            <StatusPill tone={runStatusTone(run.status)}>{run.status}</StatusPill>
            <div>
              <strong>{run.task}</strong>
              <span>{agentRunDescription(run)}</span>
            </div>
            <span>{run.model ?? run.provider ?? "not started"}</span>
          </article>
        ))}
        {props.runs.length === 0 && !props.isPending ? (
          <div className="notice notice--neutral">{props.emptyMessage}</div>
        ) : null}
      </div>
    </section>
  );
}
