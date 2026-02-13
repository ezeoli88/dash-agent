import { type ReactElement, type ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import userEvent from '@testing-library/user-event';
import { resetAllStores } from './reset-stores';

/**
 * Creates a fresh QueryClient configured for testing:
 * - No retries (fail fast)
 * - No garbage collection delay (clean between tests)
 */
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  queryClient?: QueryClient;
}

interface RouterRenderOptions extends CustomRenderOptions {
  routePath?: string;
  initialEntry?: string;
}

/**
 * Custom render that wraps the component with test-safe providers.
 *
 * Uses a minimal provider tree (QueryClientProvider only) to avoid
 * side-effects present in the production Providers component
 * (ServerRestartDetector, StateSync, ThemeProvider, etc.).
 *
 * For router-specific tests, set up routing separately.
 */
function renderWithProviders(
  ui: ReactElement,
  options: CustomRenderOptions = {},
) {
  const { queryClient = createTestQueryClient(), ...renderOptions } = options;

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient,
  };
}

function createTestRouter(
  ui: ReactElement,
  options: Pick<RouterRenderOptions, 'routePath' | 'initialEntry'> = {},
) {
  const { routePath = '/', initialEntry = '/' } = options;

  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  });

  const testRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: routePath,
    component: () => ui,
  });

  const routeTree = rootRoute.addChildren([testRoute]);

  return createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [initialEntry],
    }),
  });
}

function renderWithRouterProviders(
  ui: ReactElement,
  options: RouterRenderOptions = {},
) {
  const {
    queryClient = createTestQueryClient(),
    routePath = '/',
    initialEntry = '/',
    ...renderOptions
  } = options;

  const router = createTestRouter(ui, { routePath, initialEntry });

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
      renderOptions,
    ),
    queryClient,
    router,
  };
}

function resetTestState() {
  resetAllStores();
}

// Re-export everything from RTL so tests can import from one place
export * from '@testing-library/react';

export {
  renderWithProviders,
  renderWithRouterProviders,
  createTestQueryClient,
  createTestRouter,
  resetTestState,
  userEvent,
};
