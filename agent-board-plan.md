# Agent Board - Plan de Implementación

## Descripción del Proyecto

API backend para gestionar tareas de desarrollo. Cuando una tarea se inicia, un agente de IA autónomo la ejecuta: crea un worktree, implementa la feature, y tras aprobación del usuario, crea un PR en GitHub.

---

## Stack Tecnológico

| Componente | Tecnología |
|------------|------------|
| Backend | TypeScript + Express |
| Base de datos | SQLite |
| LLM | OpenAI SDK (GPT-4o o compatible) |
| Control de versiones | GitHub API (Octokit) + Git Worktrees |
| Streaming de logs | Server-Sent Events (SSE) |
| Testing API | curl / Postman |

---

## Configuración

```env
# .env
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
REPOS_BASE_DIR=/var/repos           # Donde se clonan los repos base
WORKTREES_DIR=/tmp/agent-worktrees  # Donde se crean los worktrees
```

---

## Modelo de Datos

### Task

```typescript
interface Task {
  id: string;                  // UUID
  title: string;               // Nombre corto de la feature
  description: string;         // Descripción detallada (prompt para el agente)
  repo_url: string;            // https://github.com/user/repo
  target_branch: string;       // Branch base (default: "main")
  context_files: string[];     // Opcional: archivos que el agente debería revisar primero
  build_command: string | null; // Opcional: comando de build

  status: TaskStatus;
  pr_url: string | null;       // URL del PR creado
  error: string | null;        // Mensaje de error si falla

  created_at: string;          // ISO timestamp
  updated_at: string;          // ISO timestamp
}

type TaskStatus =
  | 'backlog'            // En cola, no iniciada
  | 'planning'           // Agente analizando y creando plan
  | 'in_progress'        // Agente implementando
  | 'awaiting_review'    // Agente terminó, esperando revisión humana
  | 'approved'           // Usuario aprobó, creando PR
  | 'pr_created'         // PR creado, esperando merge o cambios
  | 'changes_requested'  // Reviewer pidió cambios, agente debe trabajar
  | 'done'               // PR mergeado exitosamente
  | 'failed';            // Error durante ejecución
```

### TaskLog (tabla separada)

```typescript
interface TaskLog {
  id: string;
  task_id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'agent';
  message: string;
}
```

### Schema SQLite

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  target_branch TEXT DEFAULT 'main',
  context_files TEXT DEFAULT '[]',  -- JSON array
  build_command TEXT,

  status TEXT DEFAULT 'backlog',
  pr_url TEXT,
  error TEXT,

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE task_logs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
  level TEXT DEFAULT 'info',
  message TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX idx_task_logs_task_id ON task_logs(task_id);
```

---

## API Endpoints

### Tasks CRUD

```
POST   /tasks              → Crear tarea
GET    /tasks              → Listar todas las tareas
GET    /tasks/:id          → Obtener detalle de una tarea
PATCH  /tasks/:id          → Actualizar tarea
DELETE /tasks/:id          → Eliminar tarea
```

### Ejecución y Control del Agente

```
POST   /tasks/:id/execute  → Iniciar el agente
POST   /tasks/:id/feedback → Enviar feedback al agente durante ejecución
POST   /tasks/:id/extend           → Extender timeout (+5 min)
POST   /tasks/:id/cancel           → Cancelar ejecución
POST   /tasks/:id/approve          → Aprobar cambios y crear PR
POST   /tasks/:id/request-changes  → Solicitar cambios al agente (Fase 6)
GET    /tasks/:id/logs             → Stream SSE de logs en tiempo real
GET    /tasks/:id/changes          → Ver archivos modificados (diff)
```

---

## Detalle de Endpoints

### POST /tasks

Crea una nueva tarea.

**Request:**
```json
{
  "title": "Add user authentication",
  "description": "Implement login and register endpoints using JWT. Use bcrypt for password hashing. Add middleware for protected routes.",
  "repo_url": "https://github.com/user/my-project",
  "target_branch": "main",
  "context_files": ["src/auth/", "src/middleware/"],
  "build_command": "npm run build"
}
```

**Response:** `201 Created`
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "title": "Add user authentication",
  "status": "backlog",
  ...
}
```

### POST /tasks/:id/execute

Inicia la ejecución del agente.

**Validaciones:**
- La tarea debe existir
- El status debe ser `backlog` o `failed` (permitir reintentos)
- No debe haber otra tarea `in_progress` para el mismo repo

**Response exitosa:** `202 Accepted`
```json
{
  "status": "started",
  "message": "Agent execution started"
}
```

**Response error (otra tarea corriendo en mismo repo):** `409 Conflict`
```json
{
  "error": "Another task is already in progress for this repository"
}
```

### POST /tasks/:id/feedback

Envía feedback al agente durante la ejecución.

**Request:**
```json
{
  "message": "Use bcrypt instead of crypto for password hashing"
}
```

**Response:** `200 OK`
```json
{
  "status": "feedback_sent"
}
```

### POST /tasks/:id/extend

Extiende el timeout del agente (+5 minutos).

**Response:** `200 OK`
```json
{
  "status": "extended",
  "new_timeout": "2024-01-15T10:40:00Z"
}
```

### POST /tasks/:id/cancel

Cancela la ejecución del agente.

**Response:** `200 OK`
```json
{
  "status": "cancelled"
}
```

### POST /tasks/:id/approve

Aprueba los cambios y crea el PR.

**Validaciones:**
- El status debe ser `awaiting_review`

**Response:** `200 OK`
```json
{
  "status": "approved",
  "pr_url": "https://github.com/user/repo/pull/42"
}
```

### GET /tasks/:id/changes

Retorna los archivos modificados por el agente.

**Response:** `200 OK`
```json
{
  "files": [
    {
      "path": "src/auth/jwt.ts",
      "status": "added",
      "additions": 45,
      "deletions": 0
    },
    {
      "path": "src/routes/login.ts",
      "status": "modified",
      "additions": 12,
      "deletions": 3
    }
  ],
  "diff": "diff --git a/src/auth/jwt.ts b/src/auth/jwt.ts\n..."
}
```

### GET /tasks/:id/logs

Stream SSE de logs en tiempo real.

**Headers:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Formato de eventos:**
```
event: log
data: {"timestamp": "2024-01-15T10:30:00Z", "level": "info", "message": "Creating worktree..."}

event: log
data: {"timestamp": "2024-01-15T10:30:02Z", "level": "agent", "message": "Analyzing project structure"}

event: status
data: {"status": "in_progress"}

event: timeout_warning
data: {"message": "Agent has been running for 5 minutes", "expires_at": "2024-01-15T10:35:00Z"}

event: awaiting_review
data: {"message": "Agent completed. Review changes before creating PR."}

event: complete
data: {"pr_url": "https://github.com/user/repo/pull/42"}

event: error
data: {"message": "Build failed after 3 retries"}
```

---

## Git Worktrees

### Setup Inicial (por repo)

Cuando se recibe una tarea para un repo nuevo:

```bash
# 1. Clonar repo base (solo una vez por repo)
git clone --bare https://github.com/user/repo.git /var/repos/user-repo.git

# 2. Fetch para mantener actualizado
cd /var/repos/user-repo.git && git fetch origin
```

### Por Tarea

```bash
# 1. Crear worktree para la tarea
git worktree add /tmp/agent-worktrees/task-123 -b feature/task-123 origin/main

# 2. Trabajar en el worktree
cd /tmp/agent-worktrees/task-123
# ... agente hace cambios ...

# 3. Commit y push
git add -A
git commit -m "feat: Add user authentication"
git push origin feature/task-123

# 4. Cleanup después del PR
git worktree remove /tmp/agent-worktrees/task-123
```

### Ventajas sobre Clone

- **Instantáneo**: Crear worktree es ~100ms vs varios segundos de clone
- **Espacio**: Comparten .git, no duplican historia
- **Aislado**: Cada tarea tiene su directorio independiente

---

## Flujo del Agente

### Diagrama General

```
POST /tasks/:id/execute
         │
         ▼
┌─────────────────────┐
│ Validaciones        │
│ - Task existe       │
│ - Status válido     │
│ - Repo no bloqueado │
└─────────┬───────────┘
         │
         ▼
┌─────────────────────┐
│ Update status       │
│ → "planning"        │
└─────────┬───────────┘
         │
         ▼
┌─────────────────────┐
│ Spawn AgentRunner   │◄─── Async (no bloquea el request)
└─────────┬───────────┘
         │
         ▼
┌─────────────────────┐
│ Return 202 Accepted │
└─────────────────────┘
```

### Flujo del AgentRunner

```
┌─────────────────────────────────────────────────────────────┐
│                       AGENT RUNNER                          │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │ 1. Setup worktree      │
              │    - Fetch latest      │
              │    - Create worktree   │
              │    - Install deps      │
              └────────────┬───────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │ 2. Planning phase      │
              │    Status: "planning"  │
              │    - Analyze codebase  │
              │    - Create plan       │
              │    - Log plan to user  │
              └────────────┬───────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │ 3. Implementation      │
              │    Status:"in_progress"│
              │    - Agent loop        │
              │    - Check feedback    │
              │    - Handle timeout    │
              └────────────┬───────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │ 4. Build validation    │
              │    (max 3 retries)     │
              └────────────┬───────────┘
                           │
               ┌───────────┴───────────┐
               │                       │
          Build OK              Build Fail (3x)
               │                       │
               ▼                       ▼
    ┌──────────────────┐    ┌──────────────────┐
    │ 5. Commit changes│    │ Status: failed   │
    │ 6. Push branch   │    │ Log error        │
    │ 7. Status:       │    │ Cleanup worktree │
    │    awaiting_     │    └──────────────────┘
    │    review        │
    └──────────────────┘
               │
               ▼
    ┌──────────────────┐
    │ 8. Wait for      │
    │    user approval │◄─── POST /tasks/:id/approve
    └──────────────────┘
               │
               ▼
    ┌──────────────────┐
    │ 9. Create PR     │
    │ 10. Status: done │
    │ 11. Cleanup      │
    └──────────────────┘
```

### Timeout con Extensión

```
┌─────────────────────────────────────────┐
│ Agente trabajando...                    │
│ Tiempo: 4:30 / 5:00                     │
└─────────────────────────────────────────┘
                 │
                 ▼ (5 min)
         ┌──────────────┐
         │ SSE Event:   │
         │ timeout_     │
         │ warning      │
         └──────┬───────┘
                │
    ┌───────────┴───────────┐
    │                       │
POST /extend           POST /cancel (o timeout)
    │                       │
    ▼                       ▼
Timer reset            Agent killed
+5 min                 Status: failed
```

---

## Herramientas del Agente

| Tool | Parámetros | Descripción |
|------|------------|-------------|
| `read_file` | `path: string` | Lee el contenido de un archivo |
| `write_file` | `path: string, content: string` | Crea o sobrescribe un archivo |
| `list_directory` | `path: string` | Lista archivos y carpetas |
| `run_command` | `command: string` | Ejecuta comando shell (whitelist) |
| `search_files` | `pattern: string, path?: string` | Busca en archivos (grep) |
| `task_complete` | `summary: string` | Señala que la tarea está completa |

### Whitelist de Comandos

```typescript
const COMMAND_WHITELIST = {
  // Package managers
  npm: ['install', 'run', 'test', 'build', 'ci', 'ls'],
  yarn: ['install', 'run', 'test', 'build'],
  pnpm: ['install', 'run', 'test', 'build'],
  pip: ['install', 'list'],
  cargo: ['build', 'test', 'fetch', 'check', 'run'],
  go: ['build', 'test', 'mod', 'get'],

  // Build tools
  make: ['*'],
  tsc: ['*'],

  // Read-only utilities
  ls: ['*'],
  cat: ['*'],
  head: ['*'],
  tail: ['*'],
  find: ['*'],
  grep: ['*'],
  tree: ['*'],
  wc: ['*'],

  // Git (read + local operations)
  git: ['status', 'diff', 'log', 'branch', 'add', 'commit', 'show'],
};

const BLOCKED_COMMANDS = [
  'curl', 'wget', 'ssh', 'scp', 'nc', 'netcat',  // Network
  'rm', 'rmdir', 'chmod', 'chown', 'chgrp',       // Destructive
  'eval', 'exec', 'source', 'bash', 'sh', 'zsh',  // Shell injection
  'docker', 'kubectl', 'podman',                   // Container escape
  'sudo', 'su', 'doas',                            // Privilege escalation
];
```

### Restricciones de Seguridad

- Todos los paths deben estar dentro del worktree
- Comandos validados contra whitelist antes de ejecutar
- Timeout por comando: 30 segundos
- Output truncado a 10KB por comando

---

## Manejo de Feedback

### Flujo de Feedback

```
Usuario envía feedback via POST /tasks/:id/feedback
                    │
                    ▼
          ┌─────────────────┐
          │ Validar que     │
          │ task está en    │
          │ "in_progress"   │
          └────────┬────────┘
                   │
                   ▼
          ┌─────────────────┐
          │ Agregar mensaje │
          │ a cola de       │
          │ feedback        │
          └────────┬────────┘
                   │
                   ▼
          ┌─────────────────┐
          │ Agent loop      │
          │ revisa cola     │
          │ cada iteración  │
          └────────┬────────┘
                   │
                   ▼
          ┌─────────────────┐
          │ Si hay feedback,│
          │ añadir como     │
          │ user message    │
          │ al contexto LLM │
          └─────────────────┘
```

### Implementación

```typescript
// En memoria o Redis para MVP
const feedbackQueues = new Map<string, string[]>();

// Endpoint
app.post('/tasks/:id/feedback', (req, res) => {
  const { id } = req.params;
  const { message } = req.body;

  if (!feedbackQueues.has(id)) {
    feedbackQueues.set(id, []);
  }
  feedbackQueues.get(id)!.push(message);

  res.json({ status: 'feedback_sent' });
});

// En el agent loop
function checkForFeedback(taskId: string): string | null {
  const queue = feedbackQueues.get(taskId);
  if (queue && queue.length > 0) {
    return queue.shift()!;
  }
  return null;
}
```

---

## Autodetección de Proyecto

### Instalación de Dependencias

```typescript
function detectInstallCommand(workspacePath: string): string | null {
  if (existsSync(join(workspacePath, 'package-lock.json'))) {
    return 'npm ci';
  }
  if (existsSync(join(workspacePath, 'package.json'))) {
    return 'npm install';
  }
  if (existsSync(join(workspacePath, 'requirements.txt'))) {
    return 'pip install -r requirements.txt';
  }
  if (existsSync(join(workspacePath, 'Cargo.toml'))) {
    return 'cargo fetch';
  }
  if (existsSync(join(workspacePath, 'go.mod'))) {
    return 'go mod download';
  }
  return null;
}
```

### Comando de Build

```typescript
function detectBuildCommand(workspacePath: string): string | null {
  if (existsSync(join(workspacePath, 'package.json'))) {
    const pkg = JSON.parse(readFileSync(join(workspacePath, 'package.json'), 'utf-8'));
    if (pkg.scripts?.build) return 'npm run build';
    if (pkg.scripts?.compile) return 'npm run compile';
  }
  if (existsSync(join(workspacePath, 'Cargo.toml'))) {
    return 'cargo build';
  }
  if (existsSync(join(workspacePath, 'go.mod'))) {
    return 'go build ./...';
  }
  return null;
}
```

---

## Abstracción LLM

Interfaz simple para soportar múltiples providers en el futuro:

```typescript
// src/agent/llm/types.ts
interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: object;
  };
}

interface LLMProvider {
  chat(messages: Message[], tools: Tool[]): AsyncGenerator<StreamEvent>;
}

// src/agent/llm/openai.ts
class OpenAIProvider implements LLMProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async *chat(messages: Message[], tools: Tool[]): AsyncGenerator<StreamEvent> {
    const stream = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages,
      tools,
      stream: true,
    });

    for await (const chunk of stream) {
      yield chunk;
    }
  }
}
```

---

## Estructura de Carpetas del Proyecto

```
agent-board/
├── src/
│   ├── index.ts              # Entry point, Express setup
│   ├── config.ts             # Variables de entorno
│   ├── db/
│   │   ├── database.ts       # Conexión SQLite
│   │   └── migrations.ts     # Crear tablas
│   ├── routes/
│   │   └── tasks.ts          # Todos los endpoints de tasks
│   ├── services/
│   │   ├── task.service.ts   # Lógica de negocio de tasks
│   │   ├── git.service.ts    # Worktrees, commits, push
│   │   └── agent.service.ts  # Orquestación del agente
│   ├── agent/
│   │   ├── runner.ts         # Loop principal del agente
│   │   ├── tools.ts          # Definición de herramientas
│   │   ├── executor.ts       # Ejecutor de herramientas
│   │   └── prompt.ts         # Templates de prompts
│   ├── llm/
│   │   ├── types.ts          # Interfaces
│   │   └── openai.ts         # Provider de OpenAI
│   ├── github/
│   │   └── client.ts         # Wrapper de Octokit
│   └── utils/
│       ├── logger.ts         # Logging + SSE emitter
│       ├── detect.ts         # Autodetección de proyecto
│       └── command.ts        # Validación de comandos
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

---

## Dependencias

```json
{
  "dependencies": {
    "express": "^4.18.x",
    "openai": "^4.x.x",
    "octokit": "^3.x.x",
    "better-sqlite3": "^9.x.x",
    "uuid": "^9.x.x",
    "dotenv": "^16.x.x"
  },
  "devDependencies": {
    "typescript": "^5.x.x",
    "@types/express": "^4.x.x",
    "@types/better-sqlite3": "^7.x.x",
    "@types/uuid": "^9.x.x",
    "tsx": "^4.x.x"
  }
}
```

---

## Orden de Implementación

### Fase 1: Fundamentos [COMPLETADA]
1. ~~Setup del proyecto (package.json, tsconfig, estructura)~~
2. ~~Configuración (dotenv, config.ts)~~
3. ~~Base de datos (SQLite connection, migrations)~~
4. ~~CRUD básico de tasks~~

**Notas de implementación:**
- Se usó `sql.js` en lugar de `better-sqlite3` (compatibilidad Windows)
- Validaciones con Zod (`src/schemas/task.schema.ts`)
- Endpoints probados y funcionando: POST, GET, PATCH, DELETE /tasks

### Fase 2: Git Integration [COMPLETADA]
5. ~~Servicio de Git (clone bare, worktrees)~~
6. ~~Cliente de GitHub (Octokit)~~

**Notas de implementación:**
- `src/services/git.service.ts` - Bare repos, worktrees, commits, push
- `src/github/client.ts` - Octokit wrapper para PRs
- `src/utils/github-url.ts` - Parser de URLs de GitHub
- Probado con repo público (octocat/Hello-World)
- Rutas Windows configuradas en `.env`

### Fase 3: Agente [COMPLETADA]
7. ~~Abstracción LLM (OpenAI provider)~~
8. ~~Definición de herramientas + whitelist~~
9. ~~Executor de herramientas~~
10. ~~Agent loop con planning phase~~
11. ~~Sistema de feedback~~

**Notas de implementación:**
- `src/llm/` - OpenAI provider con gpt-4o y tool calling
- `src/agent/tools.ts` - 6 herramientas (read_file, write_file, list_directory, run_command, search_files, task_complete)
- `src/agent/whitelist.ts` - Whitelist de comandos (npm, git, etc.) y bloqueo de comandos peligrosos
- `src/agent/executor.ts` - Executor con sandboxing, timeout 30s, output truncado 10KB
- `src/agent/runner.ts` - Loop de agente con max 50 iteraciones, feedback queue
- `src/services/agent.service.ts` - Orquestación del agente
- Probado con repo octocat/Hello-World - creó README.md exitosamente

### Fase 4: Control y Streaming [COMPLETADA]
12. ~~SSE para logs en tiempo real~~
13. ~~Endpoints de control (extend, cancel, approve)~~
14. ~~Timeout con warnings~~
15. ~~Creación de PR post-aprobación~~

**Notas de implementación:**
- `src/utils/sse-emitter.ts` - Clase SSEEmitter para streaming de eventos
- Eventos SSE: log, status, timeout_warning, awaiting_review, complete, error
- Timeout por defecto: 10 minutos, warning a los 5 minutos
- Conexiones SSE se cierran automáticamente en eventos terminales (error, complete)
- Endpoint `/approve` crea PR en GitHub automáticamente
- Probado con flujo completo: tarea → agente → commit → PR creado

### Fase 5: Polish [COMPLETADA]
16. ~~Manejo de errores y reintentos de build~~
17. ~~Cleanup de worktrees (solo cuando PR es mergeado/cerrado)~~
18. ~~Validaciones adicionales~~

**Notas de implementación:**
- `src/agent/runner.ts` - Método `validateBuildWithRetries()` con hasta 3 reintentos
- Si el build falla, el agente intenta corregir los errores antes del siguiente intento
- Worktree se preserva mientras el PR está activo (estado `pr_created`)
- Nuevos métodos: `markPRMerged()` y `markPRClosed()` para cleanup
- Validación UUID en middleware `requireTaskId()`
- Validaciones de estado en cada endpoint

### Fase 6: Flujo de Revisión de PR [COMPLETADA]
19. ~~Nuevo estado `changes_requested` en el ciclo de vida de tareas~~
20. ~~Endpoint `POST /tasks/:id/request-changes` para solicitar cambios al agente~~
21. ~~El agente recibe feedback del reviewer y trabaja en el mismo worktree~~
22. ~~Push automático actualiza el PR existente~~
23. ~~Worktree se mantiene hasta que PR sea mergeado o cerrado~~

**Notas de implementación:**
- Estados añadidos: `pr_created`, `changes_requested`
- Nuevos endpoints:
  - `POST /tasks/:id/request-changes` - Envía feedback del reviewer
  - `POST /tasks/:id/pr-merged` - Marca PR como mergeado, limpia worktree
  - `POST /tasks/:id/pr-closed` - Marca PR como cerrado, limpia worktree
- `src/agent/runner.ts` - Opciones `isResume` y `reviewFeedback` para modo resume
- `src/agent/prompts.ts` - Nuevo `getResumePrompt()` para feedback del reviewer
- En modo resume, el agente salta planning y usa worktree existente
- Push automático actualiza el PR (commit con prefijo "fix:" en lugar de "feat:")

**Flujo implementado:**
```
backlog → planning → in_progress → awaiting_review → approved → pr_created
                                                                     ↓
                          ┌──────────────────────────────────────────┘
                          ↓
                   changes_requested  ←── POST /tasks/:id/request-changes
                          ↓                    (con feedback del reviewer)
                    in_progress (agente trabaja en mismo worktree)
                          ↓
                   awaiting_review
                          ↓
                    push (PR se actualiza automáticamente)
                          ↓
                        done  ←── cuando PR es mergeado
```

---

## Ejemplos con curl

### Crear tarea
```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Add JWT authentication",
    "description": "Implement JWT auth with login/register endpoints",
    "repo_url": "https://github.com/user/my-api",
    "target_branch": "main"
  }'
```

### Iniciar agente
```bash
curl -X POST http://localhost:3000/tasks/{id}/execute
```

### Ver logs en tiempo real
```bash
curl -N http://localhost:3000/tasks/{id}/logs
```

### Enviar feedback
```bash
curl -X POST http://localhost:3000/tasks/{id}/feedback \
  -H "Content-Type: application/json" \
  -d '{"message": "Use bcrypt instead of crypto"}'
```

### Extender timeout
```bash
curl -X POST http://localhost:3000/tasks/{id}/extend
```

### Ver cambios
```bash
curl http://localhost:3000/tasks/{id}/changes
```

### Aprobar y crear PR
```bash
curl -X POST http://localhost:3000/tasks/{id}/approve
```

---

## Consideraciones Futuras (Post-MVP)

- **Frontend**: Dashboard web con React
- **Paralelización**: Múltiples repos simultáneos (ya soportado por diseño)
- **Más LLMs**: Añadir Claude, Gemini, etc.
- **Tests**: Ejecutar tests además de build
- **Métricas**: Tracking de tokens, tiempo, tasa de éxito
- **Webhooks**: Notificaciones cuando una tarea termina
- **Autenticación**: API keys para múltiples usuarios
