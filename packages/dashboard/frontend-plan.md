# Agent Board - Plan de Implementacion Frontend

## Descripcion General

Dashboard web para gestionar tareas de un agente IA autonomo. Permite crear tareas, monitorear su ejecucion en tiempo real via SSE, enviar feedback al agente, revisar cambios (diff) y aprobar la creacion de PRs.

---

## 1. Stack Tecnologico

### Core

| Tecnologia | Version | Justificacion |
|------------|---------|---------------|
| **Next.js** | 15.x | App Router, React Server Components, Server Actions, optimizaciones automaticas |
| **React** | 19.x | Concurrent features, Server Components, React Compiler |
| **TypeScript** | 5.7+ | Tipado estricto, mejor DX, inferencia avanzada |
| **TailwindCSS** | 4.x | Utility-first, design tokens, dark mode, responsive |

### State Management

| Libreria | Uso |
|----------|-----|
| **TanStack Query v5** | Server state en Client Components: fetching, caching, sync con backend |
| **Zustand** | Client state: UI state, SSE connections, modals |

### UI y Componentes

| Libreria | Uso |
|----------|-----|
| **shadcn/ui** | Componentes pre-construidos accesibles basados en Radix UI |
| **Radix UI** | Primitivos headless (via shadcn/ui) |
| **Lucide React** | Iconografia consistente (incluido con shadcn/ui) |
| **tailwind-merge + clsx** | Composicion de clases (via shadcn/ui cn utility) |
| **react-diff-viewer-continued** | Visualizacion de diffs con syntax highlighting |
| **react-hook-form + zod** | Formularios con validacion type-safe |

### Testing

| Herramienta | Uso |
|-------------|-----|
| **Vitest** | Unit tests, mocks, coverage |
| **React Testing Library** | Integration tests de componentes |
| **MSW** | Mock del backend para tests deterministas |
| **Playwright** | E2E tests (fase posterior) |

### Herramientas de Desarrollo

| Herramienta | Uso |
|-------------|-----|
| **ESLint** | Linting con reglas de Next.js/React/TypeScript |
| **Prettier** | Formateo consistente |
| **TypeScript strict mode** | Maxima seguridad de tipos |

---

## 2. Estructura de Carpetas (App Router)

```
frontend/
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
├── package.json
├── .env.example
├── .env.local
├── components.json              # Config de shadcn/ui
│
├── public/
│   └── favicon.svg
│
├── src/
│   ├── app/                     # App Router
│   │   ├── layout.tsx           # Root layout (Server Component)
│   │   ├── page.tsx             # Home -> redirect to /tasks
│   │   ├── loading.tsx          # Global loading state
│   │   ├── error.tsx            # Global error boundary
│   │   ├── not-found.tsx        # 404 page
│   │   ├── globals.css          # Tailwind imports + custom styles
│   │   │
│   │   ├── tasks/
│   │   │   ├── layout.tsx       # Tasks layout con sidebar
│   │   │   ├── page.tsx         # Lista de tareas (default view)
│   │   │   ├── loading.tsx      # Loading state para lista
│   │   │   ├── error.tsx        # Error boundary para tasks
│   │   │   │
│   │   │   └── [taskId]/
│   │   │       ├── page.tsx     # Detalle de tarea
│   │   │       ├── loading.tsx  # Loading state para detalle
│   │   │       └── error.tsx    # Error boundary para detalle
│   │   │
│   │   └── api/                 # Route Handlers (si se necesitan)
│   │       └── health/
│   │           └── route.ts
│   │
│   ├── components/              # Componentes reutilizables
│   │   ├── ui/                  # Componentes shadcn/ui
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── textarea.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── skeleton.tsx
│   │   │   ├── toast.tsx
│   │   │   ├── toaster.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── scroll-area.tsx
│   │   │   └── separator.tsx
│   │   │
│   │   ├── layout/              # Componentes de layout
│   │   │   ├── header.tsx
│   │   │   ├── sidebar.tsx
│   │   │   ├── main-layout.tsx
│   │   │   └── mobile-nav.tsx
│   │   │
│   │   └── shared/              # Componentes compartidos
│   │       ├── status-badge.tsx
│   │       ├── empty-state.tsx
│   │       ├── error-boundary.tsx
│   │       └── providers.tsx    # Client providers wrapper
│   │
│   ├── features/                # Features por dominio
│   │   └── tasks/
│   │       ├── components/
│   │       │   ├── task-list.tsx           # Client Component
│   │       │   ├── task-list-item.tsx      # Client Component
│   │       │   ├── task-list-skeleton.tsx  # Server Component
│   │       │   ├── task-detail.tsx         # Client Component
│   │       │   ├── task-header.tsx
│   │       │   ├── task-actions.tsx        # Client Component
│   │       │   ├── task-metadata.tsx
│   │       │   ├── task-form.tsx           # Client Component
│   │       │   ├── task-form-dialog.tsx    # Client Component
│   │       │   ├── task-logs.tsx           # Client Component (SSE)
│   │       │   ├── log-entry.tsx
│   │       │   ├── task-diff.tsx           # Client Component
│   │       │   ├── diff-viewer.tsx
│   │       │   ├── file-changes.tsx
│   │       │   └── feedback-form.tsx       # Client Component
│   │       │
│   │       ├── hooks/
│   │       │   ├── query-keys.ts           # TanStack Query keys factory
│   │       │   ├── use-tasks.ts            # TanStack Query hook
│   │       │   ├── use-task.ts
│   │       │   ├── use-create-task.ts
│   │       │   ├── use-task-actions.ts     # execute, approve, cancel, extend
│   │       │   └── use-task-sse.ts         # SSE subscription
│   │       │
│   │       ├── actions/                    # Server Actions
│   │       │   ├── create-task.ts
│   │       │   ├── execute-task.ts
│   │       │   ├── approve-task.ts
│   │       │   ├── cancel-task.ts
│   │       │   ├── extend-task.ts
│   │       │   └── send-feedback.ts
│   │       │
│   │       ├── stores/
│   │       │   └── task-ui-store.ts        # Zustand store
│   │       │
│   │       ├── schemas/
│   │       │   └── task.schema.ts          # Zod schemas
│   │       │
│   │       └── types/
│   │           └── index.ts                # Task types
│   │
│   ├── lib/                     # Utilidades
│   │   ├── utils.ts             # cn() utility (shadcn/ui)
│   │   ├── api-client.ts        # Fetch wrapper con base URL
│   │   ├── formatters.ts        # Formateo de fechas, etc.
│   │   └── constants.ts         # Constantes globales
│   │
│   └── types/                   # Tipos globales
│       ├── api.ts               # Response types genericos
│       └── common.ts            # Tipos compartidos
│
└── tests/
    ├── setup.ts                 # Vitest setup
    ├── mocks/
    │   ├── handlers.ts          # MSW handlers
    │   └── server.ts            # MSW server
    └── utils/
        └── render.tsx           # Custom render con providers
```

---

## 3. Componentes Principales

### 3.1 Layout (Server Components por defecto)

#### `RootLayout` (src/app/layout.tsx)
- Server Component
- Configura metadata, fonts (next/font)
- Envuelve con Providers (ThemeProvider, QueryProvider)
- HTML lang, dark mode class

```typescript
// src/app/layout.tsx
import { Inter } from 'next/font/google'
import { Providers } from '@/components/shared/providers'
import { Toaster } from '@/components/ui/toaster'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Agent Board',
  description: 'Dashboard para gestionar tareas de un agente IA',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  )
}
```

#### `TasksLayout` (src/app/tasks/layout.tsx)
- Server Component con Client Components hijos
- Header con logo y navegacion
- Sidebar con lista de tareas (Client Component para interactividad)
- Area principal para detalle de tarea
- Responsive: en mobile, sidebar es un sheet/drawer

#### `Header`
- Logo "Agent Board"
- Boton para crear nueva tarea (abre Dialog)
- Toggle dark/light mode (next-themes)
- (Futuro) Menu de usuario

### 3.2 Features: Tasks

#### `TaskList` (Client Component)
Panel lateral con todas las tareas agrupadas/filtradas.

**Props:**
```typescript
interface TaskListProps {
  initialTasks?: Task[];  // SSR data para hidratacion
}
```

**Estados:**
- Loading: Skeleton de 5 items (shadcn Skeleton)
- Empty: EmptyState con CTA "Crear primera tarea"
- Error: Mensaje + boton retry
- Success: Lista de TaskListItem

**Filtros disponibles:**
- Por status (shadcn/ui chips/badges seleccionables)
- Busqueda por titulo (debounced con Input)

#### `TaskListItem`
Item individual en la lista.

**Muestra:**
- Titulo (truncado)
- Status badge con color (shadcn Badge + variantes custom)
- Repo name (extraido de URL)
- Tiempo relativo (hace 2 min)

**Interacciones:**
- Click: navega a `/tasks/[taskId]`
- Hover: highlight
- Indicador visual si esta en ejecucion (pulse animation)

#### `TaskDetail` (Client Component)
Vista principal cuando se selecciona una tarea.

**Secciones:**
1. **Header**: Titulo, status badge, repo link
2. **Metadata**: Branch, created_at, context_files (Card de shadcn)
3. **Description**: Descripcion completa
4. **Actions**: Botones contextuales segun status
5. **Tabs**: Logs | Changes (cuando aplique) - shadcn Tabs

#### `TaskForm` (Client Component)
Formulario para crear nueva tarea.

**Campos:**
| Campo | Tipo | Validacion |
|-------|------|------------|
| title | Input | Requerido, min 1 char |
| description | Textarea | Requerido, min 10 chars |
| repo_url | Input | Requerido, URL valida de GitHub |
| target_branch | Input | Opcional, default "main" |
| context_files | Tag input custom | Opcional, array de paths |
| build_command | Input | Opcional |

**UX:**
- Mostrado en shadcn Dialog
- Validacion en tiempo real con react-hook-form + zod
- Submit puede usar Server Action o mutation
- Feedback visual de errores inline
- Toast de exito/error

#### `TaskLogs` (Client Component - SSE)
Visualizador de logs en tiempo real.

**Caracteristicas:**
- Auto-scroll al fondo (con toggle para pausar)
- Colores por level: info (gris), warn (amarillo), error (rojo), agent (azul)
- Timestamp formateado
- Indicador de conexion SSE activa
- Boton para copiar logs
- Usa shadcn ScrollArea para scroll customizado

#### `TaskDiff` (Client Component)
Visualizador de cambios cuando status = awaiting_review.

**Secciones:**
1. **File list**: Lista de archivos modificados con status (added/modified/deleted)
2. **Diff viewer**: Vista unificada del diff con syntax highlighting
3. **Stats**: Total additions/deletions

**Interacciones:**
- Click en archivo para ver su diff
- Expand/collapse de secciones del diff
- Copy file content

#### `FeedbackForm` (Client Component)
Input para enviar feedback al agente durante ejecucion.

**UX:**
- shadcn Textarea con placeholder contextual
- shadcn Button "Send Feedback"
- Disabled cuando tarea no esta in_progress
- Toast de exito/error

#### `TaskActions` (Client Component)
Botones de accion segun el estado de la tarea.

| Status | Acciones disponibles |
|--------|---------------------|
| backlog | Execute |
| planning | Cancel |
| in_progress | Extend, Cancel, Send Feedback |
| awaiting_review | Approve, Cancel |
| approved | (ninguna, en proceso) |
| done | View PR |
| failed | Retry (Execute) |

### 3.3 Componentes UI (shadcn/ui)

Los siguientes componentes se instalan via CLI de shadcn/ui:

```bash
npx shadcn@latest add button input textarea badge card dialog tabs skeleton toast scroll-area dropdown-menu separator
```

#### `StatusBadge` (Custom sobre shadcn Badge)
Badge con color segun status.

```typescript
// src/components/shared/status-badge.tsx
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<TaskStatus, { label: string; variant: string }> = {
  backlog: { label: 'Backlog', variant: 'secondary' },
  planning: { label: 'Planning', variant: 'default' },
  in_progress: { label: 'In Progress', variant: 'warning' },
  awaiting_review: { label: 'Awaiting Review', variant: 'purple' },
  approved: { label: 'Approved', variant: 'indigo' },
  done: { label: 'Done', variant: 'success' },
  failed: { label: 'Failed', variant: 'destructive' },
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  const config = STATUS_CONFIG[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}
```

---

## 4. Modelo de Datos (TypeScript)

### 4.1 Tipos del Dominio

```typescript
// src/features/tasks/types/index.ts

/**
 * Estados posibles de una tarea.
 */
export const TASK_STATUSES = [
  'backlog',
  'planning',
  'in_progress',
  'awaiting_review',
  'approved',
  'done',
  'failed',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * Tarea del agente.
 */
export interface Task {
  id: string;
  title: string;
  description: string;
  repo_url: string;
  target_branch: string;
  context_files: string[];
  build_command: string | null;
  status: TaskStatus;
  pr_url: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Input para crear una tarea.
 */
export interface CreateTaskInput {
  title: string;
  description: string;
  repo_url: string;
  target_branch?: string;
  context_files?: string[];
  build_command?: string;
}

/**
 * Input para actualizar una tarea.
 */
export interface UpdateTaskInput {
  title?: string;
  description?: string;
  repo_url?: string;
  target_branch?: string;
  context_files?: string[];
  build_command?: string | null;
  status?: TaskStatus;
  pr_url?: string | null;
  error?: string | null;
}
```

### 4.2 Tipos de Logs y SSE

```typescript
// src/features/tasks/types/index.ts (continuacion)

/**
 * Niveles de log.
 */
export type LogLevel = 'info' | 'warn' | 'error' | 'agent';

/**
 * Entrada de log.
 */
export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
}

/**
 * Eventos SSE del backend.
 */
export type SSEEventType =
  | 'log'
  | 'status'
  | 'timeout_warning'
  | 'awaiting_review'
  | 'complete'
  | 'error';

export interface SSELogEvent {
  type: 'log';
  data: {
    timestamp: string;
    level: LogLevel;
    message: string;
  };
}

export interface SSEStatusEvent {
  type: 'status';
  data: {
    status: TaskStatus;
  };
}

export interface SSETimeoutWarningEvent {
  type: 'timeout_warning';
  data: {
    message: string;
    expires_at: string;
  };
}

export interface SSEAwaitingReviewEvent {
  type: 'awaiting_review';
  data: {
    message: string;
  };
}

export interface SSECompleteEvent {
  type: 'complete';
  data: {
    pr_url: string;
  };
}

export interface SSEErrorEvent {
  type: 'error';
  data: {
    message: string;
  };
}

export type SSEEvent =
  | SSELogEvent
  | SSEStatusEvent
  | SSETimeoutWarningEvent
  | SSEAwaitingReviewEvent
  | SSECompleteEvent
  | SSEErrorEvent;
```

### 4.3 Tipos de Cambios/Diff

```typescript
// src/features/tasks/types/index.ts (continuacion)

/**
 * Estado de un archivo modificado.
 */
export type FileChangeStatus = 'added' | 'modified' | 'deleted';

/**
 * Archivo modificado por el agente.
 */
export interface FileChange {
  path: string;
  status: FileChangeStatus;
  additions: number;
  deletions: number;
}

/**
 * Respuesta del endpoint /changes.
 */
export interface TaskChangesResponse {
  files: FileChange[];
  diff: string;
}
```

### 4.4 Tipos de API

```typescript
// src/types/api.ts

/**
 * Respuesta de error estandar.
 */
export interface ApiError {
  error: string;
  details?: Array<{
    field: string;
    message: string;
  }>;
}

/**
 * Respuesta de acciones (execute, approve, etc).
 */
export interface ActionResponse {
  status: string;
  message?: string;
  pr_url?: string;
  new_timeout?: string;
}
```

---

## 5. Patrones de State Management

### 5.1 Server Components vs Client Components

**Estrategia de renderizado:**

| Componente | Tipo | Justificacion |
|------------|------|---------------|
| RootLayout | Server | Metadata, fonts, estructura estatica |
| TasksLayout | Server | Layout estatico, puede pre-renderizar estructura |
| TaskList | Client | Interactividad (filtros, seleccion), TanStack Query |
| TaskDetail | Client | TanStack Query, SSE, acciones |
| TaskForm | Client | react-hook-form, validacion interactiva |
| TaskLogs | Client | SSE en tiempo real |
| StatusBadge | Server | Sin interactividad, solo renderiza |
| Skeletons | Server | Sin interactividad |

### 5.2 Server State con TanStack Query (Client Components)

**Query Keys Factory:**
```typescript
// src/features/tasks/hooks/query-keys.ts

export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  list: (filters: TaskFilters) => [...taskKeys.lists(), filters] as const,
  details: () => [...taskKeys.all, 'detail'] as const,
  detail: (id: string) => [...taskKeys.details(), id] as const,
  changes: (id: string) => [...taskKeys.all, 'changes', id] as const,
};
```

**Hooks principales:**
```typescript
// src/features/tasks/hooks/use-tasks.ts
'use client'

import { useQuery } from '@tanstack/react-query'
import { taskKeys } from './query-keys'
import { tasksApi } from '@/lib/api-client'

export function useTasks(filters?: TaskFilters) {
  return useQuery({
    queryKey: taskKeys.list(filters ?? {}),
    queryFn: () => tasksApi.getAll(filters),
    staleTime: 30_000, // 30 segundos
  });
}

// src/features/tasks/hooks/use-task.ts
'use client'

export function useTask(id: string) {
  return useQuery({
    queryKey: taskKeys.detail(id),
    queryFn: () => tasksApi.getById(id),
    enabled: Boolean(id),
  });
}

// src/features/tasks/hooks/use-create-task.ts
'use client'

export function useCreateTask() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: tasksApi.create,
    onSuccess: (newTask) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      router.push(`/tasks/${newTask.id}`);
    },
  });
}

// src/features/tasks/hooks/use-task-actions.ts
'use client'

export function useTaskActions(taskId: string) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const invalidateTask = () => {
    queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
    queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
  };

  const execute = useMutation({
    mutationFn: () => tasksApi.execute(taskId),
    onSuccess: invalidateTask,
  });

  const approve = useMutation({
    mutationFn: () => tasksApi.approve(taskId),
    onSuccess: invalidateTask,
  });

  const cancel = useMutation({
    mutationFn: () => tasksApi.cancel(taskId),
    onSuccess: invalidateTask,
  });

  const extend = useMutation({
    mutationFn: () => tasksApi.extend(taskId),
  });

  const sendFeedback = useMutation({
    mutationFn: (message: string) => tasksApi.feedback(taskId, message),
  });

  return { execute, approve, cancel, extend, sendFeedback };
}
```

### 5.3 Server Actions (Alternativa/Complemento)

Server Actions para mutaciones simples donde no se necesita el control granular de TanStack Query:

```typescript
// src/features/tasks/actions/create-task.ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createTaskSchema } from '../schemas/task.schema'

export async function createTaskAction(formData: FormData) {
  const validatedFields = createTaskSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description'),
    repo_url: formData.get('repo_url'),
    target_branch: formData.get('target_branch'),
    build_command: formData.get('build_command'),
  })

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
    }
  }

  const response = await fetch(`${process.env.API_BASE_URL}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validatedFields.data),
  })

  if (!response.ok) {
    return { error: 'Failed to create task' }
  }

  const task = await response.json()

  revalidatePath('/tasks')
  redirect(`/tasks/${task.id}`)
}

// src/features/tasks/actions/execute-task.ts
'use server'

import { revalidatePath } from 'next/cache'

export async function executeTaskAction(taskId: string) {
  const response = await fetch(
    `${process.env.API_BASE_URL}/tasks/${taskId}/execute`,
    { method: 'POST' }
  )

  if (!response.ok) {
    return { error: 'Failed to execute task' }
  }

  revalidatePath(`/tasks/${taskId}`)
  revalidatePath('/tasks')

  return { success: true }
}

// src/features/tasks/actions/approve-task.ts
'use server'

import { revalidatePath } from 'next/cache'

export async function approveTaskAction(taskId: string) {
  const response = await fetch(
    `${process.env.API_BASE_URL}/tasks/${taskId}/approve`,
    { method: 'POST' }
  )

  if (!response.ok) {
    return { error: 'Failed to approve task' }
  }

  revalidatePath(`/tasks/${taskId}`)
  revalidatePath('/tasks')

  return { success: true }
}
```

**Cuando usar Server Actions vs TanStack Query:**

| Caso de uso | Recomendacion |
|-------------|---------------|
| Crear tarea (form simple) | Server Action con useActionState |
| Ejecutar/Aprobar/Cancelar | TanStack Query (mejor UX con loading states) |
| Fetch lista de tareas | TanStack Query (caching, refetch automatico) |
| SSE/Logs en tiempo real | Custom hook (Client Component) |
| Enviar feedback | TanStack Query (feedback instantaneo) |

### 5.4 Client State con Zustand

**Store de UI:**
```typescript
// src/features/tasks/stores/task-ui-store.ts
'use client'

import { create } from 'zustand'
import type { TaskStatus } from '../types'

interface TaskUIState {
  // Filtros
  statusFilter: TaskStatus[];
  searchQuery: string;
  setStatusFilter: (statuses: TaskStatus[]) => void;
  setSearchQuery: (query: string) => void;
  clearFilters: () => void;

  // Modal de creacion
  isCreateModalOpen: boolean;
  openCreateModal: () => void;
  closeCreateModal: () => void;

  // Logs UI
  isAutoScrollEnabled: boolean;
  toggleAutoScroll: () => void;
}

export const useTaskUIStore = create<TaskUIState>((set) => ({
  statusFilter: [],
  searchQuery: '',
  setStatusFilter: (statuses) => set({ statusFilter: statuses }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  clearFilters: () => set({ statusFilter: [], searchQuery: '' }),

  isCreateModalOpen: false,
  openCreateModal: () => set({ isCreateModalOpen: true }),
  closeCreateModal: () => set({ isCreateModalOpen: false }),

  isAutoScrollEnabled: true,
  toggleAutoScroll: () => set((state) => ({
    isAutoScrollEnabled: !state.isAutoScrollEnabled
  })),
}));
```

### 5.5 SSE con Custom Hook

```typescript
// src/features/tasks/hooks/use-task-sse.ts
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { taskKeys } from './query-keys'
import type { LogEntry, TaskStatus, SSEEvent } from '../types'

interface UseTaskSSEOptions {
  taskId: string;
  enabled?: boolean;
  onStatusChange?: (status: TaskStatus) => void;
  onComplete?: (prUrl: string) => void;
  onError?: (message: string) => void;
}

export function useTaskSSE(options: UseTaskSSEOptions) {
  const { taskId, enabled = true, onStatusChange, onComplete, onError } = options;
  const queryClient = useQueryClient();

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<
    'connecting' | 'connected' | 'disconnected' | 'error'
  >('disconnected');
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (!enabled || !taskId) return;

    const url = `${process.env.NEXT_PUBLIC_API_BASE_URL}/tasks/${taskId}/logs`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnectionStatus('connected');
    };

    eventSource.addEventListener('log', (event) => {
      const data = JSON.parse(event.data);
      setLogs((prev) => [...prev, { id: crypto.randomUUID(), ...data }]);
    });

    eventSource.addEventListener('status', (event) => {
      const data = JSON.parse(event.data);
      onStatusChange?.(data.status);
      // Invalidar queries para reflejar nuevo status
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    });

    eventSource.addEventListener('complete', (event) => {
      const data = JSON.parse(event.data);
      onComplete?.(data.pr_url);
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
      eventSource.close();
    });

    eventSource.addEventListener('error', (event) => {
      const data = JSON.parse((event as MessageEvent).data);
      onError?.(data.message);
    });

    eventSource.onerror = () => {
      setConnectionStatus('error');
      eventSource.close();
    };
  }, [taskId, enabled, onStatusChange, onComplete, onError, queryClient]);

  const disconnect = useCallback(() => {
    eventSourceRef.current?.close();
    setConnectionStatus('disconnected');
  }, []);

  useEffect(() => {
    connect();
    return disconnect;
  }, [connect, disconnect]);

  return {
    logs,
    connectionStatus,
    clearLogs: () => setLogs([]),
    reconnect: connect,
    disconnect,
  };
}
```

---

## 6. Fases de Implementacion

### Fase 1: Setup y Fundamentos ✅ COMPLETADA

**Objetivo:** Proyecto Next.js 16.1 base funcionando con estructura y tooling.

**Tareas:**
1. ✅ Crear proyecto con `npx create-next-app@latest` (App Router, TypeScript, Tailwind, ESLint)
2. ✅ Configurar Tailwind CSS 4.x
3. ✅ Inicializar shadcn/ui (`npx shadcn@latest init`)
4. ✅ Setup de TanStack Query provider (Client Component wrapper)
5. ✅ Setup de Zustand store base
6. ✅ Crear estructura de carpetas App Router
7. ✅ Configurar variables de entorno (NEXT_PUBLIC_API_BASE_URL, API_BASE_URL)
8. ✅ Implementar cliente HTTP base (`src/lib/api-client.ts`)
9. ✅ Configurar next-themes para dark mode

**Entregables:**
- ✅ Proyecto compilando sin errores
- ✅ `npm run dev` funcionando (puerto 3003)
- ✅ Layout basico visible en `/tasks`

**Nota:** Se usó Next.js 16.1 con React 19.2 (versiones más recientes que el plan original).

---

### Fase 2: Componentes UI Base con shadcn/ui ✅ COMPLETADA

**Objetivo:** Instalar y configurar componentes shadcn/ui necesarios.

**Tareas:**
1. ✅ Instalar componentes shadcn/ui:
   ```bash
   npx shadcn@latest add button input textarea badge card dialog tabs skeleton toast scroll-area dropdown-menu separator alert-dialog sheet tooltip avatar
   ```
2. ✅ Configurar variantes custom para Badge (status colors)
3. ✅ Implementar `StatusBadge` wrapper
4. ✅ Implementar `EmptyState` component
5. ✅ Configurar Toaster para notificaciones (usando Sonner)
6. ✅ Crear utilidades de cn() ya incluida por shadcn
7. ✅ Implementar `ErrorBoundary` component
8. ✅ Implementar `LoadingSpinner` component

**Entregables:**
- ✅ Todos los componentes UI instalados
- ✅ StatusBadge con colores por status (7 variantes)
- ✅ Toast notifications funcionando (Sonner)

**Nota:** Se usó Sonner en lugar del toast deprecado de shadcn.

---

### Fase 3: Layout y Navegacion ✅ COMPLETADA

**Objetivo:** Estructura visual del dashboard con App Router.

**Tareas:**
1. ✅ Implementar `RootLayout` con Providers
2. ✅ Implementar `TasksLayout` con estructura sidebar + main
3. ✅ Implementar `Header` component
4. ✅ Implementar `Sidebar` (colapsable)
5. ✅ Implementar `MobileNav` con Sheet de shadcn
6. ✅ Responsive design
7. ✅ Dark mode toggle con next-themes
8. ✅ Implementar `ThemeToggle` component (Light/Dark/System)
9. ✅ Implementar `MainLayout` wrapper
10. ✅ Crear `layout-store.ts` con Zustand (estado sidebar/mobile nav)

**Entregables:**
- ✅ Layout responsive funcionando (Desktop/Tablet/Mobile)
- ✅ Navegacion entre `/tasks` y `/tasks/[taskId]`
- ✅ Dark mode toggle con 3 opciones
- ✅ Sidebar colapsable con persistencia

---

### Fase 4: Lista de Tareas ✅ COMPLETADA

**Objetivo:** Ver todas las tareas y navegar a una.

**Tareas:**
1. ✅ Implementar API client para tasks (`GET /tasks`)
2. ✅ Implementar hook `useTasks` con TanStack Query
3. ✅ Implementar `TaskList` (Client Component) con estados
4. ✅ Implementar `TaskListItem` y `TaskListItemCompact`
5. ✅ Implementar `TaskListSkeleton`
6. ✅ Implementar filtros por status (chips)
7. ✅ Implementar busqueda por titulo (debounced 300ms)
8. ✅ Conectar con Zustand store para filtros
9. ✅ Navegacion con `next/link` a `/tasks/[taskId]`
10. ✅ Implementar `query-keys.ts` factory
11. ✅ Implementar `formatters.ts` (tiempo relativo, extractRepoName)
12. ✅ Crear mock data para desarrollo (8 tareas de ejemplo)
13. ✅ Integrar TaskList en Sidebar

**Entregables:**
- ✅ Lista de tareas mostrando datos (mock data o API)
- ✅ Filtros funcionando (status + búsqueda)
- ✅ Click navega a detalle
- ✅ Animación pulse para tareas in_progress
- ✅ Estados: loading, error, empty

---

### Fase 5: Detalle de Tarea ✅ COMPLETADA

**Objetivo:** Ver detalles completos de una tarea en `/tasks/[taskId]`.

**Tareas:**
1. ✅ Implementar page.tsx para ruta dinamica
2. ✅ Implementar API client para task detail (`GET /tasks/:id`)
3. ✅ Implementar hook `useTask`
4. ✅ Implementar `TaskDetail` (Client Component)
5. ✅ Implementar `TaskHeader` (título, status, repo link, botón volver)
6. ✅ Implementar `TaskMetadata` con Cards (branch, fechas, archivos, build command, PR URL, error)
7. ✅ Implementar `TaskDescription` component
8. ✅ Implementar `TaskActions` (estructura base con botones por status)
9. ✅ Implementar `TaskDetailSkeleton` para loading
10. ✅ Loading y error states con loading.tsx y error.tsx
11. ✅ Agregar `formatDate()` en formatters.ts

**Entregables:**
- ✅ Vista de detalle funcionando en `/tasks/[taskId]`
- ✅ Metadata visible (todos los campos)
- ✅ Loading/error states
- ✅ Botones de acción según status (deshabilitados, funcionalidad en Fase 7)
- ✅ AlertDialog para acciones destructivas

---

### Fase 6: Crear Tarea ✅ COMPLETADA

**Objetivo:** Formulario para crear nuevas tareas.

**Tareas:**
1. ✅ Implementar schema Zod para validacion (`task.schema.ts`)
2. ✅ Implementar `TaskForm` con react-hook-form
3. ✅ Implementar `TaskFormDialog` con shadcn Dialog
4. ✅ Implementar `TagInput` component para context_files
5. ✅ TanStack Query mutation (`useCreateTask` hook)
6. ✅ Toast de exito/error (Sonner)
7. ✅ Redireccion a nueva tarea
8. ✅ Agregar TaskFormDialog a Providers (disponible globalmente)

**Dependencias agregadas:** react-hook-form, @hookform/resolvers, zod

**Entregables:**
- ✅ Crear tareas desde el frontend
- ✅ Validacion client-side en tiempo real
- ✅ Tarea aparece en lista al crear
- ✅ Flujo completo: botón → dialog → form → submit → toast → navegación

---

### Fase 7: Acciones de Tarea ✅ COMPLETADA

**Objetivo:** Ejecutar, cancelar, extender, aprobar tareas.

**Tareas:**
1. ✅ Implementar API clients para acciones (execute, approve, cancel, extend, feedback)
2. ✅ Implementar hook `useTaskActions` con 5 mutations
3. ✅ Conectar botones en `TaskActions`
4. ✅ Feedback visual de acciones en progreso (loading spinners)
5. ✅ Manejo de errores con toast (Sonner)
6. ✅ Confirmacion para acciones destructivas (AlertDialog para Cancel)
7. ✅ Invalidacion de queries tras acciones
8. ✅ Implementar `FeedbackForm` component para tareas in_progress
9. ✅ Mock mode con transiciones de estado simuladas

**Entregables:**
- ✅ Todas las acciones funcionando (execute, approve, cancel, extend, feedback)
- ✅ Botones habilitados/deshabilitados segun status
- ✅ Feedback de exito/error con toast
- ✅ Loading spinners en botones durante acciones
- ✅ FeedbackForm para enviar mensajes al agente

---

### Fase 8: Logs en Tiempo Real ✅ COMPLETADA

**Objetivo:** Ver logs del agente via SSE.

**Tareas:**
1. ✅ Implementar `useTaskSSE` hook con auto-reconnect (3s)
2. ✅ Implementar `TaskLogs` component con ScrollArea
3. ✅ Implementar `LogEntry` con colores por nivel (info/warn/error/agent)
4. ✅ Auto-scroll con toggle (Zustand)
5. ✅ Indicador de conexion SSE (`ConnectionStatus` component)
6. ✅ Reconexion automatica si se pierde conexion
7. ✅ Manejo de eventos especiales (timeout_warning, awaiting_review, complete, error)
8. ✅ Invalidacion de queries cuando llega evento de status change
9. ✅ Implementar `mock-sse.ts` para desarrollo
10. ✅ Agregar Tabs a TaskDetail (Overview, Logs, Changes)
11. ✅ Botones copiar logs y limpiar logs

**Entregables:**
- ✅ Logs visibles en tiempo real
- ✅ Colores por nivel (gris, amber, rojo, púrpura)
- ✅ Eventos especiales manejados
- ✅ Mock SSE genera logs realistas durante ejecución

---

### Fase 9: Diff y Cambios ✅ COMPLETADA

**Objetivo:** Ver cambios del agente antes de aprobar.

**Tareas:**
1. ✅ Implementar API client para changes (`GET /tasks/:id/changes`)
2. ✅ Implementar `TaskDiff` contenedor principal
3. ✅ Implementar `FileChanges` (lista de archivos con status icons)
4. ✅ Implementar `DiffViewer` con react-diff-viewer-continued
5. ✅ Implementar `DiffStats` (estadísticas additions/deletions con barra visual)
6. ✅ Implementar `useTaskChanges` hook
7. ✅ Mock changes data para desarrollo
8. ✅ Toggle split/unified view
9. ✅ Dark mode support

**Dependencia agregada:** react-diff-viewer-continued

**Entregables:**
- ✅ Ver diff completo con syntax highlighting
- ✅ Lista de archivos modificados (added/modified/deleted)
- ✅ Estadísticas visuales de cambios
- ✅ Layout responsive (sidebar + viewer)

---

### Fase 10: Feedback al Agente ✅ COMPLETADA

**Objetivo:** Enviar feedback durante ejecucion.

**Tareas:**
1. ✅ Implementar `FeedbackForm` mejorado con shadcn Textarea
2. ✅ Conectar con API (`POST /tasks/:id/feedback`)
3. ✅ Deshabilitar cuando no aplica (con mensajes claros)
4. ✅ Toast de exito/error
5. ✅ Contador de caracteres (max 2000)
6. ✅ Keyboard shortcut: Ctrl+Enter para enviar
7. ✅ Animación de éxito al enviar
8. ✅ `FeedbackHistory` component para ver mensajes enviados
9. ✅ `FeedbackSection` combinando form + history
10. ✅ Nivel 'user' en logs con estilo emerald
11. ✅ Mock: agente responde al feedback

**Entregables:**
- ✅ Enviar feedback al agente con UX mejorada
- ✅ Feedback aparece en logs con estilo distinto
- ✅ Historial de mensajes enviados
- ✅ Respuestas mock del agente

---

### Fase 11: Polish y UX ✅ COMPLETADA

**Objetivo:** Pulir experiencia de usuario.

**Tareas:**
1. ✅ Loading states consistentes (`LoadingPage`, animaciones fade-in)
2. ✅ Error handling global con error.tsx (retry, stack trace dev mode)
3. ✅ Toast notifications para todas las acciones
4. ✅ Keyboard shortcuts con cmdk (Cmd+K / Ctrl+K)
5. ✅ Transiciones con CSS (fade-in, slide-in, scale-in, hover effects)
6. ✅ Mejorar accesibilidad (skip link, aria-labels, focus states)
7. ✅ Mobile optimization (touch targets 44px, quick actions)
8. ✅ Metadata SEO con generateMetadata (OpenGraph, viewport)
9. ✅ Favicon dinámico y Apple touch icon
10. ✅ Página 404 amigable
11. ✅ Navigation progress indicator

**Dependencia agregada:** cmdk

**Entregables:**
- ✅ UX pulida con transiciones suaves
- ✅ Accesibilidad mejorada (WCAG)
- ✅ Sin bugs visuales obvios
- ✅ Command palette funcional
- ✅ Mobile-ready

---

### Fase 12: Refactoring

**Objetivo:** Refactorizar código y mejorar la calidad del código.

**Tareas:**

1. Úsar el sub agente de code-reviewer para determinar la calidad del código
2. Refactorizar código para mejorar la legibilidad y mantenibilidad

**Entregables:**
- Código limpio y refactorizado
- Feedback de calidad del código

---

### Fase 13: Testing

**Objetivo:** Cobertura de tests adecuada.

**Tareas:**

1. Tests E2E con el mcp de Test Sprite (flujos principales solamente)

**Entregables:**
- Coverage > 70% en logica critica
- CI pipeline con tests

---

## 7. Estimacion Total

| Fase | Duracion estimada |
|------|-------------------|
| Fase 1: Setup Next.js 15 | 2-3 dias |
| Fase 2: UI Base shadcn | 1-2 dias |
| Fase 3: Layout App Router | 1-2 dias |
| Fase 4: Lista Tareas | 2-3 dias |
| Fase 5: Detalle | 2-3 dias |
| Fase 6: Crear Tarea | 2 dias |
| Fase 7: Acciones | 2-3 dias |
| Fase 8: Logs SSE | 3-4 dias |
| Fase 9: Diff | 2-3 dias |
| Fase 10: Feedback | 1-2 dias |
| Fase 11: Polish | 2-3 dias |
| Fase 12: Testing | 3-4 dias |
| **Total** | **23-34 dias** |

---

## 8. Dependencias del Backend

Para que el frontend funcione completamente, el backend necesita tener implementados:

| Endpoint | Estado Backend | Criticidad |
|----------|---------------|------------|
| `GET /tasks` | Completado | Alta |
| `GET /tasks/:id` | Completado | Alta |
| `POST /tasks` | Completado | Alta |
| `PATCH /tasks/:id` | Completado | Media |
| `DELETE /tasks/:id` | Completado | Baja |
| `POST /tasks/:id/execute` | En Fase 3 | Alta |
| `POST /tasks/:id/feedback` | Pendiente | Alta |
| `POST /tasks/:id/extend` | Pendiente | Media |
| `POST /tasks/:id/cancel` | Pendiente | Media |
| `POST /tasks/:id/approve` | Pendiente | Alta |
| `GET /tasks/:id/logs` (SSE) | Pendiente | Alta |
| `GET /tasks/:id/changes` | Pendiente | Alta |

**Nota:** El frontend puede desarrollarse en paralelo usando MSW para mockear endpoints pendientes.

---

## 9. Consideraciones Adicionales

### Next.js Specific

**Rendering Strategy:**
- Paginas de lista: SSR con revalidacion (ISR-like con `revalidate`)
- Paginas de detalle: SSR dinamico (datos siempre frescos)
- Layouts: Server Components estaticos
- Componentes interactivos: Client Components con 'use client'

**Caching:**
- TanStack Query para client-side caching
- Next.js fetch cache para Server Components si se usan
- revalidatePath/revalidateTag para invalidacion desde Server Actions

**Environment Variables:**
- `API_BASE_URL` - Solo servidor (Server Actions, Route Handlers)
- `NEXT_PUBLIC_API_BASE_URL` - Cliente (TanStack Query, SSE)

### Accesibilidad (a11y)
- shadcn/ui incluye accesibilidad por defecto (Radix UI)
- Todos los componentes interactivos accesibles via teclado
- ARIA labels automaticos en componentes Radix
- Focus visible en todos los elementos interactivos
- Contraste de colores WCAG 2.1 AA
- Screen reader friendly

### Performance
- Server Components por defecto (menos JS al cliente)
- Streaming con Suspense boundaries
- next/image para optimizacion de imagenes
- next/font para fonts optimizados
- Lazy loading con dynamic() para componentes pesados
- Virtualizacion para listas largas de logs (react-virtual)
- Debounce en inputs de busqueda

### Seguridad
- Server Actions validan con Zod en el servidor
- CORS configurado en backend
- Variables de entorno sensibles solo en servidor
- No exponer API_BASE_URL al cliente si contiene credenciales

### Futuras Mejoras (Post-MVP)
- Autenticacion de usuarios (NextAuth.js)
- Notificaciones push cuando tarea termina
- Dashboard con metricas (tareas por dia, tasa de exito)
- Historial de ejecuciones por tarea
- Comparacion de diffs entre versiones
- Export de logs
- Temas personalizables
- Parallel Routes para modales de URL
- Intercepting Routes para preview de tareas

---

## 10. Referencias

- [Next.js 15 Documentation](https://nextjs.org/docs)
- [React 19 Documentation](https://react.dev)
- [shadcn/ui](https://ui.shadcn.com)
- [TanStack Query v5](https://tanstack.com/query/latest)
- [Zustand](https://zustand-demo.pmnd.rs/)
- [Tailwind CSS](https://tailwindcss.com)
- [Radix UI](https://radix-ui.com)
- [React Hook Form](https://react-hook-form.com)
- [Zod](https://zod.dev)
- [next-themes](https://github.com/pacocoursey/next-themes)
