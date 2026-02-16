# Arquitectura del Dashboard - Guia para Devs Nuevos

## Vista de 10,000 pies

El dashboard es una **SPA React** bundleada con **Vite**. Su trabajo es: mostrar las tareas en un board Kanban, monitorear en tiempo real lo que hacen los agentes IA via SSE, permitir al usuario enviar feedback, revisar diffs de codigo y aprobar PRs.

```
Browser (React SPA)
  |
  +-- TanStack Router (navegacion)
  +-- TanStack Query (server state + polling)
  +-- Zustand (client state + persistencia)
  +-- EventSource (SSE en tiempo real)
  |
  +----> Express API (via apiClient)
```

---

## Entry Points y Bootstrap

### 1. `main.tsx` — Arranque de la app

No es un simple `ReactDOM.render`. Antes de montar React hace dos cosas:

1. **Pre-fetch de repos**: Llama a `/api/repos` para saber si hay repos registrados. Si no hay, redirige a `/repos`.
2. **Deteccion de restart del server**: Compara el header `X-Server-ID` contra `localStorage`. Si cambio, limpia todo y redirige a `/repos`.

Despues monta `<RouterProvider>` con el router configurado.

### 2. `lib/auth.ts` — Autenticacion por token

- Lee `?token=` de la URL al cargar la pagina
- Lo guarda en `sessionStorage` (por tab, no se comparte)
- Limpia el token de la URL (seguridad: no aparece en screenshots)
- Todas las requests lo envian como `Authorization: Bearer {token}`

### 3. `components/shared/providers.tsx` — Providers globales

Wrapper que envuelve toda la app:

```
<QueryClientProvider>          // TanStack Query
  <ThemeProvider>              // next-themes (dark/light)
    <ServerRestartDetector />  // Monitorea cambios de server
    <StateSync />              // Sincroniza estado entre tabs
    <Sonner />                 // Toast notifications
    {children}
  </ThemeProvider>
</QueryClientProvider>
```

---

## Routing (TanStack Router)

Arbol de rutas:

```
Root Route (envuelve con <Providers>)
├── / (HomePage — smart redirect)
│     └── Si hay repos → /board, si no → /repos
│
├── /repos (ReposPage — SIN MainLayout)
│     └── Pagina standalone para seleccionar repo. Incluye banner de MCP setup.
│
├── /setup → redirige a /repos
│
├── /mcp-setup (McpSetupPage — SIN MainLayout)
│     └── Pagina standalone para configurar conexion MCP desde IDEs/CLIs
│
└── Main Layout Route (REQUIERE repo seleccionado)
    ├── /board (BoardPage — Kanban)
    ├── /diff/:taskId (DiffPage — viewer de cambios)
    └── /settings (SettingsPage — preferencias, incluye banner MCP)
```

**Patron clave**: El `MainLayout` route tiene un `beforeLoad` guard que chequea si hay repos. Si no hay, redirige a `/repos`. Esto hace que `/repos` sea la "landing page" obligatoria para usuarios nuevos.

---

## Los Modulos, uno por uno

### 1. Pages (`app/`)

| Page | Ruta | Que hace |
|------|------|----------|
| **HomePage** | `/` | Smart redirect: detecta si hay repos y redirige a `/board` o `/repos`. |
| **BoardPage** | `/board` | Kanban board con drag-and-drop. Incluye `<CreateTaskDialog>` y `<TaskDrawer>`. |
| **ReposPage** | `/repos` | Seleccion de repositorios. Escanea repos locales del filesystem. Sin MainLayout. |
| **DiffPage** | `/diff/:taskId` | Viewer de cambios de codigo para una task especifica. |
| **SettingsPage** | `/settings` | Preferencias de usuario (tema, idioma, conexiones). Incluye banner de MCP setup. |
| **McpSetupPage** | `/mcp-setup` | Pagina standalone para configurar la conexion MCP desde IDEs/CLIs. |

### 2. Features (`features/`)

Cada feature es un modulo autocontenido con `components/`, `hooks/`, `stores/` y `types/`.

#### `features/tasks/` — El modulo principal (~40 componentes)

**Componentes principales:**

| Componente | Que hace |
|-----------|----------|
| **`task-detail.tsx`** | Vista principal con tabs: Overview, Chat, Logs, Changes, Comments. |
| **`task-logs.tsx`** | Stream de logs del agente via SSE. Auto-scroll, copy, clear. |
| **`task-chat.tsx`** | Interfaz de chat con badges de tool activity. |
| **`task-actions.tsx`** | Botones de accion segun estado (Execute, Approve, Cancel, Request Changes, etc). |
| **`task-header.tsx`** | Titulo, status badge, breadcrumb. |
| **`task-drawer.tsx`** | Drawer lateral para inspeccion rapida de task. |
| **`create-task-dialog.tsx`** | Formulario de creacion de task. |
| **`edit-task-dialog.tsx`** | Edicion de tasks en draft. |
| **`diff-viewer.tsx`** | Visualizacion de diffs de codigo. |
| **`feedback-form.tsx`** | Input para enviar feedback al agente. |
| **`spec-editor.tsx`** | Editor inline de spec. |
| **`merge-conflicts.tsx`** | UI para resolver conflictos de merge. |
| **`pr-comments.tsx`** | Muestra comentarios de review del PR. |
| **`agent-model-selector.tsx`** | Selector de tipo de agente y modelo. |
| **`task-filters.tsx`** | Filtros de status y busqueda. |

**Hooks (15+):**

| Hook | Que hace |
|------|----------|
| **`use-task-sse.ts`** | El corazon del real-time. Maneja EventSource, reconnect, parsing de eventos. |
| **`use-task.ts`** | Fetch de una task. Polling cada 2s cuando `refining` o `approved`. |
| **`use-tasks.ts`** | Fetch de todas las tasks. Polling cada 3s cuando hay tasks activas. |
| **`use-create-task.ts`** | Mutation para crear task. |
| **`use-task-actions.ts`** | Todas las mutations de acciones (execute, approve, cancel, extend, etc). |
| **`use-task-chat.ts`** | Agrega mensajes de chat + tool activities desde SSE. |
| **`use-start-task.ts`** | Inicia una task draft. |
| **`use-generate-spec.ts`** | Genera spec via PM Agent. |
| **`use-approve-spec.ts`** | Aprueba spec e inicia Dev Agent. |
| **`use-task-changes.ts`** | Fetch de cambios/diff del worktree. |
| **`use-pr-comments.ts`** | Fetch de comentarios del PR. |
| **`use-resolve-conflicts.ts`** | Resuelve conflictos de merge. |
| **`use-open-editor.ts`** | Abre VS Code para resolver conflictos. |

**Store (Zustand):**
- **`task-ui-store.ts`** — Filtros, estado del modal de creacion, logs persistidos, comentarios no leidos, ultima preferencia de agente/modelo.

---

#### `features/board/` — Kanban Board

| Componente | Que hace |
|-----------|----------|
| **`board-view.tsx`** | Board principal con `@dnd-kit/core` para drag-and-drop. |
| **`board-column.tsx`** | Columna individual con drop zone. |
| **`board-card.tsx`** | Card de task con status badge. |
| **`board-header.tsx`** | Headers de columna con conteo de tasks. |

**Columnas del board:**

```
Todo → In Progress → In Review → Done
                                  Failed
                                  Canceled
```

**Mapping de estados a columnas:**

| Columna | Estados que incluye |
|---------|-------------------|
| **Todo** | `draft`, `backlog`, `pending_approval` |
| **In Progress** | `refining`, `approved`, `coding`, `planning`, `in_progress`, `plan_review` |
| **In Review** | `awaiting_review`, `pr_created`, `changes_requested`, `merge_conflicts` |
| **Done** | `done` |
| **Failed** | `failed` |
| **Canceled** | `canceled` |

**Drag-and-drop**: Mover una task draft a "In Progress" la inicia automaticamente. Usa `@dnd-kit/core` con 8px de distancia de activacion.

---

#### `features/repos/` — Gestion de Repositorios

| Componente | Que hace |
|-----------|----------|
| **`repo-list.tsx`** | Lista lateral de repos disponibles. |
| **`repo-card.tsx`** | Card de repo con badge de branch. |
| **`add-repo-dialog.tsx`** | Dialog para agregar repo. |
| **`repo-config-dialog.tsx`** | Configuracion de repo (convenciones, patterns). |
| **`conventions-editor.tsx`** | Editor de convenciones del repo. |
| **`learned-patterns-list.tsx`** | Muestra patterns aprendidos. |

**Hooks:**

| Hook | Que hace |
|------|----------|
| **`use-repos.ts`** | Fetch de repos (stale time: 5 min). |
| **`use-repo.ts`** | Fetch de un repo individual. |
| **`use-repo-context.ts`** | Maneja repo seleccionado + sync con server. |
| **`use-local-repos.ts`** | Escanea filesystem buscando repos Git. |
| **`use-github-repos.ts`** | Fetch de repos de GitHub via Octokit. |
| **`use-repo-mutations.ts`** | Add/update/delete repos. |

**Store**: `repo-store.ts` — ID del repo seleccionado, estados de dialogs.

---

#### `features/setup/` — Configuracion Inicial

Wizard de primera vez con multiples pasos:

| Componente | Que hace |
|-----------|----------|
| **`setup-screen.tsx`** | Pantalla principal del wizard. |
| **`agent-selector.tsx`** | Elegir CLI: Claude Code, Codex, Copilot, Gemini. |
| **`ai-provider-card.tsx`** | Seleccion de proveedor: OpenAI, Anthropic, OpenRouter. |
| **`api-key-dialog.tsx`** | Input de API key. |
| **`github-connect.tsx`** | OAuth o PAT para GitHub. |
| **`gitlab-connect.tsx`** | Configuracion de GitLab. |

**Store**: `setup-store.ts` — Estados de conexion (AI, GitHub, GitLab, CLI), persiste en localStorage.

---

#### `features/mcp-setup/` — Configuracion MCP

Pagina standalone (sin MainLayout, accesible desde `/repos` y `/settings`) que permite al usuario configurar la conexion MCP desde su IDE o CLI favorito.

| Componente | Que hace |
|-----------|----------|
| **`mcp-setup-content.tsx`** | Layout principal con lista de plataformas y snippet de configuracion. |
| **`platform-snippet.tsx`** | Renderiza el snippet de configuracion especifico para cada plataforma. |
| **`copy-button.tsx`** | Boton para copiar snippet al clipboard. |

**Hooks:**

| Hook | Que hace |
|------|----------|
| **`use-mcp-config.ts`** | Fetch de `GET /api/setup/mcp-config` para obtener la URL del MCP server. |

**Lib:**

| Archivo | Que hace |
|---------|----------|
| **`platforms.ts`** | Definicion de plataformas soportadas (Claude Code, VS Code, Cursor, Windsurf, Codex CLI, Gemini CLI) con sus `buildSnippet()` que generan la config especifica. |

---

#### `features/settings/` — Preferencias

| Componente | Que hace |
|-----------|----------|
| **`preferences-section.tsx`** | UI de preferencias del usuario. |
| **`language-selector.tsx`** | Seleccion de idioma. |
| **`theme-selector.tsx`** | Picker de tema (light/dark). |
| **`connections-section.tsx`** | Cuentas conectadas. |

---

### 3. Layout (`components/layout/`)

| Componente | Que hace |
|-----------|----------|
| **`main-layout.tsx`** | Wrapper principal. Redirige a `/repos` si no hay repo seleccionado. |
| **`header.tsx`** | Barra superior: selector de repo, theme toggle, user menu. |
| **`mobile-nav.tsx`** | Drawer de navegacion movil. |
| **`theme-toggle.tsx`** | Switch dark/light mode. |

### 4. Shared (`components/shared/`)

| Componente | Que hace |
|-----------|----------|
| **`providers.tsx`** | Setup de providers globales (Query, Theme, SSE detect, etc). |
| **`command-palette.tsx`** | Paleta de comandos `Cmd+K`. |
| **`navigation-progress.tsx`** | Barra de progreso en transiciones de pagina. |
| **`error-boundary.tsx`** | Error boundary de React. |
| **`empty-state.tsx`** | Placeholder para estados vacios. |
| **`loading-page.tsx`** | Loading de pagina completa. |
| **`status-badge.tsx`** | Badge de status de task con colores. |

### 5. UI (`components/ui/`) — shadcn/ui

Primitivas de shadcn/ui con Tailwind:
`Button`, `Input`, `Label`, `Textarea`, `Select`, `Dialog`, `AlertDialog`, `Card`, `Badge`, `Tabs`, `Collapsible`, `DropdownMenu`, `Skeleton`, `Avatar`, `Tooltip`, `RadioGroup`, `Separator`, `Sheet`, `ScrollArea`, `Sonner`.

---

## API Client (`lib/api-client.ts`)

El cliente HTTP centralizado. Todo pasa por aca.

```typescript
apiClient.get<T>(endpoint, options)
apiClient.post<T>(endpoint, body, options)
apiClient.patch<T>(endpoint, body, options)
apiClient.delete<T>(endpoint, options)
```

**Caracteristicas:**
- Base URL: `VITE_API_BASE_URL` en dev, `window.location.origin` en prod
- Todos los endpoints llevan prefijo `/api`
- Auth token automatico en header `Authorization: Bearer`
- Clase custom `ApiClientError` con `statusCode`, `code`, `details`
- Deteccion de restart del server via `X-Server-ID`
- Soporte para query params via objeto `params`

**API de Tasks (preconstruida):**

```typescript
tasksApi = {
  getAll, getById, create, update, delete,
  generateSpec, regenerateSpec, updateSpec, approveSpec,
  approvePlan, execute, approve, cancel, extend, feedback,
  requestChanges, markPRMerged, markPRClosed,
  getChanges, cleanupWorktree, getPRComments
}
```

---

## State Management — La estrategia de 3 capas

```
+---------------------------------------------------+
|  TanStack Query (Server State)                     |
|  - Datos del server (tasks, repos, settings)       |
|  - Cache con stale times                           |
|  - Polling automatico para datos activos           |
|  - Invalidacion precisa por query keys             |
+---------------------------------------------------+
          |
+---------------------------------------------------+
|  Zustand (Client State)                            |
|  - Estado de UI (filtros, modales, sidebar)         |
|  - Persistencia en localStorage                    |
|  - Preferencias del usuario                        |
+---------------------------------------------------+
          |
+---------------------------------------------------+
|  EventSource / SSE (Real-time State)               |
|  - Logs del agente en tiempo real                  |
|  - Mensajes de chat                                |
|  - Actividad de tools                              |
|  - Cambios de status                               |
+---------------------------------------------------+
```

### TanStack Query — Server State

**Query Keys (patron factory):**

```typescript
// Tasks
taskKeys.all          // ['tasks']
taskKeys.list(filters) // ['tasks', 'list', { status, search }]
taskKeys.detail(id)    // ['tasks', 'detail', '123']
taskKeys.changes(id)   // ['tasks', 'changes', '123']

// Repos
repoKeys.list()       // ['repos', 'list']
repoKeys.detail(id)   // ['repos', 'detail', '456']
repoKeys.github       // ['github-repos']
```

**Polling dinamico (la parte inteligente):**

| Hook | Cuando hace polling | Intervalo |
|------|-------------------|-----------|
| `useTask(id)` | Status es `refining` o `approved` | 2 segundos |
| `useTasks()` | Alguna task esta en `refining`, `approved`, `planning`, `in_progress`, `coding` | 3 segundos |

Cuando no hay tasks activas, no hay polling. Se queda con el cache.

**Stale times:**

| Dato | Stale time |
|------|------------|
| Repos | 5 minutos |
| Tasks (lista) | 30 segundos |
| Task (detalle) | 30 segundos |

**Invalidacion:**
- Crear/editar/borrar task → invalida `taskKeys.lists()`
- Cambio de status (via SSE) → invalida detail + lists
- Seleccionar repo → fetch detail + invalida list

### Zustand — Client State

| Store | Que guarda | Persiste? |
|-------|-----------|-----------|
| **task-ui-store** | Filtros, modal de creacion, logs por task, comentarios no leidos, ultimo agente/modelo | Si (parcial) |
| **repo-store** | Repo seleccionado, estados de dialogs | No |
| **setup-store** | Estados de conexion (AI, GitHub, GitLab, CLI) | Si |

---

## SSE — El Sistema de Tiempo Real

### `useTaskSSE` — El motor de real-time

Es el hook mas importante del frontend. Maneja la conexion SSE para recibir updates del agente.

**Conexion:**
```
EventSource → GET /api/tasks/{taskId}/logs?token={authToken}
```

**Ciclo de vida:**

```
1. Abrir conexion
     |
2. Recibir eventos ─────┐
     |                    |
3. Si error:             |
   - Esperar 3s          |
   - Reconnect ──────────┘
     |
4. Si evento terminal (complete/error):
   - Cerrar conexion
   - NO reconnect
```

**Eventos que maneja:**

| Evento | Que hace en el frontend |
|--------|------------------------|
| **`log`** | Agrega linea al stream de logs (timestamp, level, message). |
| **`status`** | Actualiza status de la task + invalida queries. |
| **`chat_message`** | Mensaje del agente o usuario en el chat. |
| **`tool_activity`** | Badge de tool usada (read_file, write_file, run_command). |
| **`timeout_warning`** | Muestra warning de que el agente esta por expirar. |
| **`awaiting_review`** | Notifica que el agente espera review del usuario. |
| **`complete`** | Task terminada exitosamente. Cierra SSE. |
| **`error`** | Task fallo. Muestra error. Cierra SSE. |
| **`pr_comment`** | Nuevo comentario de review en el PR. |

**Estado de conexion** (usa `useSyncExternalStore` para performance):

```
disconnected → connecting → connected → error (→ reconnect)
                                      → disconnected (terminal)
```

### `useTaskChat` — Agregador de chat

Consume los eventos de `useTaskSSE` y los organiza:

- Agrega `chat_message` a la lista de mensajes
- Mergea eventos `tool_use` → `tool_result` inteligentemente
- Limpia y reconecta cuando hay retry de status

### Persistencia de logs

Los logs se guardan en Zustand (`taskLogs[taskId]`), asi que:
- Sobreviven al cambiar de tab
- Se pueden limpiar manualmente
- Cada task tiene su array separado

---

## El Flujo Principal: De Task a PR (vista frontend)

```
+------------------------------------------------------------------+
|  1. CREAR TASK                                                    |
|  <CreateTaskDialog> → useCreateTask().mutate(data)                |
|  → POST /api/tasks { user_input, repository_id, agent, model }   |
|  → Toast + invalidar taskKeys.lists()                             |
|  → Task aparece en columna "Todo" del board                       |
+------------------------------+-----------------------------------+
                               v
+------------------------------------------------------------------+
|  2. EJECUTAR                                                      |
|  Click "Start" → useStartTask().mutate(taskId)                    |
|  → POST /api/tasks/{id}/execute                                   |
|  → Task se mueve a columna "In Progress"                          |
|  → Polling se activa (3s lista, 2s detalle)                       |
|  → useTaskSSE abre EventSource                                    |
|  → Logs streamean en tab "Logs"                                   |
|  → Chat messages aparecen en tab "Chat"                           |
|  → Tool activities se muestran como badges                        |
+------------------------------+-----------------------------------+
                               v
+------------------------------------------------------------------+
|  3. FEEDBACK (mientras el agente corre)                           |
|  Usuario escribe en chat o feedback form                          |
|  → sendFeedback.mutate(message)                                   |
|  → POST /api/tasks/{id}/feedback                                  |
|  → Agrega al chat optimisticamente                                |
|  → Agente procesa en su proxima iteracion                         |
|  → Respuesta llega via SSE chat_message                           |
+------------------------------+-----------------------------------+
                               v
+------------------------------------------------------------------+
|  4. REVIEW                                                        |
|  Status llega a "awaiting_review" via SSE                         |
|  → Task se mueve a columna "In Review"                            |
|  → Tab "Changes" se habilita                                      |
|  → useTaskChanges() fetch GET /api/tasks/{id}/changes             |
|  → Diff viewer renderiza cambios archivo por archivo              |
|  → Usuario decide:                                                |
|    +-- "Approve" → approve mutation → crea PR                     |
|    +-- "Request Changes" → requestChanges mutation → agente resume|
|    +-- "Cancel" → cancel mutation → todo se limpia                |
+------------------------------+-----------------------------------+
                               v
+------------------------------------------------------------------+
|  5. PR CREADO                                                     |
|  Status → "pr_created" via SSE                                    |
|  → Se muestra link al PR en GitHub                                |
|  → Tab "Comments" muestra review comments del PR                  |
|  → Usuario decide:                                                |
|    +-- "Mark as Merged" → markPRMerged mutation → done            |
|    +-- "Mark as Closed" → markPRClosed mutation → closed          |
+------------------------------+-----------------------------------+
                               v
+------------------------------------------------------------------+
|  6. DONE                                                          |
|  SSE recibe evento "complete"                                     |
|  → Cierra EventSource (sin reconnect)                             |
|  → Task se mueve a columna "Done"                                 |
|  → Toast de exito                                                 |
|  → Polling se desactiva (no hay tasks activas)                    |
+------------------------------------------------------------------+
```

---

## Flujos Secundarios

### Deteccion de Restart del Server

```
1. Cada response del API incluye header X-Server-ID
2. api-client compara contra localStorage['agent-board-server-id']
3. Si cambio → dispara evento 'server-restart'
4. <ServerRestartDetector> escucha el evento
5. Limpia QueryClient (cache) + Zustand stores
6. Redirige a /repos (fuerza re-seleccion de repo)
```

**Por que?** Cuando el server reinicia, el estado en memoria (agentes activos, logs) se pierde. El frontend necesita resincronizar.

### Seleccion de Repositorio

```
1. /repos muestra repos escaneados del filesystem
2. Usuario selecciona un repo (checkmark badge)
3. Click "Continue"
4. repo-store.setSelectedRepoId(id)
5. Fetch repo detail via useRepo(id)
6. Navega a /board
7. MainLayout verifica que hay repo → permite render
```

### Drag-and-Drop en Board

```
1. @dnd-kit/core detecta drag (8px distancia minima)
2. Usuario arrastra card de "Todo" a "In Progress"
3. onDragEnd() detecta que es un draft
4. Ejecuta useStartTask().mutate(taskId)
5. Task transiciona de draft → coding
6. Card se mueve de columna automaticamente (via requery)
```

---

## Como se conecta todo (diagrama de dependencias)

```
Pages (UI layer)
  |
  +-- BoardPage ────> board-view ────> board-column, board-card
  |                       +───> use-board-tasks (agrupa por columna)
  |                       +───> @dnd-kit/core (drag-and-drop)
  |
  +-- TaskDetail ───> task-header, task-actions, task-tabs
  |                       +───> use-task (fetch + polling)
  |                       +───> use-task-sse (SSE real-time)
  |                       +───> use-task-chat (chat + tools)
  |                       +───> use-task-changes (diff)
  |                       +───> use-task-actions (mutations)
  |
  +-- ReposPage ────> repo-list, repo-card
  |                       +───> use-repos, use-local-repos
  |                       +───> use-repo-context (seleccion)
  |                       +───> repo-store (Zustand)
  |
  +-- SettingsPage ──> preferences-section, connections-section
  |                       +───> use-settings
  |                       +───> setup-store (Zustand)
  |
  +-- McpSetupPage ──> mcp-setup-content, platform-snippet, copy-button
                           +───> use-mcp-config (GET /api/setup/mcp-config)
                           +───> platforms.ts (snippet generators)

Capa transversal:
  +-- api-client ────> todas las requests HTTP
  +-- providers ─────> QueryClient, ThemeProvider, SSE detect
  +-- auth ──────────> token management (sessionStorage)
  +-- task-ui-store ──> filtros, logs, preferencias de agente
```

---

## Patrones y Convenciones

### Hooks

- **Fetching**: Wrapper fino sobre `useQuery` con query keys de `query-keys.ts`
- **Mutations**: `useMutation` con toast de exito/error e invalidacion de cache
- **SSE**: Callback refs para evitar reconnects cuando cambian los callbacks
- **Polling**: Condicional via `refetchInterval` — solo cuando hay datos activos

### Componentes

- **Pages**: `NombrePage` en `/app/{path}/page.tsx`
- **Features**: Agrupados por feature, exportados via `index.ts`
- **Shared**: Stateless, reutilizables, sin data fetching
- **Container pattern**: Componente que fetchea data y delega el render

### Formularios

- React Hook Form + Zod validation
- Schemas compartidos con el server (via `@dash-agent/shared`)
- Formularios en Dialog/Sheet para modales

### Loading States

```typescript
if (isLoading) return <Skeleton />       // Esqueletos, no spinners
if (isError) return <ErrorBoundary />     // Fallback con retry
if (!data) return <EmptyState />          // Estado vacio
```

---

## Styling y Theming

### Tailwind CSS v4

- **Colores**: Sistema OKLch (modelo de color moderno)
- **Dark mode**: Class-based via `next-themes` (atributo `class`)
- **Animaciones custom**: `fade-in`, `fade-in-up`, `slide-in-right`, `scale-in`
- **Stagger delays**: Para listas animadas
- **Terminal styles**: Fondos oscuros para logs y chat

### Theming

```
next-themes → atributo "class" en <html>
  → default: "light"
  → detecta preferencia del sistema
  → sin flash al cambiar (transiciones deshabilitadas)
```

---

## Dependencias clave

| Paquete | Version | Para que |
|---------|---------|----------|
| **React** | 19.2 | UI framework |
| **@tanstack/react-router** | 1.159 | Routing type-safe |
| **@tanstack/react-query** | 5.90 | Server state + cache |
| **zustand** | 5.0 | Client state (stores) |
| **next-themes** | 0.4 | Dark mode |
| **react-hook-form** | 7.71 | Formularios |
| **zod** | 4.3 | Validacion de schemas |
| **@dnd-kit/core** | 6.3 | Drag-and-drop (board) |
| **react-diff-viewer-continued** | 3.4 | Visualizacion de diffs |
| **lucide-react** | 0.563 | Iconos |
| **sonner** | 2.0 | Toast notifications |
| **@dash-agent/shared** | workspace | Tipos y schemas compartidos |

---

## Build y Deployment

### Desarrollo

```
Vite dev (port 3003) ──proxy /api──> Bun server (port 51767)
```

Variable de entorno: `VITE_API_BASE_URL=http://localhost:51767`

### Produccion

```
Bun server sirve:
  /api/*          → Express routes
  /assets/*       → Archivos estaticos de dist/
  /*              → SPA fallback (index.html)
```

No hay server Vite separado. Todo lo sirve el binary de Bun.

### Build

```bash
npm run build:dashboard    # Vite build → dist/
```

Output en `packages/dashboard/dist/`. El server lo sirve como archivos estaticos.

---

## Resiliencia y Error Handling

### Red

| Situacion | Como se maneja |
|-----------|---------------|
| SSE se cae | Auto-reconnect cada 3s (salvo evento terminal) |
| API 5xx | Retry con exponential backoff |
| API 401 | Toast de error, operaciones fallan |
| Server reinicia | Detecta via `X-Server-ID`, limpia estado, redirige a `/repos` |

### Datos

- TanStack Query es la **unica fuente de verdad** para datos del server
- Zustand es para estado **efimero de UI** (filtros, modales, preferencias)
- Server ID tracking previene datos stale despues de restart

### UX

- Skeletons para loading (no spinners genericos en listas)
- Error boundaries con fallback UI y boton de retry
- Botones deshabilitados durante mutations
- Toasts para feedback inmediato al usuario
