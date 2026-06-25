export function StatusPill(props: { tone: "neutral" | "success" | "warning" | "danger"; children: string }) {
  return <span className={`status-pill status-pill--${props.tone}`}>{props.children}</span>;
}
