import { errorMessage } from "../../lib/error-message";
import type { OpportunityExplorerActionResult } from "../../screens/opportunity-explorer-data";
import { label } from "./opportunity-explorer-utils";

export function OpportunityExplorerActionNotice(props: { result: OpportunityExplorerActionResult | undefined }) {
  if (!props.result) {
    return null;
  }

  switch (props.result.kind) {
    case "scout_queued":
      return (
        <div className="notice notice--neutral">
          Scout response: {props.result.response.status.replaceAll("_", " ")}
          {props.result.response.runId ? ` (${props.result.response.runId})` : ""}
        </div>
      );
    case "proof_recorded":
      return (
        <div className="notice notice--neutral">
          Ranking proof recorded: {props.result.proof.query}, rank {props.result.proof.rank}
        </div>
      );
    case "decision_saved":
      return (
        <div className="notice notice--neutral">
          Opportunity decision saved: {label(props.result.opportunity.status)}
          {props.result.opportunity.statusReason ? ` (${props.result.opportunity.statusReason})` : ""}
        </div>
      );
    case "page_proposal_queued":
      return (
        <div className="notice notice--neutral">
          Page proposal response: {props.result.response.status.replaceAll("_", " ")}
          {props.result.response.runId ? ` (${props.result.response.runId})` : ""}
        </div>
      );
    case "scout_failed":
      return (
        <div className="notice notice--danger">
          {errorMessage(props.result.error, "Opportunity scout could not be queued.")}
        </div>
      );
    case "proof_failed":
      return (
        <div className="notice notice--danger">
          {errorMessage(props.result.error, "Ranking proof could not be recorded.")}
        </div>
      );
    case "decision_failed":
      return (
        <div className="notice notice--danger">
          {errorMessage(props.result.error, "Opportunity decision could not be saved.")}
        </div>
      );
    case "page_proposal_failed":
      return (
        <div className="notice notice--danger">
          {errorMessage(props.result.error, "Page proposal could not be queued.")}
        </div>
      );
  }
}
