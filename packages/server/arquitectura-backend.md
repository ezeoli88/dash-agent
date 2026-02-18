# Arquitectura del Server - Guia para Devs Nuevos

## Vista de 10,000 pies

El server es una **API Express** que corre sobre **Bun**. Su trabajo es: recibir tareas del dashboard, lanzar agentes IA (como Claude Code, Codex o Gemini) para que escriban codigo, y monitorear todo en tiempo real hasta que se abra un PR.

```
Dashboard (React) <--> Express API <--> Agentes IA (CLI subprocesses)
                          |                     |
                       SQLite DB          Git Worktrees
```

---

## Los Modulos, uno por uno

### 1. Entry Points (`index.ts`, `bin.ts`, `config.ts`)

- **`index.ts`** — El `app.ts` clasico de Express. Monta rutas, CORS, auth middleware, inicializa la DB y arranca el server en `0.0.0.0:51767`.
- **`bin.ts`** — Wrapper para cuando se compila como binario standalone (`bun build --compile`). Detecta la IP LAN y abre el browser.
- **`config.ts`** — Lee env vars (`PORT`, `DATABASE_PATH`, `REPOS_BASE_DIR`, etc.) con defaults. Tambien expone `getRuntimePort()` / `setRuntimePort()` para el puerto real post-startup (usado por MCP config endpoint).

### 2. Routes (los endpoints HTTP)

| Router | Prefijo | Que hace |
|--------|---------|----------|
| **`tasks.ts`** | `/api/tasks` | CRUD de tareas + ejecucion de agentes + feedback + PR creation. Es el archivo mas grande (~1500 lineas). |
| **`repos.ts`** | `/api/repos` | Gestion de repositorios (GitHub y local). Incluye deteccion de stack tecnologico. |
| **`setup.ts`** | `/api/setup` | Deteccion de CLIs instalados, validacion de API keys, OAuth con GitHub. Incluye `/setup/mcp-config` para configuracion MCP. |
| **`secrets.ts`** | `/api/secrets` | CRUD de credenciales encriptadas (API keys, tokens GitHub/GitLab). |
| **`data.ts`** | `/api/data` | Export/import de toda la data como JSON. |

### 3. Services (la logica de negocio)

Cada service es un **singleton** con patron `getInstance()` / `getXService()`:

| Service | Responsabilidad |
|---------|----------------|
| **`task.service`** | CRUD en DB para tareas (25 columnas). Transiciones de estado. |
| **`agent.service`** | El corazon. Maneja agentes activos, logs en memoria, chat history, timeouts, feedback queue. |
| **`pm-agent.service`** | Lanza el "PM Agent" que genera specs a partir del input del usuario. |
| **`dev-agent.service`** | Coordina al "Dev Agent" que implementa la spec aprobada. |
| **`git.service`** | Operaciones git: worktrees, push, diff, merge, deteccion de conflictos. |
| **`repo.service`** | Almacen in-memory de repos registrados. |
| **`github.service`** | Wrapper de Octokit: crear PRs, listar repos, obtener comentarios. |
| **`secrets.service`** | Encriptacion AES-256-GCM para guardar API keys en DB. |
| **`agent-detection.service`** | Detecta que CLIs estan instalados (claude, codex, gemini). |
| **`stack-detector.service`** | Analiza un repo para inferir el tech stack (React, Node, Python, etc). |
| **`settings.service`** | Key-value store para configuracion de la app (agente default, modelo, etc). |

### 4. Agent System (`agent/`)

Este es el modulo mas interesante. Hay **3 tipos de runners**, todos implementan `IAgentRunner`:

| Runner | Como funciona |
|--------|---------------|
| **`cli-runner.ts`** | Spawns un CLI (claude, codex, gemini) como subprocess. Lee su output JSON via stdout. |
| **`runner.ts`** | Legacy. Llama directamente a la API de OpenAI con tool-calling loop. |
| **`openrouter-runner.ts`** | Similar al legacy pero via OpenRouter API. |

El **factory** (`agent/index.ts`) elige cual usar:

```
claude-code / codex / gemini  -->  CLIAgentRunner
openrouter                    -->  OpenRouterRunner
undefined (legacy)            -->  AgentRunner (OpenAI)
```

Archivos de soporte:

- **`executor.ts`** — Ejecuta las tools (read_file, write_file, run_command) con whitelist de seguridad.
- **`cli-prompts.ts`** — Construye el prompt para CLIs, incluyendo contexto del repo (stack, patterns, convenciones).
- **`prompts.ts`** — Templates de prompts para el runner legacy (OpenAI API).
- **`tools.ts`** — Definiciones JSON Schema de las 7 tools disponibles para el agente.
- **`whitelist.ts`** — Lista de comandos permitidos/bloqueados (no `rm -rf`, si `npm run build`).
- **`types.ts`** — Interfaces: `IAgentRunner`, `RunnerOptions`, `AgentRunResult`.

### 5. Database (`db/`)

- **`database.ts`** — Inicializa **sql.js** (SQLite en JavaScript puro). Exporta `getDatabase()`, `withTransaction()`.
- **`migrations.ts`** — Sistema de migraciones versionado. Crea tablas: `tasks`, `task_logs`, `repositories`, `user_secrets`, `user_settings`.

**Tablas principales:**

| Tabla | Proposito |
|-------|-----------|
| `tasks` | 25 columnas. Toda la info de cada tarea (status, spec, diff, agente, etc). |
| `task_logs` | Logs historicos de ejecucion de tareas. |
| `repositories` | Metadata de repos (URL, branch, stack, convenciones). |
| `user_secrets` | API keys y tokens encriptados con AES-256-GCM. |
| `user_settings` | Key-value para configuracion de la app. |
| `schema_versions` | Tracking de migraciones aplicadas. |

### 6. Utilities (`utils/`)

| Util | Para que |
|------|----------|
| **`sse-emitter.ts`** | Singleton que maneja Server-Sent Events. Registra clientes, emite eventos tipados, heartbeat cada 15s. |
| **`process-killer.ts`** | Trackea todos los subprocesos spawneados y los mata limpiamente (incluyendo Windows con `taskkill`). |
| **`logger.ts`** | Logger estructurado JSON con labels. |
| **`github-url.ts`** | Parseo de URLs de GitHub (clone URL autenticada, deteccion de repos locales). |
| **`gitlab-url.ts`** | Idem para GitLab. |
| **`errors.ts`** | Helper para extraer mensajes de error de cualquier tipo. |

### 7. MCP Server (`mcp/`)

El server expone un **MCP (Model Context Protocol)** en `/api/mcp` para que IDEs y CLIs puedan interactuar con Agent Board programaticamente.

**Arquitectura:**
- **Stateless**: Cada POST crea un McpServer + transport fresco, procesa el JSON-RPC y cierra. Sin manejo de sesiones.
- **Transport**: `StreamableHTTPServerTransport` del SDK oficial de MCP.
- **Auth**: Requests desde loopback (127.0.0.1, ::1) bypasean autenticacion — IDEs locales no necesitan token.

**Archivos:**

| Archivo | Que hace |
|---------|----------|
| **`index.ts`** | Monta rutas Express (POST/GET/DELETE `/api/mcp`). Solo POST es funcional. |
| **`server.ts`** | Factory que crea un `McpServer` y registra todos los tools y resources. |
| **`errors.ts`** | Error codes tipados (`McpErrorCode`) y helpers para respuestas de error. |

**Tools (5 modulos):**

| Modulo | Tools que registra |
|--------|--------------------|
| **`task-tools.ts`** | `create_task`, `list_tasks`, `get_task`, `update_task`, `delete_task` |
| **`workflow-tools.ts`** | `start_task`, `execute_task`, `send_feedback`, `extend_task_timeout`, `cancel_task` |
| **`review-tools.ts`** | `get_task_changes`, `approve_changes`, `request_changes`, `mark_pr_merged`, `mark_pr_closed` |
| **`repo-tools.ts`** | `list_repositories`, `add_repository`, `get_repository` |
| **`status-tools.ts`** | `get_setup_status` |

**Resources (2 modulos):**

| Modulo | URIs |
|--------|------|
| **`task-resources.ts`** | `agentboard://tasks/{taskId}` — Detalle completo de una task |
| **`repo-resources.ts`** | `agentboard://status` — Estado del board (providers, agents, OAuth) |

**Nota sobre `create_task`:** Auto-detecta `agent_type` y `agent_model` si no se proveen, usando `detectInstalledAgents()`. Tambien resuelve `repo_url` desde `repository_id`.

### 8. Middleware

- **`auth.middleware.ts`** — Token de autenticacion generado al startup. Se pasa via query param o header `Authorization: Bearer`. Obligatorio en modo binario, opcional en dev. Requests desde loopback a `/api/mcp` bypasean auth (para IDEs locales).

---

## El Flujo Principal: De Task a PR

El flujo actual es directo: el usuario crea la tarea y el agente codifica hasta llegar al PR. No hay paso intermedio de generacion/aprobacion de spec.

> **Nota:** Los endpoints legacy de spec (`generate-spec`, `approve-spec`, `regenerate-spec`, `PATCH /spec`) y el `pm-agent.service` fueron marcados como **deprecated** y ahora retornan `410 Gone`. Usar `POST /api/tasks/:id/start` para iniciar una tarea directamente.

```
+------------------------------------------------------------------+
|  1. CREAR TASK                                                    |
|  POST /api/tasks { user_input, repository_id }                    |
|  -> task.service.create() -> status: "draft"                      |
+------------------------------+-----------------------------------+
                               v
+------------------------------------------------------------------+
|  2. EJECUTAR (Dev Agent)                                          |
|  POST /api/tasks/:id/execute                                      |
|  -> dev-agent.service.executeSpec()                                |
|     -> git.service.setupWorktree() (crea rama + worktree)         |
|     -> createRunner(options) (elige CLI o API runner)              |
|     -> runner.run() <- LOOP PRINCIPAL:                             |
|        +-- LLM decide que hacer                                   |
|        +-- Ejecuta tools (read/write files, run commands)          |
|        +-- SSE emite logs + chat_message + tool_activity           |
|        +-- Checkea feedback queue (usuario puede intervenir)       |
|        +-- Repite hasta task_complete o error                      |
|  -> status: "coding" -> "awaiting_review"                         |
+------------------------------+-----------------------------------+
                               v
+------------------------------------------------------------------+
|  3. REVIEW                                                        |
|  GET /api/tasks/:id/changes -> diff del worktree                  |
|  GET /api/tasks/:id/logs (SSE) -> ver que hizo el agente          |
|  El usuario ve el diff y decide:                                  |
|    +-- POST /tasks/:id/approve -> crea PR                         |
|    +-- POST /tasks/:id/feedback -> pide cambios al agente         |
|    +-- POST /tasks/:id/cancel -> cancela todo                     |
+------------------------------+-----------------------------------+
                               v
+------------------------------------------------------------------+
|  4. CREAR PR                                                      |
|  agent.service.approveAndCreatePR()                                |
|  -> git.service.push() (sube rama al remote)                      |
|  -> github.service.createPullRequest()                             |
|  -> status: "pr_created"                                          |
+------------------------------+-----------------------------------+
                               v
+------------------------------------------------------------------+
|  7. MERGE                                                         |
|  POST /api/tasks/:id/pr-merged                                    |
|  -> agent.service.markPRMerged()                                   |
|  -> Limpia worktree                                               |
|  -> status: "done"                                                |
+------------------------------------------------------------------+
```

---

## Como se conecta todo (diagrama de dependencias)

```
Routes (HTTP layer)
  |
  +-- tasks.ts ----> agent.service ----> cli-runner / runner
  |                      +----> git.service (worktrees, push)
  |                      +----> sse-emitter (streaming)
  |                      +----> github.service (PRs)
  |              ----> pm-agent.service ----> CLI spawn
  |              ----> task.service ----> database
  |              ----> dev-agent.service ----> agent.service
  |
  +-- repos.ts ----> repo.service
  |              ----> stack-detector.service
  |              ----> github.service
  |
  +-- setup.ts ----> agent-detection.service
  |              ----> ai-provider.service
  |              ----> github-oauth.service
  |
  +-- secrets.ts ----> secrets.service ----> database (encrypted)
  |
  +-- data.ts ----> database (direct)

MCP Server (/api/mcp — stateless JSON-RPC)
  |
  +-- task-tools ──────> task.service, agent.service, repo.service
  +-- workflow-tools ──> task.service, agent.service, dev-agent.service
  +-- review-tools ────> task.service, agent.service, git.service
  +-- repo-tools ──────> repo.service, stack-detector.service
  +-- status-tools ────> secrets.service, agent-detection.service
  +-- task-resources ──> task.service, git.service
  +-- repo-resources ──> repo.service, secrets.service, agent-detection.service
```

---

## Estados de una Task (TaskStatus)

```
draft                 Estado inicial, sin spec
backlog               Workflow legacy, lista para ejecutar
refining              PM Agent generando spec
pending_approval      Spec generada, esperando aprobacion del usuario
approved              Spec aprobada, lista para Dev Agent
coding                Dev Agent implementando
planning              Agente planificando (legacy)
in_progress           Agente ejecutando (legacy)
plan_review           Plan creado, esperando aprobacion
awaiting_review       Agente termino, esperando review del usuario
pr_created            PR creado en GitHub
changes_requested     Reviewer pidio cambios
merge_conflicts       Conflictos de merge detectados
canceled              Usuario cancelo
done                  PR mergeado exitosamente
failed                Error del agente o timeout
```

---

## Conceptos clave

### Git Worktrees
Cada task tiene su propio directorio de trabajo (worktree) aislado. Esto permite multiples agentes trabajando en paralelo sin conflictos. Se crean en `WORKTREES_DIR` (default: `/tmp/agent-worktrees`).

### SSE (Server-Sent Events)
El dashboard mantiene una conexion abierta a `GET /tasks/:id/logs`. El server pushea eventos en tiempo real mientras el agente trabaja. Heartbeat cada 15s para mantener la conexion viva. Tipos de evento: `log`, `status`, `chat_message`, `tool_activity`, `error`, `timeout_warning`.

### Feedback Queue
Mientras un agente corre, el usuario puede enviar mensajes via `POST /tasks/:id/feedback`. Se encolan y el agente los procesa en su proxima iteracion. Si el agente ya termino, se re-lanza con el feedback como contexto.

### PM Agent vs Dev Agent
- **PM Agent** — Solo lee el repo. Genera una spec tecnica a partir del input del usuario. No escribe codigo.
- **Dev Agent** — Lee Y escribe codigo. Implementa la spec aprobada. Tiene acceso a tools (read_file, write_file, run_command, etc).

### Runners intercambiables
El factory pattern (`createRunner`) permite soportar multiples CLIs y APIs sin cambiar la logica del flujo. Agregar un nuevo agente CLI es cuestion de agregar un `case` en el factory y su command builder.

### Timeouts
Cada agente tiene 10 minutos por defecto. El usuario puede extender de a 5 minutos con `POST /tasks/:id/extend`. Si se agota, el agente se mata via `process-killer`.

### Seguridad
- **Auth**: Token random al startup (obligatorio en modo binario)
- **CORS**: Solo localhost + IPs privadas RFC 1918
- **Commands**: Whitelist estricta (no `rm`, no `sudo`)
- **Paths**: Validacion UUID, no `../` traversal
- **Secrets**: AES-256-GCM en DB
- **Procesos**: Todos trackeados para cleanup al cancelar/timeout
- **MCP Loopback Bypass**: Requests a `/api/mcp` desde 127.0.0.1/::1 no requieren token auth (IDEs/CLIs locales se conectan sin configurar credenciales)
