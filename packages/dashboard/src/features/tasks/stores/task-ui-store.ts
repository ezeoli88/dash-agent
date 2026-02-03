'use client'

import { create } from 'zustand'
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
}

export const useTaskUIStore = create<TaskUIState>((set, get) => ({
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
}));
