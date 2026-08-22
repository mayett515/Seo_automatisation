# Web application — React and TanStack

Render paths are pure, deterministic, and non-throwing. Effects belong in handlers, mutations, or effects—not in render.

- Render pending, error, blocked, empty, and success as distinct states where remote workflow data matters.
- Model exclusive UI workflows with discriminated unions or reducers rather than interacting booleans.
- Do not parse untrusted URLs or JSON directly in JSX.
- Keep hook ordering and dependency arrays honest; redesign unstable effects instead of omitting dependencies.
- User-triggered submits, approvals, deployments, and destructive actions use handlers or mutations, never state-toggle effects.
- Add memoization only for measured pressure or stable props of memoized children.
- TanStack Query owns server state. Do not hand-roll `useEffect + fetch + useState` for it.
- Query keys include every variable affecting fetched data. Successful mutations invalidate affected queries and expose visible pending/error/success state.
- TanStack Router owns route params and route-level contracts. Encode parameters in manually constructed URLs.
- Form, Table, Store, and Virtual are separate adoption decisions; use them only when their specific pressure exists.
- Scaffold-mutating CLI commands require explicit user approval.
