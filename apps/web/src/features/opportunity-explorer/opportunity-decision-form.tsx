import { useForm } from "@tanstack/react-form";
import { StatusPill } from "@localseo/ui";
import type { OpportunityExplorerOpportunity } from "@localseo/contracts";
import { normalizedReason, type OpportunityDecisionFormState } from "../../screens/opportunity-explorer-data";
import { decisionLabel, label, lifecycleTone, opportunityDecisionStatuses } from "./opportunity-explorer-utils";

export function OpportunityDecisionForm(props: {
  opportunity: OpportunityExplorerOpportunity;
  isPending: boolean;
  onSubmit: (decision: OpportunityDecisionFormState) => void;
}) {
  const form = useForm({
    defaultValues: {
      status: props.opportunity.status === "brief_created" ? "monitoring" : props.opportunity.status,
      reason: props.opportunity.statusReason ?? ""
    } satisfies OpportunityDecisionFormState,
    onSubmit: ({ value }) => {
      if (value.status === "rejected" && normalizedReason(value.reason) === undefined) {
        return;
      }

      props.onSubmit(value);
    }
  });

  return (
    <form
      className="decision-card"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="decision-card__header">
        <h3>Operator decision</h3>
        <StatusPill tone={lifecycleTone(props.opportunity.status)}>{label(props.opportunity.status)}</StatusPill>
      </div>
      <form.Field name="status">
        {(field) => (
          <div className="decision-button-row">
            {opportunityDecisionStatuses.map((status) => (
              <button
                className={`button-secondary${field.state.value === status ? " button-secondary--active" : ""}`}
                key={status}
                type="button"
                onClick={() => field.handleChange(status)}
              >
                {decisionLabel(status)}
              </button>
            ))}
          </div>
        )}
      </form.Field>
      <form.Field name="reason">
        {(field) => (
          <label className="form-field">
            <span>Reason</span>
            <textarea
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="Required when rejecting; optional for hold or monitor."
            />
          </label>
        )}
      </form.Field>
      <form.Subscribe selector={(state) => ({ isSubmitting: state.isSubmitting, values: state.values })}>
        {(state) => {
          const rejectNeedsReason =
            state.values.status === "rejected" && normalizedReason(state.values.reason) === undefined;
          return (
            <button
              className="button-primary"
              type="submit"
              disabled={props.isPending || state.isSubmitting || rejectNeedsReason}
            >
              Save decision
            </button>
          );
        }}
      </form.Subscribe>
    </form>
  );
}
