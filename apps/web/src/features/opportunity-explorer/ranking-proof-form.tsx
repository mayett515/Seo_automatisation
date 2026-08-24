import { useForm } from "@tanstack/react-form";
import { StatusPill } from "@localseo/ui";
import type { RankingProof } from "@localseo/contracts";
import { normalizedReason, type RankingProofFormState } from "../../screens/opportunity-explorer-data";
import { safeUrlLabel } from "./opportunity-explorer-utils";

export function RankingProofForm(props: {
  value: RankingProofFormState;
  isPending: boolean;
  onChange: (value: RankingProofFormState) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="command-card command-card--wide"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit();
      }}
    >
      <label className="form-field">
        <span>Query</span>
        <input
          value={props.value.query}
          onChange={(event) => props.onChange({ ...props.value, query: event.target.value })}
          required
        />
      </label>
      <label className="form-field">
        <span>Page URL</span>
        <input
          type="url"
          value={props.value.pageUrl}
          onChange={(event) => props.onChange({ ...props.value, pageUrl: event.target.value })}
          required
        />
      </label>
      <label className="form-field form-field--small">
        <span>Rank</span>
        <input
          min="1"
          max="100"
          type="number"
          value={props.value.rank}
          onChange={(event) => props.onChange({ ...props.value, rank: event.target.value })}
          required
        />
      </label>
      <label className="form-field">
        <span>Note</span>
        <input
          value={props.value.notes}
          onChange={(event) => props.onChange({ ...props.value, notes: event.target.value })}
        />
      </label>
      <button className="button-secondary" type="submit" disabled={props.isPending}>
        Add proof
      </button>
    </form>
  );
}

export function RankingProofList(props: {
  proofs: RankingProof[];
  isPending: boolean;
  isError: boolean;
  mutationPending: boolean;
  onUpdate: (proof: RankingProof, status: "reviewed" | "invalidated", reason?: string) => void;
}) {
  return (
    <section className="table-panel">
      <h2>Ranking proof</h2>
      {props.isPending ? <div className="notice notice--neutral">Loading proof</div> : null}
      {props.isError ? <div className="notice notice--danger">Ranking proof could not be loaded.</div> : null}
      <div className="run-list">
        {props.proofs.map((proof) => (
          <article className="run-item" key={proof.id}>
            <StatusPill tone={proof.rank <= 10 ? "success" : "neutral"}>{`rank ${proof.rank}`}</StatusPill>
            <div>
              <strong>{proof.query}</strong>
              <span>{safeUrlLabel(proof.pageUrl)}</span>
              <RankingProofActions isPending={props.mutationPending} proof={proof} onUpdate={props.onUpdate} />
            </div>
            <StatusPill
              tone={proof.status === "reviewed" ? "success" : proof.status === "invalidated" ? "danger" : "warning"}
            >
              {proof.status}
            </StatusPill>
          </article>
        ))}
        {props.proofs.length === 0 && !props.isPending ? (
          <div className="notice notice--neutral">No manual ranking proof has been recorded.</div>
        ) : null}
      </div>
    </section>
  );
}

function RankingProofActions(props: {
  proof: RankingProof;
  isPending: boolean;
  onUpdate: (proof: RankingProof, status: "reviewed" | "invalidated", reason?: string) => void;
}) {
  const form = useForm({
    defaultValues: { reason: "" },
    onSubmit: ({ value }) => {
      const reason = normalizedReason(value.reason);
      if (reason) props.onUpdate(props.proof, "invalidated", reason);
    }
  });

  if (props.proof.status === "captured") {
    return (
      <button
        className="button-secondary"
        disabled={props.isPending}
        type="button"
        onClick={() => props.onUpdate(props.proof, "reviewed")}
      >
        Confirm proof
      </button>
    );
  }

  if (props.proof.status !== "reviewed") return null;

  return (
    <form
      className="knowledge-reject-form"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="reason">
        {(field) => (
          <input
            aria-label={`Invalidation reason for ${props.proof.query}`}
            maxLength={2000}
            placeholder="Invalidation reason"
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
          />
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.values.reason.trim().length > 0}>
        {(hasReason) => (
          <button className="button-secondary" disabled={!hasReason || props.isPending} type="submit">
            Invalidate
          </button>
        )}
      </form.Subscribe>
    </form>
  );
}
