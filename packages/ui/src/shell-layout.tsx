import type { ReactNode } from "react";

export function ShellLayout(props: {
  title: string;
  navigation: ReactNode;
  rightPanel?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <strong>{props.title}</strong>
      </header>
      <aside className="app-shell__nav">{props.navigation}</aside>
      <main className="app-shell__main">{props.children}</main>
      {props.rightPanel ? <aside className="app-shell__panel">{props.rightPanel}</aside> : null}
    </div>
  );
}
