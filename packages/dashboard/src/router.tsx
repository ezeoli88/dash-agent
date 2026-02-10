import { createRouter, createRoute, createRootRoute, Outlet, redirect } from '@tanstack/react-router'
import { Providers } from '@/components/shared/providers'
import { MainLayout } from '@/components/layout/main-layout'

// Lazy imports for pages to enable code splitting
import HomePage from '@/app/page'
import BoardPage from '@/app/board/page'
import DiffPage from '@/app/diff/[taskId]/page'
import ReposPage from '@/app/repos/page'
import SettingsPage from '@/app/settings/page'

// Root route - wraps everything with Providers
const rootRoute = createRootRoute({
  component: () => (
    <Providers>
      <Outlet />
    </Providers>
  ),
})

// Layout route for pages that use MainLayout (Header + content)
const mainLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'main-layout',
  component: () => (
    <MainLayout>
      <Outlet />
    </MainLayout>
  ),
})

// Index route - smart redirect based on repos
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
})

// Board route
const boardRoute = createRoute({
  getParentRoute: () => mainLayoutRoute,
  path: '/board',
  component: BoardPage,
})

// Diff route
const diffRoute = createRoute({
  getParentRoute: () => mainLayoutRoute,
  path: '/diff/$taskId',
  component: DiffPage,
})

// Repos route (no MainLayout - has its own full-page layout)
const reposRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/repos',
  component: ReposPage,
})

// Setup route - redirect to /repos
const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  beforeLoad: () => {
    throw redirect({ to: '/repos' })
  },
})

// Settings route
const settingsRoute = createRoute({
  getParentRoute: () => mainLayoutRoute,
  path: '/settings',
  component: SettingsPage,
})

// Build route tree
const routeTree = rootRoute.addChildren([
  indexRoute,
  reposRoute,
  setupRoute,
  mainLayoutRoute.addChildren([
    boardRoute,
    diffRoute,
    settingsRoute,
  ]),
])

// Create and export router
export const router = createRouter({ routeTree })

// Type registration for TanStack Router
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
