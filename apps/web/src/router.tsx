import {
  Link,
  Navigate,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  useNavigate,
  useRouterState
} from "@tanstack/react-router";
import { ShellLayout, StatusPill } from "@localseo/ui";
import { authClient } from "./lib/auth-client";
import { allowsLocalScaffoldUi } from "./lib/local-scaffold";
import { GscConnectScreen } from "./screens/gsc-connect";
import { LoginScreen } from "./screens/login";
import { MissionControlPage } from "./screens/mission-control";
import { OpportunityExplorerScreen } from "./screens/opportunity-explorer";
import { PagePreviewScreen, PagesScreen } from "./screens/pages";
import { PerformanceDashboardScreen } from "./screens/performance-dashboard";
import { PlaceholderScreen } from "./screens/placeholder-screen";
import { ProjectDashboardScreen } from "./screens/project-dashboard";
import { TrackingKeysScreen } from "./screens/tracking-keys";

function RootLayout() {
  const location = useRouterState({ select: (state) => state.location });
  const isLoginRoute = location.pathname === "/login";

  if (isLoginRoute) {
    return <Outlet />;
  }

  if (allowsLocalScaffoldUi()) {
    return <AuthenticatedShell userEmail="local scaffold" />;
  }

  return <SessionProtectedShell redirectTo={redirectPathFor(location)} />;
}

function SessionProtectedShell(props: { redirectTo: string }) {
  const session = authClient.useSession();
  const navigate = useNavigate();

  if (session.isPending) {
    return (
      <main className="auth-screen">
        <div className="auth-panel">Checking session</div>
      </main>
    );
  }

  if (session.error) {
    return (
      <main className="auth-screen">
        <div className="auth-panel">
          <p>Could not reach the authentication service.</p>
          <button className="button-secondary" type="button" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (!session.data) {
    return <Navigate to="/login" search={{ redirect: props.redirectTo }} />;
  }

  return (
    <AuthenticatedShell
      userEmail={session.data.user.email}
      onSignOut={async () => {
        await authClient.signOut();
        await navigate({ to: "/login", search: { redirect: undefined } });
      }}
    />
  );
}

function AuthenticatedShell(props: { userEmail: string; onSignOut?: () => Promise<void> }) {
  return (
    <ShellLayout
      title="Local SEO Mission Control"
      navigation={
        <nav className="nav-list">
          <Link to="/">Mission Control</Link>
          <Link to="/audit">Audit</Link>
          <Link to="/projects/$projectId" params={{ projectId: "demo-project" }}>
            Project
          </Link>
          <Link to="/projects/$projectId/opportunities" params={{ projectId: "demo-project" }}>
            Opportunities
          </Link>
          <Link to="/projects/$projectId/pages" params={{ projectId: "demo-project" }}>
            Pages
          </Link>
          <Link to="/projects/$projectId/releases" params={{ projectId: "demo-project" }}>
            Releases
          </Link>
          <Link to="/projects/$projectId/gsc/connect" params={{ projectId: "demo-project" }}>
            GSC
          </Link>
          <Link to="/projects/$projectId/tracking-keys" params={{ projectId: "demo-project" }}>
            Tracking
          </Link>
        </nav>
      }
      rightPanel={
        <div className="panel-stack">
          <StatusPill tone="warning">Preview required</StatusPill>
          <div className="shell-user">
            <span>{props.userEmail}</span>
            {props.onSignOut ? (
              <button className="button-secondary" type="button" onClick={props.onSignOut}>
                Sign out
              </button>
            ) : null}
          </div>
          <p>AI suggests. Customer approves. Workers execute.</p>
        </div>
      }
    >
      <Outlet />
    </ShellLayout>
  );
}

function redirectPathFor(location: { pathname: string; searchStr?: string }): string {
  return `${location.pathname}${location.searchStr ?? ""}`;
}

const rootRoute = createRootRoute({ component: RootLayout });

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined
  }),
  component: LoginScreen
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: MissionControlPage
});

const auditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/audit",
  component: () => <PlaceholderScreen title="Pre-Sales Audit" />
});

const auditReportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/audit/$leadId/report",
  component: () => <PlaceholderScreen title="Potential Report" />
});

const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId",
  component: ProjectDashboardScreen
});

const projectPagesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId/pages",
  component: PagesRouteComponent
});

const projectOpportunitiesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId/opportunities",
  component: OpportunitiesRouteComponent
});

const projectPagePreviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId/pages/$pageId/preview",
  component: PagePreviewRouteComponent
});

const projectChildRoutes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/website",
    component: () => <PlaceholderScreen title="Main Website Preview" />
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/areas",
    component: () => <PlaceholderScreen title="Areas and Radius" />
  }),
  projectOpportunitiesRoute,
  projectPagesRoute,
  projectPagePreviewRoute,
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/approvals",
    component: () => <PlaceholderScreen title="Approval Queue" />
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/releases",
    component: () => <PlaceholderScreen title="Release Queue" />
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/releases/$releasePlanId",
    component: () => <PlaceholderScreen title="Release Detail" />
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/releases/$releasePlanId/checks",
    component: () => <PlaceholderScreen title="Preflight Checks" />
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/releases/$releasePlanId/notes",
    component: () => <PlaceholderScreen title="Release Notes" />
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/releases/$releasePlanId/rollback",
    component: () => <PlaceholderScreen title="Rollback Panel" />
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/gsc/connect",
    component: GscConnectScreen
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/performance",
    component: PerformanceDashboardScreen
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/tracking-keys",
    component: TrackingKeysScreen
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/map",
    component: () => <PlaceholderScreen title="Dynamic SEO Map" />
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/bundles",
    component: () => <PlaceholderScreen title="Bundles" />
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/reports",
    component: () => <PlaceholderScreen title="Google Lagebericht" />
  })
];

function PagesRouteComponent() {
  const params = projectPagesRoute.useParams();
  return <PagesScreen projectId={params.projectId} />;
}

function OpportunitiesRouteComponent() {
  const params = projectOpportunitiesRoute.useParams();
  return <OpportunityExplorerScreen projectId={params.projectId} />;
}

function PagePreviewRouteComponent() {
  const params = projectPagePreviewRoute.useParams();
  return <PagePreviewScreen pageVersionId={params.pageId} projectId={params.projectId} />;
}

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  auditRoute,
  auditReportRoute,
  projectRoute,
  ...projectChildRoutes
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
