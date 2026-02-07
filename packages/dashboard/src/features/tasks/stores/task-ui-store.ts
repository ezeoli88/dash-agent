'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TaskStatus, LogEntry } from '../types'

interface TaskUIState {
  // Filter state
  statusFilter: TaskStatus[];
  searchQuery: string;
  setStatusFilter: (statuses: TaskStatus[]) => void;
  setSearchQuery: (query: string) => void;
  clearFilters: () => void;

  // Create modal state
  isCreateModalOpen: boolean;
  openCreateModal: () => void;
  closeCreateModal: () => void;

  // Auto-scroll state for logs
  isAutoScrollEnabled: boolean;
  toggleAutoScroll: () => void;

  // Selected task for detail view
  selectedTaskId: string | null;
  setSelectedTaskId: (taskId: string | null) => void;

  // Task logs state - persisted across tab switches
  taskLogs: Record<string, LogEntry[]>;
  addTaskLog: (taskId: string, log: LogEntry) => void;
  addTaskLogs: (taskId: string, logs: LogEntry[]) => void;
  setTaskLogs: (taskId: string, logs: LogEntry[]) => void;
  clearTaskLogs: (taskId: string) => void;
  getTaskLogs: (taskId: string) => LogEntry[];

  // Unread PR comments state - persisted to localStorage
  // Map of taskId to Set of unread comment IDs
  unreadComments: Record<string, number[]>;
  addUnreadComment: (taskId: string, commentId: number) => void;
  markCommentAsRead: (taskId: string, commentId: number) => void;
  markAllCommentsAsRead: (taskId: string) => void;
  getUnreadCount: (taskId: string) => number;
  hasUnreadComments: (taskId: string) => boolean;

  // Drawer state (ephemeral, not persisted)
  drawerTaskId: string | null;
  openDrawer: (taskId: string) => void;
  closeDrawer: () => void;

  // Last used agent preferences (persisted)
  lastAgentType: string | null;
  lastAgentModel: string | null;
  setLastAgent: (agentType: string | null, agentModel: string | null) => void;
}

// Persisted state (stored in localStorage)
interface PersistedState {
  unreadComments: Record<string, number[]>;
  lastAgentType: string | null;
  lastAgentModel: string | null;
}

export const useTaskUIStore = create<TaskUIState>()(
  persist(
    (set, get) => ({
      // Filter state
      statusFilter: [],
      searchQuery: '',
      setStatusFilter: (statuses) => set({ statusFilter: statuses }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      clearFilters: () => set({ statusFilter: [], searchQuery: '' }),

      // Create modal state
      isCreateModalOpen: false,
      openCreateModal: () => set({ isCreateModalOpen: true }),
      closeCreateModal: () => set({ isCreateModalOpen: false }),

      // Auto-scroll state
      isAutoScrollEnabled: true,
      toggleAutoScroll: () => set((state) => ({
        isAutoScrollEnabled: !state.isAutoScrollEnabled
      })),

      // Selected task
      selectedTaskId: null,
      setSelectedTaskId: (taskId) => set({ selectedTaskId: taskId }),

      // Task logs state - persisted across tab switches
      taskLogs: {},
      addTaskLog: (taskId, log) => set((state) => ({
        taskLogs: {
          ...state.taskLogs,
          [taskId]: [...(state.taskLogs[taskId] || []), log],
        },
      })),
      addTaskLogs: (taskId, logs) => set((state) => ({
        taskLogs: {
          ...state.taskLogs,
          [taskId]: [...(state.taskLogs[taskId] || []), ...logs],
        },
      })),
      setTaskLogs: (taskId, logs) => set((state) => ({
        taskLogs: {
          ...state.taskLogs,
          [taskId]: logs,
        },
      })),
      clearTaskLogs: (taskId) => set((state) => ({
        taskLogs: {
          ...state.taskLogs,
          [taskId]: [],
        },
      })),
      getTaskLogs: (taskId) => get().taskLogs[taskId] || [],

      // Drawer state (ephemeral, not persisted)
      drawerTaskId: null,
      openDrawer: (taskId) => set({ drawerTaskId: taskId }),
      closeDrawer: () => set({ drawerTaskId: null }),

      // Last used agent preferences (persisted)
      lastAgentType: null,
      lastAgentModel: null,
      setLastAgent: (agentType, agentModel) => set({ lastAgentType: agentType, lastAgentModel: agentModel }),

      // Unread comments state
      unreadComments: {},
      addUnreadComment: (taskId, commentId) => set((state) => {
        const currentUnread = state.unreadComments[taskId] || [];
        if (currentUnread.includes(commentId)) {
          return state; // Already marked as unread
        }
        return {
          unreadComments: {
            ...state.unreadComments,
            [taskId]: [...currentUnread, commentId],
          },
        };
      }),
      markCommentAsRead: (taskId, commentId) => set((state) => {
        const currentUnread = state.unreadComments[taskId] || [];
        return {
          unreadComments: {
            ...state.unreadComments,
            [taskId]: currentUnread.filter((id) => id !== commentId),
          },
        };
      }),
      markAllCommentsAsRead: (taskId) => set((state) => ({
        unreadComments: {
          ...state.unreadComments,
          [taskId]: [],
        },
      })),
      getUnreadCount: (taskId) => (get().unreadComments[taskId] || []).length,
      hasUnreadComments: (taskId) => (get().unreadComments[taskId] || []).length > 0,
    }),
    {
      name: 'dash-agent-task-ui',
      // Persist unreadComments and last agent preferences to localStorage
      partialize: (state): PersistedState => ({
        unreadComments: state.unreadComments,
        lastAgentType: state.lastAgentType,
        lastAgentModel: state.lastAgentModel,
      }),
    }
  )
);
