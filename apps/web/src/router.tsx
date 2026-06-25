import { Link, Outlet, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { ShellLayout, StatusPill } from "@localseo/ui";
import { GscConnectScreen } from "./screens/gsc-connect";
import { MissionControlPage } from "./screens/mission-control";
import { PerformanceDashboardScreen } from "./screens/performance-dashboard";
import { PlaceholderScreen } from "./screens/placeholder-screen";

function RootLayout() {
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
          <Link to="/projects/$projectId/releases" params={{ projectId: "demo-project" }}>
            Releases
          </Link>
          <Link to="/projects/$projectId/gsc/connect" params={{ projectId: "demo-project" }}>
            GSC
          </Link>
        </nav>
      }
      rightPanel={
        <div className="panel-stack">
          <StatusPill tone="warning">Preview required</StatusPill>
          <p>AI suggests. Customer approves. Workers execute.</p>
        </div>
      }
    >
      <Outlet />
    </ShellLayout>
  );
}

const rootRoute = createRootRoute({ component: RootLayout });

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
  component: () => <PlaceholderScreen title="Project Dashboard" />
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
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/opportunities",
    component: () => <PlaceholderScreen title="Opportunities" />
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/pages",
    component: () => <PlaceholderScreen title="Local Pages" />
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/pages/$pageId/preview",
    component: () => <PlaceholderScreen title="Preview and Notes" />
  }),
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

const routeTree = rootRoute.addChildren([
  indexRoute,
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
