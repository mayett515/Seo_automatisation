export function ScoutRunForm(props: {
  maxBriefs: string;
  isActive: boolean;
  isPending: boolean;
  onMaxBriefsChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="command-card"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit();
      }}
    >
      <label className="form-field">
        <span>Scout briefs</span>
        <input
          min="1"
          max="12"
          type="number"
          value={props.maxBriefs}
          onChange={(event) => props.onMaxBriefsChange(event.target.value)}
        />
      </label>
      <button className="button-primary" type="submit" disabled={props.isPending || props.isActive}>
        {props.isActive ? "Run active" : "Run scout"}
      </button>
    </form>
  );
}
