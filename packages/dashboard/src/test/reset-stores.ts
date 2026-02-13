import { useRepoStore } from '../features/repos/stores/repo-store';
import { usePreferencesStore } from '../features/settings/stores/preferences-store';
import { useSetupStore } from '../features/setup/stores/setup-store';
import { useTaskUIStore } from '../features/tasks/stores/task-ui-store';
import { useLayoutStore } from '../stores/layout-store';

const PERSISTED_STORAGE_KEYS = [
  'dash-agent-preferences',
  'dash-agent-task-ui',
  'layout-storage',
  'dash-agent-setup-v2',
];

/**
 * Resets all app stores and persisted browser state between tests.
 * This prevents cross-test pollution when using Zustand persist stores.
 */
export function resetAllStores() {
  // Clear persisted storage first so old snapshots do not leak into new tests.
  for (const key of PERSISTED_STORAGE_KEYS) {
    window.localStorage.removeItem(key);
  }
  window.sessionStorage.clear();

  useRepoStore.getState().reset();
  usePreferencesStore.getState().resetPreferences();
  useSetupStore.getState().resetSetup();

  useTaskUIStore.setState({
    statusFilter: [],
    searchQuery: '',
    isCreateModalOpen: false,
    isAutoScrollEnabled: true,
    selectedTaskId: null,
    taskLogs: {},
    unreadComments: {},
    drawerTaskId: null,
    lastAgentType: null,
    lastAgentModel: null,
  });

  useLayoutStore.setState({
    isSidebarCollapsed: false,
    isMobileNavOpen: false,
  });
}

